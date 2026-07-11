"""03 · Approve — three variants.

- queue  (conservative): an accordion of every pending action; expand to see draft + critic.
- review (canon):        one focused action — draft | critic — with a queue navigator.
- ledger (divergent):    every proposal stamped in a table + summary tiles.

Wired to the real /actions queue + per-action /actions/{id}/critique; approve/reject POST live.
"""
from fasthtml.common import A, Button, Div, P, Span, Table, Tbody, Td, Th, Thead, Tr  # type: ignore

from assets import ACCORDION_JS, EDIT_JS
from chrome import draft_card, critic_panel, is_blocking, page, surface_head, variant_strip

VARIANTS = [("queue", "queue"), ("review", "review"), ("ledger", "ledger")]
DEFAULT = "review"
_SEV_COLOR = {"high": "var(--vermilion)", "medium": "var(--saffron)", "low": "var(--paper-muted)"}


_GSTRIP_STYLE = ("display:flex;align-items:center;gap:12px;flex-wrap:wrap;"
                 "border:1px solid var(--rule);padding:12px 16px;margin:0 0 22px")


def _google_strip(google: dict | None):
    """Connection state banner: approvals here either send real Gmail / book real Calendar
    events (connected) or simulate. When disconnected this is where you fix it."""
    if not isinstance(google, dict):
        return ""  # agent unreachable — the surface already degrades elsewhere
    if google.get("connected"):
        email = google.get("email") or "google account"
        scope = ("real gmail + calendar" if google.get("calendar") else "real gmail")
        return Div(Span(cls="pulse-dot"), Span("google · live", cls="chrome"),
                   Span(f"connected as {email} — approvals send {scope}", cls="label"),
                   cls="gconnect", style=_GSTRIP_STYLE)
    if google.get("configured"):
        return Div(Span(cls="pulse-dot saffron"), Span("google · simulated", cls="chrome"),
                   Span("approvals will NOT actually send until a Google account is connected",
                        cls="label"),
                   A("connect google →", href=google.get("connectUrl") or "#",
                     cls="btn-d primary", style="margin-left:auto"),
                   cls="gconnect", style=_GSTRIP_STYLE)
    return Div(Span(cls="pulse-dot muted"), Span("google · simulated", cls="chrome"),
               Span("GMAIL_OAUTH_CLIENT_ID / _SECRET / _REDIRECT_URI are not set on the agent "
                    "(see .env.example)", cls="label"),
               cls="gconnect", style=_GSTRIP_STYLE)


def _subject(a):
    p = a.get("proposal", {}) or {}
    return p.get("subject") or p.get("title") or "(untitled)"


def _recipient(a):
    p = a.get("proposal", {}) or {}
    to = p.get("to") or p.get("attendees") or []
    return ", ".join(to) if isinstance(to, list) else str(to)


def _sev_strip(critique):
    findings = (critique or {}).get("findings", [])
    if not findings:
        return Span("clean", cls="chrome", style="color:var(--saffron)")
    dots = [Span(cls="sev-dot", style=f"background:{_SEV_COLOR.get(f.get('severity'),'var(--paper-faint)')}")
            for f in findings]
    return Span(*dots, cls="sev-strip")


# ── review (canon) ──
def _review(actions, index, critique):
    index = max(0, min(index, len(actions) - 1))
    action = actions[index]
    dots = [A(cls="qdot" + (" active" if i == index else ""), href=f"/approve?v=review&i={i}")
            for i in range(len(actions))]
    nav = Div(A("‹ prev", href=f"/approve?v=review&i={(index-1)%len(actions)}", cls="btn-d ghost"),
              Div(*dots, cls="qdots"),
              A("next ›", href=f"/approve?v=review&i={(index+1)%len(actions)}", cls="btn-d ghost"),
              Span(f"№{index+1:02d} / {len(actions):02d}", cls="chrome", style="margin-left:8px"),
              cls="qnav")
    grid = Div(draft_card(action, critique, show_marks=True),
               Div(cls="vrule"), critic_panel(critique), cls="ac-grid")
    return Div(P("Page through the queue; approve with one click — unless the Critic blocks the send.",
                 cls="muted", style="max-width:60ch;margin:0 0 16px"), nav, grid), ""


# ── queue (conservative) ──
def _queue(actions, critiques):
    rows = []
    for a in actions:
        crit = critiques.get(a["id"])
        blocking = is_blocking(crit)
        notes = len((crit or {}).get("findings", []))
        head = Div(Span(cls="pulse-dot" if not blocking else "pulse-dot saffron"),
                   Div(Span(_subject(a), cls="acc-subj"),
                       Div(f"{a.get('kind','')} · {_recipient(a)}", cls="label", style="margin-top:3px")),
                   Span(f"{notes} notes", cls="chrome"),
                   Span("blocking" if blocking else "clean", cls="tag v" if blocking else "tag"),
                   Span("›", cls="acc-chev"), cls="acc-head")
        body = Div(Div(draft_card(a, crit, show_marks=True),
                       Div(cls="vrule"), critic_panel(crit), cls="ac-grid",
                       style="border:none"), cls="acc-body")
        rows.append(Div(head, body, cls="acc-row" + (" blocking" if blocking else "")))
    return Div(P("Every pending action with its Critic audit. One open at a time.", cls="muted",
                 style="margin:0 0 16px"), *rows), ACCORDION_JS


# ── ledger (divergent) ──
def _ledger(actions, critiques):
    proposed = len(actions)
    clean = sum(1 for a in actions if not is_blocking(critiques.get(a["id"]))
                and not (critiques.get(a["id"]) or {}).get("findings"))
    revisions = sum(1 for a in actions if (critiques.get(a["id"]) or {}).get("findings")
                    and not is_blocking(critiques.get(a["id"])))
    blocked = sum(1 for a in actions if is_blocking(critiques.get(a["id"])))
    tiles = Div(
        Div(Div(str(proposed), cls="big"), Div("proposed", cls="label"), cls="tile-sum"),
        Div(Div(str(clean), cls="big"), Div("clean", cls="label"), cls="tile-sum"),
        Div(Div(str(revisions), cls="big"), Div("revisions", cls="label"), cls="tile-sum"),
        Div(Div(str(blocked), cls="big"), Div("blocked", cls="label"), cls="tile-sum block"),
        cls="tiles-sum")
    rows = []
    for i, a in enumerate(actions, 1):
        crit = critiques.get(a["id"])
        blocking = is_blocking(crit)
        verdict = (crit or {}).get("verdict", "—")
        btn = (Button("blocked", cls="btn-d", disabled=True) if blocking else
               Button("approve", cls="btn-d primary",
                      hx_post=f"/approve/decide?aid={a['id']}&verdict=approve",
                      hx_target=f"#lr-{a['id']}", hx_swap="innerHTML"))
        rows.append(Tr(
            Td(f"§{i:02d}", cls="mono faint"),
            Td(Span(_subject(a), cls="i", style="font-size:16px"),
               Div(f"{a.get('kind','')} · {_recipient(a)}", cls="label", style="margin-top:2px")),
            Td(verdict, cls="mono"),
            Td(_sev_strip(crit)),
            Td(btn, Span(id=f"lr-{a['id']}", style="margin-left:8px"), style="text-align:right")))
    table = Table(Thead(Tr(Th("§"), Th("proposal"), Th("verdict"), Th("severity"), Th("decision"))),
                  Tbody(*rows), cls="ledger")
    return Div(tiles, table), ""


def render(variant: str = DEFAULT, actions: list[dict] | None = None, index: int = 0,
           critiques: dict | None = None, ready: dict | None = None, vault: dict | None = None):
    actions = actions or []
    critiques = critiques or {}
    if variant not in dict(VARIANTS):
        variant = DEFAULT
    strip = variant_strip("/approve", variant, VARIANTS, meta="03 · approve · the differentiator")
    head = surface_head("03", "approve · the action queue",
                        Span("What the Critic "), Span("flagged.", cls="i accent"))
    gstrip = _google_strip((ready or {}).get("google"))
    if not actions:
        return page("approve", head, gstrip,
                    Div("the queue is empty — ask the agent to draft something, then approve it here.",
                        cls="empty"), ready=ready, vault=vault, strip=strip)
    if variant == "queue":
        body, scripts = _queue(actions, critiques)
    elif variant == "ledger":
        body, scripts = _ledger(actions, critiques)
    else:
        body, scripts = _review(actions, index, critiques.get(actions[max(0, min(index, len(actions)-1))]["id"]))
    return page("approve", head, gstrip, body, ready=ready, vault=vault, scripts=scripts + EDIT_JS, strip=strip)


def decide_result(verdict: str, ok: bool, info: dict | None = None):
    info = info or {}
    if not ok:
        return Div("could not record decision — is the agent reachable?", cls="decide-done warn")
    if verdict == "reject":
        return Div("✕ rejected · removed from queue", cls="decide-done faint")
    # approve — report what actually happened, honestly
    via = info.get("sentVia")
    booked = info.get("bookedVia")
    if via == "gmail":
        return Div(f"✓ sent via Gmail{(' · ' + info['sentAs']) if info.get('sentAs') else ''}",
                   cls="decide-done", style="color:var(--saffron)")
    if info.get("gmailError"):
        return Div(f"⚠ approved, but the Gmail send failed: {info['gmailError']}", cls="decide-done warn")
    if via == "simulated":
        return Div("✓ approved · simulated — the email was NOT actually sent (no Gmail account "
                   "connected on the agent)", cls="decide-done", style="color:var(--vermilion)")
    if booked == "google":
        return Div("✓ approved · meeting booked on Google Calendar", cls="decide-done",
                   style="color:var(--saffron)")
    if booked == "simulated":
        return Div("✓ approved · simulated — calendar not connected, no event created",
                   cls="decide-done", style="color:var(--vermilion)")
    return Div("✓ approved", cls="decide-done", style="color:var(--saffron)")
