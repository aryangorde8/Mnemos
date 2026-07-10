# Deploying Mnemos on AWS (the `aws` branch)

This branch is the **AWS-native variant**: zero Google stack. The LLM is any
OpenAI-compatible endpoint (default **Groq**, free API key), embeddings are
**Cohere** (free trial key, 1024-dim), and everything runs on **one EC2
instance** with docker-compose — web public on :80, agent internal (the web
app proxies to it server-side via `AGENT_URL`).

Why one EC2 box and not App Runner/Lightsail: the app streams SSE for up to
~10 minutes (ask/debate runs); managed load balancers with fixed idle
timeouts cut those streams. A single instance with the web container serving
directly avoids the problem entirely, and fits free-tier/credit accounts.

---

## 0. What you need (all free tiers)

| Thing | Where | Notes |
|---|---|---|
| AWS account + IAM access keys | console.aws.amazon.com → IAM → Users → *your user* → Security credentials → Create access key | Never use root keys. Give the IAM user EC2 permissions (e.g. `AmazonEC2FullAccess` for simplicity). |
| EC2 key pair | EC2 console → Key Pairs → Create (download the `.pem`) | Terraform references it by **name**. |
| Groq API key | console.groq.com/keys | Free tier — llama-3.3-70b-versatile. |
| Cohere API key | dashboard.cohere.com/api-keys | Trial key is free (rate-limited). |
| MongoDB Atlas URI | cloud.mongodb.com | Free M0 cluster works. **Network Access must allow the EC2 IP** (or 0.0.0.0/0 for a demo). |

Local machine: install [Terraform](https://developer.hashicorp.com/terraform/install)
(already present here) — the AWS CLI is *not* required (Terraform reads the
env vars directly).

## 1. Provision the instance

```bash
cd deploy/aws/terraform
export AWS_ACCESS_KEY_ID=...        # the IAM user's key
export AWS_SECRET_ACCESS_KEY=...
terraform init
terraform apply -var key_name=<your-key-pair-name> \
                -var ssh_cidr=<your-ip>/32     # optional but recommended
```

Outputs `public_ip`. Wait ~2 minutes after apply for cloud-init to finish
installing Docker.

## 2. Start the stack

```bash
ssh -i <path-to-key.pem> ubuntu@<public_ip>

git clone -b aws https://github.com/<your-github-user>/mnemos.git
cd mnemos/deploy/aws
cp .env.example .env
nano .env        # fill MONGODB_URI, GROQ_API_KEY, COHERE_API_KEY
docker compose up -d --build
```

## 3. One-time: rebuild the Atlas indexes + re-ingest

The AWS variant embeds at **1024 dims** (Cohere) — the old 768-dim index and
corpus are incompatible and must be rebuilt:

```bash
docker compose exec agent python scripts/setup_atlas_indexes.py --wipe
# then load the demo corpus (from the EC2 box):
curl -N -X POST http://127.0.0.1:8788/ingest/demo
```

(Or use the web UI's ingest page instead of the curl.)

## 4. Verify

```bash
curl -s http://127.0.0.1:8788/ready | python3 -m json.tool
# want: atlas/llm/embeddings all "configured", runtime "python-aws"
```

Then open `http://<public_ip>/` in a browser and ask a question.

## Ops notes

- **Update:** `git pull && docker compose up -d --build` on the box.
- **Logs:** `docker compose logs -f agent` / `... web`.
- **Teardown:** `terraform destroy` in `deploy/aws/terraform` (releases the EIP too).
- **TLS later:** point a domain's A record at the EIP, then put Caddy in front
  (`caddy reverse-proxy --from your.domain --to localhost:80`) or add a caddy
  service to the compose file. Plain HTTP is fine for a demo.
- **Swap the LLM provider:** set `LLM_BASE_URL` + `LLM_MODEL` + key in `.env` —
  any OpenAI-compatible endpoint (Mistral, Cerebras, OpenRouter, …) works
  without code changes.
- **Gmail/Calendar/Firebase** stay off by default (drafts are simulated,
  auth is open). Set their env vars only if you want them — they are Google
  *services* (optional features), separate from the Google *stack* this
  branch removed (Vertex/GCP hosting).

## Free-tier rate-limit reality (be honest in demos)

- Groq free tier caps requests/tokens per minute & day — a debate run (2
  parallel agents + synthesis) burns turns fast; if you hit 429s, wait a
  minute or upgrade.
- Cohere trial keys are rate-limited (~100 calls/min) and fine for demo-size
  ingests; a large corpus re-embed may need pacing.
- t3.small ≈ $15/mo on-demand (t3.micro is free-tier eligible but tight);
  Atlas M0, Groq, and Cohere trial are $0.
