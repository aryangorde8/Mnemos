# @mnemos/web-py — FastHTML frontend

The Mnemos UI, in **pure Python** (no TypeScript, no build step): FastHTML +
HTMX, with native Server-Sent Events for the reasoning stream. Replaces the old
Next.js/React app.

It renders HTML server-side and talks to the agent backend (`apps/agent-py`)
over HTTP/SSE — the browser only ever talks to this frontend (so there's no
cross-origin/CORS concern; the agent URL is server-side config).

## Run

```bash
npm run setup:web          # python venv + deps (or: python3 -m venv .venv && pip install -r requirements.txt)
AGENT_URL=http://localhost:8787 npm run dev:web   # http://localhost:3000
```

`AGENT_URL` points at the agent service (default `http://localhost:8787`).

## Layout

```
main.py      # FastHTML app: shell + pages + the SSE reasoning-stream proxy
backend.py   # httpx client for the agent backend (incl. SSE proxy)
styles.py    # the editorial-dark palette/typography (carried from the React app)
```

## Pages

`/` home · `/overview` status · `/ask` (SSE reasoning stream) · `/search`
(hybrid retrieval) · `/debate` (multi-agent, SSE) · `/memory` (entities) ·
`/commitments` (ledger) · `/actions` (proposals).

How the stream works: `/ask` posts via HTMX to `/ask/run`, which returns an
`hx-ext="sse"` container connected to `/ask/stream?q=…`. That route proxies the
agent's `POST /agent/ask` SSE and re-emits each event as an HTML fragment, which
HTMX appends (`hx-swap="beforeend"`); a final `done` event closes the stream.
