# Mnemos

> An AI agent that takes multi-step actions on top of your professional memory.

Not search. Not notes. An agent that remembers what you've seen across inbox,
calendar, and documents — and *does things about it* under your approval.

Built for the **Google Cloud Rapid Agent Hackathon — MongoDB partner track**.

- **Live:** https://mnemos.aryangorde.com
- **Agent API:** https://mnemos-agent.aryangorde.com
- **Demo (3 min):** *<YouTube link added at submission>*
- **License:** Apache 2.0

![Mnemos hero](docs/screenshots/01-cold-open.png)

## What's special

- **Hybrid retrieval** — every memory query runs `$vectorSearch` *and* `$search` (BM25) in parallel, merges via Reciprocal Rank Fusion, then optionally reranks with a fast Gemini pass. The reasoning stream renders the pipeline live; `/search` lets you scrub through each phase to see what it produced.
- **Critic sub-agent** — after every drafted email, a second adversarial agent audits the draft against the cited context. Flags unsupported claims, hallucinated specifics, voice mismatches, safety issues. Renders inline below the ApprovalCard.
- **Graph-augmented retrieval** — when the agent identifies a key entity, it walks the memory graph (people, projects, relations) and pulls in chunks no keyword search would find. The traversal animates inline in the reasoning stream.
- **Multi-agent debate** — `/debate` runs Primary + Devil's Advocate in parallel on the same query, then a Synthesizer produces the consensus answer.
- **Memory as a constellation** — `/memory` plots extracted entities as stars on RA/Dec axes, with project constellations connecting their members.
- **`[N]` claim verification** — every factual claim in the agent's answer ends with a vermilion citation pill. Hover to see the source chunk excerpt.
- **Cost/latency telemetry** — every run shows token counts + estimated USD + latency in the stream header.
- **Multi-turn conversation** — `/ask` remembers prior questions in the same session and threads context.
- **Real Gmail send** — OAuth flow wired; "approve & send" actually fires `gmail.users.messages.send` when configured.

## What it does

| Surface | Path |
|---|---|
| Constellation hero · cold open | `/` |
| The four wedges · overview | `/overview` |
| Ask · SSE reasoning stream with `[N]` citations | `/ask` |
| Memory · SVG constellation chart | `/memory` |
| Search · hybrid retrieval pipeline scrubber | `/search` |
| Debate · two agents in parallel | `/debate` |
| Runs · time-travel agent history | `/runs` |
| Briefings · 1-pager generator | `/briefings`, `/briefings/[id]` |
| Commitments ledger | `/commitments` |
| Actions ledger (with Gmail connect) | `/actions` |
| Ingest · SSE-streamed corpus loader | `/ingest` |
| ⌘K command palette | global |

## Screenshots

| | |
|---|---|
| ![Reasoning stream](docs/screenshots/03-ask-reasoning.png) | ![Search pipeline](docs/screenshots/05-search-pipeline.png) |
| *Reasoning stream — `[N]` citation pills, hybrid pipeline phases, telemetry chip* | *Hybrid retrieval pipeline scrubber* |
| ![Memory constellation](docs/screenshots/04-memory-constellation.png) | ![Debate](docs/screenshots/06-debate.png) |
| *Memory constellation chart* | *Multi-agent debate* |
| ![Runs](docs/screenshots/07-runs.png) | ![⌘K](docs/screenshots/02-cmd-k.png) |
| *Time-travel runs · click to replay* | *⌘K command palette* |

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (Pages Router), TypeScript strict, Tailwind v4 CSS-first, Framer Motion 12 |
| Agent | Python 3.12 + FastAPI, hand-rolled ReAct loop, Server-Sent Events ([apps/agent-py](apps/agent-py)) |
| LLM | Gemini 3.1 Pro (preview) via Vertex AI through the official `google-genai` SDK (streaming + function calling + thinking control) |
| Memory | MongoDB Atlas Vector Search + Atlas Search (BM25) + a graph collection, via `motor` (async driver) |
| Hosting | Cloud Run (web + agent), scale-to-zero, custom subdomains |

## Local setup

```bash
cp .env.example .env.local
# fill MONGODB_URI, GOOGLE_CLOUD_PROJECT, GOOGLE_APPLICATION_CREDENTIALS

npm install                                                      # web deps + TS script utils
npm run setup:agent                                             # python venv + agent deps
npx tsx --env-file=.env.local scripts/setup-mongo-index.ts

npm run dev:agent   # FastAPI (Python) on http://localhost:8787
npm run dev:web     # http://localhost:3000

npx tsx --env-file=.env.local scripts/seed-alex-data.ts --load   # ~5–10 min
```

## Deploy

```bash
bash scripts/deploy-agent.sh                               # prints AGENT_URL
NEXT_PUBLIC_AGENT_URL=$AGENT_URL bash scripts/deploy-web.sh
```

Full runbook: [docs/DEPLOY.md](docs/DEPLOY.md).

## Three demo scenarios that always work

| | Prompt | Surface | Time |
|---|---|---|---|
| Q&A | *what did I commit to Sarah last week* | `/ask` | 10–35s |
| The wedge | *draft a polite decline to Marcus for Monday coffee and propose Thursday at 2pm instead* | `/ask` | 60–90s |
| Search | *inference SLO slip* | `/search` | <300ms |

## Architecture

![Mnemos architecture](docs/architecture.svg)

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

Apache 2.0 — see [LICENSE](LICENSE).
