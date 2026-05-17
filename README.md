# Mnemos

> An AI agent that takes multi-step actions on top of your professional memory.

Not search. Not notes. An agent that remembers what you've seen across inbox,
calendar, and documents — and *does things about it* under your approval.

Built for the **Google Cloud Rapid Agent Hackathon — MongoDB partner track**.

- **Live:** https://mnemos-web-920213762253.us-central1.run.app
- **Agent API:** https://mnemos-agent-920213762253.us-central1.run.app
- **Demo (3 min):** *added at submission*
- **License:** Apache 2.0

## What's special

- **Hybrid retrieval** — every memory query runs `$vectorSearch` *and* `$search` (BM25) in parallel, merges via Reciprocal Rank Fusion, then optionally reranks the top candidates with Gemini. The reasoning stream shows the pipeline live (`vector 20 → bm25 20 → rrf → 32 → rerank · gemini · top 8`).
- **Critic sub-agent** — after every drafted email, a second adversarial agent audits the draft against the cited context. Flags unsupported claims, hallucinated specifics, voice mismatches, and safety issues. Renders inline below the ApprovalCard so the user sees both proposals at once.
- **Memory graph** — a Gemini extractor reads every chunk and lifts named people / projects / topics + directional relations (owes / works_with / manages / discusses) into a queryable graph. Each entity gets a mentions-over-time sparkline.
- **Live reasoning stream** — every thought, tool call, observation, and citation streams character-by-character over SSE. No black boxes.

## What it does

| Surface | Path |
|---|---|
| Empty-state dashboard | `/` |
| Corpus loader (SSE progress) | `/ingest` |
| Vault search with citations + hybrid phases | `/search` |
| Ask the agent (SSE reasoning stream) | `/ask` |
| Memory graph (entities + relations) | `/memory` |
| Briefings — 1-pager generator | `/briefings`, `/briefings/[id]` |
| Action approval (draft email + critic) | inline in `/ask` + `/actions` |
| Commitments ledger | `/commitments` |
| ⌘K command palette | global |

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (Pages Router), TypeScript, Tailwind v4 CSS-first |
| Agent | Node 22 + Express 5, hand-rolled ReAct loop, SSE |
| LLM | Gemini 3 Pro via Vertex AI (streaming + function calling + JSON-mode reranker) |
| Memory | MongoDB Atlas Vector Search + Atlas Search (BM25) |
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
