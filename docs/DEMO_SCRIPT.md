# Demo script — 3-minute submission video (v2 · Mnemos-III aesthetic)

> Read top-to-bottom before each take. Every beat below maps to a working
> surface on the live URL — if a beat doesn't have a surface, the beat is
> wrong, not the code.

## Pre-record checklist

| | Status check |
|---|---|
| Atlas vector + BM25 indexes both `READY` | hit `/ready` on the agent, expect `atlas: configured` |
| Bedrock reachable (Amazon Nova) | hit `/ready`, expect `llm: bedrock` |
| Prod corpus loaded | hit `/ingest/stats`, expect `documents: 242, chunks: 268` |
| Memory graph extracted on prod | hit `/graph/stats`, expect `person: ≥36, project: ≥25, relations: ≥150` |
| Voice fixture refreshed from live corpus | `scripts/fixtures/alex-voice.md` head should mention 24 sampled emails |
| Box up (always-on, no cold start) | `docker compose ps` shows web + agent + caddy running |
| Three demo prompts work end-to-end three takes in a row | rehearse before recording |
| `mnemos.aryangorde.com` resolves with valid SSL | dig + curl check |

## Recording setup

- 1920 × 1080 @ 30 fps, MP4 H.264, system audio off, mic on (gain ≈ −18 dB)
- Browser: **Chrome or Safari** (NOT Brave — its Shields prompt every cross-site call)
- Dark mode confirmed in DevTools (`prefers-color-scheme: dark`)
- Zoom 110 %, hide bookmarks bar, no extensions visible
- Fresh window, only the Mnemos tab open
- DevTools closed, any browser banner dismissed
- **Pre-load `/` once before recording** so the constellation canvas warms up and the first auto-trace has fired
- **Pre-warm the agent** with one throwaway `/ask` call so Bedrock TTFB is short on the live take
- Voice-over only — no talking-head insert

---

## Shot list

### 0:00 – 0:15 · Cold open · the constellation

**Visual.** `https://mnemos.aryangorde.com` — fresh load. Camera does not move.
The constellation canvas particle field fades in. Hero text reveals
word-by-word: *"Your professional memory, made navigable."* The live-stream
corner widget cycles its 7-step canned reasoning trace in the side panel.

**VO.**
> Mnemos. An agent that takes multi-step actions on top of your
> professional memory.

**Cue.** At 0:08 the mouse drifts across the canvas, stars track
gently. At 0:12 click anywhere on the field — a vermilion reasoning
trace draws through the constellation in real time. *This is the only
hero animation that matters.*

---

### 0:15 – 0:35 · Q&A · grounded answer with click-to-verify

**Visual.** Press **⌘K** → command palette opens with the staggered
entrance animation. Type the **exact** prompt:

> what did I commit to Sarah last week

⏎. Cut straight to `/ask?q=…&run=1`. The reasoning stream begins.

**What the viewer sees** (in order):
1. Run header pulses: `streaming · amazon nova pro · bedrock`
2. Time chips appear in the left gutter, vermilion node marker pops
   on the rule (line 1)
3. A `›` `search_memory` tool call with the args, then an `‹` observation
   reading: **`hybrid · vector 24 → bm25 24 → rrf → 34 → top 8 · 412ms`**
4. *Optionally* a second retrieval refining the query
5. Italic mono `thoughts` streaming character-by-character
6. The **answer** in serif body type with inline `[1]` `[2]` `[3]` pills
   after every factual claim
7. Citation chips row pops in at the end with the source titles
8. Header chip lands: `12.4k tok · $0.0021 · 4.2s`

**VO** (overlap with the stream):
> Watch it think. Hybrid retrieval — vector plus BM25, fused with
> reciprocal rank fusion. Every claim cited. Hover any number — the
> matching source pulses.

**Cue.** At 0:32, hover the `[1]` pill in the answer. The matching
citation chip below glows vermilion. Hold for ½ second.

---

### 0:35 – 1:10 · Memory · the constellation chart

**Visual.** Click the **memory** link in the page nav (or ⌥3). Cut to
`/memory` showing the SVG star map: people as stars sized by mention
count, projects drawn as constellation lines connecting their members,
RA/Dec axes labeled in editorial mono.

**Action sequence:**
1. Pause for ½ second on the empty hover detail panel (right rail)
2. Hover one bright star — twinkle cross appears, name label resolves,
   right panel updates with mention sparkline + commitments
3. Hover one constellation in the legend — everything except those
   members dims to 18 % opacity
4. Pan/scroll slightly to show the four stat tiles at the bottom

**VO.**
> The graph isn't decorative. A second model pass reads every chunk
> and pulls people, projects, and commitments into Atlas as a third
> retrieval modality — graph traversal, alongside vector and BM25.

---

### 1:10 – 2:00 · The wedge · draft + Critic + schedule

**Visual.** Press **⌘K** again. Type:

> draft a polite decline to Marcus for Monday coffee and propose
> Thursday at 2pm instead

⏎. The reasoning stream lights up. This is the centerpiece beat.

**Tool sequence the viewer will see:**
1. `search_memory("Marcus")` → hybrid pipeline phase line
2. `expand_via_graph(entity="Marcus Bell")` → **`graph expand · 1 seed → 3 entities · depth 1 · 12/36 chunks · 115ms`** — visible proof of GraphRAG
3. `get_calendar_events(...)` → calendar window check
4. `draft_email(...)` → ApprovalCard slides in from below with the email
   draft, vermilion left rail, mono meta block, serif pull-quote body
5. **`critique_draft(action_id=…)` auto-fires** → CritiqueCard drops in
   below the ApprovalCard with a saffron left rail, copy-editor
   findings (severity badges, claim quotes, fix suggestions)
6. `schedule_meeting(...)` with conflict detection → second
   ApprovalCard shows Thursday 2pm as **✓ free, preferred** with
   alternates listed
7. Final answer with `[N]` citations to the chunks Marcus came from

**VO.**
> Two agents work in sequence. The drafter writes the email in Alex's
> voice — extracted from his outbound corpus. The Critic, a second
> agent, red-pencils the draft against the cited context: hallucinations,
> tone, safety issues. Schedule meeting checks the calendar for
> conflicts and proposes alternates.
>
> Nothing has been sent. The user approves with one click.

**Cue.** At 1:55, mouse hovers the ApprovalCard's `✓ approve & send`
button but doesn't click. Hold the frame for one beat.

---

### 2:00 – 2:25 · Search · hybrid retrieval visible

**Visual.** Press **⌘K**. Type `inference SLO slip` → enter as a search
(arrow-right toggles ask→search). Cut to `/search?q=…&run=1`.

**Beats to capture:**
- Header pipeline line: `12 citations · hybrid retrieval · vector 24 → bm25 24 → rrf → 36 → top 12 · 287ms`
- Each result row shows `V` and `T` source flags (vector / text)
- Score bars for the top 3

**VO.**
> Atlas runs as a vector store, a full-text index, and a graph database
> in the same query. MongoDB partner-track depth, no extra services.

---

### 2:25 – 2:50 · Commitments + actions ledger

**Visual.** Quick cut to `/commitments`. Show the directional
`→ you owe` / `← owed to you` columns with the per-row commitment
excerpts and dates. Two seconds.

Then `/actions` to show the same draft + meeting from earlier sitting
in the ledger with `proposed · awaiting approval` status. Two seconds.

**VO.**
> Every action waits in the ledger. Every commitment surfaces by who
> owes whom, by when.

---

### 2:50 – 3:00 · Closer · the wordmark

**Visual.** Back to `/`. Constellation visible. Hero text re-reveals
(route remount triggers Framer Motion). Pretty URL appears at the
bottom edge as a small overlay.

**VO.**
> Mnemos. Open source, Apache 2.0, live at mnemos.aryangorde.com.

Cut at exactly 3:00.000 — judges will time it.

---

## The three rehearsed scenarios (must always work)

These are the only prompts typed during the live take. Run each three
times back-to-back before the final record. If any fails twice in a
row, fix it before continuing.

| # | Prompt | Tools expected | Runtime |
|---|---|---|---|
| 1 | *what did I commit to Sarah last week* | search_memory ×1-2 | 8–18 s |
| 2 | *draft a polite decline to Marcus for Monday coffee and propose Thursday at 2pm instead* | search_memory, expand_via_graph, get_calendar_events, draft_email, critique_draft, schedule_meeting | 50–90 s |
| 3 | *inference SLO slip* (search, not ask) | hybrid retrieval pipeline | 1–2 s |

---

## Things to NOT do on camera

- **Brave**. Use Chrome / Safari / Firefox.
- **DevTools open** — kills the editorial composition.
- **The raw agent URL** (`mnemos-agent.…`) — only the pretty subdomain appears in the URL bar.
- **Hover the agent backend URL** — it's hidden by design.
- **Click the constellation more than twice** — once is "look, interactive",
  three times is "the demo is broken".
- **Wait through a cold start** — pre-warm before each take.
- **Show empty state on `/memory`** — graph extraction is already done on prod;
  if it shows empty, refresh.

---

## Post-record checklist

- [ ] Trim hard at 3:00.000
- [ ] Add captions for the three prompts (large, vermilion, Plex Mono)
- [ ] Optional: a 1-frame title card at the start — "Mnemos" in
      Instrument Serif italic on the warm umber background
- [ ] End card: tagline + pretty URL + GitHub URL
- [ ] Upload to YouTube unlisted
- [ ] Paste URL into Devpost form + README + SUBMISSION.md
