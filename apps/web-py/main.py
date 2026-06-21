"""Mnemos frontend — FastHTML (pure Python, HTMX + SSE). Replaces the React app.

Serves the UI and talks to the agent backend (apps/agent-py) over HTTP/SSE.
"""
from __future__ import annotations

from urllib.parse import quote

from fasthtml.common import (  # type: ignore
    A, Div, EventStream, Form, H1, H3, Header, Input, Main, Nav, NotStr, P, Span,
    Style, Table, Tbody, Td, Th, Thead, Title, Tr, fast_app, sse_message,
)

import backend
from styles import CSS

_FONTS = NotStr(
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1'
    "&family=IBM+Plex+Mono:wght@300;400;500&family=IBM+Plex+Sans:wght@300;400;500;600"
    '&display=swap" rel="stylesheet">'
)
_SSE_EXT = NotStr('<script src="https://cdn.jsdelivr.net/npm/htmx-ext-sse@2.2.3/dist/sse.js"></script>')

app, rt = fast_app(pico=False, hdrs=(_FONTS, Style(CSS), _SSE_EXT), htmlkw={"lang": "en"})

NAV = [("overview", "/overview"), ("ask", "/ask"), ("search", "/search"), ("debate", "/debate"),
       ("memory", "/memory"), ("commitments", "/commitments"), ("actions", "/actions")]


def shell(active: str, *content):
    nav = Header(
        Div(
            A(Span("Mnemos", cls="brand"), href="/"),
            Span("mn. · the memory agent", cls="tag"),
            Nav(*[A(label, href=href, cls=("on" if active == label else "")) for label, href in NAV]),
            cls="wrap",
        ),
        cls="nav",
    )
    return (nav, Main(Div(*content, cls="wrap"), style="padding:40px 0 120px"))


# ─────────────────────────── pages ───────────────────────────

@rt("/")
def home():
    return (Title("Mnemos — the memory agent"), shell(
        "",
        Div(
            P("01 · multi-step reasoning over memory", cls="eyebrow"),
            H1("Your professional memory,", Span(" made navigable.", cls="accent i")),
            P("Not search. Not notes. An agent that remembers what you've seen across inbox, "
              "calendar, and documents — and does things about it under your approval.",
              cls="muted", style="max-width:620px; font-size:1.12rem"),
            Div(A("watch it reason →", href="/ask", cls="btn primary"),
                A("tour the memory", href="/memory", cls="btn"),
                style="display:flex; gap:12px; margin-top:28px"),
            cls="hero",
        ),
    ))


@rt("/overview")
async def overview():
    ready = await backend.get_json("/ready") or {}
    stats = await backend.get_json("/ingest/stats") or {}
    graph = await backend.get_json("/graph/stats") or {}
    commits = await backend.get_json("/commitments/stats") or {}

    def kpi(n, label):
        return Div(Div(str(n), cls="kpi"), Div(label, cls="label", style="margin-top:8px"), cls="card")

    ents = graph.get("entities", {}) if isinstance(graph, dict) else {}
    return (Title("Mnemos — overview"), shell(
        "overview",
        P("00 · the system", cls="eyebrow"),
        H1("What Mnemos ", Span("knows.", cls="accent i")),
        Div(
            kpi(stats.get("documents", "—"), "documents"),
            kpi(stats.get("chunks", "—"), "memory chunks"),
            kpi(commits.get("count", "—"), "open commitments"),
            cls="grid cols-3", style="margin-top:32px",
        ),
        Div(
            kpi(sum(ents.values()) if ents else "—", "graph entities"),
            kpi(graph.get("relations", "—"), "relations"),
            kpi(ready.get("geminiModel", "—"), "model"),
            cls="grid cols-3", style="margin-top:16px",
        ),
        Div(
            P("backend", cls="label"),
            P(f"atlas {ready.get('atlas','?')} · vertex {ready.get('vertex','?')} · "
              f"gmail {ready.get('gmail','?')} · firebase {ready.get('firebaseAuth','?')} · "
              f"runtime {ready.get('runtime','?')}", cls="mono faint", style="font-size:.8rem; margin-top:6px"),
            cls="card", style="margin-top:16px",
        ),
    ))


@rt("/ask")
def ask():
    return (Title("Mnemos — ask"), shell(
        "ask",
        P("03 · multi-step reasoning", cls="eyebrow"),
        H1("What should the agent ", Span("do for you?", cls="accent i")),
        Form(
            Input(name="q", cls="field", placeholder="what did I commit to Sarah last week?",
                  autocomplete="off", autofocus=True),
            hx_get="/ask/run", hx_target="#result", hx_swap="innerHTML",
            style="margin-top:18px",
        ),
        Div(id="result", style="margin-top:8px"),
    ))


@rt("/ask/run")
def ask_run(q: str = ""):
    q = (q or "").strip()
    if not q:
        return Div("type a question and hit enter.", cls="empty")
    return Div(
        P(Span("● ", cls="accent"), Span("streaming", cls="mono"), f" · {q}", cls="mono faint",
          style="font-size:.8rem; margin-bottom:6px"),
        Div(
            id="stream", cls="stream",
            hx_ext="sse", sse_connect=f"/ask/stream?q={quote(q)}",
            sse_swap="message", hx_swap="beforeend", sse_close="done",
        ),
    )


@rt("/ask/stream")
async def ask_stream(q: str = ""):
    async def gen():
        async for ev in backend.stream_events("/agent/ask", {"query": q}):
            frag = render_event(ev)
            if frag is not None:
                yield sse_message(frag)
            if ev.get("kind") in ("done", "error"):
                yield sse_message(Div(), event="done")
                break
    return EventStream(gen())


def render_event(ev: dict):
    kind = ev.get("kind")
    if kind == "thought":
        return Span(ev.get("chunk", ""), cls="tok-thought")
    if kind == "tool_call":
        args = ev.get("args", {}) or {}
        auto = " (auto)" if args.get("auto") else ""
        summary = ", ".join(f"{k}: {v}" for k, v in args.items() if k != "auto")[:140]
        return Div(P("→ " + ev.get("name", "") + auto, cls="head accent"),
                   P(summary, cls="sub"), cls="stream-block")
    if kind == "observation":
        res = ev.get("result", {}) or {}
        sub = res.get("summary") or (("error: " + res.get("error", "")) if not res.get("ok") else "ok")
        return Div(P("← " + ev.get("name", ""), cls="head faint"),
                   P(str(sub)[:160], cls="sub"), cls="stream-block")
    if kind == "answer":
        return Div(ev.get("chunk", ""), cls="answer")
    if kind == "error":
        return Div("error: " + ev.get("message", ""), cls="answer accent")
    if kind == "done":
        u = ev.get("usage", {}) or {}
        return Div(f"{ev.get('turns','?')} turns · {u.get('totalTokens','?')} tokens · "
                   f"${u.get('estimatedCostUsd','?')} · {ev.get('totalMs','?')}ms",
                   cls="sub faint mono", style="margin-top:18px")
    return None


@rt("/search")
def search():
    return (Title("Mnemos — search"), shell(
        "search",
        P("05 · hybrid retrieval", cls="eyebrow"),
        H1("Search the ", Span("memory.", cls="accent i")),
        Form(
            Input(name="q", cls="field", placeholder="inference SLO slip", autocomplete="off", autofocus=True),
            hx_get="/search/run", hx_target="#sresult", hx_swap="innerHTML",
            style="margin-top:18px",
        ),
        Div(P("vector + BM25 + reciprocal rank fusion", cls="label", style="margin-top:10px")),
        Div(id="sresult", style="margin-top:18px"),
    ))


@rt("/search/run")
async def search_run(q: str = ""):
    q = (q or "").strip()
    if not q:
        return Div("type a query.", cls="empty")
    data = await backend.post_json("/search", {"query": q, "limit": 10}) or {}
    results = data.get("results", [])
    if not results:
        return Div(f"no matches for “{q}”.", cls="empty")
    phases = " → ".join(data.get("phases", []))
    rows = [Div(
        Div(Span(r.get("source", ""), cls="pill"), " ", Span(r.get("title", ""), cls="t")),
        Div((r.get("text", "") or "")[:240], cls="x"),
        cls="result") for r in results]
    return Div(P(f"{phases} · {data.get('tookMs','?')}ms", cls="label", style="margin-bottom:8px"), *rows)


@rt("/commitments")
async def commitments():
    data = await backend.get_json("/commitments", {"limit": 50}) or {}
    items = data.get("commitments", []) if isinstance(data, dict) else []
    body = []
    for c in items:
        d = c.get("direction", "")
        body.append(Tr(
            Td(Span("● ", cls=("dir-out" if d == "outgoing" else "dir-in")), d, cls="mono"),
            Td(c.get("owedBy", ""), cls="mono faint"),
            Td(c.get("owedTo", ""), cls="mono faint"),
            Td(c.get("summary") or c.get("excerpt", "")),
            Td(c.get("dueDate") or "—", cls="mono faint"),
        ))
    table = (Table(Thead(Tr(Th("dir"), Th("from"), Th("to"), Th("commitment"), Th("due"))),
                   Tbody(*body), cls="ledger") if body
             else Div("ledger is empty — run the seed to build it.", cls="empty"))
    return (Title("Mnemos — commitments"), shell(
        "commitments",
        P("04 · the ledger", cls="eyebrow"),
        H1("What's ", Span("owed.", cls="accent i")),
        P(f"{len(items)} open commitments · source: {data.get('source','—')}", cls="label",
          style="margin:10px 0 20px"),
        table,
    ))


@rt("/memory")
async def memory():
    data = await backend.get_json("/graph") or {}
    ents = data.get("entities", {}) if isinstance(data, dict) else {}
    stats = data.get("stats", {}) if isinstance(data, dict) else {}

    def col(title, rows):
        items = [Div(Span(e.get("name", ""), cls="t"),
                     Span(f"  {e.get('mentions',0)}×", cls="faint mono", style="font-size:.78rem"),
                     Div(e.get("role") or "", cls="x") if e.get("role") else "",
                     cls="result") for e in rows[:18]]
        return Div(P(title, cls="label", style="margin-bottom:8px"),
                   *(items or [Div("—", cls="empty")]), cls="card")

    e = stats.get("entities", {})
    return (Title("Mnemos — memory"), shell(
        "memory",
        P("02 · the constellation", cls="eyebrow"),
        H1("The people & projects ", Span("in orbit.", cls="accent i")),
        P(f"{e.get('person','—')} people · {e.get('project','—')} projects · "
          f"{stats.get('relations','—')} relations", cls="label", style="margin:10px 0 22px"),
        Div(col("people", ents.get("person", [])),
            col("projects", ents.get("project", [])),
            col("topics", ents.get("topic", [])),
            cls="grid cols-3"),
    ))


@rt("/actions")
async def actions():
    data = await backend.get_json("/actions", {"limit": 25}) or {}
    items = data.get("actions", []) if isinstance(data, dict) else []
    cards = []
    for a in items:
        p = a.get("proposal", {}) or {}
        kind = a.get("kind")
        title = (p.get("subject") if kind == "draft_email" else p.get("title")) or "(untitled)"
        meta = f"{kind} · {a.get('status')}"
        if a.get("sentVia"):
            meta += f" · {a.get('sentVia')}"
        if a.get("bookedVia"):
            meta += f" · {a.get('bookedVia')}"
        cards.append(Div(
            P(meta, cls="label"),
            H3(title, style="margin:6px 0"),
            P((p.get("body") or p.get("agenda") or "")[:220], cls="muted"),
            cls="card", style="margin-bottom:14px"))
    return (Title("Mnemos — actions"), shell(
        "actions",
        P("06 · the ledger of intent", cls="eyebrow"),
        H1("What the agent ", Span("proposed.", cls="accent i")),
        P(f"{len(items)} actions", cls="label", style="margin:10px 0 20px"),
        *(cards or [Div("no actions yet.", cls="empty")]),
    ))


@rt("/debate")
def debate():
    return (Title("Mnemos — debate"), shell(
        "debate",
        P("· multi-agent debate", cls="eyebrow"),
        H1("Primary ", Span("vs.", cls="accent i"), " Devil's Advocate."),
        P("two agents reason over the same query in parallel, then a synthesizer commits to a call.",
          cls="muted", style="max-width:600px"),
        Form(
            Input(name="q", cls="field", placeholder="should I cut the saved-view feature for the launch?",
                  autocomplete="off", autofocus=True),
            hx_get="/debate/run", hx_target="#dresult", hx_swap="innerHTML", style="margin-top:18px",
        ),
        Div(id="dresult", style="margin-top:8px"),
    ))


@rt("/debate/run")
def debate_run(q: str = ""):
    q = (q or "").strip()
    if not q:
        return Div("type a question.", cls="empty")
    return Div(
        P(Span("● ", cls="accent"), Span("two agents thinking", cls="mono"), cls="mono faint",
          style="font-size:.8rem; margin-bottom:6px"),
        Div(id="stream", cls="stream", hx_ext="sse", sse_connect=f"/debate/stream?q={quote(q)}",
            sse_swap="message", hx_swap="beforeend", sse_close="done"),
    )


@rt("/debate/stream")
async def debate_stream(q: str = ""):
    async def gen():
        async for ev in backend.stream_events("/debate", {"query": q}):
            frag = render_debate_event(ev)
            if frag is not None:
                yield sse_message(frag)
            if ev.get("kind") in ("debate_done", "synthesis_error"):
                yield sse_message(Div(), event="done")
                break
    return EventStream(gen())


def render_debate_event(ev: dict):
    kind = ev.get("kind")
    agent = ev.get("agent")
    if kind == "synthesis":
        return Div(P("⚖ synthesis", cls="head accent"), Div(ev.get("text", ""), cls="answer"),
                   cls="stream-block")
    if agent and kind == "answer":
        tag = "primary" if agent == "primary" else "devil's advocate"
        return Div(P(f"[{tag}]", cls="head " + ("accent" if agent == "primary" else "saffron")),
                   Div(ev.get("chunk", ""), cls="answer", style="font-size:1.1rem"), cls="stream-block")
    if agent and kind == "tool_call":
        return Div(P(f"[{agent}] → {ev.get('name','')}", cls="sub"), cls="stream-block",
                   style="border:none; padding:2px 0; margin:2px 0")
    return None


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5001)
