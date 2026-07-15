# @mnemos/agent-py — Python agent backend

A faithful Python port of the original TypeScript agent, built for
GenAI-engineer-shaped work: **FastAPI + a provider-neutral LLM layer (Amazon
Bedrock via `boto3`, with `google-genai` as a pluggable fallback) + `motor`
(async MongoDB) + `pydantic`**, with a **hand-rolled ReAct loop** (no agent
framework — the orchestration is the point).

Generation runs on **Claude Sonnet 4.5 (Amazon Bedrock)** and embeddings on
**Amazon Titan Text v2**; both are selected by env var (`LLM_PROVIDER` /
`EMBED_PROVIDER`) so the same loop runs on Bedrock, the Gemini API, or Vertex.
It shares the repo-root `.env.local`, the MongoDB Atlas collections, and the
Google OAuth token store, so it runs against real data and an existing
Gmail/Calendar connection with no re-auth. The FastHTML frontend
([apps/web-py](../web-py)) talks to it over the same HTTP/SSE API contract.

## Run

```bash
# from repo root — one-time venv (ensurepip-free bootstrap if needed)
python3 -m venv apps/agent-py/.venv
apps/agent-py/.venv/bin/python -m pip install -r apps/agent-py/requirements.txt

# start (port 8788 so it coexists with the TS backend on 8787)
apps/agent-py/.venv/bin/python -m uvicorn app.main:app \
  --app-dir apps/agent-py --host 127.0.0.1 --port 8788
```

Point the frontend at it: set `AGENT_URL=http://localhost:8788` in `.env.local`
and restart `npm run dev:web`.

## Layout

```
app/
  config.py              # pydantic-settings; loads repo-root .env.local
  main.py                # FastAPI app, CORS, Firebase middleware, /health /ready
  llm/
    genai_client.py      # provider dispatch: generate · embed · stream_generate (fn-calling)
    bedrock_client.py    # Amazon Bedrock (Converse + Titan embeddings)
    neutral.py           # provider-neutral message/tool format → Bedrock / Gemini
  db/mongo.py            # motor async client
  agent/
    react_loop.py        # hand-rolled ReAct + enforced critic
    prompts.py · debate_prompts.py · briefing.py
    extract_graph.py · extract_commitments.py   # LLM extraction
    tools/               # 8 tools + registry (search_memory, expand_via_graph,
                         #   get_calendar_events, get_briefing_context, draft_email,
                         #   list_commitments, schedule_meeting, critique_draft)
  lib/                   # actions · commitments · graph · critique · gmail ·
                         #   calendar · briefings · firebase_auth
  ingest/                # chunker · embedder
  routes/                # search · agent · actions · commitments · graph · auth ·
                         #   debate · briefings · ingest
```

## Parity notes

- **Verified live** against Atlas + Bedrock: `/agent/ask` (ReAct + enforced
  critic), `/search` (hybrid vector + BM25 + RRF), `/commitments` (ledger),
  `/graph`, `/actions`, `/calendar/events` (real Google Calendar),
  `/auth/google/status` (real connection), `/briefings`, `/ingest/stats`.
- **Not ported:** the MongoDB MCP client path. It's an optional, off-by-default
  feature (`MNEMOS_USE_MCP=0`); the backend talks to Atlas directly via `motor`.
  The retrieval results are identical.
- The LLM layer is provider-neutral (`app/llm/neutral.py`): the ReAct loop holds
  a single neutral message list, and each backend converts it at call time —
  Bedrock Converse blocks or Gemini `Content`/`Part`. Titan embeddings are
  1024-dim, so the Atlas vector index is built at that dimension.
