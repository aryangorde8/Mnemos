"""schedule_meeting — port of apps/agent/src/agent/tools/schedule-meeting.ts."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from app.agent.types import ToolDef
from app.db.mongo import documents
from app.lib.calendar import get_busy_intervals, is_calendar_connected
from app.lib.timezones import format_in_zone, parse_in_zone, resolve_zone

_DECL = {
    "name": "schedule_meeting",
    "description": (
        "Propose a meeting and persist the proposal for user approval. Checks the calendar for conflicts "
        "in each proposed time window (the live Google Calendar when connected, otherwise the Mongo-backed "
        "demo calendar) and surfaces them per slot. The proposal is NOT booked until the user approves — "
        "on approval a real Google Calendar event is created when connected. "
        "Times are zone-sensitive: pass `timezone` whenever you know where the attendees are, and ask the "
        "user which timezone they mean if the request is ambiguous rather than guessing."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "title": {"type": "string", "description": "Meeting title."},
            "attendees": {"type": "array", "items": {"type": "string"}, "description": "Attendee email addresses."},
            "proposed_times": {"type": "array", "items": {"type": "string"},
                               "description": ("ISO datetimes in priority order. Include a UTC offset "
                                               "('2026-07-15T14:00:00+05:30') when you know it; a bare "
                                               "wall-clock time ('2026-07-15T14:00:00') is read in the "
                                               "`timezone` argument's zone.")},
            "timezone": {"type": "string",
                         "description": ("IANA zone the proposed_times are expressed in, e.g. 'Asia/Kolkata', "
                                         "'America/New_York'. A raw offset like 'UTC+05:30' also works. "
                                         "Falls back to the location hint, then the server default.")},
            "duration_minutes": {"type": "integer", "description": "Meeting length in minutes. Default 30."},
            "location": {"type": "string",
                         "description": ("Zoom link, room, or city. A city or office name ('Bengaluru HQ', "
                                         "'NYC office') is also used to infer the timezone when `timezone` "
                                         "is omitted.")},
            "agenda": {"type": "string", "description": "Short agenda — 1–4 bullets."},
        },
        "required": ["title", "attendees", "proposed_times"],
    },
}


def _clamp(raw, default, lo, hi):
    try:
        return max(lo, min(hi, int(raw)))
    except (TypeError, ValueError):
        return default


def _event_ms(iso: str) -> float | None:
    """Epoch ms for a stored event time. A stored time without an offset is read as
    UTC — everything this app writes is UTC — never as the container's local zone."""
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp() * 1000


async def _evaluate_slot(start_iso: str, duration: int, connected: bool, zone, zone_name: str,
                         user_id: str | None = None) -> dict:
    try:
        start = parse_in_zone(start_iso, zone)
    except ValueError:
        return {"start": start_iso, "end": start_iso, "conflicts": [], "free": False,
                "timezone": zone_name, "display": str(start_iso)}
    end = start + timedelta(minutes=duration)
    start_ms, end_ms = start.timestamp() * 1000, end.timestamp() * 1000
    labels = {"timezone": zone_name,
              "display": format_in_zone(start, zone, zone_name),
              "startUtc": start.astimezone(timezone.utc).isoformat()}

    if connected:
        try:
            busy = await get_busy_intervals(start.isoformat(), end.isoformat(), user_id or "")
            conflicts = []
            for b in busy:
                bs, be = _event_ms(b.get("start")), _event_ms(b.get("end"))
                if bs is None or be is None:
                    continue
                if be <= start_ms or bs >= end_ms:
                    continue
                conflicts.append({"id": "busy", "title": "Busy (calendar)", "when": b["start"], "location": None})
            return {"start": start.isoformat(), "end": end.isoformat(), "conflicts": conflicts,
                    "free": not conflicts, **labels}
        except Exception:  # noqa: BLE001
            pass

    # Mongo-backed fallback (assume 60-min blocks)
    try:
        from_iso = datetime.fromtimestamp(start_ms / 1000 - 4 * 3600, tz=timezone.utc).isoformat()
        to_iso = datetime.fromtimestamp(end_ms / 1000 + 4 * 3600, tz=timezone.utc).isoformat()
        candidates = await documents().find(
            {"source": "calendar", "$or": [{"metadata.eventTime": {"$gte": from_iso, "$lte": to_iso}},
                                           {"metadata.date": {"$gte": from_iso, "$lte": to_iso}}]},
            projection={"_id": 1, "title": 1, "metadata.eventTime": 1, "metadata.date": 1, "metadata.eventLocation": 1},
            limit=100,
        ).to_list(length=None)
        conflicts = []
        for ev in candidates:
            md = ev.get("metadata") or {}
            ev_time = md.get("eventTime") or md.get("date")
            ev_start = _event_ms(ev_time) if ev_time else None
            if ev_start is None:
                continue
            ev_end = ev_start + 60 * 60_000
            if ev_end <= start_ms or ev_start >= end_ms:
                continue
            conflicts.append({"id": str(ev["_id"]), "title": ev.get("title", "untitled"),
                              "when": ev_time, "location": md.get("eventLocation")})
        return {"start": start.isoformat(), "end": end.isoformat(), "conflicts": conflicts,
                "free": not conflicts, **labels}
    except Exception:  # noqa: BLE001
        return {"start": start.isoformat(), "end": end.isoformat(), "conflicts": [], "free": True, **labels}


async def _handler(args: dict, ctx: dict | None = None) -> dict:
    try:
        title = str(args.get("title", "")).strip()
        attendees = args.get("attendees") if isinstance(args.get("attendees"), list) else []
        proposed_times = args.get("proposed_times") if isinstance(args.get("proposed_times"), list) else []
        duration = _clamp(args.get("duration_minutes"), 30, 5, 480)
        location = args["location"] if isinstance(args.get("location"), str) else None
        agenda = args["agenda"] if isinstance(args.get("agenda"), str) else None
        if not title or not attendees or not proposed_times:
            return {"ok": False, "error": "title, attendees, and proposed_times are required"}

        zone, zone_name, zone_source = resolve_zone(
            args["timezone"] if isinstance(args.get("timezone"), str) else None, location)

        # Conflicts are checked against the calendar of whoever is running this, so a
        # second connected visitor never sees the first one's busy times.
        acting_user = (ctx or {}).get("userId")
        connected = await is_calendar_connected(acting_user)
        slot_checks = await asyncio.gather(
            *[_evaluate_slot(t, duration, connected, zone, zone_name, acting_user)
              for t in proposed_times])
        conflict_count = sum(1 for s in slot_checks if s["conflicts"])
        free_count = len(slot_checks) - conflict_count
        preferred_idx = next((i for i, s in enumerate(slot_checks) if not s["conflicts"]), -1)

        proposal = {"title": title, "attendees": attendees, "proposedTimes": proposed_times,
                    "durationMinutes": duration, "location": location, "agenda": agenda,
                    "slots": slot_checks, "preferredIdx": preferred_idx,
                    "timezone": zone_name, "timezoneSource": zone_source}

        from app.lib.actions import record_action
        action_id = None
        try:
            action_id = await record_action(kind="schedule_meeting", proposal=proposal,
                                            query=(ctx or {}).get("query"), run_id=(ctx or {}).get("runId"))
        except Exception:  # noqa: BLE001
            pass

        verdict = ("all slots conflict — user must pick or rebook" if free_count == 0
                   else "preferred slot is free" if preferred_idx == 0
                   else f"preferred slot conflicts; {free_count} alternate(s) free")
        # An assumed zone is called out so the model asks instead of quietly booking
        # a wall-clock time in the server default.
        zone_note = (f"timezone {zone_name} (assumed — confirm with the user which timezone they mean)"
                     if zone_source == "default"
                     else f"timezone {zone_name} (inferred from location)" if zone_source == "location"
                     else f"timezone {zone_name}")
        return {"ok": True, "data": {
            "actionId": action_id, "title": title, "attendees": attendees, "proposedTimes": proposed_times,
            "durationMinutes": duration, "location": location, "agenda": agenda, "slots": slot_checks,
            "preferredIdx": preferred_idx, "conflictCount": conflict_count, "conflictFreeCount": free_count,
            "timezone": zone_name, "timezoneSource": zone_source,
            "status": "proposed", "requiresApproval": True,
        }, "summary": f'proposed "{title}" · {len(proposed_times)} slot(s) · {zone_note} · {verdict}'
                      f'{" · awaiting approval" if action_id else ""}'}
    except Exception as err:  # noqa: BLE001
        return {"ok": False, "error": str(err)}


tool = ToolDef(declaration=_DECL, handler=_handler)
