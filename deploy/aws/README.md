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
- A Gemini API key: <https://aistudio.google.com/apikey> (free, no billing).
- Your existing Google OAuth client id/secret.
- Access to your domain's DNS (to point `mnemos` + `mnemos-agent` at the box).

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
cd Mnemos/deploy/aws
cp .env.example .env
nano .env          # fill in MONGODB_URI, GEMINI_API_KEY, GMAIL_OAUTH_* (save: Ctrl-O, Enter, Ctrl-X)
```

Leave the URL / model lines as-is unless your domain differs. If you edit the
hostnames, change them in `Caddyfile` too (and the ACME `email`).

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

## 7. Verify

```bash
curl https://mnemos-agent.aryangorde.com/health          # {"status":"ok",...}
curl https://mnemos-agent.aryangorde.com/ready           # llm: gemini_api, gmail: configured
```

Then open `https://mnemos.aryangorde.com`, go to **/approve**, and click
**connect google** once to re-authorize on the new host. The topbar pill should
read `gemini · api · free` and `google · live`.

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

This runs the LLM on the **Gemini API free tier** — the cheapest path and still
Google-billing-free. If you'd rather keep everything inside AWS, **Amazon
Bedrock** (Claude on AWS) is the native option, but it's a code change to
`app/llm/genai_client.py` (different SDK + model), not just config — ask and I
can scope it.
