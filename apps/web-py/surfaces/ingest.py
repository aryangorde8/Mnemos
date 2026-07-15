"""01 · Ingest — four variants.

- sources (conservative): an editorial wedge + a per-source connection table.
- run     (canon):        three counters + a vermilion progress bar + the 5-phase pipeline.
- vault   (divergent):    an 864-cell grid that lights up, coloured by source, as documents index.
- manage:                 add a single item to memory by hand, or delete anything already indexed.

All seeded from the real /ingest/stats (and /ingest/documents for manage).
"""
from fasthtml.common import (  # type: ignore
    A, Button, Div, Form, Input, Option, P, Select, Span, Table, Tbody, Td, Textarea, Tr,
)

from assets import INGEST_JS, VAULT_JS
from chrome import page, surface_head, variant_strip

VARIANTS = [("sources", "sources"), ("run", "ingest run"), ("vault", "the vault fills"),
            ("manage", "add · delete")]
DEFAULT = "run"

_PHASES = [("01", "fetch"), ("02", "parse"), ("03", "chunk"), ("04", "embed"), ("05", "index")]
_SOURCES = [("✉", "Gmail", "email"), ("◷", "Google Calendar", "calendar"),
            ("※", "Slack", "slack"), ("⌗", "Google Drive", "shared_doc"),
            ("❡", "Notion", "notes"), ("§", "Linear", "issues")]
# source values accepted by the agent's POST /ingest (SourceKind)
_SRC_OPTS = [("notes", "notes"), ("email", "email"), ("calendar", "calendar"),
             ("meeting_notes", "meeting notes"), ("shared_doc", "shared doc"), ("slack", "slack")]


def _src_counts(stats):
    return {s.get("source"): s.get("count") for s in stats.get("sources", [])}


def _source_table(stats):
    counts = _src_counts(stats)
    rows = []
    for glyph, name, key in _SOURCES:
        c = counts.get(key)
        on = isinstance(c, int) and c > 0
        rows.append(Tr(
            Td(Span(glyph, cls="glyph-mk"), style="width:34px"),
            Td(Span(name, cls="nm"), Div(key, cls="label")),
            Td(f"{c:,}" if isinstance(c, int) else "—", cls="ct"),
            Td(Span(Span(cls="pulse-dot" if on else "pulse-dot muted"), " ",
                    "connected" if on else "available", cls="chrome",
                    style="display:inline-flex;align-items:center;gap:7px"),
               style="text-align:right;width:130px")))
    return Table(Tbody(*rows), cls="src-table")


def _counter(cid, goal, cap, atlas=False):
    return Div(Div(Span("0"), Span(f" / {goal:,}", cls="goal") if goal else "", cls="big", id=cid),
               Div(cap, cls="label cap"), cls="counter" + (" atlas" if atlas else ""))


def _run_body(stats):
    documents = stats.get("documents") or 0
    chunks = stats.get("chunks") or (documents * 2)
    goal = documents or 5939
    chunks_goal = chunks or goal * 2
    counters = Div(_counter("c-items", goal, "items → done"),
                   _counter("c-chunks", chunks_goal, "chunks"),
                   _counter("c-vectors", chunks_goal, "vectors → atlas", atlas=True), cls="counters")
    progress = Div(Div(id="ing-fill", cls="fill"), cls="progress")
    phases = Div(*[Div(Div(n, cls="pn"), Div(label, cls="pl"), cls="phase-cell")
                   for n, label in _PHASES], cls="phases")
    banner = Div(Div("The vault is ", Span("ready.", cls="i accent"), cls="surface-h1",
                     style="font-size:34px"),
                 Div(A("ask it something →", href="/ask", cls="btn-d primary"),
                     A("search the corpus", href="/search", cls="btn-d"),
                     style="margin-top:16px;display:flex;gap:10px"),
                 id="ing-banner", style="display:none;margin-top:30px")
    return Div(
        surface_head("01", "ingest · vectorize into atlas",
                     Span("Watch the corpus "), Span("vectorize.", cls="i accent")),
        P("Each item becomes ~2 chunks; each chunk becomes one 768-d vector indexed into MongoDB "
          "Atlas vector search.", cls="muted", style="max-width:62ch;margin:0 0 26px"),
        Div(counters, progress,
            Div(Span("skip to end", id="ing-skip", cls="btn-d ghost", style="cursor:pointer"),
                style="margin-top:10px"),
            phases, banner,
            id="ingest-run", data_goal=str(goal), data_chunks=str(chunks_goal)),
        Div(P("by source", cls="label", style="margin:40px 0 10px"), _source_table(stats)),
    )


def _sources_body(stats):
    return Div(
        surface_head("01", "ingest · connect your sources",
                     Span("Mnemos reads "), Span("everything,", cls="i accent"), Span(" once.")),
        P("Connect a source; Mnemos fetches, chunks, embeds, and indexes it into Atlas. Heterogeneous "
          "items — messages, events, docs — counted in one unit.", cls="muted",
          style="max-width:62ch;margin:0 0 26px"),
        _source_table(stats),
        P("read-only demo · to (re)load the corpus run  npm run seed -- --load", cls="faint mono",
          style="font-size:12px;margin-top:18px"),
    )


def _vault_body(stats):
    documents = stats.get("documents") or 0
    legend = [("email", "#f25738"), ("calendar", "#e8c547"), ("docs", "#f3ecdf"), ("slack", "#9c9486")]
    cells = [Div(cls="vcell") for _ in range(48 * 18)]
    return Div(
        surface_head("01", "ingest · the vault fills",
                     Span("Eight hundred sixty-four "), Span("cells.", cls="i accent")),
        P("Each cell is a document landing in the index, coloured by source as it vectorizes.",
          cls="muted", style="max-width:62ch;margin:0 0 8px"),
        Div(*[Span(Span(cls="sw", style=f"background:{c}"), name, cls="lg") for name, c in legend],
            Span(Span("0", id="vault-count", cls="num"), f" / {documents or 864} indexed",
                 cls="lg", style="margin-left:auto"),
            cls="vault-legend"),
        Div(*cells, id="vault-grid", cls="vault-grid"),
    )


def doc_list(docs: list[dict] | None):
    """Recent-documents list with a per-row delete — re-rendered after every add / delete."""
    docs = docs or []
    if not docs:
        return Div("nothing ingested yet — add something above, or run the demo seed.", cls="empty")
    rows = []
    for d in docs:
        rows.append(Div(
            Div(Span(d.get("source", ""), cls="label"),
                Div(d.get("title", ""), cls="nm", style="margin-top:2px"),
                Div(f"{d.get('chunks', 0)} chunks · {(d.get('createdAt') or '')[:10]}",
                    cls="chrome faint", style="margin-top:3px")),
            Button("✕ delete", cls="btn-d",
                   hx_post=f"/ingest/delete?doc_id={d.get('id','')}",
                   hx_target="#doc-list", hx_swap="innerHTML",
                   hx_confirm="Delete this from memory? Its chunks are removed from the Atlas vault."),
            cls="doc-row",
            style="display:flex;justify-content:space-between;align-items:center;gap:16px;"
                  "padding:12px 0;border-bottom:1px solid var(--rule)"))
    return Div(*rows)


def _manage_body(stats, docs):
    documents = stats.get("documents") or 0
    chunks = stats.get("chunks") or 0
    form = Form(
        Div(Input(name="title", cls="field", autocomplete="off", placeholder="title",
                  style="flex:1"),
            Select(*[Option(label, value=val) for val, label in _SRC_OPTS], name="source",
                   cls="field", style="max-width:190px"),
            style="display:flex;gap:10px"),
        Textarea(name="body", cls="field", rows="4",
                 placeholder="paste the content Mnemos should remember…",
                 style="margin-top:10px;width:100%;resize:vertical"),
        Div(Button("add to memory →", type="submit", cls="btn-d primary"),
            Span("chunked, embedded with Titan, indexed into Atlas", cls="chrome"),
            style="display:flex;align-items:center;gap:14px;margin-top:10px"),
        hx_post="/ingest/add", hx_target="#doc-list", hx_swap="innerHTML")
    return Div(
        surface_head("01", "ingest · manage memory",
                     Span("Add to — and "), Span("prune —", cls="i accent"), Span(" the vault.")),
        P("Ingest a single item by hand, or delete anything already indexed. Deleting removes the "
          "document and every vector it produced from Atlas.", cls="muted",
          style="max-width:62ch;margin:0 0 22px"),
        form,
        P(f"indexed · {documents:,} items · {chunks:,} chunks", cls="label",
          style="margin:30px 0 6px"),
        Div(doc_list(docs), id="doc-list"),
    )


def render(variant: str = DEFAULT, stats: dict | None = None, ready: dict | None = None,
           vault: dict | None = None, documents: list[dict] | None = None):
    stats = stats or {}
    if variant not in dict(VARIANTS):
        variant = DEFAULT
    strip = variant_strip("/ingest", variant, VARIANTS, meta="01 · ingest · MongoDB Atlas")
    if variant == "sources":
        body, scripts = _sources_body(stats), ""
    elif variant == "vault":
        body, scripts = _vault_body(stats), VAULT_JS
    elif variant == "manage":
        body, scripts = _manage_body(stats, documents), ""
    else:
        body, scripts = _run_body(stats), INGEST_JS
    return page("ingest", body, ready=ready, vault=vault, scripts=scripts, strip=strip)
