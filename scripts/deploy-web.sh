#!/usr/bin/env bash
# Deploy the Mnemos web frontend (Next.js 16) to Cloud Run.
#
# Required env:
#   GOOGLE_CLOUD_PROJECT    — GCP project id
#   NEXT_PUBLIC_AGENT_URL   — public URL of the deployed agent service
#
# Optional:
#   GOOGLE_CLOUD_LOCATION   — defaults to us-central1
#   SERVICE_NAME            — defaults to "mnemos-web"
#
# Usage:
#   bash scripts/deploy-web.sh

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

if [[ -f .env.local ]]; then
  # Source .env.local but DO NOT overwrite vars the user already exported —
  # otherwise NEXT_PUBLIC_AGENT_URL=... in front of the script call is ignored.
  while IFS='=' read -r key val; do
    # skip comments + blank lines + invalid keys
    [[ -z "$key" || "$key" =~ ^# || ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && continue
    # only set if not already in environment
    if [[ -z "${!key+x}" ]]; then
      # strip surrounding quotes from val if present
      val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
      export "$key=$val"
    fi
  done < .env.local
fi

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
: "${NEXT_PUBLIC_AGENT_URL:?NEXT_PUBLIC_AGENT_URL is required (deploy the agent first)}"

REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE="${SERVICE_NAME:-mnemos-web}"

IMAGE="${REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/mnemos/${SERVICE}:$(date +%Y%m%d-%H%M%S)"

echo "[deploy-web] project=${GOOGLE_CLOUD_PROJECT} region=${REGION} service=${SERVICE}"
echo "[deploy-web] agent URL → ${NEXT_PUBLIC_AGENT_URL}"
echo "[deploy-web] building image: ${IMAGE}"

gcloud builds submit "$ROOT" \
  --project "${GOOGLE_CLOUD_PROJECT}" \
  --region "${REGION}" \
  --config <(cat <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - apps/web/Dockerfile
      - --build-arg
      - NEXT_PUBLIC_AGENT_URL=${NEXT_PUBLIC_AGENT_URL}
      - -t
      - ${IMAGE}
      - .
images:
  - ${IMAGE}
options:
  logging: CLOUD_LOGGING_ONLY
EOF
)

echo "[deploy-web] deploying ${SERVICE} on Cloud Run"

gcloud run deploy "${SERVICE}" \
  --project "${GOOGLE_CLOUD_PROJECT}" \
  --region "${REGION}" \
  --image "${IMAGE}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 512Mi \
  --min-instances 0 \
  --max-instances 4 \
  --timeout 60 \
  --concurrency 80 \
  --set-env-vars "NEXT_PUBLIC_AGENT_URL=${NEXT_PUBLIC_AGENT_URL}"

URL=$(gcloud run services describe "${SERVICE}" \
  --project "${GOOGLE_CLOUD_PROJECT}" --region "${REGION}" \
  --format="value(status.url)")

echo
echo "[deploy-web] live → ${URL}"
