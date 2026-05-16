# Deploy

This is the one-page runbook for taking Mnemos from a local checkout to a
public Cloud Run URL. It assumes you have a Google Cloud project + billing,
a MongoDB Atlas cluster, and Vertex AI Gemini access in the same region.

> **Order matters.** Deploy the agent first; capture its URL; then deploy the
> web frontend with that URL baked into `NEXT_PUBLIC_AGENT_URL` at build time.

## Prerequisites

```
gcloud --version          # ≥ 470
node --version            # 22.x
docker --version          # optional; used for local image testing
```

```bash
gcloud auth login
gcloud config set project  YOUR_PROJECT_ID
gcloud config set run/region us-central1
gcloud auth application-default login
```

## 1. Atlas

1. Create an **M0** cluster in a region with **Atlas Vector Search**
   (e.g. AWS `us-east-1`, GCP `us-central1`).
2. Add a database user; whitelist `0.0.0.0/0` *only for the demo* (lock down
   for production).
3. Capture the connection string into `.env.local`:

```
MONGODB_URI=mongodb+srv://USER:PASS@CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=mnemos
```

4. Create the vector search index:

```bash
npx tsx --env-file=.env.local scripts/setup-mongo-index.ts
```

Atlas needs ~1–3 min to build the index. The script is idempotent.

## 2. Vertex AI

1. Enable the API:

```bash
gcloud services enable aiplatform.googleapis.com run.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com
```

2. (Optional but recommended) create a runtime service account for the agent:

```bash
gcloud iam service-accounts create mnemos-agent \
  --display-name="Mnemos agent runtime"

PROJECT_ID=$(gcloud config get-value project)
SA="mnemos-agent@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA}" --role="roles/aiplatform.user"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA}" --role="roles/logging.logWriter"
```

3. Capture project + region in `.env.local`:

```
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
VERTEX_GEMINI_MODEL=gemini-3-pro
VERTEX_EMBEDDING_MODEL=text-embedding-004
```

## 3. Artifact Registry

Cloud Build pushes images to a regional Artifact Registry repo named `mnemos`.
Create it once:

```bash
gcloud artifacts repositories create mnemos \
  --repository-format=docker \
  --location=us-central1 \
  --description="Mnemos container images"
```

## 4. Seed the vault

This populates Mongo with 247 synthetic Alex Chen documents — the demo corpus.
Run the agent locally first, then have the seed script POST to its `/ingest`:

```bash
# terminal 1
npm run dev:agent

# terminal 2
npx tsx --env-file=.env.local scripts/seed-alex-data.ts --load
```

It takes ~5–10 minutes (one Gemini call per narrative thread; one embedding
batch per ingested document). This writes the fixture to
`scripts/fixtures/alex-data.json` as a side-effect.

**Web UI alternative (after fixture is generated):** Navigate to `/ingest`
in the running web app, or open ⌘K and type "ingest the demo corpus". The
page reads `scripts/fixtures/alex-data.json` via the agent's `POST /ingest/demo`
SSE endpoint and streams per-document progress live.

Optional: extract Alex's writing voice so `draft_email` mimics his actual
phrasings:

```bash
npx tsx --env-file=.env.local scripts/extract-voice.ts
```

Writes `scripts/fixtures/alex-voice.md`; the agent loads it lazily at draft
time. A hand-crafted version is already committed — run `extract-voice.ts`
to override it with voice sampled from the generated corpus.

## 5. Deploy the agent

```bash
SERVICE_ACCOUNT="mnemos-agent@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  bash scripts/deploy-agent.sh
```

The script:
- builds the agent container via `gcloud builds submit`
- pushes to `${REGION}-docker.pkg.dev/${PROJECT}/mnemos/mnemos-agent`
- deploys to Cloud Run with the right env vars
- prints the public URL

Verify:

```bash
curl https://mnemos-agent-XXX.a.run.app/health
curl https://mnemos-agent-XXX.a.run.app/ready
```

`/ready` should report `atlas: configured` and `vertex: configured`.

## 6. Deploy the web frontend

Copy the agent URL into `.env.local` as `NEXT_PUBLIC_AGENT_URL`, then:

```bash
bash scripts/deploy-web.sh
```

`NEXT_PUBLIC_*` vars are baked in at build time, so re-deploy the web service
if the agent URL ever changes.

## 7. (Optional) custom subdomain

```bash
gcloud beta run domain-mappings create \
  --service=mnemos-web \
  --domain=mnemos.YOURDOMAIN.com \
  --region=us-central1
```

Then add the DNS records gcloud prints to your registrar.

## 8. Cloud Build alternative

`cloudbuild.yaml` works as a CI trigger. Wire it to a GitHub trigger so a push
to `main` rebuilds + redeploys:

```bash
gcloud builds triggers create github \
  --name="mnemos-agent" \
  --repo-name=mnemos --repo-owner=YOUR_GH_USER \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml \
  --substitutions=_TARGET=agent
```

Repeat with `_TARGET=web` plus `_NEXT_PUBLIC_AGENT_URL=...` for the web trigger.

## Cost notes

- Cloud Run scale-to-zero, M0 free Atlas, Vertex pay-per-call → demo costs
  pennies a day. The 247-doc seed run is the biggest single expense (~$0.30
  in Gemini calls). Embedding cost is negligible at this corpus size.

## Tearing down

```bash
gcloud run services delete mnemos-web    --region=us-central1 --quiet
gcloud run services delete mnemos-agent  --region=us-central1 --quiet
gcloud artifacts repositories delete mnemos --location=us-central1 --quiet
```
