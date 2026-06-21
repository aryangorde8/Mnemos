"""Google Calendar — port of apps/agent/src/lib/calendar.ts (raw REST via httpx)."""
from __future__ import annotations

import httpx

from app.lib.gmail import DEMO_USER_ID, get_access_token, get_tokens, is_gmail_configured

CAL_BASE = "https://www.googleapis.com/calendar/v3"


def is_calendar_configured() -> bool:
    return is_gmail_configured()


async def is_calendar_connected(user_id: str = DEMO_USER_ID) -> bool:
    if not is_gmail_configured():
        return False
    rec = await get_tokens(user_id)
    if not rec or "calendar" not in (rec.get("scope") or ""):
        return False
    return bool(await get_access_token(user_id))


async def _authed(method: str, path: str, user_id: str, **kwargs) -> httpx.Response:
    token = await get_access_token(user_id)
    if not token:
        raise RuntimeError("calendar not connected — open /auth/google/start to authorize")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=20) as c:
        return await c.request(method, f"{CAL_BASE}{path}", headers=headers, **kwargs)


def _normalize(e: dict) -> dict:
    start = (e.get("start") or {}).get("dateTime") or (e.get("start") or {}).get("date")
    end = (e.get("end") or {}).get("dateTime") or (e.get("end") or {}).get("date")
    return {
        "id": e.get("id", ""),
        "title": e.get("summary", "(untitled)"),
        "when": start,
        "end": end,
        "location": e.get("location"),
        "attendees": [a.get("email", "") for a in (e.get("attendees") or []) if a.get("email")],
        "organizer": (e.get("organizer") or {}).get("email"),
        "htmlLink": e.get("htmlLink"),
    }


async def list_calendar_events(*, time_min: str, time_max: str, q: str | None = None,
                               max_results: int = 50, user_id: str = DEMO_USER_ID) -> list[dict]:
    params = {"timeMin": time_min, "timeMax": time_max, "singleEvents": "true",
              "orderBy": "startTime", "maxResults": str(max_results)}
    if q:
        params["q"] = q
    r = await _authed("GET", "/calendars/primary/events", user_id, params=params)
    if r.status_code >= 400:
        raise RuntimeError(f"calendar.list {r.status_code}: {r.text}")
    return [_normalize(e) for e in (r.json().get("items") or [])]


async def insert_calendar_event(*, summary: str, start_iso: str, end_iso: str,
                                attendees: list[str] | None = None, location: str | None = None,
                                description: str | None = None, user_id: str = DEMO_USER_ID) -> dict:
    body: dict = {"summary": summary, "start": {"dateTime": start_iso}, "end": {"dateTime": end_iso}}
    if location:
        body["location"] = location
    if description:
        body["description"] = description
    if attendees:
        body["attendees"] = [{"email": e} for e in attendees]
    r = await _authed("POST", "/calendars/primary/events?sendUpdates=all", user_id, json=body)
    if r.status_code >= 400:
        raise RuntimeError(f"calendar.insert {r.status_code}: {r.text}")
    data = r.json()
    return {"id": data.get("id", ""), "htmlLink": data.get("htmlLink")}


async def get_busy_intervals(time_min: str, time_max: str, user_id: str = DEMO_USER_ID) -> list[dict]:
    r = await _authed("POST", "/freeBusy", user_id,
                      json={"timeMin": time_min, "timeMax": time_max, "items": [{"id": "primary"}]})
    if r.status_code >= 400:
        raise RuntimeError(f"calendar.freebusy {r.status_code}: {r.text}")
    return (((r.json().get("calendars") or {}).get("primary") or {}).get("busy")) or []
