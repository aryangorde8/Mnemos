#!/usr/bin/env bash
# One-time setup so GitHub Actions can deploy Mnemos to Cloud Run using a service-account JSON key.
# Run once on your machine with gcloud authenticated to the right project.
#
#   bash scripts/setup-gha-deploy.sh
#
# It creates the deployer service account, grants the roles needed to run the Cloud Build pipeline,
# and writes a JSON key to ./gh-deployer-key.json. Then:
#   • GitHub → repo → Settings → Secrets and variables → Actions
#       - Secrets   tab → New secret    → GCP_SA_KEY      = <paste the whole JSON file>
#       - Variables tab → New variable  → GCP_PROJECT_ID  = <your project id>
#       - Variables tab → New variable  → AGENT_URL       = https://mnemos-agent.aryangorde.com (optional)
#   • Then DELETE the local key file:  rm gh-deployer-key.json
#
# Prefer the Cloud Console UI? See the "UI path" notes in the deploy chat / README — you only need
# to create one SA with these roles, make a JSON key, and paste it as the GCP_SA_KEY secret.
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
SA_NAME="${SA_NAME:-gh-deployer}"
: "${PROJECT_ID:?set GOOGLE_CLOUD_PROJECT or run 'gcloud config set project <id>'}"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="gh-deployer-key.json"

echo "project=$PROJECT_ID  number=$PROJECT_NUMBER  sa=$SA"

# 1) Enable the APIs the pipeline needs (no-op if already enabled).
gcloud services enable cloudbuild.googleapis.com run.googleapis.com \
  artifactregistry.googleapis.com --project "$PROJECT_ID"

# 2) Deployer service account.
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

# 4) Create a JSON key for GitHub.
gcloud iam service-accounts keys create "$KEY_FILE" --iam-account "$SA" --project "$PROJECT_ID"

cat <<EOF

────────────────────────────────────────────────────────────────────────
✓ done. In GitHub → repo → Settings → Secrets and variables → Actions:

   Secrets   tab → New repository secret
       GCP_SA_KEY      = (paste the entire contents of ./${KEY_FILE})

   Variables tab → New repository variable
       GCP_PROJECT_ID  = ${PROJECT_ID}
       AGENT_URL       = https://mnemos-agent.aryangorde.com   (optional; this is the default)

Then push to main — CI runs, and on success the web service auto-deploys.
Deploy the agent manually anytime: Actions → deploy → Run workflow → service=agent.

⚠  SECURITY: the key is a long-lived credential. After pasting it into GitHub, delete it locally:
       rm ${KEY_FILE}
────────────────────────────────────────────────────────────────────────
EOF
