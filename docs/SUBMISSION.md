# Devpost submission — Mnemos

Drop this copy into the Devpost form. Fields below mirror the Devpost
submission UI exactly.

---

## Tagline (140 chars)

> Mnemos is the first AI agent that takes multi-step actions on top of your professional memory — under your approval.

## Hero one-liner

> Not search. Not notes. An agent that remembers what you've seen across
> inbox, calendar, and documents — and *does things about it*.

---

## Inspiration

Knowledge workers don't have a memory problem; they have a *retrieval and
follow-through* problem. The Q3 doc you promised Sarah, the design review
Marcus is waiting on, the renewal email June flagged — they all live in
your inbox already. The hard part is recalling them at the right moment
and acting on them quickly.

Every "AI for your notes" tool stops at the recall step. Mnemos is built
around the next step: *the agent watches itself think, proposes a concrete
action grounded in your memory, and waits for your approval before
anything ships.*

## What it does

Mnemos is a memory-first agent for a senior product manager. You ingest
your professional corpus (emails, calendar, meeting notes, shared docs,
slack, personal jots) once. From then on, you can:

1. **Ask** — *"what did I commit to Sarah last week?"* The agent retrieves
   the relevant memory, streams its reasoning live, and returns an answer
   with chunk-level citations.
2. **Brief** — Click any calendar event and get a 60-second 1-pager:
   attendees with current context, open threads, outstanding commitments,
   suggested talking points. The agent watches the reasoning unfold in
   real time.
3. **Act** — *"draft a polite decline to Marcus and propose Thursday at
   2pm."* The agent searches memory for Marcus context, checks Thursday
   availability, drafts an email in your voice, schedules the proposed
   meeting, and surfaces both proposals inline for one-click approval.
4. **Track** — A commitment dashboard makes "you owe Alex the Q3 doc by
   Friday" and "Marcus owes you the design review by tomorrow" first-class
   surfaces.

The reasoning stream is the centerpiece — no black box. Every thought,
tool call, observation, and citation is rendered as a terminal-grade
character-by-character stream so the user can see *why* the agent did what
it did.

## How we built it

| Layer        | Tech                                            |
|--------------|-------------------------------------------------|
| Frontend     | **Next.js 16** (Pages Router), TS strict, **Tailwind v4** CSS-first |
| Agent        | **Node 22 + Express 5**, hand-rolled ReAct loop streaming SSE |
| LLM          | **Gemini 3 Pro** on Vertex AI (function calling + streaming) |
| Embeddings   | `text-embedding-004` on Vertex AI, 768-dim cosine |
| Memory       | **MongoDB Atlas Vector Search** (`$vectorSearch`) |
| MCP          | **MongoDB MCP Server** as a stdio JSON-RPC tool |
| Hosting      | **Cloud Run** for both services, **Cloud Build** CI |
| Container reg| Artifact Registry                                |

The agent exposes six tools to Gemini via function calling:
`search_memory`, `get_calendar_events`, `get_briefing_context`,
`draft_email`, `list_commitments`, `schedule_meeting`. The ReAct loop is
an async generator that yields typed events (`start`, `thought`,
`tool_call`, `observation`, `answer`, `citations`, `done`); the SSE
endpoint pipes those straight to the browser. The web side parses the
event stream, buffers thought / answer chunks, and renders them
character-by-character with proper streaming UI states (live caret,
auto-scroll, color-coded by event kind).

Action-producing tools (`draft_email`, `schedule_meeting`) write a
proposal to a dedicated `actions` collection in Mongo and return an
`actionId`. The reasoning stream UI detects this and renders an inline
`ApprovalCard` — the user can edit, approve, or reject without leaving
the conversation. Approved actions flip status to `sent`; the ledger
view at `/actions` shows the full history.

We use the MongoDB MCP server (the official one from `mongodb-mcp-server`)
for vector-search queries. The agent spawns it as a child process,
speaks JSON-RPC over stdio, calls `tools/aggregate` with the
`$vectorSearch` pipeline, and falls back to direct Mongo access if the
MCP path fails — so the partner integration is real, not theatrical.

## Challenges we ran into

- **Streaming SSE through Express 5.** The initial implementation
  listened to `req.on("close")` to clean up heartbeats; Express 5's
  request stream emits `close` when the readable side ends (after the
  POST body is consumed), so we were aborting the stream before writing
  the first event. Fix: listen on `res.on("close")` instead, since that
  fires only when the underlying connection terminates.
- **Function calling + streaming in one Gemini call.** Vertex's
  `streamGenerateContent` returns text *and* `functionCall` parts
  interleaved within a single turn. The ReAct loop has to flush pending
  text as a "thought" event before the tool call, then resume on the
  next turn after the function response is appended to history.
- **Coherent synthetic data.** 247 documents are useless if the names,
  dates, and threads don't line up across files. We define a static
  "world" with 8 narrative threads (Q3 planning, Lantern, Marcus 1:1,
  Sarah's Q3 doc, Acme pricing, hiring, audit-log, background) and
  generate one batched Gemini call per thread asking for a structured
  JSON payload of the right document mix. People recur, dates align,
  commitments span multiple files.
- **Editorial aesthetic vs. dense information.** Building a Linear-tier
  dark interface that also displays a 12-row search-result list with
  citations, scores, and per-source glyphs took a real design pass.
  We landed on a warm near-black palette with a single vermilion accent
  (`#e84a35`), Instrument Serif for display, IBM Plex Sans for body, IBM
  Plex Mono for the reasoning stream — and committed hard to one accent
  color across every surface.

## Accomplishments we're proud of

- A live reasoning stream that *looks like a serious terminal* — not a
  chat bubble. Color-coded by step kind, animated caret on the live line,
  citation chips at the end.
- The full wedge demo works inside a single page: ask, watch reasoning,
  see the ApprovalCard materialize inline, click approve, see the status
  flip — no modal, no navigation, no page reload.
- A 1-pager briefing generator that streams the markdown live and renders
  each section (Attendees / Open threads / Outstanding commitments /
  Suggested talking points) with its own accent color.
- The agent fails gracefully without credentials. Every endpoint returns
  a clear diagnostic; nothing crashes. Made dev-without-creds practical.

## What we learned

- The Vertex AI Function Calling API gives you streaming *and* tool calls
  in the same turn — but you must keep `text` and `functionCall` parts in
  order in the response history, or the next turn will go off the rails.
- Atlas `$vectorSearch` is cheap to query but expensive to seed at
  hackathon scale — embed in batches of 5, not one-at-a-time.
- Tailwind v4's CSS-first config (no `tailwind.config.js`) lets you put
  your entire design system in `globals.css`. Custom utilities via
  `@utility` are a clean replacement for `@layer components`.
- An ApprovalCard inside the reasoning stream is the right place for
  approvals — *not* a separate modal. It keeps the cognitive context
  intact.

## What's next for Mnemos

- **Real Google integrations.** The calendar and email tools currently
  simulate sends by writing to Mongo. Wiring up actual Google Calendar +
  Gmail APIs is one step.
- **Voice extraction at sign-up.** A small onboarding flow that samples
  100 outbound emails and produces the personal voice fixture on day one.
- **Multi-user.** A real auth gate (Firebase) and per-user vault
  isolation.
- **Streaming briefings into the reasoning stream.** Today the briefing
  generator has its own SSE stream; folding it into the unified `/ask`
  flow would let you do *"brief me on Q3 planning"* without switching
  surfaces.

---

## Built With

- gemini-3-pro
- vertex-ai
- google-cloud-agent-builder
- mongodb-atlas-vector-search
- mongodb-mcp-server
- google-cloud-run
- google-cloud-build
- nextjs
- typescript
- tailwindcss
- node-js
- express
- server-sent-events

## Try it out

- Live: **`https://mnemos.aryangorde.com`**
- Repo: **`https://github.com/aryangorde/mnemos`**
- Demo video: **`<YouTube/Vimeo link>`**

## Team

- **Aryan Gorde** — solo build

---

## Form-by-form quick paste

| Field | Value |
|---|---|
| Title | Mnemos |
| Tagline | The first AI agent that takes multi-step actions on top of your professional memory. |
| Submission URL | https://mnemos.aryangorde.com |
| Video URL | `<demo video link>` |
| Repo URL | https://github.com/aryangorde/mnemos |
| Track | MongoDB partner track |
| License | Apache 2.0 |
