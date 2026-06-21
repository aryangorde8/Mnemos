"""Briefings store — port of apps/agent/src/lib/briefings.ts."""
from __future__ import annotations

from datetime import datetime

from bson import ObjectId

from app.db.mongo import collection


def briefings_col():
    return collection("briefings")


async def save_briefing(rec: dict) -> str:
    ins = await briefings_col().insert_one({**rec})
    return str(ins.inserted_id)


async def get_briefing(bid: str) -> dict | None:
    if not ObjectId.is_valid(bid):
        return None
    return await briefings_col().find_one({"_id": ObjectId(bid)})


async def list_briefings(limit: int = 30) -> list[dict]:
    return await briefings_col().find({}, limit=limit, sort=[("createdAt", -1)]).to_list(length=None)


def _iso(v):
    return v.isoformat() if isinstance(v, datetime) else v


def public_briefing(b: dict) -> dict:
    return {
        "id": str(b.get("_id", "")), "eventId": str(b.get("eventId", "")),
        "eventTitle": b.get("eventTitle"), "eventWhen": b.get("eventWhen"),
        "eventLocation": b.get("eventLocation"), "attendees": b.get("attendees", []),
        "markdown": b.get("markdown", ""), "contextSummary": b.get("contextSummary"),
        "citations": b.get("citations", []), "model": b.get("model"),
        "createdAt": _iso(b.get("createdAt")),
    }
