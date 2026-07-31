"""Action lifecycle — port of apps/agent/src/lib/actions.ts.

Records proposed agent actions; on approval, sends real Gmail / books real
Calendar events (when connected), else marks them simulated.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from bson import ObjectId

from app.db.mongo import collection


def actions_col():
    return collection("actions")


async def record_action(*, kind: str, proposal: dict, query: str | None = None,
                        run_id: str | None = None, model: str | None = None,
                        context: str | None = None) -> str:
    doc = {
        "kind": kind, "status": "proposed", "proposal": proposal, "origin": "agent",
        "createdAt": datetime.now(timezone.utc),
    }
    if query:
        doc["query"] = query
    if run_id:
        doc["runId"] = run_id
    if model:
        doc["model"] = model
    if context:
        doc["context"] = context
    ins = await actions_col().insert_one(doc)
    return str(ins.inserted_id)


async def get_action(aid: str) -> dict | None:
    if not ObjectId.is_valid(aid):
        return None
    return await actions_col().find_one({"_id": ObjectId(aid)})


async def list_actions(*, status: str | None = None, kind: str | None = None,
                       limit: int = 50) -> list[dict]:
    flt: dict = {}
    if status:
        flt["status"] = status
    if kind:
        flt["kind"] = kind
    cur = actions_col().find(flt, limit=limit, sort=[("createdAt", -1)])
    return await cur.to_list(length=None)


async def approve_action(aid: str, edits: dict | None = None,
                         acting_user: str | None = None) -> dict | None:
    """Approve and execute. `acting_user` selects whose Google connection sends/books;
    None means the shared anonymous connection, i.e. the pre-sessions behaviour."""
    from app.lib.session import ANON_USER_ID
    acting_user = acting_user or ANON_USER_ID
    if not ObjectId.is_valid(aid):
        return None
    col = actions_col()
    existing = await col.find_one({"_id": ObjectId(aid)})
    if not existing:
        return None
    if existing.get("status") != "proposed":
        return existing

    final = {**existing["proposal"], **(edits or {})}

    if existing["kind"] == "schedule_meeting":
        # Each slot's rendered time and conflict list were computed for the proposed
        # times in the proposed zone. If the user edited either, they describe a
        # different instant — drop them rather than record a stale reading.
        prop = existing["proposal"]
        if (final.get("proposedTimes") != prop.get("proposedTimes")
                or final.get("timezone") != prop.get("timezone")):
            final["slots"] = []

    gmail_info = None
    gmail_error = None
    if existing["kind"] == "draft_email":
        try:
            from app.lib.gmail import get_access_token, is_gmail_configured, send_gmail
            # Sends from the approver's own Google account, not a shared one.
            if is_gmail_configured() and await get_access_token(acting_user):
                gmail_info = await send_gmail(
                    acting_user, to=final["to"], cc=final.get("cc") or [],
                    subject=final["subject"], body=final["body"],
                )
        except Exception as err:  # noqa: BLE001
            gmail_error = str(err)

    calendar_info = None
    calendar_error = None
    if existing["kind"] == "schedule_meeting":
        try:
            from app.lib.calendar import insert_calendar_event, is_calendar_connected
            if await is_calendar_connected(acting_user):
                idx = final.get("preferredIdx", 0)
                if idx is None or idx < 0:
                    idx = 0
                times = final.get("proposedTimes") or []
                start_iso = times[idx] if idx < len(times) else (times[0] if times else None)
                if start_iso:
                    # Same zone the proposal was evaluated in, so what the user approved
                    # is what gets booked — a bare wall-clock time must not drift here.
                    from app.lib.timezones import iana_or_none, parse_in_zone, resolve_zone
                    zone, zone_name, _ = resolve_zone(final.get("timezone"), final.get("location"))
                    start = parse_in_zone(start_iso, zone)
                    dur = final.get("durationMinutes", 30)
                    end = start + timedelta(minutes=dur)
                    inserted = await insert_calendar_event(
                        summary=final["title"], start_iso=start.isoformat(), end_iso=end.isoformat(),
                        attendees=final.get("attendees"), location=final.get("location"),
                        description=final.get("agenda"), time_zone=iana_or_none(zone_name),
                        user_id=acting_user,
                    )
                    calendar_info = {"eventId": inserted["id"], "htmlLink": inserted.get("htmlLink")}
        except Exception as err:  # noqa: BLE001
            calendar_error = str(err)

    update: dict = {"status": "sent", "final": final, "decidedAt": datetime.now(timezone.utc),
                    # Which connection actually sent/booked — with several people
                    # connected, "who did this" is no longer implicit.
                    "approvedBy": acting_user}
    if gmail_info:
        update["gmailMessageId"] = gmail_info["messageId"]
        if gmail_info.get("threadId"):
            update["gmailThreadId"] = gmail_info["threadId"]
        update["sentVia"] = "gmail"
        update["sentAs"] = gmail_info["sentAs"]
    elif existing["kind"] == "draft_email":
        update["sentVia"] = "simulated"
        if gmail_error:
            update["gmailError"] = gmail_error
    if calendar_info:
        update["bookedVia"] = "google"
        update["calendarEventId"] = calendar_info["eventId"]
        if calendar_info.get("htmlLink"):
            update["calendarHtmlLink"] = calendar_info["htmlLink"]
    elif existing["kind"] == "schedule_meeting":
        update["bookedVia"] = "simulated"
        if calendar_error:
            update["calendarError"] = calendar_error

    await col.update_one({"_id": ObjectId(aid)}, {"$set": update})
    return await col.find_one({"_id": ObjectId(aid)})


async def reject_action(aid: str, reason: str | None = None) -> dict | None:
    if not ObjectId.is_valid(aid):
        return None
    col = actions_col()
    existing = await col.find_one({"_id": ObjectId(aid)})
    if not existing:
        return None
    if existing.get("status") != "proposed":
        return existing
    upd = {"status": "rejected", "decidedAt": datetime.now(timezone.utc)}
    if reason:
        upd["reason"] = reason
    await col.update_one({"_id": ObjectId(aid)}, {"$set": upd})
    return await col.find_one({"_id": ObjectId(aid)})


def _iso(v):
    return v.isoformat() if isinstance(v, datetime) else v


def public_action(a: dict) -> dict:
    return {
        "id": str(a.get("_id", "")), "kind": a["kind"], "status": a["status"],
        "proposal": a["proposal"], "final": a.get("final"), "reason": a.get("reason"),
        "query": a.get("query"), "runId": a.get("runId"), "origin": a.get("origin", "agent"),
        "model": a.get("model"),
        "sentVia": a.get("sentVia"), "sentAs": a.get("sentAs"),
        "gmailMessageId": a.get("gmailMessageId"), "gmailThreadId": a.get("gmailThreadId"),
        "gmailError": a.get("gmailError"),
        "bookedVia": a.get("bookedVia"), "calendarEventId": a.get("calendarEventId"),
        "calendarHtmlLink": a.get("calendarHtmlLink"), "calendarError": a.get("calendarError"),
        "createdAt": _iso(a.get("createdAt")), "decidedAt": _iso(a.get("decidedAt")),
    }
