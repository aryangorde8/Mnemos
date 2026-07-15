"""04 · Memory — constellation.

A printed star map (SVG) of the people the agent has extracted from the corpus. X ≈ first-seen
(right ascension), Y ≈ relationship density (declination), star size ≈ magnitude (mentions). Projects
are constellations joining their member stars. Hover a star → the right rail updates.
"""
import hashlib

from fasthtml.common import Div, NotStr, P, Span  # type: ignore

from assets import MEMORY_JS
from chrome import page, surface_head

W, H = 1000, 560
PADL, PADR, PADT, PADB = 60, 40, 34, 44
PLOT_W = W - PADL - PADR
PLOT_H = H - PADT - PADB
_COLORS = {"vermilion": "#f25738", "saffron": "#e8c547", "paper": "#f3ecdf"}
_CYCLE = ["vermilion", "saffron", "paper"]


def _esc(s: str) -> str:
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def _hash(s: str) -> int:
    return int(hashlib.md5((s or "x").encode()).hexdigest(), 16)


def _num(v) -> int:
    """A series point may be a plain number or a dict like {date, count}; coerce to an int."""
    if isinstance(v, dict):
        for k in ("count", "n", "value", "v", "mentions"):
            if isinstance(v.get(k), (int, float)):
                return int(v[k])
        return 0
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _x(hour: float) -> float:
    return PADL + (hour / 24.0) * PLOT_W


def _y(dec: float) -> float:
    return PADT + ((60 - dec) / 120.0) * PLOT_H


def _build(people: list[dict]):
    if not people:
        return None, []
    max_m = max((p.get("mentions", 0) for p in people), default=1) or 1
    # RA from first-seen rank (newest → 0h); dec from mention density; deterministic jitter
    ranked = sorted(people, key=lambda p: (p.get("firstSeen") or ""), reverse=True)
    rank = {id(p): i for i, p in enumerate(ranked)}
    n = len(people)
    nodes = {}
    for p in people:
        m = p.get("mentions", 0)
        hh = _hash(p["name"])
        hour = (rank[id(p)] / max(1, n - 1)) * 24
        hour = max(0.2, min(23.8, hour + ((hh % 100) / 100 - 0.5) * 1.6))
        dec = -52 + 104 * (m / max_m) + (((hh >> 8) % 100) / 100 - 0.5) * 20
        dec = max(-58, min(58, dec))
        mag = 1 + 5 * (1 - m / max_m)
        r = max(1.6, 6 - mag * 0.9)
        cx, cy = _x(hour), _y(dec)
        nodes[p["name"]] = {"p": p, "cx": cx, "cy": cy, "r": r, "mag": mag, "hour": hour, "dec": dec}
        if p.get("key"):
            nodes[p["key"]] = nodes[p["name"]]
    return nodes, ranked


def _members_of(proj, relations, valid):
    pname, pkey = proj.get("name"), proj.get("key")
    members = []
    for r in relations:
        a, b = r.get("from"), r.get("to")
        if a in (pname, pkey) and b in valid:
            members.append(b)
        elif b in (pname, pkey) and a in valid:
            members.append(a)
    return list(dict.fromkeys(members))


def _constellations(projects, relations, nodes):
    """Build <g> constellation line groups + legend rows from project membership."""
    groups, legend, membership = [], [], {}
    name_keys = set(nodes.keys())
    for pi, proj in enumerate(projects):
        color = _CYCLE[pi % len(_CYCLE)]
        hexc = _COLORS[color]
        pid = f"p{pi}"
        members = _members_of(proj, relations, name_keys)
        for m in members:
            membership.setdefault(m, []).append(proj.get("name", ""))
        legend.append((pid, proj.get("name", ""), hexc))
        if len(members) >= 2:
            cx = sum(nodes[m]["cx"] for m in members) / len(members)
            cy = sum(nodes[m]["cy"] for m in members) / len(members)
            lines = "".join(
                f'<line x1="{nodes[m]["cx"]:.1f}" y1="{nodes[m]["cy"]:.1f}" '
                f'x2="{cx:.1f}" y2="{cy:.1f}" stroke="{hexc}" stroke-width="0.6" opacity="0.5"/>'
                for m in members)
            label = (f'<text x="{cx:.1f}" y="{cy - 6:.1f}" font-family="Instrument Serif" '
                     f'font-style="italic" font-size="15" fill="{hexc}" opacity="0.8" '
                     f'text-anchor="middle">{_esc(proj.get("name",""))}</text>')
            groups.append(f'<g data-projlines="{pid}" style="transition:opacity 220ms">{lines}{label}</g>')
    return groups, legend, membership


def _svg(people, projects, relations):
    nodes, ranked = _build(people)
    if not nodes:
        return None, []
    groups, legend, membership = _constellations(projects, relations, nodes)

    parts = [f'<svg id="mem-svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet" '
             f'style="font-variant-numeric:tabular-nums">']
    # grid + ticks
    for hour in range(0, 25, 4):
        gx = _x(hour)
        parts.append(f'<line x1="{gx:.1f}" y1="{PADT}" x2="{gx:.1f}" y2="{PADT+PLOT_H}" '
                     f'stroke="#2a2218" stroke-width="0.5" stroke-dasharray="2 4"/>')
        parts.append(f'<text x="{gx:.1f}" y="{PADT+PLOT_H+16}" font-family="IBM Plex Mono" '
                     f'font-size="9" fill="#6c645a" text-anchor="middle">{hour:02d}h</text>')
    for dec in range(-60, 61, 30):
        gy = _y(dec)
        parts.append(f'<line x1="{PADL}" y1="{gy:.1f}" x2="{PADL+PLOT_W}" y2="{gy:.1f}" '
                     f'stroke="#2a2218" stroke-width="0.5" stroke-dasharray="2 4"/>')
        parts.append(f'<text x="{PADL-10}" y="{gy+3:.1f}" font-family="IBM Plex Mono" '
                     f'font-size="9" fill="#6c645a" text-anchor="end">{dec:+d}°</text>')
    # axis labels
    parts.append(f'<text x="{PADL}" y="{H-6}" font-family="IBM Plex Mono" font-size="9" '
                 f'fill="#6c645a" letter-spacing="0.14em">RIGHT ASCENSION · FIRST SEEN →</text>')
    parts.append(f'<text x="14" y="{PADT+10}" font-family="IBM Plex Mono" font-size="9" '
                 f'fill="#6c645a" letter-spacing="0.14em" transform="rotate(-90 14 {PADT+10})">'
                 f'DECLINATION · RELATIONSHIP DENSITY</text>')
    # constellation lines (behind stars)
    parts.extend(groups)
    # halo
    parts.append('<circle id="halo" cx="-99" cy="-99" r="0" fill="none" stroke="#f25738" '
                 'stroke-width="1" opacity="0" style="transition:opacity 200ms"/>')
    # stars (dedup by identity)
    seen = set()
    for name, nd in nodes.items():
        p = nd["p"]
        if id(p) in seen:
            continue
        seen.add(id(p))
        cx, cy, r = nd["cx"], nd["cy"], nd["r"]
        parts.append(f'<circle class="star" cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="#f3ecdf"/>')
        if nd["mag"] < 2.2:  # brightest always labelled
            parts.append(f'<text x="{cx+r+5:.1f}" y="{cy+3:.1f}" font-family="Instrument Serif" '
                         f'font-style="italic" font-size="13" fill="#d8d2c5">{_esc(p["name"])}</text>')
        series = ",".join(str(_num(v)) for v in (p.get("series") or [])[-14:])
        projects_csv = ",".join(membership.get(p["name"], []) + membership.get(p.get("key", ""), []))
        radec = f"{nd['hour']:.1f}h · {nd['dec']:+.0f}°"
        parts.append(
            f'<circle class="star-hit" cx="{cx:.1f}" cy="{cy:.1f}" r="{max(r+7,10):.1f}" '
            f'data-cx="{cx:.1f}" data-cy="{cy:.1f}" data-r="{r:.1f}" '
            f'data-name="{_esc(p["name"])}" data-role="{_esc(p.get("role") or "")}" '
            f'data-mentions="{p.get("mentions",0)}" data-mag="{nd["mag"]:.1f}" '
            f'data-last="{_esc((p.get("lastSeen") or "")[:10])}" data-radec="{radec}" '
            f'data-series="{_esc(series)}" data-projects="{_esc(projects_csv)}"/>')
    parts.append("</svg>")
    return "".join(parts), legend


def _constellation_body(people, projects, relations):
    svg, legend = _svg(people, projects, relations)
    if not svg:
        return None, ""
    legend_rows = [Div(Span(cls="swatch", style=f"background:{hexc}"), Span(name),
                       cls="row", data_proj=pid) for pid, name, hexc in legend]
    legend_box = (Div(Div("constellations", cls="label", style="margin-bottom:6px"),
                      *legend_rows, cls="mem-legend") if legend_rows else "")
    rail = Div(Div("entity", cls="label"),
               Div("Hover a star.", cls="nm", style="margin-top:6px"),
               P("Size encodes magnitude — how often the person appears across the vault. Bright "
                 "stars are labelled; the rest reveal on hover.", cls="muted",
                 style="font-size:13px;margin-top:14px"), id="mem-rail", cls="mem-rail")
    grid = Div(Div(NotStr(svg), legend_box, cls="mem-chart"), rail, cls="mem-grid")
    return grid, MEMORY_JS


def render(graph: dict | None = None, ready: dict | None = None, vault: dict | None = None):
    graph = graph or {}
    ents = graph.get("entities", {}) if isinstance(graph, dict) else {}
    people = ents.get("person", []) or []
    projects = ents.get("project", []) or []
    relations = graph.get("relations", []) or []
    stats = graph.get("stats", {}) if isinstance(graph, dict) else {}
    e = stats.get("entities", {}) if isinstance(stats, dict) else {}
    head = surface_head("04", "memory · the constellation",
                        Span("The people & projects "), Span("in orbit.", cls="i accent"))
    meta = P(f"{e.get('person','—')} people · {e.get('project','—')} projects · "
             f"{stats.get('relations','—')} relations", cls="label", style="margin:0 0 14px")

    if not people:
        return page("memory", head,
                    Div("no entities extracted yet — run the graph extraction over the corpus.",
                        cls="empty"), ready=ready, vault=vault)

    body, scripts = _constellation_body(people, projects, relations)
    return page("memory", head, meta, body, ready=ready, vault=vault, scripts=scripts)
