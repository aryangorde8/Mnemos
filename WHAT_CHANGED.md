# What changed — making five features real

Implemented 2026-06-20. Each section says what it does now, where it lives, and
what you must provision for the external parts to light up. Both apps typecheck
and build clean (`npm run typecheck`, `npm --workspace apps/web run build`).

---

## 1. Critic sub-agent — now ENFORCED in code

**Before:** `critique_draft` ran only if the model chose to call it.
**Now:** the ReAct loop guarantees every `draft_email` is audited.

- [react-loop.ts](apps/agent/src/agent/react-loop.ts): after a turn's tool calls, any `draft_email` that produced an `actionId` and was **not** paired with the model's own `critique_draft` is critiqued automatically, and the verdict is fed back into the same turn. Tracked via a run-level `critiquedActionIds` set so a draft is never double-critiqued.
- The auto-run emits the normal `tool_call`/`observation` SSE events with `args.auto = true`, so the UI can label an enforced critique.

No provisioning needed — works wherever the agent already runs.

## 2. MongoDB MCP server — now DEFAULT-ON and broader

**Before:** off unless `MNEMOS_USE_MCP=1`, vector leg only, silent fallback.
**Now:** on by default, both retrieval legs, with a circuit breaker.

- [mongo-mcp-client.ts](apps/agent/src/mcp/mongo-mcp-client.ts): `USE_MCP` defaults on (set `MNEMOS_USE_MCP=0` to disable). New generic `aggregateViaMcp(collection, pipeline)`; `searchViaMcp` delegates to it. A **circuit breaker** (`mcpBroken`) trips on the first spawn/init failure so a missing MCP server doesn't re-pay the spawn+timeout cost on every search — callers fall straight to the driver.
- [search-memory.ts](apps/agent/src/agent/tools/search-memory.ts): the **BM25/text leg** now also routes through MCP (the vector leg already did), each with driver fallback.

Provisioning: none required (npx fetches `mongodb-mcp-server`); if it can't, the driver path is used transparently.

## 3. Firebase Auth — real, config-gated (no new backend deps)

**Before:** claimed in docs/env, zero implementation.
**Now:** real Google sign-in on the web + real ID-token verification on the agent.

- **Agent** [firebase-auth.ts](apps/agent/src/lib/firebase-auth.ts): verifies Firebase RS256 ID tokens using only Node's built-in `crypto` (fetches Google's x509 certs, checks signature + `iss`/`aud`/`exp`). Middleware mounted in [server.ts](apps/agent/src/server.ts) — **no-op when `FIREBASE_PROJECT_ID` is unset**; when set, read-only GETs and `/auth/*` stay open but every mutating/agent request needs a valid token.
- **Web** [firebase.ts](apps/web/src/lib/firebase.ts) / [auth.tsx](apps/web/src/lib/auth.tsx) / [auth-control.tsx](apps/web/src/components/auth-control.tsx): `AuthProvider` + Google popup sign-in + a top-right sign-in/out control (renders nothing when unconfigured). The current ID token is bridged to non-React request modules via [auth-token.ts](apps/web/src/lib/auth-token.ts) and attached to SSE runs ([sse.ts](apps/web/src/lib/sse.ts)) and action mutations ([api.ts](apps/web/src/lib/api.ts)).

Provisioning: create a Firebase project; set `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (web) and `FIREBASE_PROJECT_ID` (agent). Leave unset to keep the open demo behaviour.

## 4. Calendar scheduling — real Google Calendar API

**Before:** simulated in Mongo, never touched Google.
**Now:** reads the live calendar, checks real free/busy, and books real events on approval.

- The Google OAuth flow now also requests `calendar.events` ([gmail.ts](apps/agent/src/lib/gmail.ts)).
- [calendar.ts](apps/agent/src/lib/calendar.ts): `listCalendarEvents`, `insertCalendarEvent`, `getBusyIntervals` (raw REST, reusing the existing OAuth token store).
- [get-calendar-events.ts](apps/agent/src/agent/tools/get-calendar-events.ts) reads the live calendar when connected (Mongo fallback offline). [schedule-meeting.ts](apps/agent/src/agent/tools/schedule-meeting.ts) checks real free/busy for conflicts. On approval, [actions.ts](apps/agent/src/lib/actions.ts) `approveAction` inserts a real event and records `bookedVia`/`calendarEventId`/`calendarHtmlLink`.

Provisioning: enable the **Calendar API** on your Google Cloud project and **re-connect** Google (the existing Gmail OAuth client gains the calendar scope; old tokens must re-consent). Until then it falls back to the Mongo simulation.

## 5. Commitments ledger — persisted, LLM-extracted

**Before:** regex over chunk text at query time.
**Now:** a real `commitments` collection populated by an LLM extraction pass.

- [lib/commitments.ts](apps/agent/src/lib/commitments.ts): structured `CommitmentRecord` (owedBy/owedTo/summary/dueDate/status/direction/evidence), upsert with dedup, filtered list, status updates.
- [extract-commitments.ts](apps/agent/src/agent/extract-commitments.ts): batched Gemini extraction → persisted ledger (mirrors the graph extractor). Triggered via `POST /commitments/extract` (SSE) — wired in [routes/commitments.ts](apps/agent/src/routes/commitments.ts), plus `/commitments/stats` and `/commitments/:id/status`.
- [list-commitments.ts](apps/agent/src/agent/tools/list-commitments.ts) reads the ledger first and only falls back to the old regex when the ledger is empty (keeps offline demos alive). Output stays backward-compatible with the existing UI.
- [seed-alex-data.ts](scripts/seed-alex-data.ts) now auto-builds the graph **and** the commitments ledger after `--load`, so both work immediately after seeding.

Provisioning: none beyond what the agent already needs (Mongo + Vertex). Run a seed/load, or `POST /commitments/extract?rebuild=1`, to populate it.

---

## Config additions

See [.env.example](.env.example) — newly documented: `MONGODB_TEXT_INDEX`,
`MNEMOS_USE_MCP`, `VERTEX_GEMINI_LOCATION`, the corrected
`VERTEX_GEMINI_MODEL=gemini-3.1-pro-preview`, the `GMAIL_OAUTH_*` trio (now Gmail
**+** Calendar), `MNEMOS_WEB_URL`, and `FIREBASE_PROJECT_ID` (agent-side).
