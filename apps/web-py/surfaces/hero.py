"""00 · Home / hero — three variants.

- typographic  (conservative): a 100px serif headline + CTAs, no canvas.
- constellation (canon):        a 2D canvas particle field behind headline + a live mini stream.
- live-trace   (divergent):     a headline that types itself in + a now·thinking stream + stats.

All three share the 4-tile footer linking into the product.
"""
from fasthtml.common import A, Br, Canvas, Div, H1, P, Span  # type: ignore

from assets import CONSTELLATION_JS, LIVESTREAM_JS, TYPE_JS
from chrome import kicker, page, variant_strip

VARIANTS = [("typographic", "typographic"), ("constellation", "constellation"),
            ("live-trace", "live trace")]
DEFAULT = "constellation"

_TILES = [
    ("01", "❡", "Memory", "ingested.",
     "Mail, calendar, notes, slack, docs — vectorized in MongoDB Atlas, queryable in milliseconds.", "/ingest"),
    ("02", "◆", "Reasoning", "streamed.",
     "Gemini 3 Pro thinks out loud over SSE. Every thought, retrieval, observation, citation — in order.", "/ask"),
    ("03", "✎", "Critique", "audited.",
     "A second agent red-pencils the first. Drafts arrive with their own copy-editor's notes.", "/approve"),
    ("04", "⌗", "Hybrid retrieval", "cited.",
     "Vector + BM25 fused via RRF and reranked. Every claim traceable to a chunk in the vault.", "/search"),
]


def _tile(t, last):
    num, glyph, title, verb, body, href = t
    return A(Div(Span(num, cls="label"), Span(glyph, cls="tile-glyph"), cls="tile-top"),
             Div(title, " ", Span(verb, cls="i accent"), cls="tile-title"),
             P(body, cls="tile-body"), href=href, cls="tile" + (" last" if last else ""))


def _tiles():
    return Div(*[_tile(t, i == len(_TILES) - 1) for i, t in enumerate(_TILES)], cls="tiles")


def _mini_panel():
    return Div(Div(Span("live · stream 0x4a91", cls="label"), Span(cls="pulse-dot"), cls="panel-head"),
               Div(id="livestream", cls="mini-stream"), cls="panel")


def _cta(primary=True):
    return Div(A("watch it reason →", href="/ask", cls="btn-d primary"),
              A("tour the memory", href="/memory", cls="btn-d"),
              A("the action queue", href="/approve", cls="btn-d ghost"), cls="hero-cta")


def _typographic():
    return Div(
        Div(kicker("00", "mnemos · the memory agent")),
        H1("An agent that takes ", Span("multi-step actions", cls="i accent"),
           Br(), "on top of your professional memory.", cls=""),
        P("Ingest your email, calendar, notes, slack, and docs. Mnemos reasons over the corpus with "
          "Gemini 3 Pro, drafts the action, and a second Critic agent audits it — before you approve "
          "with one click.", cls="hero-sub", style="max-width:640px"),
        _cta(),
        Span("press ⌘K anywhere to ask · search · navigate", cls="chrome",
             style="display:block;margin-top:18px"),
        cls="hero-typo")


def _constellation():
    return Div(
        Canvas(id="constellation"), Div(cls="hero-fade"),
        Div(Div(kicker("00", "mnemos · the memory agent")),
            Div(Div(H1("Your professional memory,", Br(), Span("made navigable.", cls="i accent"),
                       cls="hero-h1"),
                    P("Ingest your email, calendar, notes, slack, and docs. Mnemos reasons over the "
                      "corpus with Gemini 3 Pro, drafts the action, and a second ",
                      Span("Critic agent", cls="saffron"),
                      " audits the draft — before you approve with one click.", cls="hero-sub"),
                    _cta(),
                    Span("click anywhere on the field to trace a path", cls="chrome",
                         style="display:block;margin-top:18px")),
                _mini_panel(), cls="hero-grid"),
            cls="hero-inner"),
        cls="hero")


def _live_trace():
    stats = [("documents read", "14,212"), ("retrievals", "6"), ("citations", "9"),
             ("critic verdict", "revise · 1 high"), ("voice fidelity", "8 / 10")]
    return Div(
        Div(Div(kicker("00", "mnemos · the live trace")),
            Div("It read fourteen thousand documents.",
                id="typed", cls="typed", data_text="It read fourteen thousand documents.",
                style="margin-top:18px"),
            Div(Div(P(Span("now · thinking", cls="label")),
                    Div(id="livestream", cls="mini-stream", style="margin-top:10px"), cls="panel"),
                Div(Div("this run", cls="label", style="padding:12px 16px;border-bottom:1px solid var(--rule)"),
                    *[Div(Span(k, cls="k"), Span(v, cls="v"), cls="stat-row") for k, v in stats],
                    cls="stat-block"),
                cls="trace-grid"),
            _cta(),
            cls="hero-inner"),
        cls="hero", style="min-height:auto")


def render(variant: str = DEFAULT, ready: dict | None = None, vault: dict | None = None):
    if variant not in dict(VARIANTS):
        variant = DEFAULT
    strip = variant_strip("/", variant, VARIANTS, meta="00 · home · pick a cold-open")
    if variant == "typographic":
        body, scripts = _typographic(), ""
    elif variant == "live-trace":
        body, scripts = _live_trace(), TYPE_JS + LIVESTREAM_JS
    else:
        body, scripts = _constellation(), CONSTELLATION_JS + LIVESTREAM_JS
    return page("hero", body, _tiles(), ready=ready, vault=vault, full_bleed=True,
                scripts=scripts, strip=strip)
