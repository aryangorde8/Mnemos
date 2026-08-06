"""Extra surfaces kept from the prior build, restyled into the new chrome.

These wire to real backend endpoints (commitments / briefings) that aren't part of the
six-surface design but are working product — reskinned to the new tokens for visual consistency.
"""
import re
from urllib.parse import quote

from fasthtml.common import (  # type: ignore
    Div, Form, H3, Input, P, Span, Table, Tbody, Td, Th, Thead, Tr,
)

from chrome import page, surface_head

# Line-leading markdown syntax: ATX headings, bullets, ordered items.
_MD_LINE = re.compile(r"^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s?)", re.M)


def _plain(md: str, limit: int = 220) -> str:
    """A markdown body reduced to one line of preview text.

    The briefing card used to slice the raw markdown, so a card that happened to cut
    across a heading rendered "## Attendees * Sarah Okafor" verbatim. Strip the syntax
    instead of displaying it — a 220-character teaser has no use for structure.
    """
    t = re.sub(r"```.*?```", " ", md or "", flags=re.S)      # fenced code blocks
    t = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", t)         # links/images → their label
    t = _MD_LINE.sub("", t)
    t = re.sub(r"\*\*|__|[*_`]", "", t)                      # emphasis and code ticks
    t = " ".join(t.split())
    return t[:limit].rstrip() + ("…" if len(t) > limit else "")


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
                 P(_plain(b.get("markdown", "")), cls="x"), cls="result") for b in items]
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
