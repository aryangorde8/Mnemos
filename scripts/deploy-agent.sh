#!/usr/bin/env bash
# Deploy the Mnemos agent backend to Cloud Run.
#
# Required env (read from .env.local at repo root if present):
#   GOOGLE_CLOUD_PROJECT       — GCP project id
#   MONGODB_URI                — full Atlas connection string
#
# Optional:
#   GOOGLE_CLOUD_LOCATION      — defaults to us-central1
#   MONGODB_DB                 — defaults to "mnemos"
#   MONGODB_VECTOR_INDEX       — defaults to "mnemos_vector_index"
#   VERTEX_GEMINI_MODEL        — defaults to "gemini-3-pro"
#   VERTEX_EMBEDDING_MODEL     — defaults to "text-embedding-004"
#   SERVICE_NAME               — defaults to "mnemos-agent"
#   SERVICE_ACCOUNT            — fully-qualified SA email; recommended for Vertex/MCP
#
# Usage:
#   bash scripts/deploy-agent.sh
#
# Idempotent: re-running rebuilds + redeploys; URL is stable per service name.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  set -a; source .env.local; set +a
fi

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required (gcloud project id)}"
: "${MONGODB_URI:?MONGODB_URI is required (Atlas connection string)}"

REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE="${SERVICE_NAME:-mnemos-agent}"
DB="${MONGODB_DB:-mnemos}"
INDEX="${MONGODB_VECTOR_INDEX:-mnemos_vector_index}"
GEMINI="${VERTEX_GEMINI_MODEL:-gemini-3-pro}"
EMBED="${VERTEX_EMBEDDING_MODEL:-text-embedding-004}"

IMAGE="${REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/mnemos/${SERVICE}:$(date +%Y%m%d-%H%M%S)"

echo "[deploy-agent] project=${GOOGLE_CLOUD_PROJECT} region=${REGION} service=${SERVICE}"
echo "[deploy-agent] building image: ${IMAGE}"

gcloud builds submit "$ROOT" \
  --project "${GOOGLE_CLOUD_PROJECT}" \
  --region "${REGION}" \
  --tag "${IMAGE}" \
  --config <(cat <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - apps/agent/Dockerfile
      - -t
      - ${IMAGE}
      - .
images:
  - ${IMAGE}
options:
  logging: CLOUD_LOGGING_ONLY
EOF
)

echo "[deploy-agent] deploying ${SERVICE} on Cloud Run"

EXTRA_ENV=""
SET_ENV="MONGODB_URI=${MONGODB_URI},MONGODB_DB=${DB},MONGODB_VECTOR_INDEX=${INDEX}"
SET_ENV+=",GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GOOGLE_CLOUD_LOCATION=${REGION}"
SET_ENV+=",VERTEX_GEMINI_MODEL=${GEMINI},VERTEX_EMBEDDING_MODEL=${EMBED}"

if [[ "${MNEMOS_USE_MCP:-}" == "1" ]]; then
  SET_ENV+=",MNEMOS_USE_MCP=1"
fi

if [[ -n "${SERVICE_ACCOUNT:-}" ]]; then
  EXTRA_ENV+=" --service-account=${SERVICE_ACCOUNT}"
fi

gcloud run deploy "${SERVICE}" \
  --project "${GOOGLE_CLOUD_PROJECT}" \
  --region "${REGION}" \
  --image "${IMAGE}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 1Gi \
  --min-instances 0 \
  --max-instances 4 \
  --timeout 600 \
  --concurrency 40 \
  --set-env-vars "${SET_ENV}" \
  ${EXTRA_ENV}

URL=$(gcloud run services describe "${SERVICE}" \
  --project "${GOOGLE_CLOUD_PROJECT}" --region "${REGION}" \
  --format="value(status.url)")

echo
echo "[deploy-agent] live → ${URL}"
echo "[deploy-agent] copy this URL into NEXT_PUBLIC_AGENT_URL before deploying web."
