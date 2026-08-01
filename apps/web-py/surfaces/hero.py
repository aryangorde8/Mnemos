"""00 · Home / hero.

A 2D canvas particle field behind the headline + a live mini stream, with a 4-tile footer
linking into the product.
"""
from fasthtml.common import A, Br, Canvas, Div, H1, P, Span  # type: ignore

from assets import CONSTELLATION_JS, LIVESTREAM_JS
from chrome import kicker, page


def _tiles(model="Amazon Nova"):
    tiles = [
        ("01", "❡", "Memory", "ingested.",
         "Mail, calendar, notes, slack, docs — vectorized in MongoDB Atlas, queryable in milliseconds.", "/ingest"),
        ("02", "◆", "Reasoning", "streamed.",
         f"{model} thinks out loud over SSE. Every thought, retrieval, observation, citation — in order.", "/ask"),
        ("03", "✎", "Critique", "audited.",
         "A second agent red-pencils the first. Drafts arrive with their own copy-editor's notes.", "/approve"),
        ("04", "⌗", "Hybrid retrieval", "cited.",
         "Vector + BM25 fused via RRF and reranked. Every claim traceable to a chunk in the vault.", "/search"),
    ]
    return Div(*[_tile(t, i == len(tiles) - 1) for i, t in enumerate(tiles)], cls="tiles")


def _tile(t, last):
    num, glyph, title, verb, body, href = t
    return A(Div(Span(num, cls="label"), Span(glyph, cls="tile-glyph"), cls="tile-top"),
             Div(title, " ", Span(verb, cls="i accent"), cls="tile-title"),
             P(body, cls="tile-body"), href=href, cls="tile" + (" last" if last else ""))


def _mini_panel():
    return Div(Div(Span("live · stream 0x4a91", cls="label"), Span(cls="pulse-dot"), cls="panel-head"),
               Div(id="livestream", cls="mini-stream"), cls="panel")


def _purpose():
    """Plain statement of what Mnemos does, and specifically what it does with a
    connected Google account. Required by Google's OAuth branding review — the home
    page has to explain the app's purpose in terms a reviewer can match to the scopes."""
    return Div(
        Div("what mnemos does", cls="label", style="margin-bottom:10px"),
        P("Mnemos is a personal memory agent. It reads a corpus of your professional "
          "documents — email, calendar entries, meeting notes, shared docs, chat — and "
          "answers questions about them with citations back to the source.",
          cls="muted", style="max-width:66ch;margin:0 0 12px"),
        P("It also drafts actions for you. When you ask it to write an email, it produces "
          "a draft, a second reviewing agent audits that draft, and nothing is sent until "
          "you press approve. If you connect a Google account, approving a draft sends "
          "that one message from your Gmail, and approving a proposed meeting creates that "
          "one event in your Google Calendar. Connecting is optional — without it, "
          "approvals are recorded but nothing leaves the app.",
          cls="muted", style="max-width:66ch;margin:0 0 12px"),
        P(Span("Mnemos does not read your mailbox.", cls="paper"),
          " It requests permission to send mail and manage calendar events only. There is "
          "no read access to your email, Drive, or contacts.",
          cls="muted", style="max-width:66ch;margin:0 0 14px"),
        Div(A("Privacy policy", href="/privacy", cls="accent"),
            Span(" · ", style="opacity:.4"),
            A("Terms of service", href="/terms", cls="accent"),
            cls="chrome"),
        cls="hero-purpose")


def _cta(primary=True):
    return Div(A("watch it reason →", href="/ask", cls="btn-d primary"),
              A("tour the memory", href="/memory", cls="btn-d"),
              A("the action queue", href="/approve", cls="btn-d ghost"), cls="hero-cta")


def _constellation(model="Amazon Nova"):
    return Div(
        Canvas(id="constellation"), Div(cls="hero-fade"),
        Div(Div(kicker("00", "mnemos · the memory agent")),
            Div(Div(H1("Mnemos", Br(), Span("your professional memory, made navigable.",
                                            cls="i accent", style="font-size:.52em"),
                       cls="hero-h1"),
                    P("Ingest your email, calendar, notes, slack, and docs. Mnemos reasons over the "
                      f"corpus with {model}, drafts the action, and a second ",
                      Span("Critic agent", cls="saffron"),
                      " audits the draft — before you approve with one click.", cls="hero-sub"),
                    _cta(),
                    Span("click anywhere on the field to trace a path", cls="chrome",
                         style="display:block;margin-top:18px")),
                _mini_panel(), cls="hero-grid"),
            cls="hero-inner"),
        cls="hero")


def render(ready: dict | None = None, vault: dict | None = None):
    model = (ready or {}).get("modelLabel") or "Amazon Nova"
    return page("hero", _constellation(model), _purpose(), _tiles(model),
                ready=ready, vault=vault,
                full_bleed=True, scripts=CONSTELLATION_JS + LIVESTREAM_JS)
