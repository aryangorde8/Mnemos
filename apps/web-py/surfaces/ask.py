"""02 · Ask — THE CENTERPIECE.

The reasoning stream + the proposed action's Approval card + the Critic's audit: a full-width live
stream, then the approval + critic side by side. Driven by the real /agent/ask SSE; the
approval/critic mount at the end via out-of-band swaps.
"""
import time
from urllib.parse import quote

from fasthtml.common import Button, Div, Form, Input, P, Span  # type: ignore

from assets import EDIT_JS
from chrome import cite, draft_card, critic_panel, page, surface_head

_MODEL_FALLBACK = "Amazon Nova"  # used only if /ready is unreachable


def render_page(ready: dict | None = None, vault: dict | None = None):
    body = Div(
        surface_head("02", "ask · multi-step reasoning",
                     Span("What should the agent "), Span("do for you?", cls="i accent")),
        P("Ask a question or issue a command. The agent retrieves context, reasons in a live stream, "
          "drafts the action — then the Critic audits it before you approve.", cls="muted",
          style="max-width:60ch;margin:0 0 18px"),
        # explicit submit button → Enter and click both fire reliably (one run per submit,
        # not per keystroke — each run is a real model call).
        Form(Input(name="q", cls="field", autocomplete="off", autofocus=True,
                   placeholder="draft a decline to Marcus, propose Thursday 2pm"),
             Div(Button("ask →", type="submit", cls="btn-d primary"),
                 Span("press ↵ or click to run", cls="chrome"),
                 style="display:flex;align-items:center;gap:14px;margin-top:14px"),
             hx_get="/ask/run", hx_target="#run", hx_swap="innerHTML"),
        Div(id="run", style="margin-top:8px"),
    )
    return page("ask", body, ready=ready, vault=vault, scripts=EDIT_JS)


def _prompt_head(q, model=_MODEL_FALLBACK):
    return Div(
        Div("your prompt", cls="label"),
        P(q, cls="prompt-q"),
        Div(Span(Span(cls="pulse-dot"), " streaming", cls="chrome",
                 style="display:inline-flex;align-items:center;gap:7px"),
            Span(f"model · {model}", cls="chrome"), Span("retrieval · hybrid", cls="chrome"),
            Span("↻ replay", cls="btn-d ghost", style="margin-left:auto;cursor:pointer",
                 hx_get=f"/ask/run?q={quote(q)}", hx_target="#run", hx_swap="innerHTML"),
            cls="prompt-meta"),
        cls="prompt-head")


def _stream(q):
    return Div(id="stream", cls="stream", hx_ext="sse",
               sse_connect=f"/ask/stream?q={quote(q)}",
               sse_swap="message", hx_swap="beforeend", sse_close="done")


def render_run(q: str, model: str = _MODEL_FALLBACK):
    q = (q or "").strip()
    if not q:
        return Div("type a question and press enter.", cls="empty")
    return Div(_prompt_head(q, model), _stream(q), Div(id="ac-slot", style="margin-top:8px"))


def _node(kind_cls, kind_label, ts, *body):
    return Div(Div(cls="dot"), Span(ts, cls="ts"), Span(kind_label, cls="kind"), *body,
               cls=f"node {kind_cls}")


def _ts(at) -> str:
    """The agent sends `at` as epoch-millis (int); render it as a mono HH:MM:SS gutter stamp."""
    if isinstance(at, (int, float)):
        return time.strftime("%H:%M:%S", time.localtime(at / 1000))
    if isinstance(at, str):
        return at[-12:-4] or at[:8]
    return ""


def render_event(ev: dict):
    kind = ev.get("kind")
    ts = _ts(ev.get("at"))
    if kind == "thought":
        return Span(ev.get("chunk", ""), cls="thought-txt", style="display:inline")
    if kind == "tool_call":
        args = ev.get("args", {}) or {}
        auto = " · auto" if args.get("auto") else ""
        summary = ", ".join(f"{k}={v}" for k, v in args.items() if k != "auto")[:120]
        return _node("tool", f"› tool_call{auto}", ts, Div(ev.get("name", ""), cls="tool-txt"),
                     Div(summary, cls="obs-txt") if summary else "")
    if kind == "observation":
        res = ev.get("result", {}) or {}
        data = res.get("data") or {}
        sub = data.get("summary") or (("error · " + res.get("error", "")) if not res.get("ok") else "ok")
        cnt = data.get("count")
        if cnt is not None:
            sub = f"← {cnt} documents · {sub}"
        return _node("obs", "‹ observation", ts, Div(ev.get("name", ""), cls="obs-txt"),
                     Div(str(sub)[:160], cls="obs-txt"))
    if kind == "answer":
        return _node("answer", "◆ answer", ts, Div(ev.get("chunk", ""), cls="answer-body"))
    if kind == "citations":
        chips = [cite(i, c.get("title", "source"), (c.get("source", "doc") or "doc")[:8],
                      (c.get("excerpt") or c.get("text") or "")[:240])
                 for i, c in enumerate(ev.get("citations", [])[:8], 1)]
        return Div(*chips, cls="cites") if chips else None
    if kind == "error":
        return _node("answer", "◆ error", ts,
                     Div(ev.get("message", ""), cls="answer-body", style="border-color:var(--vermilion)"))
    if kind == "done":
        u = ev.get("usage", {}) or {}
        return Div(f"{ev.get('turns','?')} turns · {u.get('totalTokens','?')} tokens · "
                   f"${u.get('estimatedCostUsd','?')} · {ev.get('totalMs','?')}ms",
                   cls="chrome", style="margin-top:16px;padding-left:18px")
    return None


def _proposal_head():
    return Div(surface_head("", "the proposal", Span("Held for your "),
                            Span("approval.", cls="i accent")), style="margin-top:36px")


def approval_block(actions, critique: dict | None):
    """OOB fragment: the proposed action(s) + the Critic's audit, mounted into #ac-slot.

    Handles both emails (critic column) and meetings (full-width, no critic — meetings aren't audited).
    `actions` is a list; a run may propose an email and/or a meeting.
    """
    actions = actions or []
    if not actions:
        return Div(id="ac-slot", hx_swap_oob="true")

    cards = []
    for a in actions:
        if a.get("kind") == "draft_email":
            cards.append(Div(draft_card(a, critique, show_marks=True), Div(cls="vrule"),
                             critic_panel(critique), cls="ac-grid", style="margin-bottom:18px"))
        else:  # meeting (or other) — full-width card, no critic column
            cards.append(Div(draft_card(a, None, show_marks=False), cls="ac-grid",
                             style="grid-template-columns:1fr;margin-bottom:18px"))
    return Div(_proposal_head(), *cards, id="ac-slot", hx_swap_oob="true")
