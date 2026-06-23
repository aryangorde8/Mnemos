"""02 · Ask — three variants.  THE CENTERPIECE.

The reasoning stream + the proposed action's Approval card + the Critic's audit. The stream and cards
are identical across variants; only the layout differs:
- calm          (conservative): stream | a 380px rail with approval over critic.
- choreographed (canon):        full-width stream, then approval + critic side by side.
- split-critic  (divergent):    three columns — stream | draft | critic.

Driven by the real /agent/ask SSE; the approval/critic mount at the end via out-of-band swaps.
"""
import time
from urllib.parse import quote

from fasthtml.common import Button, Div, Form, Input, P, Span  # type: ignore

from assets import EDIT_JS
from chrome import cite, draft_card, critic_panel, page, surface_head, variant_strip

VARIANTS = [("calm", "calm"), ("choreographed", "choreographed"), ("split-critic", "split-critic")]
DEFAULT = "choreographed"
_MODEL = "gemini-3-pro"


def render_page(variant: str = DEFAULT, ready: dict | None = None, vault: dict | None = None):
    if variant not in dict(VARIANTS):
        variant = DEFAULT
    strip = variant_strip("/ask", variant, VARIANTS, meta="02 · ask · the centerpiece")
    body = Div(
        surface_head("02", "ask · multi-step reasoning",
                     Span("What should the agent "), Span("do for you?", cls="i accent")),
        P("Ask a question or issue a command. The agent retrieves context, reasons in a live stream, "
          "drafts the action — then the Critic audits it before you approve.", cls="muted",
          style="max-width:60ch;margin:0 0 18px"),
        # explicit submit button → Enter and click both fire reliably (one run per submit,
        # not per keystroke — each run is a real Gemini call).
        Form(Input(name="q", cls="field", autocomplete="off", autofocus=True,
                   placeholder="draft a decline to Marcus, propose Thursday 2pm"),
             Input(type="hidden", name="v", value=variant),
             Div(Button("ask →", type="submit", cls="btn-d primary"),
                 Span("press ↵ or click to run", cls="chrome"),
                 style="display:flex;align-items:center;gap:14px;margin-top:14px"),
             hx_get="/ask/run", hx_target="#run", hx_swap="innerHTML"),
        Div(id="run", style="margin-top:8px"),
    )
    return page("ask", body, ready=ready, vault=vault, strip=strip, scripts=EDIT_JS)


def _prompt_head(q, variant):
    return Div(
        Div("your prompt", cls="label"),
        P(q, cls="prompt-q"),
        Div(Span(Span(cls="pulse-dot"), " streaming", cls="chrome",
                 style="display:inline-flex;align-items:center;gap:7px"),
            Span(f"model · {_MODEL}", cls="chrome"), Span("retrieval · hybrid", cls="chrome"),
            Span("↻ replay", cls="btn-d ghost", style="margin-left:auto;cursor:pointer",
                 hx_get=f"/ask/run?q={quote(q)}&v={variant}", hx_target="#run", hx_swap="innerHTML"),
            cls="prompt-meta"),
        cls="prompt-head")


def _stream(q, variant):
    return Div(id="stream", cls="stream", hx_ext="sse",
               sse_connect=f"/ask/stream?q={quote(q)}&v={variant}",
               sse_swap="message", hx_swap="beforeend", sse_close="done")


def render_run(q: str, variant: str = DEFAULT):
    q = (q or "").strip()
    if variant not in dict(VARIANTS):
        variant = DEFAULT
    if not q:
        return Div("type a question and press enter.", cls="empty")
    head = _prompt_head(q, variant)
    stream = _stream(q, variant)
    if variant == "calm":
        layout = Div(Div(stream, style="padding:18px 20px"),
                     Div(id="ac-slot", style="padding:18px 20px;border-left:1px solid var(--rule)"),
                     cls="ask-calm")
        return Div(head, layout)
    if variant == "split-critic":
        layout = Div(Div(stream, cls="col"), Div(cls="vrule"),
                     Div(Div("draft", cls="label", style="margin-bottom:10px"),
                         Div(id="ac-draft"), cls="col"),
                     Div(cls="vrule"),
                     Div(Div("critic", cls="label", style="margin-bottom:10px"),
                         Div(id="ac-critic"), cls="col"),
                     cls="ask-3col")
        return Div(head, layout)
    # choreographed (canon)
    return Div(head, stream, Div(id="ac-slot", style="margin-top:8px"))


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


def approval_block(actions, critique: dict | None, variant: str = DEFAULT):
    """OOB fragment(s): the proposed action(s) + the Critic's audit, placed to match the variant.

    Handles both emails (critic column) and meetings (full-width, no critic — meetings aren't audited).
    `actions` is a list; a run may propose an email and/or a meeting.
    """
    actions = actions or []

    def _email_critic(a):
        return critique if a.get("kind") == "draft_email" else None

    if variant == "split-critic":
        if not actions:
            return (Div(Div("no action proposed for this run.", cls="empty"),
                        id="ac-draft", hx_swap_oob="true"),
                    Div(id="ac-critic", hx_swap_oob="true"))
        drafts = [draft_card(a, _email_critic(a), show_marks=(a.get("kind") == "draft_email"))
                  for a in actions]
        first_crit = _email_critic(actions[0])
        return (Div(*drafts, id="ac-draft", hx_swap_oob="true"),
                Div(critic_panel(first_crit), id="ac-critic", hx_swap_oob="true"))

    if not actions:
        return Div(id="ac-slot", hx_swap_oob="true")

    cards = []
    for a in actions:
        if a.get("kind") == "draft_email":
            crit = critique
            if variant == "calm":
                cards.append(Div(draft_card(a, crit, show_marks=True),
                                 Div(critic_panel(crit), style="margin-top:18px"),
                                 style="margin-bottom:24px"))
            else:  # choreographed
                cards.append(Div(draft_card(a, crit, show_marks=True), Div(cls="vrule"),
                                 critic_panel(crit), cls="ac-grid", style="margin-bottom:18px"))
        else:  # meeting (or other) — full-width card, no critic column
            cards.append(Div(draft_card(a, None, show_marks=False), cls="ac-grid",
                             style="grid-template-columns:1fr;margin-bottom:18px"))
    return Div(_proposal_head(), *cards, id="ac-slot", hx_swap_oob="true")
