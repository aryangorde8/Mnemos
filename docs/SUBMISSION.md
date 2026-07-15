# Devpost submission — Mnemos

> Paste-ready copy for the Devpost form. Each section maps to a Devpost
> field. The screenshots in `docs/screenshots/` upload in numbered order
> (01 is the cover).

> **Post-hackathon update.** Mnemos was originally built and submitted on
> Google Cloud (Gemini 3 Pro / Vertex AI / Cloud Run, Next.js + Node). It has
> since migrated fully to **AWS** — **Amazon Nova Pro on Amazon Bedrock**,
> **Amazon Titan** embeddings, and a **Python** stack (FastAPI agent + FastHTML
> web) on **AWS Lightsail**. The copy below reflects the current system; the
> retrieval/critic/graph design is unchanged. (The model is a one-var switch —
> `BEDROCK_MODEL_ID` — so Claude/Llama/Mistral drop in too.)

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
   retrieves from hybrid (vector + BM25 + RRF + LLM rerank) memory
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
| Frontend | Python 3.12 + FastHTML (HTMX + SSE), server-rendered, no build step |
| Agent | Python 3.12 + FastAPI, hand-rolled ReAct loop, Server-Sent Events |
| LLM | Amazon Bedrock (Converse — streaming + function calling); default Amazon Nova Pro, model set by `BEDROCK_MODEL_ID`; pluggable to Gemini/Vertex via `LLM_PROVIDER` |
| Embeddings | Amazon Titan Text v2 (Bedrock), 1024-dim |
| Memory | MongoDB Atlas Vector Search + Atlas Search (BM25) + a graph collection |
| MCP | MongoDB MCP Server (stdio, optional, gated by `MNEMOS_USE_MCP=1`) |
| Hosting | AWS Lightsail (web + agent + Caddy via docker-compose) |
| CI | GitHub Actions (import checks + docker build) |

**The retrieval stack (the MongoDB partner-track depth):**
- `search_memory` runs `$vectorSearch` + `$search` (BM25) **in parallel**,
  merges via Reciprocal Rank Fusion (k=60), and optionally reranks the
  top candidates with a fast LLM pass. Each phase reports in the result
  summary so the reasoning stream shows the pipeline visibly.
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

**Cost/latency telemetry.** Token usage from every Bedrock stream event
is accumulated across all turns. The done event carries `totalTokens`
+ `estimatedCostUsd` (provider- and model-aware pricing — Amazon Nova Pro
by default). Shown live in the reasoning stream header.

**Calendar conflict detection.** `schedule_meeting` checks the corpus
calendar for each proposed time window, tags slots free/conflict, and
identifies the preferred slot. ApprovalCard renders the result inline.

**Real Gmail send.** OAuth 2.0 flow (`/auth/google/start` →
`/auth/google/callback`) persists per-user refresh tokens in Mongo.
When the user is connected, "approve & send" fires
`gmail.users.messages.send` for real. Gated by env vars — falls back
to simulated send when not configured.

## Challenges we ran into

- **One ReAct loop, three providers.** Rather than fork the loop per
  backend, we built a provider-neutral message/tool format (`app/llm/
  neutral.py`) that each client converts at call time — Bedrock Converse
  blocks or Gemini `Content`/`Part`. The loop holds a single neutral
  history and never sees a vendor SDK type.
- **Bedrock's strict tool protocol vs. the auto-critic.** Converse
  rejects a tool *result* that has no matching tool *use* in the prior
  turn. The Critic fires automatically (the model didn't call it), so we
  feed its audit back as a text note in the next user turn instead of a
  synthetic `toolResult` — same behaviour, protocol-legal.
- **Streaming was gated behind a use-case review.** `converse_stream`
  returned "Model use case details have not been submitted." Submitting
  the Anthropic use-case form once (it propagates in ~15 min) unblocked
  live token streaming.
- **India Marketplace payment wall → Amazon Nova.** Anthropic Claude on
  Bedrock is provisioned as an AWS Marketplace subscription, which India
  (AISPL) accounts can't complete without an international card
  (`INVALID_PAYMENT_INSTRUMENT`). We moved generation to **Amazon Nova Pro**
  — an AWS first-party model, no Marketplace subscription — so it runs on the
  AWS credit with no card. The provider-neutral layer made it a one-line
  model-id change (Titan embeddings are first-party too, so `/search` was
  never blocked).
- **Titan throttled on the bulk re-embed.** Re-embedding the whole corpus
  fired too many parallel `InvokeModel` calls and hit `ThrottlingException`.
  A concurrency semaphore (2) plus adaptive retries made it steady.
- **Embedding dimension change.** Titan v2 is 1024-dim vs. Gemini
  `text-embedding-004`'s 768, so moving embeddings to Bedrock meant
  re-embedding every chunk and rebuilding the Atlas vector index at the
  new dimension (`scripts/reembed_chunks.py` + `setup_mongo_index.py`).

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

- The Bedrock Converse API gives you streaming *and* tool calls in the
  same turn, but tool-use input arrives as *partial JSON deltas* — you
  accumulate the fragments and parse once the block closes. And every
  tool result must map to a prior tool use, which shaped how the
  auto-critic is threaded back in.
- Atlas `$vectorSearch` is cheap to query but **slow to seed at scale**.
  Embedding the corpus in parallel hit provider throttling fast; a small
  concurrency cap plus batching fixed it.
- The **right place for an approval gate is inline in the reasoning
  stream**, not a modal. Cognitive context stays intact; the user sees
  the draft *while* the Critic's findings stream in below.
- Server-rendered SSE (FastHTML + HTMX) makes the reasoning stream a
  first-class citizen with no client framework — the agent yields events
  and the page appends them, no build step and no hydration to fight.

## What's next for Mnemos

- **Deeper production integrations.** Gmail send and Google Calendar
  `events.insert` are both live via OAuth; next is inbound sync (watch
  the inbox + calendar so memory stays fresh without manual ingest).
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
amazon-nova
amazon-bedrock
amazon-titan
mongodb-atlas-vector-search
mongodb-atlas-search
mongodb-mcp-server
mongodb
aws-lightsail
python
fastapi
fasthtml
htmx
caddy
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
| Built With tags | amazon-nova · amazon-bedrock · amazon-titan · mongodb-atlas-vector-search · mongodb-atlas-search · mongodb-mcp-server · aws-lightsail · python · fastapi · fasthtml · htmx · server-sent-events |

## Gallery upload order

Upload these in this order — Devpost uses the first image as the cover thumbnail:

1. `docs/screenshots/01-cold-open.png` — **cover** — constellation hero, headline, live stream corner
2. `docs/screenshots/03-ask-reasoning.png` — full Q&A run with `[N]` markers + telemetry chip
3. `docs/screenshots/05-search-pipeline.png` — hybrid retrieval pipeline scrubber
4. `docs/screenshots/04-memory-constellation.png` — SVG star map of extracted entities
5. `docs/screenshots/06-debate.png` — multi-agent debate landing
6. `docs/screenshots/02-cmd-k.png` — ⌘K palette overlay

(Devpost gallery caps at 6 — the remaining shots `07-runs.png` + `08-overview.png` live in the repo for the README.)
