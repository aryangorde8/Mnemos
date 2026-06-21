"""Commitments ledger — port of apps/agent/src/lib/commitments.ts."""
from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId

from app.db.mongo import collection
from app.lib.graph import entity_key

_ALEX_KEYS = {"alex-chen", "alex", "ac"}


def is_alex(name: str) -> bool:
    return entity_key(name) in _ALEX_KEYS


def commitment_key(owed_by: str, owed_to: str, summary: str) -> str:
    import re
    slug = re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", summary.lower()))[:64]
    return f"{entity_key(owed_by)}|{entity_key(owed_to)}|{slug}"


def commitments_col():
    return collection("commitments")


async def upsert_commitment(rec: dict) -> None:
    key = commitment_key(rec["owedBy"], rec["owedTo"], rec["summary"])
    now = datetime.now(timezone.utc)
    setdoc = {
        "direction": rec["direction"], "owedBy": rec["owedBy"], "owedTo": rec["owedTo"],
        "summary": rec["summary"], "status": rec["status"], "evidence": rec["evidence"],
        "updatedAt": now,
    }
    for k in ("dueDate", "sourceChunkId", "sourceTitle", "source", "date"):
        if rec.get(k):
            setdoc[k] = rec[k]
    await commitments_col().update_one(
        {"key": key}, {"$set": setdoc, "$setOnInsert": {"key": key, "createdAt": now}}, upsert=True
    )


async def list_commitment_records(*, direction: str | None = None, actor: str | None = None,
                                  status: str | None = None, limit: int = 50) -> list[dict]:
    flt: dict = {}
    if direction and direction != "all":
        flt["direction"] = direction
    if status and status != "all":
        flt["status"] = status
    if actor:
        rx = {"$regex": actor, "$options": "i"}
        flt["$or"] = [{"owedBy": rx}, {"owedTo": rx}]
    cur = commitments_col().find(flt, limit=limit, sort=[("status", 1), ("dueDate", 1), ("date", -1)])
    return await cur.to_list(length=None)


async def count_commitments() -> int:
    return await commitments_col().count_documents({})


async def clear_commitments() -> None:
    await commitments_col().delete_many({})


async def set_commitment_status(cid: str, status: str) -> dict | None:
    if not ObjectId.is_valid(cid):
        return None
    col = commitments_col()
    await col.update_one({"_id": ObjectId(cid)},
                         {"$set": {"status": status, "updatedAt": datetime.now(timezone.utc)}})
    return await col.find_one({"_id": ObjectId(cid)})


def public_commitment(c: dict) -> dict:
    return {
        "id": str(c.get("_id", "")),
        "chunkId": c.get("sourceChunkId", ""),
        "title": c.get("sourceTitle") or c["summary"],
        "source": c.get("source", "notes"),
        "excerpt": c.get("evidence") or c["summary"],
        "date": c.get("dueDate") or c.get("date"),
        "thread": None,
        "direction": c["direction"],
        "summary": c["summary"], "owedBy": c["owedBy"], "owedTo": c["owedTo"],
        "dueDate": c.get("dueDate"), "status": c["status"],
    }
