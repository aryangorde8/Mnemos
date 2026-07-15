"""Briefing generator — port of apps/agent/src/agent/briefing.ts."""
from __future__ import annotations

import time

from bson import ObjectId

from app.agent.tools.get_briefing_context import tool as briefing_context_tool
from app.config import active_model, settings
from app.db.mongo import documents
from app.lib.briefings import save_briefing
from app.llm.genai_client import stream_generate

SYSTEM = """You are Mnemos, drafting a meeting briefing for a senior PM named Alex Chen. Produce a tight, editorial 1-pager that Alex could read in 60 seconds and walk into the room prepared.

OUTPUT RULES
- Output STRICT markdown. No HTML, no emoji, no decorative dividers, no AI-stock filler.
- Use ## section headings only. No H1 (the page renders one for you). No deeper than H3.
- Lead with one short orienting sentence under the title — no heading.
- Sections IN THIS ORDER:
  ## Attendees
  Bullet list. One short clause each capturing role + what they currently care about.
  ## Open threads
  Bullet list. Each item: "thread name — one-line status, with date or commitment if cited."
  ## Outstanding commitments
  Bullet list of concrete promises (incoming and outgoing). Format: "owner → recipient: what, by when." If none, write "Nothing tracked for this meeting."
  ## Suggested talking points
  3–5 questions or focal points Alex can raise, written in Alex's voice (lowercase-leaning, terse).
- Cite specifics by quoting fragments from the supplied context, never invent.
- No headings beyond these four.
- Do NOT include the meeting title or time at the top — those are rendered separately."""


def _now() -> int:
    return int(time.time() * 1000)


def _build_user_prompt(data: dict) -> str:
    ev = data["event"]
    parts = [f"Event: {ev['title']}"]
    if ev.get("when"):
        parts.append(f"When: {ev['when']}")
    if ev.get("location"):
        parts.append(f"Location: {ev['location']}")
    if ev.get("attendees"):
        parts.append(f"Attendees: {', '.join(ev['attendees'])}")
    if ev.get("agendaExcerpt"):
        parts.append(f"Agenda excerpt:\n{ev['agendaExcerpt']}")
    event_block = "\n".join(parts)

    related = "\n\n".join(
        f"R{i+1} [{r['source']}] {r['title']}:\n{(r.get('text') or '')[:320]}"
        for i, r in enumerate(data["related"][:8])) or "(no related chunks)"
    commitments = "\n\n".join(
        f"C{i+1} [{c['source']}] {c['title']}:\n{(c.get('excerpt') or '')[:300]}"
        for i, c in enumerate(data["commitmentLeads"][:8])) or "(no commitment leads found)"

    return (f"Generate the briefing for the meeting below.\n\n{event_block}\n\n"
            f"--- related context ---\n{related}\n\n"
            f"--- commitment leads ---\n{commitments}\n\n"
            "Now produce the markdown briefing per the system instructions.")


async def run_briefing(*, event_id: str | None = None, event_title: str | None = None):
    started = time.time()
    yield {"kind": "start", "eventId": event_id or "", "at": _now()}
    try:
        resolved_title = ""
        if event_id:
            if not ObjectId.is_valid(event_id):
                raise ValueError(f"invalid event id: {event_id}")
            e = await documents().find_one({"_id": ObjectId(event_id), "source": "calendar"})
            if not e:
                raise ValueError(f"event {event_id} not found")
            resolved_title = e["title"]
        elif event_title:
            resolved_title = event_title
        else:
            raise ValueError("event_id or event_title required")

        ctx_args = {"event_title": resolved_title}
        if event_id:
            ctx_args["event_id"] = event_id
        ctx = await briefing_context_tool.handler(ctx_args, None)
        if not ctx.get("ok") or not ctx.get("data"):
            raise RuntimeError(ctx.get("error") or "failed to assemble context")

        data = ctx["data"]
        ev = data["event"]
        citations = ctx.get("citations") or []
        yield {"kind": "event_loaded", "event": ev, "at": _now()}
        yield {"kind": "context_loaded", "relatedCount": len(data["related"]),
               "commitmentCount": len(data["commitmentLeads"]), "at": _now()}
        yield {"kind": "synthesizing", "at": _now()}

        collected = ""
        async for chunk in stream_generate(system=SYSTEM,
                                           contents=[{"role": "user", "parts": [{"text": _build_user_prompt(data)}]}],
                                           tools=None, temperature=0.35, max_tokens=1400):
            if chunk.text:
                collected += chunk.text
                yield {"kind": "chunk", "text": chunk.text, "at": _now()}

        from datetime import datetime, timezone
        briefing_id = await save_briefing({
            "eventId": ObjectId(ev["id"]), "eventTitle": ev["title"], "eventWhen": ev.get("when"),
            "eventLocation": ev.get("location"), "attendees": ev.get("attendees") or [],
            "markdown": collected.strip(), "contextSummary": ctx.get("summary"),
            "citations": citations, "model": active_model(),
            "createdAt": datetime.now(timezone.utc),
        })
        yield {"kind": "saved", "briefingId": briefing_id, "eventTitle": ev["title"],
               "attendees": ev.get("attendees") or [], "eventWhen": ev.get("when"),
               "eventLocation": ev.get("location"), "citations": citations, "at": _now()}
        yield {"kind": "done", "totalMs": int((time.time() - started) * 1000), "at": _now()}
    except Exception as err:  # noqa: BLE001
        yield {"kind": "error", "message": str(err), "at": _now()}
