"""Mnemos frontend — FastHTML (pure Python, HTMX + SSE).

Six canon surfaces (home / ingest / ask / approve / memory / search) rebuilt to the design handoff,
plus restyled extras (debate / commitments / briefings). Talks to the agent backend (apps/agent-py)
over HTTP/SSE via `backend.py`. No React/Next/TypeScript; the only JS is FastHTML's bundled HTMX and
the small inline snippets in `assets.py`.
"""
from __future__ import annotations

import asyncio

from fasthtml.common import (  # type: ignore
    Div, EventStream, NotStr, RedirectResponse, Style, Title, fast_app, sse_message,
)

import backend
from styles import CSS
from surfaces import approve as approve_s
from surfaces import ask as ask_s
from surfaces import extra as extra_s
from surfaces import hero as hero_s
from surfaces import ingest as ingest_s
from surfaces import memory as memory_s
from surfaces import search as search_s

_FONTS = NotStr(
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1'
    "&family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500;600"
    '&display=swap" rel="stylesheet">'
)
_SSE_EXT = NotStr('<script src="https://cdn.jsdelivr.net/npm/htmx-ext-sse@2.2.3/dist/sse.js"></script>')

app, rt = fast_app(pico=False, hdrs=(_FONTS, Style(NotStr(CSS)), _SSE_EXT), htmlkw={"lang": "en"})


async def _chrome():
    """Fetch the bits the global chrome needs (status pills + vault foot), tolerant of a down agent."""
    ready, stats = await asyncio.gather(
        backend.get_json("/ready"), backend.get_json("/ingest/stats"))
    ready = ready if isinstance(ready, dict) else {}
    stats = stats if isinstance(stats, dict) else {}
    docs, chunks = stats.get("documents"), stats.get("chunks")
    vault = {"items": docs if isinstance(docs, int) else None,
             "chunks": chunks if isinstance(chunks, int) else None}
    return ready, vault, stats


# ─────────────────────────── canon surfaces ───────────────────────────

@rt("/")
async def home(v: str = ""):
    ready, vault, _ = await _chrome()
    return (Title("Mnemos — the memory agent"), *hero_s.render(variant=v, ready=ready, vault=vault))


@rt("/ingest")
async def ingest(v: str = ""):
    ready, vault, stats = await _chrome()
    return (Title("Mnemos — ingest"), *ingest_s.render(variant=v, stats=stats, ready=ready, vault=vault))


@rt("/ask")
async def ask(v: str = ""):
    ready, vault, _ = await _chrome()
    return (Title("Mnemos — ask"), *ask_s.render_page(variant=v, ready=ready, vault=vault))


@rt("/ask/run")
def ask_run(q: str = "", v: str = ""):
    return ask_s.render_run(q, v)


@rt("/ask/stream")
async def ask_stream(q: str = "", v: str = ""):
    async def gen():
        # collect proposed actions (email and/or meeting) + the email critique; last of each kind wins
        by_kind: dict[str, dict] = {}
        critique: dict | None = None
        async for ev in backend.stream_events("/agent/ask", {"query": q}):
            if ev.get("kind") == "observation":
                data = (ev.get("result") or {}).get("data") or {}
                name = ev.get("name")
                if name == "draft_email" and data.get("actionId"):
                    by_kind["draft_email"] = {
                        "id": data["actionId"], "kind": "draft_email", "status": "proposed",
                        "proposal": {"to": data.get("to", []), "cc": data.get("cc", []),
                                     "subject": data.get("subject", ""), "body": data.get("body", "")}}
                elif name == "schedule_meeting" and data.get("actionId"):
                    by_kind["schedule_meeting"] = {
                        "id": data["actionId"], "kind": "schedule_meeting", "status": "proposed",
                        "proposal": {"title": data.get("title", ""), "attendees": data.get("attendees", []),
                                     "proposedTimes": data.get("proposedTimes", []),
                                     "durationMinutes": data.get("durationMinutes"),
                                     "location": data.get("location"), "agenda": data.get("agenda"),
                                     "preferredIdx": data.get("preferredIdx", 0)}}
                elif name == "critique_draft" and data.get("verdict"):
                    critique = data
            frag = ask_s.render_event(ev)
            if frag is not None:
                yield sse_message(frag)
            if ev.get("kind") in ("done", "error"):
                block = ask_s.approval_block(list(by_kind.values()), critique, v)
                for part in (block if isinstance(block, tuple) else (block,)):
                    yield sse_message(part)
                yield sse_message(Div(), event="done")
                break
    return EventStream(gen())


@rt("/approve")
async def approve(v: str = "", i: int = 0):
    ready, vault, _ = await _chrome()
    data = await backend.get_json("/actions", {"status": "proposed", "limit": 25}) or {}
    actions = data.get("actions", []) if isinstance(data, dict) else []
    critiques: dict = {}
    if actions:
        results = await asyncio.gather(*[backend.get_json(f"/actions/{a['id']}/critique")
                                         for a in actions])
        for a, c in zip(actions, results):
            if isinstance(c, dict) and "verdict" in c:
                critiques[a["id"]] = c
    return (Title("Mnemos — approve"),
            *approve_s.render(variant=v, actions=actions, index=i, critiques=critiques,
                              ready=ready, vault=vault))


@rt("/approve/decide")
async def approve_decide(aid: str = "", verdict: str = "approve",
                         body: str = "", to: str = "", subject: str = ""):
    if verdict == "approve":
        # apply any inline edits (to / subject / body) so an edited draft is what gets sent
        edits: dict = {}
        if (body or "").strip():
            edits["body"] = body
        if (subject or "").strip():
            edits["subject"] = subject
        if (to or "").strip():
            edits["to"] = [t.strip() for t in to.split(",") if t.strip()]
        payload = {"edits": edits} if edits else {}
        res = await backend.post_json(f"/actions/{aid}/approve", payload)
    else:
        res = await backend.post_json(f"/actions/{aid}/reject", {})
    ok = isinstance(res, dict) and not res.get("error")
    return approve_s.decide_result(verdict, ok, res if isinstance(res, dict) else {})


@rt("/memory")
async def memory(v: str = ""):
    ready, vault, _ = await _chrome()
    graph = await backend.get_json("/graph") or {}
    return (Title("Mnemos — memory"), *memory_s.render(variant=v, graph=graph, ready=ready, vault=vault))


@rt("/search")
async def search(v: str = ""):
    ready, vault, _ = await _chrome()
    return (Title("Mnemos — search"), *search_s.render_page(variant=v, ready=ready, vault=vault))


@rt("/search/run")
async def search_run(q: str = "", v: str = ""):
    q = (q or "").strip()
    if not q:
        return Div("type a query.", cls="empty")
    data = await backend.post_json("/search", {"query": q, "limit": 10}) or {}
    if data.get("error"):
        return Div("search failed — is the agent running with Atlas configured?", cls="empty")
    return search_s.render_results(data, q, v)


# ─────────────────────────── extras (restyled) ───────────────────────────

@rt("/commitments")
async def commitments():
    ready, vault, _ = await _chrome()
    data = await backend.get_json("/commitments", {"limit": 50}) or {}
    return (Title("Mnemos — commitments"), *extra_s.commitments(data, ready=ready, vault=vault))


@rt("/debate")
async def debate():
    ready, vault, _ = await _chrome()
    return (Title("Mnemos — debate"), *extra_s.debate_page(ready=ready, vault=vault))


@rt("/debate/run")
def debate_run(q: str = ""):
    return extra_s.debate_run(q)


@rt("/debate/stream")
async def debate_stream(q: str = ""):
    async def gen():
        async for ev in backend.stream_events("/debate", {"query": q}):
            frag = extra_s.render_debate_event(ev)
            if frag is not None:
                yield sse_message(frag)
            if ev.get("kind") in ("debate_done", "synthesis_error"):
                yield sse_message(Div(), event="done")
                break
    return EventStream(gen())


@rt("/briefings")
async def briefings():
    ready, vault, _ = await _chrome()
    data = await backend.get_json("/briefings") or {}
    return (Title("Mnemos — briefings"), *extra_s.briefings_page(data, ready=ready, vault=vault))


@rt("/briefings/run")
def briefings_run(t: str = ""):
    return extra_s.briefings_run(t)


@rt("/briefings/stream")
async def briefings_stream(t: str = ""):
    async def gen():
        async for ev in backend.stream_events("/briefings/generate", {"event_title": t}):
            k = ev.get("kind")
            if k == "context_loaded":
                yield sse_message(Div(f"context · {ev.get('relatedCount','?')} related · "
                                      f"{ev.get('commitmentCount','?')} commitment leads", cls="sub faint"))
            elif k == "synthesizing":
                yield sse_message(Div("drafting…", cls="sub faint"))
            elif k == "chunk":
                yield sse_message(Div(ev.get("text", ""), cls="answer",
                                      style="display:inline;border:none;padding:0"))
            elif k == "error":
                yield sse_message(Div("error: " + ev.get("message", ""), cls="head accent"))
                yield sse_message(Div(), event="done")
                break
            elif k == "done":
                yield sse_message(Div(), event="done")
                break
    return EventStream(gen())


# redirect the old /overview + /actions into the new surfaces
@rt("/overview")
def overview():
    return RedirectResponse("/", status_code=302)


@rt("/actions")
def actions():
    return RedirectResponse("/approve", status_code=302)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5001)
