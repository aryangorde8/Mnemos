"""Shared chrome + primitives, ported from the handoff's core.jsx.

Square corners, hairline rules, two accents. `page()` is the shell every surface renders inside:
left nav rail (200px) + top status bar + ⌘K palette, content in `.page > .surface`.
"""
from __future__ import annotations

from fasthtml.common import (  # type: ignore
    A, Aside, Button, Div, Input, Main, Nav, NotStr, Script, Span, Textarea,
)

from assets import CLOCK_JS, CMDK_JS

# section number · path · label · keybind — the six canon surfaces
SURFACES = [
    ("hero", "/", "home", "00", "⌥1"),
    ("ingest", "/ingest", "ingest", "01", "⌥2"),
    ("ask", "/ask", "ask", "02", "⌥3"),
    ("approve", "/approve", "approve", "03", "⌥4"),
    ("memory", "/memory", "memory", "04", "⌥5"),
    ("search", "/search", "search", "05", "⌥6"),
]
EXTRA = [("debate", "/debate"), ("commitments", "/commitments"), ("briefings", "/briefings")]

_SURF_BY_ID = {s[0]: s for s in SURFACES}


# ── ⌘K palette dataset (kind · glyph · title · sub · href) ──
CMDK_ITEMS = [
    ("ask", "?", "where did the Q3 plan slip?", "reason · 6 sources · ~6s", "/ask"),
    ("ask", "?", "draft a decline to Marcus, propose Thu 2pm", "reason · 4 sources · 1 action", "/ask"),
    ("ask", "?", "what did I commit to Sarah last week?", "reason · 3 sources · ~4s", "/ask"),
    ("search", "⌗", '"inference SLO slip"', "vault · vector + bm25 + rrf", "/search"),
    ("search", "⌗", "meetings with K. Reyes", "vault · calendar + notes", "/search"),
    ("nav", "→", "ingest · connect a source", "/ingest", "/ingest"),
    ("nav", "→", "approve · the action queue", "/approve", "/approve"),
    ("nav", "→", "memory · constellations", "/memory", "/memory"),
    ("nav", "→", "search · pipeline", "/search", "/search"),
    ("nav", "→", "home · the wedge", "/", "/"),
]
_CHIPS = ["draft follow-up to K. Reyes", "what did I commit in last week's sync?",
          "summarize 1:1 with M.", "threads I owe a reply to"]


def kicker(num: str, title: str, tone: str = ""):
    return Div(Span(cls="rule"), Span(f"{num} · {title}", cls="num"),
               cls="kicker" + (" saffron" if tone == "saffron" else ""))


def spark(values, tone: str = "v", width: int = 60, height: int = 12):
    mx = max(list(values) + [1])
    bars = [Span(style=f"height:{max(1, v / mx * height):.1f}px") for v in values]
    return Span(*bars, cls=f"spark {tone}", style=f"width:{width}px;height:{height}px")


def cite(n: int, title: str, src: str, excerpt: str = ""):
    tip = (Div(Div(Span(f"citation №{n:02d}", cls="accent"), Span(src),
                   cls="chrome", style="display:flex;justify-content:space-between;margin-bottom:6px"),
               Div(f'"{title}"', cls="ttl"),
               Div(excerpt, cls="ex"), cls="cite-tip") if excerpt else "")
    return Span(
        Span(Span(f"{n:02d}", cls="sup"), Span(title, cls="ttl"), Span(src, cls="src"),
             cls="cite", tabindex="0"),
        tip, cls="cite-wrap")


def nav_rail(active: str, vault: dict | None = None):
    vault = vault or {}
    items = []
    for sid, path, label, section, key in SURFACES:
        items.append(A(Span(section, cls="n"), Span(label, cls="l"), Span(key, cls="k"),
                       href=path, cls="nav-item" + (" active" if active == sid else "")))
    extra = [A(label, href=path, cls="active" if active == label else "") for label, path in EXTRA]
    items_n = vault.get("items")
    chunks_n = vault.get("chunks")
    return Aside(
        Div(Span("Mnemos", cls="name"), Span("v0.0.1", cls="ver"), cls="mark"),
        Div(*items, style="display:flex;flex-direction:column"),
        Nav(*extra, cls="nav-extra"),
        Div(Div(cls="hr-soft", style="margin:18px 0 12px"),
            Div("vault", cls="label", style="margin-bottom:8px"),
            Div(Div(f"{items_n:,} items" if isinstance(items_n, int) else "vault offline"),
                Div(f"{chunks_n:,} chunks" if isinstance(chunks_n, int) else "run the seed"),
                Div("indexed · live", cls="num", style="color:var(--paper-faint)"), cls="v"),
            cls="foot"),
        cls="nav-rail")


def _pill(label, value, state):
    dot = "pulse-dot" + ("" if state == "on" else " saffron" if state == "pending" else " muted")
    vcls = "v" + ("" if state != "off" else " off")
    return Div(Span(cls=dot), Span(label), Span(value, cls=vcls), cls="pill")


def _google_pill(google: dict | None):
    """Google OAuth pill: live (sends real email/events) · connect (configured, awaiting
    consent) · simulated (no GMAIL_OAUTH_* on the agent). Nothing when the agent is down."""
    if not isinstance(google, dict):
        return ""
    if google.get("connected"):
        return _pill("google", "live", "on")
    if google.get("configured"):
        return _pill("google", "connect", "pending")
    return _pill("google", "simulated", "off")


def topbar(active: str, ready: dict | None = None):
    ready = ready or {}
    _, path, label, _, _ = _SURF_BY_ID.get(active, ("", "/" + active, active, "", ""))
    atlas = "on" if ready.get("atlas") == "configured" else "pending"
    # llm: gemini_api (free tier) | vertex | missing; older agents only send `vertex`
    llm = ready.get("llm") or ("vertex" if ready.get("vertex") == "configured" else "missing")
    llm_value, llm_state = {"gemini_api": ("api · free", "on"),
                            "vertex": ("vertex", "on")}.get(llm, ("awaiting", "pending"))
    return Div(
        Div(Span(path, cls="path"), Span("·", style="color:var(--paper-faint)"),
            Span(label, cls="here"), cls="crumb"),
        Div(cls="spacer"),
        _pill("atlas", "connected" if atlas == "on" else "offline", atlas),
        _pill("gemini", llm_value, llm_state),
        _google_pill(ready.get("google")),
        _pill("critic", "armed", "pending"),
        Span("--:--:--", id="clock", cls="chrome num", style="margin:0 6px"),
        Button(Span("?", cls="q"), Span("ask"), Span("⌘K", cls="k"),
               cls="ask-btn", data_cmdk_open="1"),
        cls="topbar")


def command_palette():
    rows = []
    for kind, glyph, title, sub, href in CMDK_ITEMS:
        tag_cls = "tag v" if kind == "ask" else "tag s" if kind == "search" else "tag"
        rows.append(Div(
            Span(glyph, cls="glyph"),
            Span(Span(title, cls="ttl"), Span(sub, cls="sub")),
            Span(kind, cls=tag_cls),
            cls="cmdk-item", data_href=href, data_q=(title + " " + sub).lower()))
    return Div(Div(
        Div(Span("?", cls="q"), Input(id="cmdk-input", placeholder="ask · search · navigate",
                                      autocomplete="off"), Span("esc", cls="kbd"), cls="in-row"),
        Div(*rows, id="cmdk-list", cls="cmdk-list"),
        Div(Div("frequent", cls="label", style="margin-bottom:10px"),
            Div(*[Button(c, cls="cmdk-chip") for c in _CHIPS], cls="cmdk-chips"), cls="cmdk-foot"),
        Div(Span("↑↓ navigate · ↵ select · esc dismiss"), Span("mnemos · v0.0.1"),
            cls="cmdk-bar chrome"),
        cls="cmdk"), id="cmdk", cls="cmdk-back")


def variant_strip(base_path: str, active: str, options: list[tuple[str, str]],
                  meta: str = "", extra: str = ""):
    """The three-variants selector at the top of a surface. Links switch `?v=` (server-side)."""
    btns = []
    for i, (val, label) in enumerate(options, 1):
        href = f"{base_path}?v={val}" + (("&" + extra) if extra else "")
        btns.append(A(Span(f"v.{i:02d}", cls="v-num"), Span(label), href=href,
                      cls="vbtn" + (" active" if val == active else "")))
    return Div(Div("variant", cls="label-cell"), *btns,
              (Span(meta, cls="meta") if meta else ""), cls="variant-strip")


def page(active: str, *content, ready: dict | None = None, vault: dict | None = None,
         full_bleed: bool = False, scripts: str = "", strip=None):
    """The shell: nav rail + top bar + [variant strip] + content + ⌘K. `full_bleed` drops .surface padding."""
    if full_bleed:
        body = Main(strip or "", *content, cls="page")
    else:
        body = Main(strip or "", Div(*content, cls="surface"), cls="page")
    js = CMDK_JS + CLOCK_JS + scripts
    return (nav_rail(active, vault), topbar(active, ready), body, command_palette(), Script(NotStr(js)))


def surface_head(num: str, kicker_title: str, *headline, tone: str = ""):
    """Kicker rule + the big italic surface headline. `headline` are FT nodes for the H1."""
    return Div(kicker(num, kicker_title, tone), Div(*headline, cls="surface-h1"), cls="surface-head")


# ────────────────────────── shared draft / critic pieces ──────────────────────────

_SEV = {"high": ("blocking", "blocking"), "medium": ("caution", "caution"), "low": ("minor", "minor")}


def is_blocking(critique: dict | None) -> bool:
    if not critique:
        return False
    if critique.get("verdict") == "reject":
        return True
    return any(f.get("severity") == "high" for f in critique.get("findings", []))


def body_with_marks(text: str, findings: list[dict]):
    """Render draft body, wrapping each finding's `claim` phrase with a saffron wavy underline + sup."""
    text = text or ""
    claims = [(i + 1, f.get("claim", "")) for i, f in enumerate(findings) if f.get("claim")]
    segments: list = [text]
    for n, claim in claims:
        new: list = []
        for seg in segments:
            if isinstance(seg, str) and claim and claim in seg:
                before, after = seg.split(claim, 1)
                new.append(before)
                new.append(Span(claim, Span(f"{n}", cls="sup", style="vertical-align:super"),
                                cls="mark"))
                new.append(after)
            else:
                new.append(seg)
        segments = new
    return Div(*segments, cls="body")


def _fmt_dt(iso: str) -> str:
    """ISO datetime → a readable 'Thu Jun 25 · 5:00 PM' (falls back to the raw string)."""
    if not iso:
        return "—"
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return dt.strftime("%a %b %-d · %-I:%M %p")
    except (ValueError, TypeError):
        return str(iso)


def _proposal_bits(action: dict):
    p = action.get("proposal", {}) or {}
    kind = action.get("kind")
    if kind == "draft_email":
        to = p.get("to")
        to_str = ", ".join(to) if isinstance(to, list) else (to or "—")
        meta = [("to", to_str), ("subject", p.get("subject", "—"))]
        if p.get("cc"):
            cc = p.get("cc")
            meta.insert(1, ("cc", ", ".join(cc) if isinstance(cc, list) else cc))
        return p.get("subject") or "(no subject)", p.get("body") or "", meta
    if kind == "schedule_meeting":
        times = p.get("proposedTimes") or []
        idx = p.get("preferredIdx") or 0
        when = times[idx] if 0 <= idx < len(times) else (times[0] if times else "")
        meta = [("with", ", ".join(p.get("attendees", [])) or "—"), ("when", _fmt_dt(when))]
        if p.get("durationMinutes"):
            meta.append(("duration", f"{p['durationMinutes']} min"))
        if p.get("location"):
            meta.append(("location", p["location"]))
        return p.get("title") or "(meeting)", p.get("agenda") or "", meta
    return p.get("subject") or p.get("title") or "(action)", p.get("body") or p.get("agenda") or "", []


def default_decide_bar(action: dict, blocking: bool, is_email: bool = False):
    """Working decision bar: approve & reject POST to /approve/decide; edit toggles inline editing.

    For draft_email the approve request includes the (possibly edited) body textarea so an edit is
    actually sent. The whole bar is swapped out (outerHTML) with the confirmation on success.
    """
    aid = action.get("id", "")
    swap = {"hx_target": f"#decide-{aid}", "hx_swap": "outerHTML"}
    if blocking:
        approve = Button("✓ approve & send", cls="btn-d primary", disabled=True)
    else:
        approve = Button("✓ approve & send", cls="btn-d primary",
                         hx_post=f"/approve/decide?aid={aid}&verdict=approve",
                         hx_include=(f"#edit-{aid}" if is_email else None), **swap)
    edit = (Button("¶ edit", cls="btn-d ghost", type="button", onclick=f"mnEdit('{aid}')")
            if is_email else Button("¶ edit", cls="btn-d ghost", type="button", disabled=True))
    reject = Button("✕ reject", cls="btn-d",
                    hx_post=f"/approve/decide?aid={aid}&verdict=reject", **swap)
    note = (Span("⊘ critic blocks this send · resolve the blocking note first", cls="warn")
            if blocking else Span(f"{action.get('kind','action')} · {action.get('status','proposed')}",
                                  cls="chrome"))
    return Div(approve, edit, reject, note, id=f"decide-{aid}", cls="decide")


def draft_card(action: dict, critique: dict | None = None, show_marks: bool = True, decide_bar=None):
    aid = action.get("id", "")
    subject, body, meta = _proposal_bits(action)
    findings = (critique or {}).get("findings", []) if show_marks else []
    blocking = is_blocking(critique)
    is_email = action.get("kind") == "draft_email"
    p = action.get("proposal", {}) or {}
    meta_block = Div(*[Span(Span(f"{k} ", cls="", style="color:var(--paper-faint)"),
                            f"{v}\n") for k, v in meta], cls="meta",
                     style="white-space:pre-wrap") if meta else ""
    body_view = (body_with_marks(body, findings) if show_marks
                 else Div(body, cls="body", style="white-space:pre-wrap"))
    view = Div(meta_block, Div(subject, cls="subj"), body_view, id=f"view-{aid}")
    # editable to / subject / body (draft_email only); included on approve as edits
    if is_email:
        to_val = p.get("to") if isinstance(p.get("to"), list) else ([p.get("to")] if p.get("to") else [])
        edit = Div(
            Div("to", cls="label", style="margin-bottom:4px"),
            Input(name="to", value=", ".join(to_val), cls="field-edit-line"),
            Div("subject", cls="label", style="margin:12px 0 4px"),
            Input(name="subject", value=p.get("subject", ""), cls="field-edit-line"),
            Div("body", cls="label", style="margin:12px 0 4px"),
            Textarea(body, name="body", cls="field-edit"),
            id=f"edit-{aid}", style="display:none")
    else:
        edit = ""
    decide = decide_bar if decide_bar is not None else default_decide_bar(action, blocking, is_email)
    return Div(
        Div(action.get("kind", "draft"), cls="label", style="margin-bottom:12px"),
        view, edit, decide,
        cls="draft")


def critic_panel(critique: dict | None):
    if not critique:
        return Div(Div("critic", cls="label"),
                   Div("no audit on file for this draft.", cls="empty"), cls="critic")
    blocking = is_blocking(critique)
    verdict = critique.get("verdict", "revise")
    findings = critique.get("findings", [])
    notes = []
    for i, f in enumerate(findings):
        sev = f.get("severity", "low")
        sev_label, sev_cls = _SEV.get(sev, ("minor", "minor"))
        if sev != "high" and f.get("evidence") in ("unsupported", "contradicted"):
            sev_label, sev_cls = "fact", "fact"
        cite_line = (Span(f"↳ {f['citation']}", cls="cite-link") if f.get("citation") else "")
        notes.append(Div(
            Div(Span(sev_label, cls=f"sev {sev_cls}"),
                Span(f"№{i + 1:02d}", cls="chrome", style="margin-left:8px"),
                style="display:flex;align-items:center"),
            Div(f'"{f.get("claim", "")}"', cls="anchor") if f.get("claim") else "",
            Div(f.get("issue", ""), cls="text"),
            (Div(f"suggest · {f['suggestion']}", cls="text",
                 style="color:var(--paper-muted);margin-top:6px") if f.get("suggestion") else ""),
            cite_line,
            cls="note"))
    high = sum(1 for f in findings if f.get("severity") == "high")
    med = sum(1 for f in findings if f.get("severity") == "medium")
    low = sum(1 for f in findings if f.get("severity") == "low")
    voice = critique.get("voice", {}) or {}
    return Div(
        Div(kicker("", "the critic's pen", "saffron")),
        Div(critique.get("summary") or f"verdict · {verdict}", cls="verdict",
            style="margin-top:12px"),
        Div(f"verdict · {verdict}" + (" · sending blocked" if blocking else ""),
            cls="chrome", style="margin-bottom:8px"),
        *notes,
        Div(f"{high} blocking · {med} caution · {low} minor · voice {voice.get('score','—')}/10",
            cls="critic-foot"),
        cls="critic" + (" blocking" if blocking else ""))
