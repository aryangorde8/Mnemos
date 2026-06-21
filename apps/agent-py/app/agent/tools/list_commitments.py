"""list_commitments — port of apps/agent/src/agent/tools/list-commitments.ts.

Reads the persisted ledger first; falls back to a regex heuristic over chunk
text only when the ledger is empty.
"""
from __future__ import annotations

import re

from app.agent.types import ToolDef
from app.db.mongo import chunks
from app.lib.commitments import list_commitment_records, public_commitment

_DECL = {
    "name": "list_commitments",
    "description": (
        "List open commitments — promises Alex made (outgoing) or that others made to Alex (incoming). "
        "Use this for the commitment ledger, or when a question asks 'what do I owe X' / 'who owes me'."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "direction": {"type": "string", "enum": ["incoming", "outgoing", "all"],
                          "description": "Filter to commitments owed TO Alex, owed BY Alex, or all."},
            "actor": {"type": "string", "description": "Optional case-insensitive substring match on the other party."},
            "limit": {"type": "integer", "description": "Max commitments. Default 12, max 50."},
        },
    },
}

_RX = (r"(owe[ds]?|owed|will deliver|by Friday|by Mon|by Tue|by Wed|by Thu|by EOD|by next|"
       r"committed to|promised|action item|owner:|due\s)")


def _clamp(raw, default, lo, hi):
    try:
        return max(lo, min(hi, int(raw)))
    except (TypeError, ValueError):
        return default


def _classify(text: str) -> str:
    lower = text.lower()
    if re.search(r"\b(alex (will|to|owes|is delivering|to send|to ship|to deliver))\b", lower):
        return "outgoing"
    if re.search(r"\b(owes alex|to alex|will send alex|will deliver to alex|alex is waiting|alex expects)\b", lower):
        return "incoming"
    if re.search(r"\bi (will|owe|to)\b", lower):
        return "outgoing"
    return "unknown"


async def _handler(args: dict, ctx: dict | None = None) -> dict:
    try:
        direction = args["direction"] if isinstance(args.get("direction"), str) else "all"
        actor = args["actor"].strip() if isinstance(args.get("actor"), str) else ""
        limit = _clamp(args.get("limit"), 12, 1, 50)

        # Primary: persisted ledger
        records = await list_commitment_records(
            direction=direction, actor=actor or None, status="open", limit=limit)
        if records:
            return {"ok": True, "data": {
                "direction": direction, "actor": actor or None, "count": len(records),
                "source": "ledger", "commitments": [public_commitment(r) for r in records],
            }, "summary": f"{len(records)} {'' if direction == 'all' else direction + ' '}commitments"
                          f"{(' involving ' + actor) if actor else ''} · ledger"}

        # Fallback: regex over chunk text
        flt: dict = {"text": {"$regex": _RX, "$options": "i"}}
        if actor:
            esc = re.escape(actor)
            flt["text"] = {"$regex": f"{_RX}.*{esc}|{esc}.*{_RX}", "$options": "is"}
        rows = await chunks().find(
            flt, projection={"_id": 1, "title": 1, "source": 1, "text": 1, "metadata": 1}, limit=limit * 3
        ).to_list(length=None)
        inferred = []
        for c in rows:
            txt = c.get("text") if isinstance(c.get("text"), str) else ""
            md = c.get("metadata") or {}
            inferred.append({
                "chunkId": str(c["_id"]), "title": c.get("title"), "source": c.get("source"),
                "excerpt": txt[:280], "date": md.get("date"), "thread": md.get("threadId"),
                "direction": _classify(txt),
            })
        filtered = [c for c in inferred if direction == "all" or c["direction"] == direction][:limit]
        return {"ok": True, "data": {"direction": direction, "actor": actor or None,
                                     "count": len(filtered), "commitments": filtered},
                "summary": f"{len(filtered)} {'' if direction == 'all' else direction + ' '}commitments"}
    except Exception as err:  # noqa: BLE001
        return {"ok": False, "error": str(err)}


tool = ToolDef(declaration=_DECL, handler=_handler)
