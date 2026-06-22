"""Extra surfaces kept from the prior build, restyled into the new chrome.

These wire to real backend endpoints (debate / commitments / briefings) that aren't part of the
six-surface design but are working product — reskinned to the new tokens for visual consistency.
"""
from urllib.parse import quote

from fasthtml.common import (  # type: ignore
    Div, Form, H3, Input, P, Span, Table, Tbody, Td, Th, Thead, Tr,
)

from chrome import page, surface_head


# ── commitments ──
def commitments(data: dict | None, ready=None, vault=None):
    data = data or {}
    items = data.get("commitments", []) if isinstance(data, dict) else []
    rows = []
    for c in items:
        d = c.get("direction", "")
        rows.append(Tr(
            Td(Span("● ", cls=("dir-out" if d == "outgoing" else "dir-in")), d, cls="mono"),
            Td(c.get("owedBy", ""), cls="mono faint"),
            Td(c.get("owedTo", ""), cls="mono faint"),
            Td(c.get("summary") or c.get("excerpt", "")),
            Td(c.get("dueDate") or "—", cls="mono faint")))
    table = (Table(Thead(Tr(Th("dir"), Th("from"), Th("to"), Th("commitment"), Th("due"))),
                   Tbody(*rows), cls="ledger") if rows
             else Div("ledger is empty — run the seed to build it.", cls="empty"))
    return page("commitments",
                surface_head("", "the ledger", Span("What's "), Span("owed.", cls="i accent")),
                P(f"{len(items)} open commitments · source {data.get('source','—')}", cls="label",
                  style="margin:10px 0 20px"),
                table, ready=ready, vault=vault)


# ── debate ──
def debate_page(ready=None, vault=None):
    return page("debate",
                surface_head("", "multi-agent debate",
                             Span("Primary "), Span("vs.", cls="i accent"), Span(" Devil's Advocate.")),
                P("Two agents reason over the same query in parallel; a synthesizer commits to a call.",
                  cls="muted", style="max-width:600px"),
                Form(Input(name="q", cls="field", autocomplete="off", autofocus=True,
                           placeholder="should I cut the saved-view feature for the launch?"),
                     hx_get="/debate/run", hx_target="#dresult", hx_swap="innerHTML",
                     style="margin-top:18px"),
                Div(id="dresult", style="margin-top:8px"),
                ready=ready, vault=vault)


def debate_run(q: str):
    q = (q or "").strip()
    if not q:
        return Div("type a question.", cls="empty")
    return Div(
        P(Span("● ", cls="accent"), Span("two agents thinking", cls="mono"), cls="mono faint",
          style="font-size:.8rem;margin-bottom:6px"),
        Div(id="stream", cls="stream", hx_ext="sse", sse_connect=f"/debate/stream?q={quote(q)}",
            sse_swap="message", hx_swap="beforeend", sse_close="done"))


def render_debate_event(ev: dict):
    kind, agent = ev.get("kind"), ev.get("agent")
    if kind == "synthesis":
        return Div(P("⚖ synthesis", cls="head accent"), Div(ev.get("text", ""), cls="answer"),
                   cls="stream-block")
    if agent and kind == "answer":
        tag = "primary" if agent == "primary" else "devil's advocate"
        return Div(P(f"[{tag}]", cls="head " + ("accent" if agent == "primary" else "saffron")),
                   Div(ev.get("chunk", ""), cls="answer", style="font-size:1.1rem"), cls="stream-block")
    if agent and kind == "tool_call":
        return Div(P(f"[{agent}] → {ev.get('name','')}", cls="sub"), cls="stream-block",
                   style="border:none;padding:2px 0;margin:2px 0")
    return None


# ── briefings ──
def briefings_page(data: dict | None, ready=None, vault=None):
    data = data or {}
    items = data.get("briefings", []) if isinstance(data, dict) else []
    cards = [Div(P(b.get("eventTitle", ""), cls="t"),
                 P((b.get("markdown", "") or "")[:220], cls="x"), cls="result") for b in items]
    return page("briefings",
                surface_head("", "the 1-pager", Span("Walk in "), Span("prepared.", cls="i accent")),
                P("Name a calendar event; the agent assembles attendees, open threads, and commitments.",
                  cls="muted", style="max-width:580px"),
                Form(Input(name="t", cls="field", autocomplete="off",
                           placeholder="Q3 Planning with Eng Leads"),
                     hx_get="/briefings/run", hx_target="#bresult", hx_swap="innerHTML",
                     style="margin-top:18px"),
                Div(id="bresult", style="margin-top:8px"),
                P("recent briefings", cls="label", style="margin:30px 0 10px"),
                *(cards or [Div("none generated yet.", cls="empty")]),
                ready=ready, vault=vault)


def briefings_run(t: str):
    t = (t or "").strip()
    if not t:
        return Div("type an event title.", cls="empty")
    return Div(
        P(Span("● ", cls="accent"), Span("assembling briefing", cls="mono"), cls="mono faint",
          style="font-size:.8rem;margin-bottom:6px"),
        Div(id="stream", cls="stream", hx_ext="sse", sse_connect=f"/briefings/stream?t={quote(t)}",
            sse_swap="message", hx_swap="beforeend", sse_close="done"))
