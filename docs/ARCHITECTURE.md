# Architecture

![Mnemos architecture diagram](architecture.svg)

## System diagram (ASCII fallback)

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend — Python 3.12 + FastHTML (HTMX + SSE) on AWS         │
│ • Cmd+K command palette (primary input)                      │
│ • Home, ask, search, memory, approve, briefings, commitments │
│ • Reasoning stream (SSE consumer, server-rendered)           │
│ • Inline ApprovalCard + CritiqueCard                         │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTPS + Server-Sent Events
┌────────────────────────┴─────────────────────────────────────┐
│ Agent backend — Python 3.12 + FastAPI on AWS                 │
│ • Amazon Bedrock — Claude Sonnet 4.5 (Converse API)          │
│ • hand-rolled ReAct loop with tool dispatching               │
│ • provider-neutral message layer (Bedrock / Gemini / Vertex) │
│ • emits thoughts / tool-calls / observations as SSE          │
└────┬────────────────────────┬────────────────────────┬───────┘
     ▼                        ▼                        ▼
┌────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ MongoDB Atlas  │  │ Google OAuth       │  │ Real Gmail /       │
│ • documents    │  │ (Gmail + Calendar  │  │ Calendar tools     │
│ • chunks       │  │  send scopes)      │  │ • gmail.send       │
│ • commitments  │  │ tokens in Atlas    │  │ • calendar.events  │
│ • actions      │  │                    │  │ (simulated until   │
│ • entities     │  │                    │  │  a Google account  │
│ • relations    │  │                    │  │  is connected)     │
└────────────────┘  └────────────────────┘  └────────────────────┘
```

Both containers plus **Caddy** (automatic TLS) run on a single **AWS Lightsail**
box via `docker-compose` — see [../deploy/aws](../deploy/aws).

## Models

| Role | Model | Provider | Notes |
|---|---|---|---|
| Generation + streaming | Claude Sonnet 4.5 | Amazon Bedrock (Converse) | tool-use + streaming; pluggable to Gemini/Vertex via `LLM_PROVIDER` |
| Embeddings | Amazon Titan Text v2 | Amazon Bedrock | 1024-dim, cosine; pluggable via `EMBED_PROVIDER` |

The provider is chosen by env var (`LLM_PROVIDER` / `EMBED_PROVIDER`) with no code
change; `/ready` and the topbar pill report the live provider + model.

## Collections (MongoDB Atlas, db `mnemos`)

| Collection      | Purpose                                                       |
|-----------------|---------------------------------------------------------------|
| `documents`     | Raw source documents (emails, meetings, notes, docs).          |
| `chunks`        | Semantic chunks with `embedding` field for vector search.      |
| `commitments`   | Open promises ("you owe X by Y"), extracted from chunks.       |
| `actions`       | Proposed + approved agent actions, with full reasoning trace.  |
| `briefings`     | Generated 1-pagers, keyed by calendar event id.                |
| `entities` / `relations` | People/projects and their edges — the memory graph.   |
| `gmail_tokens`  | Per-user Google OAuth refresh tokens (Gmail + Calendar).       |

Vector index `mnemos_vector_index` lives on `chunks.embedding`
(1024-dim, cosine, Amazon Titan Text v2). Switching embedding provider changes
the dimension, so it requires a one-time re-embed + index rebuild
(`scripts/reembed_chunks.py` + `scripts/setup_mongo_index.py`).

## Data flow — ingestion

```
.txt upload → chunker → embedder (Titan on Bedrock) → mongo.documents + mongo.chunks
```

## Data flow — Q&A

```
prompt → agent (ReAct, Claude) → search_memory tool (hybrid vector + BM25 + RRF)
       → optional expand_via_graph (entity walk) → cited answer + reasoning stream (SSE) → UI
```

## Data flow — multi-step action

```
prompt → agent → search_memory → get_calendar_events → draft_email
       → critique_draft (auto) → propose action → user approves
       → gmail.send / calendar.events (real when connected) → mongo.actions (status=sent)
```
