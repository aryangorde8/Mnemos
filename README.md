# Mnemos

> An AI agent that takes multi-step actions on top of your professional memory.

Not search. Not notes. An agent that remembers what you've seen across inbox,
calendar, and documents — and *does things about it* under your approval.

Built for the **Google Cloud Rapid Agent Hackathon — MongoDB partner track**.

## What it does

| Surface | Path |
|---|---|
| Empty-state dashboard | `/` |
| Corpus loader (SSE progress) | `/ingest` |
| Vault search with citations | `/search` |
| Ask the agent (SSE reasoning stream) | `/ask` |
| Briefings — 1-pager generator | `/briefings`, `/briefings/[id]` |
| Action approval (draft email / schedule meeting) | inline in `/ask` + `/actions` |
| Commitments ledger | `/commitments` |
| ⌘K command palette | global |

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (Pages Router), TypeScript, Tailwind v4 |
| Agent | Node 22 + Express 5, hand-rolled ReAct loop, SSE |
| LLM | Gemini 3 Pro via Vertex AI (streaming + function calling) |
| Memory | MongoDB Atlas Vector Search (768-dim cosine, `text-embedding-004`) |
| MCP | MongoDB MCP Server (stdio, gated by `MNEMOS_USE_MCP=1`) |
| Hosting | Cloud Run (web + agent), scale-to-zero |

## Local setup

```bash
cp .env.example .env.local
# fill MONGODB_URI, GOOGLE_CLOUD_PROJECT, GOOGLE_APPLICATION_CREDENTIALS

npm install
npx tsx --env-file=.env.local scripts/setup-mongo-index.ts

npm run dev:agent   # http://localhost:8787
npm run dev:web     # http://localhost:3000

npx tsx --env-file=.env.local scripts/seed-alex-data.ts --load   # ~5–10 min
```

## Deploy

```bash
bash scripts/deploy-agent.sh                               # prints AGENT_URL
NEXT_PUBLIC_AGENT_URL=$AGENT_URL bash scripts/deploy-web.sh
```

Full runbook: [docs/DEPLOY.md](docs/DEPLOY.md).

## Architecture

![Mnemos architecture](docs/architecture.svg)

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

Apache 2.0 — see [LICENSE](LICENSE).
