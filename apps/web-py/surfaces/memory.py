"""04 · Memory — focus + neighbourhood.

One seed entity at the centre, its graph neighbours ringed around it, edges weighted by
relation kind. This mirrors what `expand_via_graph(entity, depth)` does at query time:
resolve a seed, then BFS one or two hops — so the picture is the traversal, not a
decoration of it. Depth stops at 2 because the tool clamps there.

Replaces a star map that plotted all ~120 entities and 200 relations at once beside a
30-row legend: the legend outgrew the chart, and the chart read as a faint tangle.

The shell is rendered here; the SVG is built client-side (MEMORY_JS) because re-seeding
and the depth toggle are interactive.
"""
import json

from fasthtml.common import Button, Div, Input, NotStr, P, Script, Span  # type: ignore

from assets import MEMORY_JS
from chrome import page, surface_head

# Edge weight follows the relation hierarchy the extractor emits: `owes` is a concrete
# commitment, `discusses` the weakest tie.
LEGEND = [("owes", "#e8c547", 2), ("manages", "#f25738", 2),
          ("works_with", "#d8d2c5", 1.5), ("discusses", "#6c645a", 1)]


def _payload(graph: dict) -> dict:
    """Trim /graph to what the view needs — drop chunkIds and series, cap role text."""
    ents_in = graph.get("entities") or {}
    ents, seen = [], set()
    for kind in ("person", "project", "topic"):
        for e in ents_in.get(kind) or []:
            key = e.get("key")
            if not key or key in seen:
                continue
            seen.add(key)
            ents.append({"n": e.get("name") or key, "k": key, "t": kind,
                         "m": e.get("mentions") or 0, "r": (e.get("role") or "")[:110],
                         "f": e.get("firstSeen") or "", "l": e.get("lastSeen") or ""})
    rels = [{"f": r.get("from"), "t": r.get("to"), "k": r.get("kind") or "discusses",
             "e": (r.get("evidence") or "")[:95]}
            for r in (graph.get("relations") or []) if r.get("from") and r.get("to")]
    return {"ents": ents, "rels": rels}


def _rail():
    return Div(
        Div("seed entity", cls="label"),
        Input(id="mem-q", type="search", cls="mem-search", placeholder="search entities…",
              aria_label="Search entities"),
        Div(id="mem-list", cls="mem-list", role="listbox", aria_label="Entities"),
        cls="mem-rail")


def _stage():
    legend = Div(*[Span(Span(cls="sw", style=f"border-top:{w}px solid {c}"), name, cls="lg")
                   for name, c, w in LEGEND], cls="mem-legend-inline")
    toolbar = Div(
        Span("traversal depth", cls="label"),
        Div(Button("1 hop", id="mem-d1", type="button", aria_pressed="true"),
            Button("2 hops", id="mem-d2", type="button", aria_pressed="false"),
            cls="mem-seg", role="group", aria_label="Traversal depth"),
        legend, cls="mem-toolbar")
    svg = NotStr('<svg id="mem-svg" viewBox="0 0 980 600" role="img" '
                 'aria-label="Entity neighbourhood graph"></svg>')
    return Div(toolbar, svg, cls="mem-stage")


def _detail():
    kv = lambda label, mid: Span(label, " ", Span("—", id=mid, cls="v"), cls="chrome")  # noqa: E731
    return Div(
        Div(Span("entity", cls="label"),
            Div("—", id="mem-name", cls="nm"),
            P("", id="mem-role", cls="muted", style="font-size:13.5px;margin:4px 0 12px;max-width:62ch"),
            Div(kv("mentions", "mem-m"), kv("first seen", "mem-f"),
                kv("last seen", "mem-l"), kv("neighbours", "mem-n"), cls="mem-meta"),
            Div(Div("likely duplicate entity", cls="label"), P("", id="mem-dupmsg"),
                id="mem-dup", cls="mem-dup", hidden=True)),
        Div(Span("relations · evidence", cls="label"),
            Div(id="mem-edges", cls="mem-edges")),
        cls="mem-detail")


def render(graph: dict | None = None, ready: dict | None = None, vault: dict | None = None):
    graph = graph or {}
    stats = graph.get("stats") or {}
    counts = stats.get("entities") or {}
    head = surface_head("04", "memory · focus + neighbourhood",
                        Span("Everything connected to "),
                        Span("one thing.", cls="i accent"))
    meta = P(f"{counts.get('person','—')} people · {counts.get('project','—')} projects · "
             f"{counts.get('topic','—')} topics · {stats.get('relations','—')} relations",
             cls="label", style="margin:0 0 14px")

    data = _payload(graph)
    if not data["ents"]:
        return page("memory", head,
                    Div("no entities extracted yet — run the graph extraction over the corpus.",
                        cls="empty"), ready=ready, vault=vault)

    seed = Script(NotStr(f'window.__MEM__={json.dumps(data, separators=(",", ":"))};'),
                  type="text/javascript")
    body = Div(_rail(), Div(_stage(), _detail(), cls="mem-main"), cls="mem-grid")
    return page("memory", head, meta, seed, body, ready=ready, vault=vault, scripts=MEMORY_JS)
