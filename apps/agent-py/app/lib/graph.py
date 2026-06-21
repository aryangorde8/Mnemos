"""Memory graph store — port of apps/agent/src/lib/graph.ts."""
from __future__ import annotations

import re
from datetime import datetime, timezone

from app.db.mongo import collection


def entity_key(name: str) -> str:
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", name.strip().lower()))


def entities_col():
    return collection("entities")


def relations_col():
    return collection("relations")


async def upsert_entity(rec: dict) -> None:
    now = datetime.now(timezone.utc)
    await entities_col().update_one(
        {"key": rec["key"], "kind": rec["kind"]},
        {
            "$set": {
                "name": rec["name"], "role": rec.get("role"), "mentions": rec["mentions"],
                "firstSeen": rec.get("firstSeen"), "lastSeen": rec.get("lastSeen"),
                "chunkIds": rec["chunkIds"][:12], "series": rec["series"], "updatedAt": now,
            },
            "$setOnInsert": {"key": rec["key"], "kind": rec["kind"], "createdAt": now},
        },
        upsert=True,
    )


async def insert_relation(rec: dict) -> None:
    flt = {"from": rec["from"], "to": rec["to"], "kind": rec["kind"],
           "chunkId": rec.get("chunkId", {"$exists": False})}
    await relations_col().update_one(
        flt, {"$setOnInsert": {**rec, "createdAt": datetime.now(timezone.utc)}}, upsert=True
    )


async def list_entities(kind: str | None = None, limit: int = 200) -> list[dict]:
    flt = {"kind": kind} if kind else {}
    cur = entities_col().find(flt, limit=limit, sort=[("mentions", -1)])
    return await cur.to_list(length=None)


async def list_relations(limit: int = 200) -> list[dict]:
    cur = relations_col().find({}, limit=limit, sort=[("createdAt", -1)])
    return await cur.to_list(length=None)


async def graph_stats() -> dict:
    ents, rels = entities_col(), relations_col()
    return {
        "entities": {
            "person": await ents.count_documents({"kind": "person"}),
            "project": await ents.count_documents({"kind": "project"}),
            "topic": await ents.count_documents({"kind": "topic"}),
        },
        "relations": await rels.count_documents({}),
    }


async def clear_graph() -> None:
    await entities_col().delete_many({})
    await relations_col().delete_many({})


def public_entity(e: dict) -> dict:
    return {
        "id": str(e.get("_id", "")), "name": e["name"], "key": e["key"], "kind": e["kind"],
        "role": e.get("role"), "mentions": e.get("mentions", 0),
        "firstSeen": e.get("firstSeen"), "lastSeen": e.get("lastSeen"),
        "chunkIds": e.get("chunkIds", []), "series": e.get("series", []),
    }


def public_relation(r: dict) -> dict:
    return {
        "id": str(r.get("_id", "")), "from": r["from"], "to": r["to"], "kind": r["kind"],
        "evidence": r.get("evidence", ""), "chunkId": r.get("chunkId"), "date": r.get("date"),
    }
