# Devpost submission — Mnemos

> Paste-ready copy for the Devpost form. Each section maps to a Devpost
> field. The screenshots in `docs/screenshots/` upload in numbered order
> (01 is the cover).

---

## Title

```
Mnemos
```

## Tagline (140 chars max)

```
The first AI agent that takes multi-step actions on top of your professional memory — with a Critic agent that audits every draft before you approve.
```

## Hero one-liner (above-the-fold callout)

> Not search. Not notes. An agent that remembers what you've seen across
> inbox, calendar, and documents — and *does things about it* under your
> approval.

---

## Inspiration

Knowledge workers don't have a memory problem — they have a *retrieval and
follow-through* problem. The Q3 doc you promised Sarah, the design review
Marcus is waiting on, the renewal email Diego flagged — they all live in
your inbox already. The hard part is recalling them at the right moment
and acting on them quickly.

Every "AI for your notes" product stops at the recall step: search-with-
better-vibes. Mnemos starts where they stop. The agent watches itself
think, proposes a concrete action grounded in your memory, runs a second
Critic agent to red-pencil its own draft, and waits for your one-click
approval before anything ships.

## What it does

Mnemos is a memory-first agent for a senior product manager. You ingest
your professional corpus (emails, calendar, meeting notes, shared docs,
slack, personal jots) once. From then on:

1. **Ask.** *"what did I commit to Sarah last week?"* — the agent
   retrieves from hybrid (vector + BM25 + RRF + Gemini rerank) memory
   and walks the entity graph if useful, streams its reasoning live,
   and returns an answer with `[N]` citation pills you can hover to
   verify against the source chunk.
2. **Brief.** Click any calendar event → a 60-second editorial 1-pager:
   attendees with current context, open threads, outstanding
   commitments, suggested talking points. Generated as the agent
   reasons.
3. **Act.** *"draft a polite decline to Marcus and propose Thursday at
   2pm."* The agent searches memory, walks the graph to find related
   context, drafts the email in your voice (extracted from your real
   outbound corpus), then a **Critic agent** runs in sequence and
   audits the draft — flagging unsupported claims, voice mismatches,
   hallucinated specifics, safety risks. `schedule_meeting` checks the
   calendar for conflicts and proposes alternates. Two ApprovalCards
   land inline; one click each, both go.
4. **Track.** A commitment ledger surfaces who owes whom by when. A
   memory graph plots people as stars and projects as constellations.
5. **Debate.** A separate `/debate` route runs two agents in parallel —
   Primary + Devil's Advocate — on the same query, with a third
   Synthesizer producing the consensus answer below.
6. **Time-travel.** Every past run is replayable. The reasoning stream
   itself is the centerpiece: terminal-grade typography, character-by-
   character SSE, color-coded by step kind, with an inline graph
   traversal animation when the agent walks the entity graph.

## How we built it

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (Pages Router), TypeScript strict, Tailwind v4 CSS-first, Framer Motion 12 |
| Agent | Node 22 + Express 5, hand-rolled ReAct loop, Server-Sent Events |
| LLM | Gemini 3 Pro via Vertex AI (streaming + function calling + thinkingBudget control) |
| Memory | MongoDB Atlas Vector Search + Atlas Search (BM25) + a graph collection |
| MCP | MongoDB MCP Server (stdio, gated by `MNEMOS_USE_MCP=1`) |
| Hosting | Cloud Run (web + agent, scale-to-zero, pre-warmed min-instances=1) |
| Build | Cloud Build, GitHub Actions CI, multi-stage Docker |

**The retrieval stack (the MongoDB partner-track depth):**
- `search_memory` runs `$vectorSearch` + `$search` (BM25) **in parallel**,
  merges via Reciprocal Rank Fusion (k=60), and optionally reranks the
  top candidates with a fast Gemini pass (thinkingBudget=0). Each phase
  reports in the result summary so the reasoning stream shows the
  pipeline visibly.
- `expand_via_graph` is a true graph-RAG tool: BFS traversal over the
  `entities` + `relations` collections starting from a seed entity,
  pulling chunks shared by every visited entity. The reasoning stream
  draws the actual traversal as an inline animated mini-constellation.
- The `/memory` page renders the full graph as an SVG star map — people
  plotted by first-seen + mention frequency, projects as constellation
  lines connecting their members.

**The Critic agent.** After every `draft_email` call, the primary agent
automatically calls `critique_draft` with the actionId. The Critic agent
runs a structured adversarial review (verdict ∈ approve / revise /
reject, findings with severity, evidence verdict, fix suggestions, voice
score 0–10) and persists to a `critiques` collection. The CritiqueCard
renders inline below the ApprovalCard with a saffron accent.

**`[N]` claim verification.** The system prompt instructs the agent to
emit `[1]` `[2]` bracket markers after every factual claim. The UI
parses these and renders interactive citation pills. Hover any `[N]`
and the matching citation chip pulses; click to scroll it into view.

**Cost/latency telemetry.** `usageMetadata` from every Vertex SSE chunk
is accumulated across all turns. The done event carries `totalTokens`
+ `estimatedCostUsd` (Gemini 3 Pro pricing baked in). Shown live in
the reasoning stream header.

**Calendar conflict detection.** `schedule_meeting` checks the corpus
calendar for each proposed time window, tags slots free/conflict, and
identifies the preferred slot. ApprovalCard renders the result inline.

**Real Gmail send.** OAuth 2.0 flow (`/auth/google/start` →
`/auth/google/callback`) persists per-user refresh tokens in Mongo.
When the user is connected, "approve & send" fires
`gmail.users.messages.send` for real. Gated by env vars — falls back
to simulated send when not configured.

## Challenges we ran into

- **Gemini 3 thinking tokens consume the output budget.** Set
  `maxOutputTokens: 1500` and the model returns truncated JSON because
  thoughts ate 1400 tokens. Fixed by adding `thinkingBudget: 0` for
  structured tasks (rerank, critique, voice extraction) and bumping
  `maxOutputTokens` to 8192 for safety.
- **SSE streaming + scroll behaviour.** Standard EventSource doesn't
  support POST bodies, so we use `fetch` + `ReadableStream` with manual
  line buffering for SSE parsing. Scroll handlers had to coalesce
  mousemove events via RAF to avoid React reconciles per pixel.
- **Cross-origin Cloud Run + Brave Shields.** `mnemos.aryangorde.com` →
  `*.run.app` triggered Brave's private-network-access prompt. Fixed
  by mapping the agent to `mnemos-agent.aryangorde.com` (same
  registrable domain, Brave stops asking).
- **Workspace `node_modules` hoisting in Docker.** npm sometimes nests
  deps under `apps/agent/node_modules` instead of hoisting. The
  multi-stage Dockerfile now mirrors both layouts so module resolution
  works at runtime.
- **Multi-toolCall handling in Gemini 3.** Gemini 3.x can emit multiple
  function calls per turn, and the next user turn must contain a
  `functionResponse` for *every* call in the same order. Plus
  `thoughtSignature` parts must be preserved verbatim. The hand-rolled
  ReAct loop handles this carefully.

## Accomplishments we're proud of

- **The reasoning stream as centerpiece.** Not a chat bubble — a
  cinematic vertical timeline with time chips in the gutter, vermilion
  pulse on active nodes, mono labels per step kind, serif pull-quote
  answers, and citation chips. Plus the inline graph-traversal
  animation when the agent walks the entity graph.
- **The Critic agent works as a real wedge.** Every draft is audited
  before the user sees it. The system prompt mandates the auto-call,
  and the agent revises once if the Critic returns high-severity.
- **Multi-agent debate as a separate surface.** Two parallel reasoning
  streams + a synthesizer. Almost no hackathon submission does this.
- **The constellation memory chart** wired to live entity data —
  RA/Dec axes, project constellations, hover sidenote with mention
  sparklines per entity.
- **Linear-tier polish.** Editorial typography (Instrument Serif italic
  display, IBM Plex Mono data), single-accent vermilion, atmospheric
  vermilion haze + paper-grain noise, no AI clichés.

## What we learned

- The Vertex AI Function Calling API gives you streaming *and* tool
  calls in the same turn — but the protocol is strict about
  `thoughtSignature` ordering. One out-of-place text part and the next
  turn goes off the rails.
- Atlas `$vectorSearch` is cheap to query but **slow to seed at
  hackathon scale**. Embedding 247 documents one at a time hit Vertex
  quota fast; batches of 5 fixed it.
- The **right place for an approval gate is inline in the reasoning
  stream**, not a modal. Cognitive context stays intact; the user sees
  the draft *while* the Critic's findings stream in below.
- Tailwind v4's CSS-first config (no `tailwind.config.js`) lets the
  entire design system live in `globals.css`. Custom `@utility` rules
  are a clean replacement for `@layer components`.

## What's next for Mnemos

- **Real production integrations.** Calendar tool currently writes to
  Mongo; wire actual Google Calendar `events.insert`. Gmail send is
  done (OAuth ready, dormant pending GCP credentials).
- **Multi-user.** Per-user vault isolation behind Firebase Auth so
  Mnemos becomes a product, not a demo.
- **Voice onboarding.** A 60-second flow that samples 100 outbound
  emails on day one and produces the personal voice fixture so the
  Critic catches voice mismatches from the first use.
- **MCP server.** Expose Mnemos's tools (search_memory,
  expand_via_graph, critique_draft) as an MCP server so other agents
  (Claude in Cursor, ChatGPT, etc.) can use Mnemos as their memory
  layer.

---

## Built With

```
gemini-3-pro
vertex-ai
mongodb-atlas-vector-search
mongodb-atlas-search
mongodb-mcp-server
mongodb
google-cloud-run
google-cloud-build
nextjs
react
typescript
tailwindcss
framer-motion
node-js
express
server-sent-events
docker
```

## Try it out

- **Live:** https://mnemos.aryangorde.com
- **Agent API:** https://mnemos-agent.aryangorde.com (try `/ready`)
- **Repo:** https://github.com/aryangorde8/Mnemos
- **Demo (3 min):** `<paste YouTube unlisted link here after recording>`

### Three demo scenarios that always work

| | Prompt | Time |
|---|---|---|
| Q&A | *what did I commit to Sarah last week* | 10–35s |
| The wedge | *draft a polite decline to Marcus for Monday coffee and propose Thursday at 2pm instead* | 60–90s |
| Search | *inference SLO slip* (via `/search`) | <300ms |

## Team

- **Aryan Gorde** — solo build · [@aryangorde8](https://github.com/aryangorde8)

---

## Devpost form quick-paste reference

| Field | Value |
|---|---|
| Project title | Mnemos |
| Tagline | The first AI agent that takes multi-step actions on top of your professional memory — with a Critic agent that audits every draft before you approve. |
| Submission URL | https://mnemos.aryangorde.com |
| Video URL | *(paste after recording)* |
| Repo URL | https://github.com/aryangorde8/Mnemos |
| Track | MongoDB partner track |
| License | Apache 2.0 |
| Built With tags | gemini-3-pro · vertex-ai · mongodb-atlas-vector-search · mongodb-atlas-search · mongodb-mcp-server · google-cloud-run · nextjs · typescript · tailwindcss · framer-motion · express · server-sent-events |

## Gallery upload order

Upload these in this order — Devpost uses the first image as the cover thumbnail:

1. `docs/screenshots/01-cold-open.png` — **cover** — constellation hero, headline, live stream corner
2. `docs/screenshots/03-ask-reasoning.png` — full Q&A run with `[N]` markers + telemetry chip
3. `docs/screenshots/05-search-pipeline.png` — hybrid retrieval pipeline scrubber
4. `docs/screenshots/04-memory-constellation.png` — SVG star map of extracted entities
5. `docs/screenshots/06-debate.png` — multi-agent debate landing
6. `docs/screenshots/02-cmd-k.png` — ⌘K palette overlay

(Devpost gallery caps at 6 — the remaining shots `07-runs.png` + `08-overview.png` live in the repo for the README.)
