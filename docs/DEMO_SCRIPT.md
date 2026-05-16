# Demo Script — 3-minute submission video

> Source of truth for the shot list. Read this top-to-bottom before each take.
> Every beat below maps to a working surface; if a beat doesn't have a
> surface, the beat is wrong, not the code.

**Recording setup**

- 1920×1080 @ 30fps, MP4 H.264, system audio off, mic on (gain ~ −18 dB)
- Browser: Chrome / Arc, **dark mode**, zoom 110 %, hide bookmarks bar
- Open a fresh window, only the Mnemos tab visible
- DevTools closed; close any "Update available" banner
- Pre-load `/` so the empty state animations play on the first frame
- Pre-warm the agent (one warm-up `/ask` call before record) so Vertex
  TTFB is short on the live take

**Talking-head vs. voice-over**

Voice-over only. No talking-head insert — keeps it editorial and tight.

---

## Shot list

### 0:00 – 0:15 · Cold open

**Visual.** `/` — empty dashboard. Camera does not move. Let the staggered
`rise` animations land. Stop on the hero line for one beat before VO.

**VO.**
> Mnemos. The first AI agent that takes multi-step actions on top of
> your professional memory.

**Cue.** At 0:13, mouse drifts toward the ⌘K kbd.

---

### 0:15 – 0:30 · Ingestion

**Visual.** Click **⌘K** → command palette opens. Type `load alex` →
arrow-down to "ingest the demo corpus" → ⏎. Cut to a loading bar tile
showing `0 / 247 docs ingested` rising. End on the populated dashboard
chrome at the bottom: `Atlas · live` `Vertex · live` `247 docs · 1,184
chunks indexed`.

> 247 emails, meeting notes, calendar invites, and shared docs — chunked,
> embedded, and indexed in Atlas Vector Search.

**Cue.** Hold for ½ s on the green status pills before the next cut.

---

### 0:30 – 1:00 · Memory Q&A

**Visual.** Cmd+K again. Type the **exact** prompt:

> what did I commit to Sarah last week

⏎. Cut straight to `/ask?q=...&run=1`. The reasoning stream begins.

**What the viewer sees**, in order:

1. A monospaced `›` thought streams: *"I need to find commitments Alex
   made to Sarah within the past week…"*
2. A vermilion `→ search_memory(query: "commitments to Sarah", limit: 8)`
3. A saffron `← search_memory · 6 chunks · 312 ms`
4. Another thought refining the search
5. A second tool call narrowing by date range
6. A second observation
7. The final **answer** in serif body type, with inline citations.
8. Citation chips below.

**VO.** (overlap with the streaming)
> Watch it think. Not a black box — every retrieval, every tool call,
> every citation is rendered live. The answer is grounded in the chunks
> it actually read.

**Cue.** At 0:55 hover over a citation chip to reveal a tooltip with the
chunk excerpt for one beat.

---

### 1:00 – 1:45 · Briefing

**Visual.** Click the **Mnemos** wordmark → `/`. Click the **Action** tile
(or click /briefings in the nav). On the briefings page, the upcoming
calendar list is visible. Click `generate briefing` on **"Q3 Planning
with Eng Leads"**. Cut to the live generation page.

**Status strip ticks through:** *load event → assemble context →
synthesize 1-pager*. Markdown streams in, section by section:

- `## Attendees` — bulleted list with role + current context
- `## Open threads` — Q3 doc, identity dependency map, etc.
- `## Outstanding commitments`
- `## Suggested talking points` — 4 short questions in Alex's voice

**VO.**
> A 60-second 1-pager for any meeting on your calendar. Attendees you'll
> walk into the room with. Open threads. Outstanding promises. Four
> talking points already grounded in last week's emails.

**Cue.** At 1:42, the saved indicator flips to saffron: `saved · open
saved briefing`.

---

### 1:45 – 2:30 · The wedge (the headline beat)

**Visual.** Cmd+K. Type the **exact** prompt:

> draft a polite decline to Marcus and propose Thursday at 2pm

⏎. `/ask` opens.

**What the viewer sees:**

1. Thought: *"I need context on Marcus first."*
2. `→ search_memory(query: "Marcus")`
3. `← 4 chunks · 280 ms`
4. Thought: *"Now check Thursday availability."*
5. `→ get_calendar_events(from: "2026-05-21", to: "2026-05-21")`
6. `← 3 events · 95 ms`
7. Thought: *"Drafting the email."*
8. `→ draft_email(to: ["marcus.bell@…"], subject: "Re: design review",
   intent: "polite decline + propose Thu 2pm")`
9. `← drafted reply · awaiting approval · 1340 ms`
10. **`ApprovalCard` materializes inline.** Shows the drafted email with
    subject and body. Vermilion left-border.
11. **Mouse clicks `approve · send`.** The card flips to saffron:
    `draft email · sent · 09:42 AM`.
12. The reasoning continues:
13. Thought: *"Now schedule the alternative."*
14. `→ schedule_meeting(...)` → `← proposed`
15. **Second `ApprovalCard`** for the meeting.
16. **Mouse clicks `approve · send`.** Flips to saffron.
17. Final **answer**: *"drafted the decline and proposed Thu 2pm. both
    sent — done."*

**VO.** (overlap)
> This is the wedge. The agent searched my memory for context on Marcus,
> checked Thursday on my calendar, drafted the email in my voice,
> proposed the meeting — and waited at every step for my approval.

**Cue.** At 2:27 the camera doesn't move. Both saffron `sent` pills are
on screen.

---

### 2:30 – 2:50 · Commitments

**Visual.** Navigate to `/commitments`. The "you owe" tab is active.
Four headline stats on top: outgoing / incoming / unattributed / total.
The directional badges are immediately scannable.

**VO.**
> The ledger never goes stale. Every promise pulled out of the corpus,
> who owes whom, by when.

**Cue.** Mouse hovers over the row "You owe Alex the Q3 doc by Friday."
Cut to "Marcus owes you the design review by tomorrow." 2 s on each.

---

### 2:50 – 3:00 · Closer

**Visual.** Back to `/`. Camera holds on the hero line.

**VO.**
> Mnemos. Memory you can act on. Open source, Apache 2.0, live at
> mnemos.aryangorde.com.

**Cue.** At 2:58 the public URL fades in at the bottom of the frame.

---

## Three rehearsed scenarios (must always work)

These three are the only prompts that will be typed during the live take.
Run each three times before the final record. If any fails twice in a
row, debug before continuing.

1. **Q&A** — *"what did I commit to Sarah last week"*
   - Expected tools: `search_memory` × 1–2
   - Expected runtime: 8–18 s end to end
   - Expected citations: 3–6 chunks from `email` and `meeting_notes`

2. **Briefing** — calendar event *"Q3 Planning with Eng Leads"*
   - Expected pipeline: load event → context → synthesize
   - Expected runtime: 12–25 s
   - Expected sections in output: Attendees / Open threads / Outstanding
     commitments / Suggested talking points

3. **Action** — *"draft a polite decline to Marcus and propose Thursday
   at 2pm"*
   - Expected tools (in order): `search_memory`, `get_calendar_events`,
     `draft_email`, `schedule_meeting`
   - Expected runtime: 18–35 s end to end
   - Expected proposals: 2 ApprovalCards, both must render inline

## Pre-record checklist

- [ ] Atlas index status is `READY` (`gcloud` Atlas API or web console)
- [ ] `/health` and `/ready` return green on the production agent URL
- [ ] `/ingest/stats` returns `documents: 247` on the production agent
- [ ] Tab title says **"Mnemos — the empty vault"** before record
- [ ] Browser zoom is 110 %, dark mode confirmed in DevTools
- [ ] Three scenarios run cleanly back-to-back in under 90 s combined
- [ ] OBS / Loom / QuickTime is recording the right window
- [ ] System notifications muted, Slack quit, mail quit

## Post-record checklist

- [ ] Trim hard at 3:00.000 — judges will time it
- [ ] Add captions for the three prompts (large, vermilion, Plex Mono)
- [ ] Add a 1-frame title card at the start: just "Mnemos" in Instrument
      Serif italic on the warm black
- [ ] End card: tagline + public URL + GitHub URL
- [ ] Upload to YouTube unlisted
- [ ] Paste URL into Devpost form + this repo's README
