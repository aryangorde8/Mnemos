# Mnemos

> An AI agent that takes multi-step actions on top of your professional memory.

Not search. Not notes. An agent that remembers what you've seen across inbox,
calendar, and documents — and *does things about it* under your approval.

Built for the **Google Cloud Rapid Agent Hackathon — MongoDB partner track**.

- **Live:** `https://mnemos.aryangorde.com` *(populates after deploy)*
- **Demo (3 min):** `<link to YouTube/Vimeo — added at submission>`
- **License:** Apache 2.0

---

## What it does

| Surface | Path | Demo beat |
|---|---|---|
| Empty-state dashboard | `/` | 0:00–0:15 — cold open |
| Corpus loader (SSE progress) | `/ingest` | ⌘K → "ingest the demo corpus" |
| Vault search w/ citations | `/search` | 0:15–0:30 — ingestion populates |
| Ask the agent (SSE reasoning stream) | `/ask` | 0:30–1:00 — memory Q&A |
| Briefings — 1-pager generator | `/briefings`, `/briefings/[id]` | 1:00–1:45 — briefing beat |
| Action approval (draft email / schedule mtg) | inline in `/ask` + `/actions` | 1:45–2:30 — **the wedge** |
| Commitments ledger | `/commitments` | 2:30–2:50 — who owes what |
| ⌘K command palette | global | primary input |

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | **Next.js 16** (Pages Router) | TypeScript strict, Tailwind v4 CSS-first |
| Agent | **Node 22 + Express 5** | hand-rolled ReAct loop streams SSE |
| LLM | **Gemini 3 Pro** via Vertex AI | streaming + function-calling |
| Memory | **MongoDB Atlas Vector Search** | 768-dim cosine on `text-embedding-004` |
| MCP | **MongoDB MCP Server** (stdio) | gated by `MNEMOS_USE_MCP=1` |
| Hosting | **Cloud Run** (web + agent) | scale-to-zero, multi-region |
| Build | **Cloud Build** | `cloudbuild.yaml` for either service |

## Repo layout

```
apps/
  web/                Next.js 16 frontend (Pages Router)
  agent/              Node agent (Express, SSE, ReAct loop, 6 tools)
scripts/
  setup-mongo-index.ts  create the Atlas vector search index
  seed-alex-data.ts     generate 247 coherent Alex Chen docs via Gemini
  extract-voice.ts      sample sent emails → voice guide for draft_email
  deploy-agent.sh       gcloud-based deploy
  deploy-web.sh         "
docs/
  ARCHITECTURE.md     system + collections + flows
  DEPLOY.md           one-page deploy runbook
  DEMO_SCRIPT.md      3-minute shot list
cloudbuild.yaml       parameterized CI for either service
```

## Local setup

```bash
nvm use                          # node 22
cp .env.example .env.local
# fill in MONGODB_URI, GOOGLE_CLOUD_PROJECT, GOOGLE_APPLICATION_CREDENTIALS
npm install
npx tsx --env-file=.env.local scripts/setup-mongo-index.ts
npm run dev:agent                # http://localhost:8787
npm run dev:web                  # http://localhost:3000
npx tsx --env-file=.env.local scripts/seed-alex-data.ts --load    # ~5–10 min
```

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md) for the full runbook. TL;DR:

```bash
bash scripts/deploy-agent.sh                       # captures AGENT_URL
NEXT_PUBLIC_AGENT_URL=$AGENT_URL bash scripts/deploy-web.sh
```

Both Cloud Run services scale to zero. Free-tier Atlas + Vertex pay-per-call
keeps the running cost in pennies per day.

## Architecture

![Mnemos architecture](docs/architecture.svg)

ASCII fallback + collection schema in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Submission checklist (MongoDB partner track)

- [x] Built with **Gemini 3 Pro** via Vertex AI
- [x] Orchestrated via **Google Cloud Agent Builder / ReAct loop on Vertex**
- [x] Integrates **MongoDB MCP Server** (`mongodb-mcp-server`)
- [x] Open-source GitHub repo with **Apache 2.0** license at root
- [ ] Hosted on a public URL *(filled after deploy)*
- [ ] ~3-minute demo video *(filled at submission)*
- [x] Deep use of **MongoDB Atlas Vector Search**

## License

Apache 2.0 — see [LICENSE](LICENSE).
