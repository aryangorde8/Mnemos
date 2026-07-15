"""03 · Approve — review.

One focused action — draft | critic — with a queue navigator to page through the pending queue.
Wired to the real /actions queue + per-action /actions/{id}/critique; approve/reject POST live.
"""
from fasthtml.common import A, Div, P, Span  # type: ignore

from assets import EDIT_JS
from chrome import draft_card, critic_panel, page, surface_head


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


# ── review ──
def _review(actions, index, critique):
    index = max(0, min(index, len(actions) - 1))
    action = actions[index]
    dots = [A(cls="qdot" + (" active" if i == index else ""), href=f"/approve?i={i}")
            for i in range(len(actions))]
    nav = Div(A("‹ prev", href=f"/approve?i={(index-1)%len(actions)}", cls="btn-d ghost"),
              Div(*dots, cls="qdots"),
              A("next ›", href=f"/approve?i={(index+1)%len(actions)}", cls="btn-d ghost"),
              Span(f"№{index+1:02d} / {len(actions):02d}", cls="chrome", style="margin-left:8px"),
              cls="qnav")
    grid = Div(draft_card(action, critique, show_marks=True),
               Div(cls="vrule"), critic_panel(critique), cls="ac-grid")
    return Div(P("Page through the queue; approve with one click — unless the Critic blocks the send.",
                 cls="muted", style="max-width:60ch;margin:0 0 16px"), nav, grid), ""


def render(actions: list[dict] | None = None, index: int = 0, critiques: dict | None = None,
           ready: dict | None = None, vault: dict | None = None):
    actions = actions or []
    critiques = critiques or {}
    head = surface_head("03", "approve · the action queue",
                        Span("What the Critic "), Span("flagged.", cls="i accent"))
    gstrip = _google_strip((ready or {}).get("google"))
    if not actions:
        return page("approve", head, gstrip,
                    Div("the queue is empty — ask the agent to draft something, then approve it here.",
                        cls="empty"), ready=ready, vault=vault)
    body, scripts = _review(actions, index, critiques.get(actions[max(0, min(index, len(actions)-1))]["id"]))
    return page("approve", head, gstrip, body, ready=ready, vault=vault, scripts=scripts + EDIT_JS)


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
