# @mnemos/agent-py — Python agent backend

A faithful Python port of the TypeScript agent ([apps/agent](../agent)), built
for GenAI-engineer-shaped work: **FastAPI + the official `google-genai` SDK +
`motor` (async MongoDB) + `pydantic`**, with a **hand-rolled ReAct loop** (no
agent framework — the orchestration is the point).

It shares the same `.env.local`, the same MongoDB Atlas collections, and the
same Google OAuth token store as the TS backend, so it runs against identical
data and an existing Gmail/Calendar connection with no re-auth. The HTTP/SSE API
contract matches the TS server, so the Next.js frontend works against it
unchanged.

## Run

```bash
# from repo root — one-time venv (ensurepip-free bootstrap if needed)
python3 -m venv apps/agent-py/.venv
apps/agent-py/.venv/bin/python -m pip install -r apps/agent-py/requirements.txt

# start (port 8788 so it coexists with the TS backend on 8787)
apps/agent-py/.venv/bin/python -m uvicorn app.main:app \
  --app-dir apps/agent-py --host 127.0.0.1 --port 8788
```

Point the frontend at it: set `NEXT_PUBLIC_AGENT_URL=http://localhost:8788` in
`.env.local` and restart `npm run dev:web`.

## Layout

```
app/
  config.py              # pydantic-settings; loads repo-root .env.local
  main.py                # FastAPI app, CORS, Firebase middleware, /health /ready
  llm/genai_client.py    # google-genai: generate · embed · stream_generate (fn-calling)
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

- **Verified live** against Atlas + Vertex this session: `/agent/ask` (ReAct +
  enforced critic), `/search` (hybrid vector + BM25 + RRF), `/commitments`
  (ledger), `/graph`, `/actions`, `/calendar/events` (real Google Calendar),
  `/auth/google/status` (real connection), `/briefings`, `/ingest/stats`.
- **Not ported:** the MongoDB MCP client path. It's an optional, off-by-default
  feature (`MNEMOS_USE_MCP=0`) on the TS side; the Python backend talks to Atlas
  directly via `motor`. The retrieval results are identical.
- Gemini runs on the `global` endpoint, embeddings on the regional one — same
  split as TS. `frequencyPenalty=0.4` on chat turns (preview-model loop guard).
