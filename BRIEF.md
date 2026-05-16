# Mnemos — Build Brief

## The one-line wedge

**Mnemos is the first AI agent that takes multi-step actions on top of your
professional memory.**

Not another search tool. Not another note-taker. Not "AI for your notes."
An *agent* that remembers everything you've seen and *does things about it*
across your inbox, calendar, and documents — under your approval.

This wedge is non-negotiable. Every feature, every UI element, every line of
copy reinforces it. If something doesn't serve "memory + multi-step action,"
cut it.

## Context: this is a hackathon submission

- **Hackathon:** Google Cloud Rapid Agent Hackathon — MongoDB partner track
- **Submission deadline:** June 12, 2026, 02:30 GMT+5:30
- **Prize bucket:** MongoDB track. 1st = $5,000, 2nd = $3,000, 3rd = $2,000
- **Judges include:** Daoud Farooqi (Partner Solutions Architect, MongoDB) and
  Gaurab Aryal (Senior PM, MongoDB) — these two specifically will look for deep
  use of MongoDB Atlas Vector Search and the MongoDB MCP server
- **Judging criteria** (from the rules):
  1. Technological implementation (Google Cloud + Partner integration quality)
  2. Design (UX considered, not boilerplate)
  3. Potential impact (size of audience + size of pain)
  4. Idea originality (the wedge matters here)

## Qualification rules — MUST haves

- ✅ Built with **Gemini 3 Pro** (via Vertex AI)
- ✅ Orchestrated via **Google Cloud Agent Builder**
- ✅ Integrates **MongoDB MCP Server** (github.com/mongodb-js/mongodb-mcp-server)
- ✅ Hosted on a public URL
- ✅ Open-source GitHub repo with Apache 2.0 license file at root
- ✅ ~3-minute demo video

Any submission missing any of the above is disqualified. None of these are
swappable.

## The aesthetic bar

Read this carefully. The bar is **"Linear-tier"** — meaning the visual and
interaction quality of Linear.app, Vercel.com, Cron, Reflect, Cmd-K palette
products. NOT "Apple-level polish" or "billion-dollar-startup polish" —
that's not achievable for a solo dev in 28 days and chasing it kills shipping.

Concrete rules:

- **No AI clichés.** No teal-purple gradients. No "✨ AI ✨" badges. No brain
  icons. No glowing orbs. No "Powered by AI" copy.
- **Dark mode by default**, with a thoughtful single-accent palette.
- **Editorial typography.** Real type hierarchy. Tight tracking on display.
  Readable body. Monospace for data and reasoning.
- **Information density where it matters** (search results, action history,
  commitment lists) and **breathing room where it doesn't** (empty states,
  briefings).
- **Every state is designed:** empty, loading, error, success. No defaults.
- **Real keyboard interactions:** Cmd+K command palette is the primary entry
  point. Cmd+Enter to submit. Esc to cancel.
- **Subtle motion that signals state**, not motion that decorates.
- **The agent reasoning stream is the visual centerpiece.** It must look like
  a serious terminal — monospaced, color-coded by step type, character-by-
  character streaming.

## Tech stack — locked

| Layer | Tech | Notes |
|---|---|---|
| Frontend | **Next.js 16 (Pages Router)** | Next.js 16 has breaking changes from older Next.js — always check `node_modules/next/dist/docs/` before writing Next-specific code |
| Language | **TypeScript** strict mode | |
| Styling | **Tailwind CSS v4** (CSS-first config — NO tailwind.config.js) | |
| Components | **Built from scratch** | NO shadcn, NO Radix wrappers, NO Material. Hand-built to match aesthetic. |
| LLM | **Gemini 3 Pro** via Vertex AI | |
| Agent | **Google Cloud Agent Builder** | Required by hackathon rules |
| Database | **MongoDB Atlas M0** (free tier) | With Atlas Vector Search |
| MCP integration | **MongoDB MCP Server** | Official, open-source |
| Embeddings | Gemini text-embedding-004 (or newest available) | |
| Auth | **Firebase Auth** — Google sign-in only | |
| Hosting | **Cloud Run** (both frontend and agent backend) | |
| Streaming | **Server-Sent Events** | For reasoning chain |
| Domain | Subdomain of an existing aryangorde.com TBD | |

## The 3-minute demo — the north star

Every feature must serve this. If a feature doesn't appear in the demo, it
shouldn't ship in v1.

**[0:00 – 0:15] Cold open.** Mnemos dashboard. Dark. Editorial. Empty state
with a single line: *"Mnemos remembers what you forget — and acts on it."*

**[0:15 – 0:30] Ingestion.** Click "Load Alex's data" → progress bar →
"247 documents indexed across 6 sources" → dashboard populates with
recent activity.

**[0:30 – 1:00] Memory Q&A with citations.** User asks via Cmd+K:
*"what did I commit to Sarah last week?"*. Reasoning stream appears live —
viewer can read the agent thinking. Final answer cites 3 emails + 1 meeting.

**[1:00 – 1:45] Briefing generation.** User clicks calendar event
"Q3 Planning with Eng Leads" → "Generate briefing." Reasoning streams.
A polished 1-pager appears: attendees with context, open threads,
outstanding commitments, suggested talking points.

**[1:45 – 2:30] THE WEDGE MOMENT — multi-step action.**
User types: *"draft a polite decline to Marcus and propose Thursday at 2pm."*
Reasoning stream shows agent: (1) searching memory for context on Marcus,
(2) calling get_calendar tool to check Thursday availability, (3) drafting
email in user's voice. Draft appears. User reads, clicks Approve. "Sent."

**[2:30 – 2:50] Commitment dashboard.** A clean ledger view: "You owe Alex
the Q3 doc by Friday." "Marcus owes you the design review by tomorrow."

**[2:50 – 3:00] Closer.** Single tagline. Public URL. End.

## Feature priority — build in this order

Do NOT move on until each step is genuinely working end-to-end.

### Layer 1: Foundations (Days 1–3)
1. Repo init, Next.js 16 + TS + Tailwind v4 with zero boilerplate cruft
2. MongoDB Atlas M0 cluster + Vector Search index configured
3. Vertex AI Gemini 3 access verified with a hello-world completion + embedding
4. Ingestion endpoint: upload `.txt` → semantic chunk → embed → store
5. Search endpoint: query → vector search → return chunks with scores
6. Minimal UI: search box + result list with citations and scores
7. **Sample data fixture:** 247 realistic synthetic documents for fictional
   PM "Alex Chen" — 2 weeks of emails, calendar invites, meeting notes,
   shared docs. Generate these via Gemini in a script. They must be
   coherent (people exist across messages, threads reference each other,
   commitments span multiple files).

### Layer 2: The agent (Days 4–8)
8. Google Cloud Agent Builder project + Gemini 3 agent configured
9. MongoDB MCP server wired in as a tool
10. ReAct loop with these tools: `search_memory`, `get_calendar_events`,
    `get_briefing_context`, `draft_email`, `list_commitments`,
    `schedule_meeting` (simulated)
11. Streaming endpoint that emits each reasoning step as SSE events
12. Q&A working end-to-end: ask question → agent retrieves + reasons →
    streams thought process → returns answer with citations

### Layer 3: The wedge — multi-step actions (Days 9–14)
13. Action approval system: agent proposes action → user sees draft →
    approve/edit/reject
14. Email drafting in user's voice (extract voice from sample sent emails)
15. Calendar scheduling tool (simulated — stores proposed meeting in MongoDB
    rather than calling real Google Calendar; this is fine for the demo)
16. Multi-step flow end-to-end: "decline Marcus, propose Thursday" works

### Layer 4: Polish surfaces (Days 15–22)
17. Cmd+K command palette as primary entry point
18. Briefing generator UI — clean 1-pager output
19. Commitment dashboard
20. Activity history showing past agent actions
21. The reasoning stream component, polished to centerpiece quality
22. Empty states, loading states, error states all designed

### Layer 5: Demo readiness (Days 23–28)
23. Deploy frontend + agent backend to Cloud Run
24. Subdomain + HTTPS
25. Three rehearsed demo scenarios that always work
26. Record 3-min video, multiple takes, pick best
27. Devpost submission: story, screenshots, architecture diagram, video
28. Open-source repo: README with setup instructions, Apache 2.0 license,
    architecture diagram in `/docs`
29. **Submit by Day 27** (June 10) — leave a 2-day buffer before deadline

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend — Next.js 16 on Cloud Run                           │
│ • Cmd+K command palette (primary input)                      │
│ • Dashboard, search, briefings, commitments                  │
│ • Reasoning stream component (SSE consumer)                  │
│ • Action approval modal                                      │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTPS + SSE
┌────────────────────────┴─────────────────────────────────────┐
│ Agent backend — Node on Cloud Run                            │
│ • Google Cloud Agent Builder client                          │
│ • Gemini 3 Pro reasoning                                     │
│ • ReAct loop with tool dispatching                           │
│ • Streams thoughts/tools/observations as SSE events          │
└────┬────────────────────────────┬────────────────────┬───────┘
     │                            │                    │
     ▼                            ▼                    ▼
┌─────────────────┐    ┌───────────────────┐  ┌──────────────────┐
│ MongoDB Atlas   │    │ Firebase Auth     │  │ Simulated tools  │
│ via MCP Server  │    │ Google sign-in    │  │ (calendar, email │
│ • documents     │    │                   │  │  send) — store   │
│ • embeddings    │    │                   │  │  in Mongo as the │
│ • commitments   │    │                   │  │  source of truth │
│ • actions       │    │                   │  │  for the demo    │
└─────────────────┘    └───────────────────┘  └──────────────────┘
```

## Repository structure

```
mnemos/
  apps/
    web/                  # Next.js 16 frontend
      src/
        pages/
          index.tsx       # Dashboard
          ask.tsx         # (optional) full-screen ask view
          briefings/[id].tsx
        components/
          command-palette.tsx
          reasoning-stream.tsx
          action-approval.tsx
          memory-search.tsx
        lib/
          api-client.ts
          sse-client.ts
        styles/globals.css
    agent/                # Node backend
      src/
        agent/
          react-loop.ts
          tools/
            search-memory.ts
            get-calendar.ts
            draft-email.ts
            list-commitments.ts
            schedule-meeting.ts
          gemini-client.ts
          agent-builder-client.ts
        ingest/
          chunker.ts
          embedder.ts
        mcp/
          mongo-mcp-client.ts
        server.ts         # Express + SSE
  scripts/
    seed-alex-data.ts     # Generates 247 synthetic docs
    setup-mongo-index.ts
  docs/
    ARCHITECTURE.md
    DEMO_SCRIPT.md
  LICENSE                 # Apache 2.0
  README.md
```

## What you must NOT do

- Don't add features I haven't asked for
- Don't write multi-paragraph code comments — one line max, only when WHY is
  non-obvious
- Don't add emoji anywhere — code, copy, UI, or commits
- Don't use a UI component library — build from scratch
- Don't add "/about", "/pricing", "/team" pages or any marketing fluff
- Don't add a landing page beyond the dashboard's empty state for v1
- Don't gate the core flow behind auth until ingestion + search work
- Don't write tests in week 1 — ship the demo path first, test what survives
- Don't add error boundaries, retries, fallbacks for scenarios that can't
  happen at hackathon scale
- Don't use AI-themed visuals: no brains, sparkles, glowing orbs, "AI"
  badges, "powered by AI" copy
- Don't chase "$10B aesthetic" — chase Linear-tier and ship

## Day 1 starting instructions

When you begin work:

1. Confirm you've read this brief by summarizing back to me:
   - The wedge (one sentence)
   - The 3 things that disqualify the submission if missing
   - The Day 1–3 deliverables
   - The aesthetic bar in your own words

2. Then begin Layer 1. Do NOT skip ahead. Do NOT start designing the
   reasoning stream component before search works. Sequence matters.

3. Ask me only when you genuinely need something I haven't specified
   (credentials, a real product decision). Otherwise, make confident
   choices and ship.

4. After each layer completes, give a brief status: what works
   end-to-end, what's next, any blockers. No long status reports.

Begin.
