#!/usr/bin/env bash
# One-time setup so GitHub Actions can deploy Mnemos to Cloud Run WITHOUT a stored key,
# using Workload Identity Federation (OIDC). Run this once on your machine with gcloud
# authenticated to the right project.
#
#   bash scripts/setup-gha-deploy.sh [owner/repo]
#
# Defaults to the current `gcloud config` project and the GitHub repo "aryangorde8/Mnemos".
# At the end it prints the four values to paste into:
#   GitHub → repo → Settings → Secrets and variables → Actions → **Variables** tab.
set -euo pipefail

REPO="${1:-aryangorde8/Mnemos}"                 # owner/repo, case-sensitive (must match GitHub)
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
POOL="${POOL:-github}"
PROVIDER="${PROVIDER:-github-oidc}"
SA_NAME="${SA_NAME:-gh-deployer}"

: "${PROJECT_ID:?set GOOGLE_CLOUD_PROJECT or run 'gcloud config set project <id>'}"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "project=$PROJECT_ID  number=$PROJECT_NUMBER  repo=$REPO"

# 1) Enable the APIs the pipeline needs (no-op if already enabled).
gcloud services enable iamcredentials.googleapis.com cloudbuild.googleapis.com \
  run.googleapis.com artifactregistry.googleapis.com --project "$PROJECT_ID"

# 2) Deployer service account that GitHub will impersonate.
gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT_ID" \
  --display-name "GitHub Actions deployer" 2>/dev/null || echo "  (service account already exists)"

# 3) Roles: submit Cloud Builds (which build, push, and `gcloud run deploy` per cloudbuild.yaml).
for ROLE in roles/cloudbuild.builds.editor roles/run.admin \
            roles/artifactregistry.writer roles/iam.serviceAccountUser \
            roles/storage.admin roles/logging.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${SA}" --role "$ROLE" --condition None --quiet >/dev/null
done
# Cloud Build runs as the default CB service account; allow the deployer to act as it.
gcloud iam service-accounts add-iam-policy-binding \
  "${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" --project "$PROJECT_ID" \
  --member "serviceAccount:${SA}" --role roles/iam.serviceAccountUser --quiet >/dev/null 2>&1 || true

# 4) Workload Identity pool + GitHub OIDC provider, locked to this one repository.
gcloud iam workload-identity-pools create "$POOL" --project "$PROJECT_ID" \
  --location global --display-name "GitHub" 2>/dev/null || echo "  (pool already exists)"
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project "$PROJECT_ID" \
  --location global --workload-identity-pool "$POOL" --display-name "GitHub OIDC" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository=='${REPO}'" 2>/dev/null \
  || echo "  (provider already exists)"

POOL_NAME="$(gcloud iam workload-identity-pools describe "$POOL" --project "$PROJECT_ID" \
  --location global --format 'value(name)')"

# 5) Let exactly this GitHub repo impersonate the deployer SA.
gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository/${REPO}" --quiet >/dev/null

cat <<EOF

────────────────────────────────────────────────────────────────────────
✓ done. Add these as GitHub Actions **Variables** (not Secrets):
   repo → Settings → Secrets and variables → Actions → Variables → New variable

   GCP_PROJECT_ID    = ${PROJECT_ID}
   GCP_DEPLOY_SA     = ${SA}
   GCP_WIF_PROVIDER  = ${POOL_NAME}/providers/${PROVIDER}
   AGENT_URL         = https://mnemos-agent.aryangorde.com   (optional; this is the default)

Then push to main — CI runs, and on success the web service auto-deploys.
Deploy the agent manually anytime: Actions → deploy → Run workflow → service=agent.
────────────────────────────────────────────────────────────────────────
EOF
