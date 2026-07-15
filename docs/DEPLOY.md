# Deploy

This is the one-page runbook for taking Mnemos from a local checkout to a
public URL. The default target is a single **AWS Lightsail** box running both
containers behind Caddy (automatic HTTPS); the LLM is **Amazon Nova Pro on
Amazon Bedrock** (model-configurable via `BEDROCK_MODEL_ID`) and embeddings are
**Amazon Titan Text v2**. It assumes you have an AWS account, a MongoDB Atlas
cluster, and a Google OAuth client (for Gmail send + Calendar).

> **The full box runbook lives in [../deploy/aws/README.md](../deploy/aws/README.md)** —
> instance creation, DNS, Caddy, TLS, cost guardrails. This page covers the parts
> that are the same wherever you host: Atlas, Bedrock, and seeding the vault.

## Prerequisites

```
docker --version          # + the compose plugin (docker compose version)
python3 --version         # 3.12.x, for the local setup / seed scripts
```

## 1. Atlas

1. Create an **M0** cluster in a region with **Atlas Vector Search**
   (e.g. AWS `ap-south-1` / `us-east-1`).
2. Add a database user; whitelist `0.0.0.0/0` *only for the demo* (lock down
   for production).
3. Capture the connection string into `.env.local` (local) or `deploy/aws/.env`
   (box):

```
MONGODB_URI=mongodb+srv://USER:PASS@CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=mnemos
```

4. Create the vector + text search indexes (idempotent; Atlas needs ~1–3 min to
   build):

```bash
npm run setup:agent   # one-time: python venv + agent deps
npm run setup:mongo
```

The vector index dimension follows the active embedding provider (Titan v2 →
1024). If you switch providers, re-run `setup:mongo` — it drops and recreates
the index at the new dimension.

## 2. Amazon Bedrock

1. Console → **Amazon Bedrock** → **Model access** (pick a region) → enable an
   **Amazon Nova** model. Copy its exact **model ID / inference-profile ID**.
   (Nova is AWS first-party — no Marketplace subscription, so it works on India
   accounts with no international card. Claude works too but its Marketplace
   subscription requires a card.)
2. Console → **IAM** → create a user with an inline policy allowing
   `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream`. Copy its
   access key id + secret.
3. Put the values in your env file:

```
LLM_PROVIDER=bedrock
BEDROCK_MODEL_ID=apac.amazon.nova-pro-v1:0   # region prefix must match BEDROCK_REGION
BEDROCK_REGION=ap-south-1
EMBED_PROVIDER=bedrock
BEDROCK_EMBED_MODEL=amazon.titan-embed-text-v2:0
BEDROCK_EMBED_DIMS=1024
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

## 3. Seed the vault

This populates Mongo with the synthetic Alex Chen demo corpus. The Python seed
script generates, ingests, and builds the graph + commitments ledger directly
(no running server needed):

```bash
npm run seed -- --load
```

It takes ~5–10 minutes (one LLM call per narrative thread; one embedding batch
per ingested document). This writes the fixture to
`scripts/fixtures/alex-data.json` as a side-effect.

**Web UI alternative (after the fixture is generated):** navigate to `/ingest`
in the running web app, or open ⌘K and type "ingest the demo corpus". The page
streams per-document progress via the agent's `POST /ingest/demo` SSE endpoint.

Optional — extract Alex's writing voice so `draft_email` mimics his phrasings:

```bash
npm run voice   # writes scripts/fixtures/alex-voice.md; a version is already committed
```

## 4. Deploy the box (AWS Lightsail)

Follow [../deploy/aws/README.md](../deploy/aws/README.md). In short:

```bash
git clone https://github.com/aryangorde8/Mnemos.git
cd Mnemos/deploy/aws
cp .env.example .env && nano .env      # fill Atlas + Bedrock + OAuth
docker compose up -d --build           # builds web + agent + Caddy
```

If the corpus was embedded with a non-Titan model, re-embed once and rebuild the
index at the new dimension (run inside the agent container):

```bash
docker compose exec -T agent python apps/agent-py/scripts/reembed_chunks.py
docker compose exec -T agent python apps/agent-py/scripts/setup_mongo_index.py
```

## 5. Verify

```bash
curl https://mnemos-agent.<your-domain>/health   # {"status":"ok",...}
curl https://mnemos-agent.<your-domain>/ready     # llm: bedrock, gmail: configured
```

`/ready` should report `atlas: configured` and `llm: bedrock`. Open the web URL,
go to **/approve**, and click **connect google** once — approving a draft then
sends real email via `gmail.send` and books real events via `calendar.events`.

## Cost notes

- One always-on Lightsail box (2–4 GB) plus M0 free Atlas plus Bedrock
  pay-per-call. Bedrock is billed per token (Amazon Nova Pro ≈ $0.80 / $3.20 per
  1M input/output tokens — Claude is ≈ $3 / $15); Titan embeddings are
  negligible at this corpus size.
- Set an AWS **Budgets** alert so real charges can't start silently after any
  promotional credit runs out.

## Cloud Run (legacy, still supported)

The original hackathon deploy targeted Google Cloud Run + Vertex AI. That path
still works: set `LLM_PROVIDER=vertex` (or `gemini` with a `GEMINI_API_KEY`) and
use `cloudbuild.yaml` / `scripts/deploy-agent.sh` / `scripts/deploy-web.sh`. It
is no longer the default — AWS Lightsail + Bedrock is.
