# Architecture

![Mnemos architecture diagram](architecture.svg)

## System diagram (ASCII fallback)

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend — Next.js 16 (Pages Router) on Cloud Run            │
│ • Cmd+K command palette (primary input)                      │
│ • Dashboard, search, briefings, commitments                  │
│ • Reasoning stream (SSE consumer)                            │
│ • Action approval modal                                      │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTPS + Server-Sent Events
┌────────────────────────┴─────────────────────────────────────┐
│ Agent backend — Node 22 + Express 5 on Cloud Run             │
│ • Google Cloud Agent Builder client                          │
│ • Gemini 3 Pro (Vertex AI)                                   │
│ • ReAct loop with tool dispatching                           │
│ • Emits thoughts / tool-calls / observations as SSE          │
└────┬────────────────────────┬────────────────────────┬───────┘
     ▼                        ▼                        ▼
┌────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ MongoDB Atlas  │  │ Firebase Auth      │  │ Simulated tools    │
│ via MCP server │  │ (Google sign-in)   │  │ calendar / send    │
│ • documents    │  │                    │  │ — persisted in     │
│ • embeddings   │  │                    │  │ Mongo as the demo  │
│ • commitments  │  │                    │  │ source of truth    │
│ • actions      │  │                    │  │                    │
└────────────────┘  └────────────────────┘  └────────────────────┘
```

## Collections (MongoDB Atlas, db `mnemos`)

| Collection      | Purpose                                                       |
|-----------------|---------------------------------------------------------------|
| `documents`     | Raw source documents (emails, meetings, notes, docs).          |
| `chunks`        | Semantic chunks with `embedding` field for vector search.      |
| `commitments`   | Open promises ("you owe X by Y"), extracted from chunks.       |
| `actions`       | Proposed + approved agent actions, with full reasoning trace.  |
| `briefings`     | Generated 1-pagers, keyed by calendar event id.                |

Vector index `mnemos_vector_index` lives on `chunks.embedding`
(768-dim, cosine, `text-embedding-004`).

## Data flow — ingestion

```
.txt upload → chunker → embedder (Vertex) → mongo.documents + mongo.chunks
```

## Data flow — Q&A

```
prompt → agent (ReAct) → search_memory tool (vector search via MCP)
       → cited answer + reasoning stream (SSE) → UI
```

## Data flow — multi-step action

```
prompt → agent → search_memory → get_calendar → draft_email
       → propose action → user approves → mongo.actions (status=sent)
```
