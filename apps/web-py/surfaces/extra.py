"""Extra surfaces kept from the prior build, restyled into the new chrome.

These wire to real backend endpoints (commitments / briefings) that aren't part of the
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
