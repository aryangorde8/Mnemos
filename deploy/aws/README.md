# Deploy Mnemos on AWS (Lightsail)

One small always-on box runs both containers behind Caddy (automatic HTTPS).
No Google Cloud: the agent talks to MongoDB Atlas + the Gemini API directly.

- **Cost:** the $20/mo Lightsail plan (4 GB) — ~$110 over 5.5 months, which
  draws a $100 credit down to ~zero by year-end. The $10/mo plan (2 GB) also
  works if you add swap (step 3).
- **No code changes:** the app already supports a non-GCP host via
  `GEMINI_API_KEY` (LLM without Vertex) and `AGENT_PUBLIC_URL` (browser-facing
  OAuth link).

---

## 0. Before you start

- A MongoDB Atlas connection string (unchanged — Atlas is not on GCP).
- **Amazon Bedrock** enabled (see step 0a) — both generation (Claude) and
  embeddings (Titan) run on Bedrock, so **no Google API key is needed**.
- Your existing Google OAuth client id/secret (still used for Gmail send + Calendar).
- Access to your domain's DNS (to point `mnemos` + `mnemos-agent` at the box).

## 0a. Enable Amazon Bedrock (LLM)

Generation uses Claude on Bedrock — no free-tier rate-limit wall, billed to your
AWS credit.

1. Console → **Amazon Bedrock** → **Model access** (pick a region, e.g. Mumbai
   `ap-south-1`) → **Enable** a Claude model. Copy its exact **model ID /
   inference-profile ID** — that string goes in `BEDROCK_MODEL_ID`, and its
   region in `BEDROCK_REGION`. (Availability varies by region; the value in
   `.env.example` is only a default.)
2. Console → **IAM** → create a user (programmatic access) with an inline policy
   allowing `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on
   `*`. Copy its **access key id + secret** → `AWS_ACCESS_KEY_ID` /
   `AWS_SECRET_ACCESS_KEY` in `.env`.
   *(Lightsail instances have no IAM role, so the agent authenticates with these keys.)*

## 1. Create the Lightsail instance

1. <https://lightsail.aws.amazon.com> → **Create instance**.
2. Region: **Mumbai (ap-south-1)** for lowest latency in India.
3. Platform **Linux/Unix** → blueprint **OS Only → Ubuntu 22.04 LTS**.
4. Plan: **$20/mo (4 GB RAM, 2 vCPU, 80 GB SSD)**.
5. Name it `mnemos` → **Create**.

## 2. Networking (static IP + firewall)

1. Instance → **Networking** tab → **Attach static IP** (free while attached).
   Note this IP — DNS points here.
2. Under **IPv4 Firewall**, add rules: **HTTP (80)** and **HTTPS (443)**.
   (SSH 22 is open by default.)

## 3. Install Docker on the box

SSH in (Lightsail → instance → **Connect using SSH**, or your own terminal),
then:

```bash
curl -fsSL https://get.docker.com | sudo sh   # Docker + the compose plugin
sudo usermod -aG docker $USER                  # run docker without sudo
sudo apt-get install -y git
newgrp docker                                  # refresh group in this shell

# Only if you chose a 2 GB plan — 2 GB swap so the image build doesn't OOM:
# sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile \
#   && sudo mkswap /swapfile && sudo swapon /swapfile \
#   && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Verify: `docker --version && docker compose version && git --version`.

## 4. Get the code + secrets

```bash
git clone https://github.com/aryangorde8/Mnemos.git
cd Mnemos && git checkout claude/calendar-gmail-integration-cpn5jb && cd deploy/aws
cp .env.example .env
nano .env          # save: Ctrl-O, Enter, Ctrl-X
```

Fill in `.env`:

| Variable | What to paste |
|---|---|
| `MONGODB_URI` | your Atlas connection string |
| `BEDROCK_MODEL_ID` / `BEDROCK_REGION` | the model ID + region you enabled in step 0a |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | the IAM user keys from step 0a |
| `GMAIL_OAUTH_CLIENT_ID` / `GMAIL_OAUTH_CLIENT_SECRET` | your OAuth credentials |

(`GEMINI_API_KEY` stays empty — embeddings run on Bedrock Titan now.)

Leave the URL lines as-is unless your domain differs. If you edit the hostnames,
change them in `Caddyfile` too (and the ACME `email`).

## 5. Point DNS at the box

At your DNS provider, create two **A records** → the static IP from step 2:

| Type | Name           | Value            |
|------|----------------|------------------|
| A    | `mnemos`       | `<static IP>`    |
| A    | `mnemos-agent` | `<static IP>`    |

> **Verify before flipping the live site.** `mnemos.aryangorde.com` currently
> points at Cloud Run. Point **`mnemos-agent`** first, bring the box up (step 6),
> confirm `https://mnemos-agent.aryangorde.com/health` returns ok — *then* flip
> the `mnemos` record. That keeps the old site serving until the new one is proven.

## 6. Launch

```bash
docker compose up -d --build
```

First run builds both images (~2–4 min) and Caddy auto-issues TLS certs once
DNS resolves. Watch logs with `docker compose logs -f` (Ctrl-C to stop tailing;
containers keep running and auto-restart on reboot).

## 6a. Re-embed the corpus for Titan (one-time)

The demo corpus was embedded with a Google model (768-d); Bedrock Titan vectors
are 1024-d, so re-embed every chunk with Titan and rebuild the vector index at
the new dimension. Run inside the agent container (it has the code, AWS creds,
and Atlas access):

```bash
docker compose exec -T agent python apps/agent-py/scripts/reembed_chunks.py
docker compose exec -T agent python apps/agent-py/scripts/setup_mongo_index.py
```

The re-embed takes a few minutes; the index then needs ~1–3 min to build in
Atlas. (Skip this only if the corpus was already embedded with Titan.)

## 7. Verify

```bash
curl https://mnemos-agent.aryangorde.com/health          # {"status":"ok",...}
curl https://mnemos-agent.aryangorde.com/ready           # llm: bedrock, gmail: configured
```

Then open `https://mnemos.aryangorde.com`, go to **/approve**, and click
**connect google** once to re-authorize on the new host. The topbar pill should
read `bedrock · claude` and `google · live`. Run an `/ask` query to confirm the
agent streams (that exercises the Bedrock tool-calling loop end to end).

## 8. AWS cost guardrails

- Billing → **Credits**: confirm the $100 balance and its **expiry date**.
- Billing → **Budgets** → create a **$100 budget alert** so real charges can't
  start silently after the credit runs out.

## 9. Decommission Google Cloud (after you're happy)

Once the AWS site is verified and the DNS flip has propagated:

```bash
gcloud run services delete mnemos-web   --region=us-central1 --quiet
gcloud run services delete mnemos-agent --region=us-central1 --quiet
```

Then delete the GCP billing account (or leave it — it's already scale-to-zero
and costs ~₹0). Keep the Google **OAuth client** and Atlas cluster; both are
still used by the AWS deployment.

---

### LLM note

Generation runs on **Amazon Bedrock (Claude)** — draws down your AWS credit, no
free-tier rate limits. Switching providers is just `LLM_PROVIDER`: unset it (or
set `gemini`/`vertex`) to fall back to Gemini/Vertex with the same code.

**Embeddings stay on Gemini** (`text-embedding-004`) so the existing Atlas vector
index keeps working — that's why a `GEMINI_API_KEY` is still needed. Volume is
tiny (one call per search). Going 100% off Google would mean re-embedding the
corpus with a Bedrock model (e.g. Titan) and rebuilding the Atlas index at the
new dimension — a separate migration, not required to run.
