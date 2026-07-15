"""01 · Ingest — manage memory.

A per-source overview of what's indexed, an add-a-single-item form, and a filterable list of every
document with a per-row delete. Seeded from the real /ingest/stats and /ingest/documents.
"""
from fasthtml.common import (  # type: ignore
    Button, Div, Form, Input, P, Span, Table, Tbody, Td, Textarea, Tr,
)

from assets import DROPDOWN_JS
from chrome import page, surface_head

_SOURCES = [("✉", "Gmail", "email"), ("◷", "Google Calendar", "calendar"),
            ("※", "Slack", "slack"), ("⌗", "Google Drive", "shared_doc"),
            ("❡", "Notion", "notes"), ("§", "Linear", "issues")]
# source values accepted by the agent's POST /ingest (SourceKind)
_SRC_OPTS = [("notes", "notes"), ("email", "email"), ("calendar", "calendar"),
             ("meeting_notes", "meeting notes"), ("shared_doc", "shared doc"), ("slack", "slack")]
_FILTER_OPTS = [("all", "all sources"), *_SRC_OPTS]


def _dropdown(options, value, *, input_name=None, hx_get=None, hx_target=None):
    """A custom black-themed dropdown (native <select> can't be dark-styled cross-browser).

    input_name → renders a hidden <input> the surrounding form submits (the add-source picker).
    hx_get     → each option issues an htmx GET (?source=<val>) into hx_target (the delete filter).
    """
    label = dict(options).get(value, value)
    trigger = Button(Span(label, cls="dd-val", data_dd_val="1"), Span("▾", cls="dd-caret"),
                     type="button", cls="dd-trigger", data_dd_trigger="1")
    hidden = (Input(type="hidden", name=input_name, value=value, data_dd_input="1")
              if input_name else "")
    opts = []
    for val, lab in options:
        extra = ({"hx_get": f"{hx_get}?source={val}", "hx_target": hx_target, "hx_swap": "innerHTML"}
                 if hx_get else {})
        opts.append(Div(lab, cls="dd-opt" + (" active" if val == value else ""),
                        data_dd_opt="1", data_val=val, **extra))
    menu = Div(*opts, cls="dd-menu", hidden=True, data_dd_menu="1")
    return Div(trigger, hidden, menu, cls="dd", data_dd="1")


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


def doc_list(docs: list[dict] | None, source: str = "all"):
    """Recent-documents list with a per-row delete — re-rendered after every add / delete / filter.

    `source` is the active filter; each delete preserves it so the list stays in the same category.
    """
    docs = docs or []
    if not docs:
        msg = ("nothing ingested yet — add something above, or run the demo seed."
               if source == "all" else f"no “{dict(_FILTER_OPTS).get(source, source)}” items in memory.")
        return Div(msg, cls="empty")
    rows = []
    for d in docs:
        rows.append(Div(
            Div(Span(d.get("source", ""), cls="label"),
                Div(d.get("title", ""), cls="nm", style="margin-top:2px"),
                Div(f"{d.get('chunks', 0)} chunks · {(d.get('createdAt') or '')[:10]}",
                    cls="chrome faint", style="margin-top:3px")),
            Button("✕ delete", cls="btn-d",
                   hx_post=f"/ingest/delete?doc_id={d.get('id','')}&source={source}",
                   hx_target="#doc-list", hx_swap="innerHTML",
                   hx_confirm="Delete this from memory? Its chunks are removed from the Atlas vault."),
            cls="doc-row",
            style="display:flex;justify-content:space-between;align-items:center;gap:16px;"
                  "padding:12px 0;border-bottom:1px solid var(--rule)"))
    return Div(*rows)


def _ingest_body(stats, docs):
    documents = stats.get("documents") or 0
    chunks = stats.get("chunks") or 0
    form = Form(
        Div(Input(name="title", cls="field", autocomplete="off", placeholder="title",
                  style="flex:1"),
            _dropdown(_SRC_OPTS, "notes", input_name="source"),
            style="display:flex;gap:14px;align-items:flex-end"),
        Textarea(name="body", cls="field", rows="4",
                 placeholder="paste the content Mnemos should remember…",
                 style="margin-top:10px;width:100%;resize:vertical"),
        Div(Button("add to memory →", type="submit", cls="btn-d primary"),
            Span("chunked, embedded with Titan, indexed into Atlas", cls="chrome"),
            style="display:flex;align-items:center;gap:14px;margin-top:10px"),
        hx_post="/ingest/add", hx_target="#doc-list", hx_swap="innerHTML")
    filter_row = Div(
        Span("in memory", cls="label"),
        Span(f"· {documents:,} items · {chunks:,} chunks", cls="chrome faint"),
        Div(Span("filter", cls="label", style="margin-right:10px"),
            _dropdown(_FILTER_OPTS, "all", hx_get="/ingest/list", hx_target="#doc-list"),
            style="display:flex;align-items:center;margin-left:auto"),
        cls="dd-filter-row")
    return Div(
        surface_head("01", "ingest · manage memory",
                     Span("Add to — and "), Span("prune —", cls="i accent"), Span(" the vault.")),
        P("Ingest a single item by hand, or delete anything already indexed — pick a source to narrow "
          "the list. Deleting removes the document and every vector it produced from Atlas.",
          cls="muted", style="max-width:62ch;margin:0 0 22px"),
        form,
        Div(P("by source", cls="label", style="margin:36px 0 10px"), _source_table(stats)),
        Div(filter_row, style="margin-top:30px"),
        Div(doc_list(docs), id="doc-list"),
    )


def render(stats: dict | None = None, ready: dict | None = None,
           vault: dict | None = None, documents: list[dict] | None = None):
    stats = stats or {}
    return page("ingest", _ingest_body(stats, documents), ready=ready, vault=vault,
                scripts=DROPDOWN_JS)
