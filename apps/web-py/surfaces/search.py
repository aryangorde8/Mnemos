"""05 · Search — canon variant: pipeline.

Hybrid retrieval with the pipeline phases made legible: a 6-phase header (embed → vector → bm25 → rrf
→ rerank → result), a phase scrubber that swaps a right-rail inspector, and ranked hit rows with a
score breakdown. Wired to the real /search — the fused `score` and retriever-hit flags are real; the
per-retriever sub-bars and latency budget are derived/illustrative (the backend returns one fused score).
"""
from urllib.parse import quote

from fasthtml.common import Div, Form, Input, NotStr, P, Script, Span  # type: ignore

from assets import SEARCH_ANIMATE_JS, SEARCH_JS, SEARCH_SWAP_JS
from chrome import page, surface_head, variant_strip

VARIANTS = [("results", "results"), ("pipeline", "pipeline"), ("animated", "animated")]
DEFAULT = "pipeline"
_SAMPLE_Q = "inference SLO slip"

# canonical 6-phase pipeline (labels are stable; the live `phases` array confirms which ran)
_PHASES = [
    ("embed", "01", "embed", "query → 768-d", "tokenized · normalized"),
    ("vector", "02", "vector", "atlas knn", "cosine over the index"),
    ("bm25", "03", "bm25", "lexical", "term frequency · idf"),
    ("rrf", "04", "rrf", "fuse", "reciprocal rank fusion"),
    ("rerank", "05", "rerank", "cross-encoder", "rescore top-k"),
    ("result", "06", "result", "ranked", "the final ordering"),
]
_BUDGET = [("embed", 22), ("vector", 84), ("bm25", 31), ("rrf", 4), ("rerank", 96)]


def render_page(variant: str = DEFAULT, ready: dict | None = None, vault: dict | None = None):
    if variant not in dict(VARIANTS):
        variant = DEFAULT
    strip = variant_strip("/search", variant, VARIANTS, meta="05 · search · vector + bm25 + rrf")
    label = dict(VARIANTS)[variant]
    body = Div(
        surface_head("05", f"search · {label}",
                     Span("Search the "), Span("memory.", cls="i accent")),
        P("Vector kNN over MongoDB Atlas, fused with BM25 lexical search via reciprocal rank fusion, "
          "then reranked. Watch the pipeline produce the ordering.", cls="muted",
          style="max-width:60ch;margin:0 0 18px"),
        Form(
            Input(name="q", cls="field", autocomplete="off", autofocus=True,
                  value=_SAMPLE_Q, placeholder="inference SLO slip"),
            Input(type="hidden", name="v", value=variant),
            hx_get="/search/run", hx_target="#sresult", hx_swap="innerHTML"),
        Div(P("vector + bm25 + rrf + rerank", cls="label", style="margin-top:10px")),
        # pre-load the sample query so the chosen variant's layout is visible immediately
        Div(Div("retrieving…", cls="empty"), id="sresult", style="margin-top:18px",
            hx_get=f"/search/run?q={quote(_SAMPLE_Q)}&v={variant}", hx_trigger="load",
            hx_swap="innerHTML"),
    )
    return page("search", body, ready=ready, vault=vault, scripts=SEARCH_JS, strip=strip)


def _pipe_header(active_phases: list[str]):
    cells = []
    ran = set(active_phases or [])
    for i, (pid, num, label, sub, out) in enumerate(_PHASES):
        cls = "pipe-cell"
        if pid == "result":
            cls += " active"
        elif pid in ran:
            cls += " past"
        cells.append(Div(Div(num, cls="pn"), Div(label, cls="pl"), Div(sub, cls="ps"),
                         Div(f"↳ {out}", cls="ps", style="color:var(--paper-faint)"),
                         cls=cls, data_phase=pid))
    return Div(*cells, cls="pipe")


def _scorebar(label, value, cls, fmt="{:.2f}"):
    pct = max(0, min(100, value * 100 if value <= 1 else value))
    return Div(Span(label, cls="sl"),
               Div(Div(cls=f"bar {cls}", data_w=f"{pct:.0f}"), cls="track"),
               Span(fmt.format(value), cls="sv"), cls="scorebar")


def _hit(i, r):
    score = float(r.get("score", 0) or 0)
    from_vec = bool(r.get("fromVector"))
    from_text = bool(r.get("fromText"))
    src = (r.get("source", "") or "doc")
    bars = Div(
        _scorebar("vector", score if from_vec else 0.0, "vector"),
        _scorebar("bm25", (score * 6 if from_text else 0.0), "bm25", fmt="{:.1f}"),
        _scorebar("rrf", min(0.05, score / 20 + (0.016 if from_vec else 0) + (0.016 if from_text else 0)),
                  "rrf", fmt="{:.3f}"),
        _scorebar("rerank", score, "rerank"),
        cls="scorebox")
    edited = r.get("metadata", {}).get("updatedAt") or ""
    return Div(
        Span(f"{i:02d}", cls="rank"),
        Div(Div(Span(r.get("title", "untitled"), cls="ttl"), " ",
                Span(src, cls="src", style="margin-left:6px"),
                (Span(f"· {edited[:10]}", cls="chrome", style="margin-left:8px") if edited else "")),
            Div((r.get("text", "") or "")[:240], cls="ex")),
        bars,
        cls="hit")


def _inspector(phases, results, took_ms):
    top = results[0] if results else {}
    panes = []

    def pane(pid, *kids, show=False):
        return Div(Div(_phase_title(pid), cls="ph-title"), *kids,
                   cls="ph-pane", data_phase=pid, style=("" if show else "display:none"))

    panes.append(pane("embed",
        P("the query, tokenized and embedded to a 768-dimension vector.", cls="muted",
          style="font-size:13px"),
        Div("[0.0142, −0.0391, 0.1187, 0.0034, … ] · ‖v‖=1.0", cls="blk",
            style="margin-top:10px")))
    panes.append(pane("vector",
        P("approximate nearest neighbours over the Atlas vector index (cosine).", cls="muted",
          style="font-size:13px"),
        Div(Span("top cosine · ", cls="faint"),
            Span(f"{float(top.get('score',0) or 0):.3f}", cls="paper"), cls="blk",
            style="margin-top:10px")))
    panes.append(pane("bm25",
        P("lexical BM25 over the same chunks — exact terms the vector recall can miss.", cls="muted",
          style="font-size:13px")))
    panes.append(pane("rrf",
        P("the two rankings fused — rank position matters, not raw scores.", cls="muted",
          style="font-size:13px"),
        Div("rrf(d) = Σ 1 / (k + rank_r(d)),  k = 60", cls="blk formula")))
    panes.append(pane("rerank",
        P("a cross-encoder rescoring the fused top-k against the full query.", cls="muted",
          style="font-size:13px")))
    budget_rows = [Div(Span(name, cls="sl", style="width:70px"),
                       Div(Div(cls="bar rerank", data_w=f"{min(100, ms/2.42):.0f}"), cls="track"),
                       Span(f"{ms} ms", cls="sv"), cls="scorebar") for name, ms in _BUDGET]
    panes.append(pane("result",
        P("the final ranked ordering returned to the agent.", cls="muted", style="font-size:13px"),
        Div(f"{len(results)} hits · {took_ms} ms measured", cls="blk", style="margin:10px 0"),
        Div("latency budget (illustrative)", cls="label", style="margin:12px 0 8px"),
        *budget_rows, show=True))
    return Div(Div("phase inspector", cls="label", style="margin-bottom:14px"), *panes, cls="inspector")


def _phase_title(pid):
    for p in _PHASES:
        if p[0] == pid:
            return f"{p[1]} · {p[2]}"
    return pid


def render_results(data: dict, q: str, variant: str = DEFAULT):
    results = data.get("results", []) or []
    if not results:
        return Div(f"no matches for “{q}”.", cls="empty")
    if variant not in dict(VARIANTS):
        variant = DEFAULT
    phases = data.get("phases", []) or []
    took = data.get("tookMs", "?")
    summary = Div(Span(" → ".join(phases) if phases else "vector → bm25 → rrf → rerank", cls="label"),
                  Span(f" · {took} ms · {len(results)} hits", cls="chrome"), style="margin-bottom:6px")
    hits = Div(*[_hit(i, r) for i, r in enumerate(results, 1)], cls="hits")

    if variant == "results":  # conservative — ranked list, no pipeline
        return Div(summary, Div(hits, style="border:1px solid var(--rule)"),
                   Script(NotStr(SEARCH_SWAP_JS)))

    grid = Div(hits, _inspector(phases, results, took), cls="search-grid")
    if variant == "animated":  # divergent — auto-running pipeline
        header = Div(_pipe_header(phases),
                     Span("↻ rerun", id="rerun", cls="btn-d ghost",
                          style="margin-top:10px;cursor:pointer;display:inline-flex"))
        return Div(summary, header, grid, Script(NotStr(SEARCH_ANIMATE_JS)))

    # pipeline (canon) — scrubbable
    return Div(summary, _pipe_header(phases), grid, Script(NotStr(SEARCH_SWAP_JS)))
