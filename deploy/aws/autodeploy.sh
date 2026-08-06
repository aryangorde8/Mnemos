#!/usr/bin/env bash
# Auto-deploy: pull main and rebuild when it moves, if CI passed for that commit.
#
# The box polls GitHub rather than GitHub reaching the box. This repository is public,
# so a self-hosted Actions runner would let anyone with a fork try to run code here by
# opening a pull request — on the machine holding users' Google refresh tokens. Polling
# has no inbound surface: no port opened, no runner registered, no deploy key to leak,
# and nothing a fork can influence.
#
# Run from a systemd timer (see autodeploy.timer). Safe to run concurrently-ish: the
# flock at the bottom of the unit prevents overlap.
set -euo pipefail

REPO_DIR="${MNEMOS_REPO_DIR:-$HOME/Mnemos}"
GH_REPO="${MNEMOS_GH_REPO:-aryangorde8/Mnemos}"
HEALTH_URL="${MNEMOS_HEALTH_URL:-https://mnemos.aryangorde.com/}"

cd "$REPO_DIR"
git fetch --prune --quiet origin main

local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse origin/main)

if [ "$local_sha" = "$remote_sha" ]; then
  exit 0
fi

short="${remote_sha:0:7}"
echo "main moved ${local_sha:0:7} -> ${short}"

# Deploy only what CI has approved. Without this the box would ship whatever landed on
# main, including a commit that fails to import — which is the failure the manual
# process at least caught by hand.
status=$(curl -fsSL --max-time 20 \
  -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/${GH_REPO}/commits/${remote_sha}/check-runs" \
  | python3 -c '
import json, sys
runs = json.load(sys.stdin).get("check_runs") or []
if not runs:
    print("absent")
elif any(r["status"] != "completed" for r in runs):
    print("pending")
elif all(r["conclusion"] == "success" for r in runs):
    print("success")
else:
    print("failed")
')

case "$status" in
  success) ;;
  pending|absent)
    echo "ci ${status} for ${short} — leaving it for the next tick"
    exit 0 ;;
  *)
    echo "ci ${status} for ${short} — not deploying"
    exit 0 ;;
esac

# reset, not merge: this box is a deploy target, not somewhere to edit. .env is
# untracked and gitignored, so it is unaffected.
git reset --hard --quiet "$remote_sha"

# caddy is left alone — app commits do not change its config, and restarting it drops
# TLS connections and burns ACME allowance for nothing.
cd "$REPO_DIR/deploy/aws"
docker compose up -d --build web agent

for _ in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" || echo 000)
  if [ "$code" = "200" ]; then
    echo "deployed ${short} — home page 200"
    # Untagged layers from every previous build otherwise fill the disk until a build
    # fails with no space left.
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 5
done

echo "deployed ${short} but the home page never returned 200"
echo "check: cd ${REPO_DIR}/deploy/aws && docker compose logs --tail 100 web"
exit 1
