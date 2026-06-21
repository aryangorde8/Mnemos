"""Critique store — port of apps/agent/src/lib/critique.ts."""
from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId

from app.db.mongo import collection


def critiques_col():
    return collection("critiques")


async def save_critique(rec: dict) -> str:
    doc = {**rec, "createdAt": datetime.now(timezone.utc)}
    ins = await critiques_col().insert_one(doc)
    return str(ins.inserted_id)


async def get_critique(cid: str) -> dict | None:
    if not ObjectId.is_valid(cid):
        return None
    return await critiques_col().find_one({"_id": ObjectId(cid)})


async def get_critique_by_action(action_id: str) -> dict | None:
    return await critiques_col().find_one({"actionId": action_id}, sort=[("createdAt", -1)])


def _iso(v):
    return v.isoformat() if isinstance(v, datetime) else v


def public_critique(c: dict) -> dict:
    return {
        "id": str(c.get("_id", "")), "actionId": c["actionId"], "runId": c.get("runId"),
        "query": c.get("query"), "verdict": c["verdict"], "summary": c["summary"],
        "findings": c["findings"], "voice": c["voice"], "model": c.get("model"),
        "createdAt": _iso(c.get("createdAt")),
    }
