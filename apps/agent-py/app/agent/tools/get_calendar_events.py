"""get_calendar_events — port of apps/agent/src/agent/tools/get-calendar-events.ts."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.agent.types import ToolDef
from app.db.mongo import documents
from app.lib.calendar import is_calendar_connected, list_calendar_events

_DECL = {
    "name": "get_calendar_events",
    "description": (
        "Return Alex's calendar events within a date window. Use to check availability, find a "
        "specific meeting, or list what's on the calendar this week. Times are interpreted in UTC."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "from": {"type": "string", "description": "ISO date (inclusive). Default: today."},
            "to": {"type": "string", "description": "ISO date (inclusive). Default: from + 7 days."},
            "title_contains": {"type": "string", "description": "Optional case-insensitive substring filter."},
        },
    },
}


async def _handler(args: dict, ctx: dict | None = None) -> dict:
    try:
        from_iso = args["from"] if isinstance(args.get("from"), str) else datetime.now(timezone.utc).isoformat()
        if isinstance(args.get("to"), str):
            to_iso = args["to"]
        else:
            base = datetime.fromisoformat(from_iso.replace("Z", "+00:00"))
            to_iso = (base + timedelta(days=7)).isoformat()
        title = args["title_contains"] if isinstance(args.get("title_contains"), str) else ""

        # Primary: live Google Calendar
        if await is_calendar_connected():
            try:
                live = await list_calendar_events(time_min=from_iso, time_max=to_iso, q=title or None)
                return {"ok": True, "data": {
                    "from": from_iso, "to": to_iso, "source": "google_calendar", "count": len(live),
                    "events": [{
                        "id": e["id"], "title": e["title"], "when": e["when"], "location": e["location"],
                        "attendees": e["attendees"], "organizer": e["organizer"], "htmlLink": e["htmlLink"],
                        "agendaExcerpt": None,
                    } for e in live],
                }, "summary": f"{len(live)} events in window · google calendar"}
            except Exception:  # noqa: BLE001
                pass  # fall through to Mongo

        # Fallback: Mongo-backed calendar documents
        date_clauses = [
            {"metadata.eventTime": {"$gte": from_iso, "$lte": to_iso}},
            {"metadata.date": {"$gte": from_iso, "$lte": to_iso}},
        ]
        flt: dict = {"source": "calendar", "$or": date_clauses}
        if title:
            flt["title"] = {"$regex": title, "$options": "i"}
        rows = await documents().find(
            flt,
            projection={"_id": 1, "title": 1, "body": 1, "metadata.eventTime": 1, "metadata.date": 1,
                        "metadata.attendees": 1, "metadata.eventLocation": 1, "metadata.organizer": 1,
                        "metadata.threadId": 1},
            limit=50, sort=[("metadata.eventTime", 1), ("metadata.date", 1)],
        ).to_list(length=None)
        events = []
        for e in rows:
            md = e.get("metadata") or {}
            events.append({
                "id": str(e["_id"]), "title": e.get("title"),
                "when": md.get("eventTime") or md.get("date"),
                "location": md.get("eventLocation"), "attendees": md.get("attendees") or [],
                "organizer": md.get("organizer"),
                "agendaExcerpt": (e.get("body") or "")[:240] if isinstance(e.get("body"), str) else None,
            })
        return {"ok": True, "data": {"from": from_iso, "to": to_iso, "count": len(events), "events": events},
                "summary": f"{len(events)} events in window"}
    except Exception as err:  # noqa: BLE001
        return {"ok": False, "error": str(err)}


tool = ToolDef(declaration=_DECL, handler=_handler)
