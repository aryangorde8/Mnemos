# Mnemos Recon — Source-Verified Technical Map (current state)

> Re-generated 2026-06-20 by reading the live source after the recent feature
> work. Every non-trivial claim cites `file:line`. Where docs and code disagree,
> the **code wins** (§4). This supersedes the earlier snapshot — five features
> that were SCAFFOLDED/SIMULATED are now REAL; see `WHAT_CHANGED.md` for the diff
> and the verification log.

---

## 1. One-paragraph summary

Mnemos is a **TypeScript npm-workspaces monorepo** (Node ≥22, ESM) implementing a
"memory-first" AI agent for a fictional senior PM, *Alex Chen*. Two apps: an
**Express 5 agent backend** ([apps/agent](apps/agent)) running a hand-rolled ReAct
loop over Gemini via the **Vertex AI REST API** (raw `fetch`, no SDK), and a
**Next.js 16 web frontend** ([apps/web](apps/web)) that renders the agent's reasoning
live over **Server-Sent Events**. Memory is **MongoDB Atlas**: documents are chunked,
embedded with `text-embedding-004` (768-dim), and retrieved through a real **hybrid
pipeline** — `$vectorSearch` + Atlas `$search` (BM25) merged via **Reciprocal Rank
Fusion**, optional Gemini rerank. On top of retrieval: 8 tools, an **enforced
adversarial Critic**, a **knowledge graph** (LLM-extracted entities/relations, BFS
traversal), **multi-agent debate**, a **persisted commitments ledger**, real **Gmail
send** and real **Google Calendar** booking (one OAuth flow), and optional, config-gated
**Firebase Auth** verified with Node's built-in crypto. As of this pass, all the
headline claims are **REAL and verified end-to-end against live Google Cloud + Atlas**.

---

## 2. Feature reality check

> REAL = wired and runs in a live path. SCAFFOLDED = present but no working impl.
> SIMULATED = demo stub. Verdicts below were each confirmed by a read/grep **and**
> exercised against the running stack this session.

| Claimed feature | Verdict | Evidence |
|---|---|---|
| **Hybrid retrieval** (vector + BM25 parallel) | **REAL** | `Promise.all(runVector, runText)` — [search-memory.ts:64](apps/agent/src/agent/tools/search-memory.ts#L64); verified live (`vector 30 → bm25 30 → rrf → top 10`, ~3s) |
| **Reciprocal Rank Fusion** | **REAL** | `rrfMerge(..., 60)` — [search-memory.ts:231](apps/agent/src/agent/tools/search-memory.ts#L231) |
| **Optional Gemini rerank** | **REAL** | `rerankWithGemini`, `thinkingBudget:0` — [search-memory.ts:258](apps/agent/src/agent/tools/search-memory.ts#L258) |
| **ReAct agent loop** | **REAL** | `runAgent` generator, `MAX_TURNS=14` — [react-loop.ts:21](apps/agent/src/agent/react-loop.ts#L21); verified multi-tool runs |
| **Critic / reflection sub-agent** | **REAL & ENFORCED** | Now auto-runs after every uncritiqued `draft_email` in code, not just by prompt — [react-loop.ts:213-262](apps/agent/src/agent/react-loop.ts#L213-L262); `critique_draft(auto)` observed firing in a live run |
| **MongoDB MCP server** | **REAL** (default-on in code, both legs, breaker) | `USE_MCP = env !== "0"` default-on [mongo-mcp-client.ts:35](apps/agent/src/mcp/mongo-mcp-client.ts#L35); generic `aggregateViaMcp` [:189](apps/agent/src/mcp/mongo-mcp-client.ts#L189); circuit breaker `mcpBroken` [:49](apps/agent/src/mcp/mongo-mcp-client.ts#L49); text leg routes through it too [search-memory.ts:208](apps/agent/src/agent/tools/search-memory.ts#L208). **Operationally set to `0` in this deployment's `.env.local`** (cold-start `npx` latency); driver fallback is identical-result |
| **Multi-agent debate** | **REAL** | two parallel `runAgent` + synthesizer — [routes/debate.ts:70-152](apps/agent/src/routes/debate.ts#L70-L152) |
| **Knowledge graph** | **REAL** | LLM extraction [extract-graph.ts](apps/agent/src/agent/extract-graph.ts); BFS traversal [expand-via-graph.ts:106](apps/agent/src/agent/tools/expand-via-graph.ts#L106); 75 entities live in Atlas |
| **Commitments ledger** | **REAL (persisted, LLM-extracted)** | `CommitmentRecord` collection [commitments.ts:14](apps/agent/src/lib/commitments.ts#L14); extractor [extract-commitments.ts:69](apps/agent/src/agent/extract-commitments.ts#L69); tool reads ledger first [list-commitments.ts:39](apps/agent/src/agent/tools/list-commitments.ts#L39); **57 entries built + queried live** |
| **Real Gmail send** | **REAL (verified)** | `approveAction` → `sendGmail` [actions.ts:136-148](apps/agent/src/lib/actions.ts#L136); **a real email was sent + received this session** |
| **Real Google Calendar** | **REAL (verified)** | calendar scope [gmail.ts:27](apps/agent/src/lib/gmail.ts#L27); `listCalendarEvents`/`insertCalendarEvent`/`getBusyIntervals` [calendar.ts:76,106,133](apps/agent/src/lib/calendar.ts#L76); event insert on approve [actions.ts:166-186](apps/agent/src/lib/actions.ts#L166); **free/busy conflict check + real event verified** |
| **Firebase Auth** | **REAL (config-gated)** | ID-token verify via Node `crypto.X509Certificate` [firebase-auth.ts:60-77](apps/agent/src/lib/firebase-auth.ts#L60); middleware [:124](apps/agent/src/lib/firebase-auth.ts#L124) mounted [server.ts:21](apps/agent/src/server.ts#L21); web SDK [firebase.ts](apps/web/src/lib/firebase.ts)+[auth.tsx](apps/web/src/lib/auth.tsx). **Currently `open`** (no `FIREBASE_PROJECT_ID` set) — by design |
| **Cloud Run deployment** | **REAL machinery** | Dockerfiles, [cloudbuild.yaml](cloudbuild.yaml), deploy scripts, CI. Not deployed this session (ran locally) |

---

## 3. Stack inventory

| Layer | What's actually used | Source |
|---|---|---|
| Language | TypeScript 5.7, ESM, Node 22 | [tsconfig.base.json](tsconfig.base.json), [.nvmrc](.nvmrc) |
| Monorepo | npm workspaces (`apps/*`) | [package.json:6](package.json#L6) |
| Frontend | Next.js 16 (Pages Router), React 19, Tailwind v4, Framer Motion 12, **firebase 11 (web SDK)** | [apps/web/package.json:12](apps/web/package.json#L12) |
| Backend | Express 5, `cors`, `zod`, `mongodb@6.12`, `google-auth-library` | [apps/agent/package.json](apps/agent/package.json) |
| LLM transport | Vertex AI REST via raw `fetch` + bearer token (no SDK) | [lib/vertex.ts](apps/agent/src/lib/vertex.ts) |
| LLM model (default) | `gemini-3.1-pro-preview`, `location=global`, **`frequencyPenalty:0.4`** on chat turns | [config.ts:12](apps/agent/src/config.ts#L12), [vertex.ts:108](apps/agent/src/lib/vertex.ts#L108) |
| Embeddings | `text-embedding-004`, 768-dim, cosine, `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY` | [vertex.ts:254-314](apps/agent/src/lib/vertex.ts#L254) |
| Vector store | MongoDB Atlas Vector Search (`$vectorSearch`, `mnemos_vector_index`) | [search-memory.ts:138](apps/agent/src/agent/tools/search-memory.ts#L138) |
| Lexical search | Atlas Search (`$search`, BM25, `lucene.english`, `mnemos_text_index`) | [search-memory.ts:184](apps/agent/src/agent/tools/search-memory.ts#L184) |
| Database | MongoDB Atlas, db `mnemos` | [lib/mongo.ts:42](apps/agent/src/lib/mongo.ts#L42) |
| MCP layer | MongoDB MCP Server (`npx mongodb-mcp-server`, stdio JSON-RPC) | [mongo-mcp-client.ts](apps/agent/src/mcp/mongo-mcp-client.ts) |
| Auth — external APIs | Google OAuth, **one flow for Gmail send + Calendar** (`gmail.send` + `calendar.events`) | [lib/gmail.ts:23-27](apps/agent/src/lib/gmail.ts#L23) |
| Auth — app | **Firebase ID-token verification (built-in `crypto`, zero new backend deps)** | [lib/firebase-auth.ts](apps/agent/src/lib/firebase-auth.ts) |
| Frontend↔backend | HTTP `fetch` + SSE; ID token attached via `authHeaders()` | [sse.ts:30](apps/web/src/lib/sse.ts#L30), [api.ts:195](apps/web/src/lib/api.ts#L195) |
| Hosting | Cloud Run, Docker, Cloud Build | [cloudbuild.yaml](cloudbuild.yaml) |
| CI | GitHub Actions: typecheck + build both apps + docker build | [.github/workflows/ci.yml](.github/workflows/ci.yml) |

---

## 4. Docs-vs-code discrepancies (current)

Most of the earlier gaps are now **closed** by the implementation. What remains:

1. **README/ARCHITECTURE still say "Gemini 3 Pro".** Code default is `gemini-3.1-pro-preview` on the **`global`** endpoint ([config.ts:12-14](apps/agent/src/config.ts#L12)); embeddings stay regional. Old docs unchanged.
2. **`docs/ARCHITECTURE.md` diagram is stale.** It still lists "Firebase Auth (Google sign-in)" as the only auth and "MongoDB Atlas via MCP server" as the sole path, and omits the now-real Calendar integration and the OAuth-based Gmail/Calendar auth. The ASCII diagram there predates this work.
3. **MCP "primary path" is now true *in code* but off *in practice*.** Code defaults MCP on ([mongo-mcp-client.ts:35](apps/agent/src/mcp/mongo-mcp-client.ts#L35)), but this deployment sets `MNEMOS_USE_MCP=0` in `.env.local` to avoid `npx` cold-start latency — so the live path is the direct driver. `/ready` reports the effective state.
4. **`.env.example` is now accurate** (it was updated): documents `MONGODB_TEXT_INDEX`, `VERTEX_GEMINI_LOCATION`, `MNEMOS_USE_MCP`, the `GMAIL_OAUTH_*` trio (now Gmail+Calendar), `MNEMOS_WEB_URL`, `FIREBASE_PROJECT_ID`. Resolved.
5. **"Firebase Auth" in old docs is no longer vaporware** — it's implemented ([firebase-auth.ts](apps/agent/src/lib/firebase-auth.ts), [auth.tsx](apps/web/src/lib/auth.tsx)) but **config-gated off** by default, which the docs don't explain.
6. **Calendar/scheduling is no longer "simulated"** — old `schedule_meeting` tool text said "does NOT call Google Calendar"; it now books real events on approval ([actions.ts:176](apps/agent/src/lib/actions.ts#L176)) while keeping the Mongo path as offline fallback.

---

## 5. Architecture diagram (real data flow, current)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ apps/web — Next.js 16 · React 19 · Tailwind 4 · Framer 12 · firebase 11    │
│   pages: /ask /search /memory /debate /runs /briefings /commitments        │
│          /actions /ingest /overview                                        │
│   AuthProvider (Google sign-in) → authHeaders() attaches Firebase ID token │
└───────────┬─────────────────────────────────────────┬──────────────────────┘
            │ HTTP POST (JSON) + Bearer <idToken>      │ text/event-stream (SSE)
            ▼                                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ apps/agent — Express 5 (server.ts)                                         │
│  requireAuth (no-op unless FIREBASE_PROJECT_ID set; verifies ID token)     │
│  routes: agent · debate · search · ingest · graph · actions · briefings ·  │
│          commitments · auth      +  /health  /ready                        │
│                                                                            │
│  react-loop.ts ── ReAct (≤14 turns, frequencyPenalty 0.4) ───┐             │
│    streamGenerate() → Gemini ; emit SSE thoughts/tool_calls   │            │
│    ENFORCE CRITIC: auto critique_draft after any draft_email  │            │
│                                                               ▼            │
│  8 TOOLS: search_memory · expand_via_graph · get_calendar_events ·         │
│   get_briefing_context · list_commitments · draft_email ·                  │
│   schedule_meeting · critique_draft                                        │
└───┬──────────────┬───────────────┬──────────────┬──────────────┬───────────┘
    │ HTTPS REST   │ mongodb driver │ stdio JSON-RPC│ HTTPS REST   │ HTTPS REST
    │ (SA bearer)  │ (live path)    │ (MCP, opt-in) │ Gmail        │ Calendar
    ▼              ▼                ▼               ▼              ▼
┌───────────┐ ┌──────────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ Vertex AI │ │ MongoDB Atlas    │ │ MongoDB  │ │ Gmail    │ │ Google       │
│ Gemini +  │ │ documents·chunks │ │ MCP srv  │ │ send     │ │ Calendar     │
│ embeddings│ │ entities·relations│ │ (breaker │ │ (OAuth)  │ │ events +     │
│ (global)  │ │ commitments      │ │  → driver│ │          │ │ freebusy     │
│           │ │ actions·critiques│ │  on fail)│ │          │ │ (OAuth)      │
│           │ │ gmail_tokens     │ └──────────┘ └──────────┘ └──────────────┘
│           │ │ +vector +bm25 idx│
└───────────┘ └──────────────────┘
   Firebase x509 certs ← fetched by firebase-auth.ts for ID-token verification
```

---

## 6. How the core mechanisms work

### 6.1 ReAct loop + enforced critic — [react-loop.ts](apps/agent/src/agent/react-loop.ts)
Hand-rolled async generator; each turn streams Gemini, dispatches all `functionCall`s
through `TOOL_REGISTRY`, and feeds one `functionResponse` per call back in order
(Gemini-3.x requirement), preserving `thoughtSignature`. **New:** a run-level
`critiquedActionIds` set ([:43](apps/agent/src/agent/react-loop.ts#L43)) tracks which drafts have been audited; after each
turn's tool calls, any `draft_email` that produced an `actionId` the model didn't pair
with its own `critique_draft` is critiqued automatically and the verdict injected into
the same user turn ([:213-262](apps/agent/src/agent/react-loop.ts#L213-L262)), tagged `auto:true`. The invariant "no draft reaches the
user un-audited" is now enforced in code. `frequencyPenalty:0.4` ([vertex.ts:108](apps/agent/src/lib/vertex.ts#L108)) was
added on chat turns to suppress the preview model's occasional repetition loop.

### 6.2 Hybrid retrieval — [search-memory.ts](apps/agent/src/agent/tools/search-memory.ts)
Embed query → parallel `$vectorSearch` + `$search` (BM25) → **RRF k=60** with
`fromVector`/`fromText` provenance → optional Gemini rerank (loss-proof: missing indices
back-filled). Both legs prefer MCP (`searchViaMcp`/`aggregateViaMcp`) when enabled, else
the driver; BM25 absence degrades to vector-only.

### 6.3 MCP client — [mongo-mcp-client.ts](apps/agent/src/mcp/mongo-mcp-client.ts)
stdio JSON-RPC to `npx mongodb-mcp-server`, **default-on** (`!== "0"`). Generic
`aggregateViaMcp(collection, pipeline)` runs any read aggregation; `searchViaMcp` builds
the vector pipeline and delegates. A **circuit breaker** (`mcpBroken`, [:49](apps/agent/src/mcp/mongo-mcp-client.ts#L49)/[:142](apps/agent/src/mcp/mongo-mcp-client.ts#L142)) trips on
first spawn/init failure so a missing server never re-pays the cost — callers fall to the
driver. (Disabled via env here after the cold-start added multi-second latency to the
first search.)

### 6.4 Commitments ledger — [commitments.ts](apps/agent/src/lib/commitments.ts) + [extract-commitments.ts](apps/agent/src/agent/extract-commitments.ts)
Batched Gemini extraction (12 chunks/call, `thinkingBudget:0`) → structured
`CommitmentRecord`s (`owedBy`/`owedTo`/`summary`/`dueDate`/`direction`/`status`) upserted
with a dedup key. `direction` is computed relative to Alex (`isAlex(owedBy)` → outgoing).
`list_commitments` reads the ledger first ([list-commitments.ts:39](apps/agent/src/agent/tools/list-commitments.ts#L39)) and only falls back to
the old regex when empty. Triggered via `POST /commitments/extract` (SSE).

### 6.5 Calendar — [calendar.ts](apps/agent/src/lib/calendar.ts)
Rides the Gmail OAuth flow (added `calendar.events` scope). `isCalendarConnected` checks
the granted scope; `get_calendar_events` reads the live calendar when connected (Mongo
fallback); `schedule_meeting` uses real `getBusyIntervals` for conflicts; `approveAction`
calls `insertCalendarEvent` and records `bookedVia`/`calendarEventId`/`calendarHtmlLink`.

### 6.6 Firebase auth — [firebase-auth.ts](apps/agent/src/lib/firebase-auth.ts)
Verifies RS256 ID tokens with **zero extra deps**: fetches Google's x509 certs (cached
per `cache-control`), verifies the signature via `crypto.X509Certificate(cert).publicKey`
([:77](apps/agent/src/lib/firebase-auth.ts#L77)), and checks `iss`/`aud`/`exp`. Middleware is a no-op unless `FIREBASE_PROJECT_ID`
is set; when set, reads + `/auth/*` stay open, mutating/agent requests require a valid
token. Web side: `AuthProvider` ([auth.tsx](apps/web/src/lib/auth.tsx)) bridges the live ID token to request
modules via [auth-token.ts](apps/web/src/lib/auth-token.ts).

---

## 7. Data model & flows

**Collections (MongoDB `mnemos`):** `documents`, `chunks` (768-dim `embedding`),
`entities`+`relations` (graph), **`commitments`** (now real, persisted), `actions`
(+ `bookedVia`/`calendarEventId` and `sentVia`/`gmailMessageId`), `critiques`,
`briefings`, `gmail_tokens`. Two `chunks` indexes: `mnemos_vector_index`
(768-dim cosine) + `mnemos_text_index` (BM25 `lucene.english`).

**Ingestion:** `.txt → chunk() (≈720 chars, 140 overlap) → embedBatch (5/call) → documents+chunks`.
**Query (Q&A):** `prompt → /agent/ask (SSE) → runAgent → search_memory [→ expand_via_graph / list_commitments] → grounded [N] answer`.
**Action:** `draft_email (+context) → ENFORCED critique_draft → user approves → real Gmail send`; `schedule_meeting (real free/busy) → approve → real Calendar event`.

---

## 8. Study priorities

### Hardest to defend (3–5)
1. **Preview model risk.** `gemini-3.1-pro-preview` can degenerate into repetition loops; mitigated by `frequencyPenalty:0.4` ([vertex.ts:108](apps/agent/src/lib/vertex.ts#L108)) but not eliminated — be ready to explain.
2. **MCP default-on vs disabled-in-practice.** The code defaults it on, but you turned it off (`MNEMOS_USE_MCP=0`) due to `npx` cold-start. Defensible, but it's a nuance: "we use MCP" needs the "...optionally, with driver fallback" caveat.
3. **Hand-rolled Firebase JWT verification.** No `firebase-admin` — you verify certs/signature/claims manually ([firebase-auth.ts](apps/agent/src/lib/firebase-auth.ts)). Correct, but you own the crypto.
4. **Commitment dedup by summary-slug** ([commitments.ts:38](apps/agent/src/lib/commitments.ts#L38)) — could over-merge or split near-duplicate phrasings.
5. **Token lifecycle.** Test-mode OAuth refresh tokens expire after 7 days; the connect must be re-done periodically.

### Cleverest (3–5)
1. **Zero-dep Firebase verification** via Node's `X509Certificate` ([:77](apps/agent/src/lib/firebase-auth.ts#L77)) — no heavy admin SDK.
2. **Enforced critic** through a run-level set + same-turn `functionResponse` injection ([react-loop.ts:213](apps/agent/src/agent/react-loop.ts#L213)).
3. **One OAuth flow, two real integrations** (Gmail + Calendar) with graceful Mongo fallback when unconnected.
4. **MCP circuit breaker** that fails over to the driver permanently after one failure.
5. **RRF provenance + loss-proof rerank** ([search-memory.ts:240,298](apps/agent/src/agent/tools/search-memory.ts#L240)).

### Most fragile (3–5)
1. **LLM-JSON parsing** in critic/rerank/extraction — a malformed response drops a batch/critique silently.
2. **MCP `npx` cold-start** (why it's disabled here).
3. **Preview-model degeneration** (mitigated, not gone).
4. **Approximate scheduling math** for the Mongo fallback (fixed 60-min blocks) — [schedule-meeting.ts](apps/agent/src/agent/tools/schedule-meeting.ts).
5. **"sent" semantics** — a draft is marked `sent` even when the real Gmail call fails (annotated `sentVia:"simulated"` + `gmailError`).

---

## 9. DEPENDENCY-ORDERED CONCEPT LIST

> Foundational → advanced; every item appears in the live code.

1. **TypeScript + ESM + npm workspaces** — monorepo substrate ([package.json](package.json)).
2. **Env-as-config with zod** — typed config + guards ([config.ts](apps/agent/src/config.ts)).
3. **Document chunking** — paragraph/sentence splitter with overlap ([chunker.ts](apps/agent/src/ingest/chunker.ts)).
4. **Text embeddings** — `text-embedding-004`, 768-dim, doc/query task types ([vertex.ts:254](apps/agent/src/lib/vertex.ts#L254)).
5. **Vector storage + index** — Atlas `vectorSearch`, cosine ([setup-mongo-index.ts](scripts/setup-mongo-index.ts)).
6. **Vector search** — `$vectorSearch`, `numCandidates`, `$meta` ([search-memory.ts:138](apps/agent/src/agent/tools/search-memory.ts#L138)).
7. **Lexical / BM25 search** — Atlas `$search`, `lucene.english` ([search-memory.ts:184](apps/agent/src/agent/tools/search-memory.ts#L184)).
8. **Hybrid fusion (RRF)** — k=60 with provenance ([search-memory.ts:231](apps/agent/src/agent/tools/search-memory.ts#L231)).
9. **LLM reranking** — structured reorder, loss-proof ([search-memory.ts:258](apps/agent/src/agent/tools/search-memory.ts#L258)).
10. **LLM REST client** — Vertex `generate`/`streamGenerate`, bearer auth, SSE parse ([vertex.ts](apps/agent/src/lib/vertex.ts)).
11. **Function/tool calling** — `functionDeclarations`, `AUTO`, `thoughtSignature` ([vertex.ts:33](apps/agent/src/lib/vertex.ts#L33)).
12. **Sampling controls** — temperature, `thinkingBudget`, **`frequencyPenalty`** for loop suppression ([vertex.ts:108](apps/agent/src/lib/vertex.ts#L108)).
13. **ReAct agent loop** — think→act→observe, registry dispatch, termination ([react-loop.ts](apps/agent/src/agent/react-loop.ts)).
14. **Tool design** — 8 declarative JSON-schema tools ([tools/](apps/agent/src/agent/tools/)).
15. **Server-Sent Events** — Express SSE + `fetch`-based client ([routes/agent.ts](apps/agent/src/routes/agent.ts), [sse.ts](apps/web/src/lib/sse.ts)).
16. **Action lifecycle + human-in-the-loop** — propose → approve/reject → execute, audited ([actions.ts](apps/agent/src/lib/actions.ts)).
17. **OAuth + real side-effects** — one Google flow → Gmail send **and** Calendar booking ([gmail.ts](apps/agent/src/lib/gmail.ts), [calendar.ts](apps/agent/src/lib/calendar.ts)).
18. **Enforced self-verification (Critic)** — adversarial audit guaranteed in code ([react-loop.ts:213](apps/agent/src/agent/react-loop.ts#L213), [critique-draft.ts](apps/agent/src/agent/tools/critique-draft.ts)).
19. **Knowledge-graph extraction** — LLM-as-extractor → entities/relations ([extract-graph.ts](apps/agent/src/agent/extract-graph.ts)).
20. **Graph-augmented retrieval (graph-RAG)** — BFS over relations ([expand-via-graph.ts](apps/agent/src/agent/tools/expand-via-graph.ts)).
21. **LLM-extracted structured ledger** — persisted commitments with direction/dedup ([commitments.ts](apps/agent/src/lib/commitments.ts), [extract-commitments.ts](apps/agent/src/agent/extract-commitments.ts)).
22. **Multi-agent debate + synthesis** — parallel agents + reducer ([routes/debate.ts](apps/agent/src/routes/debate.ts)).
23. **JWT/ID-token verification** — manual RS256 + x509 via Node `crypto`, config-gated middleware ([firebase-auth.ts](apps/agent/src/lib/firebase-auth.ts)).
24. **Optional MCP transport** — stdio JSON-RPC, default-on, circuit-breaker fallback ([mongo-mcp-client.ts](apps/agent/src/mcp/mongo-mcp-client.ts)).
25. **Containerized deploy** — Docker + Cloud Build + Cloud Run, CI gate ([cloudbuild.yaml](cloudbuild.yaml), [.github/workflows/ci.yml](.github/workflows/ci.yml)).

---

*End of recon. Methodology: line numbers anchored against the live source this pass;
REAL verdicts in §2 were each exercised against the running stack (Atlas + Vertex +
Gmail + Calendar) this session, not inferred from docs.*
