"""expand_via_graph — port of apps/agent/src/agent/tools/expand-via-graph.ts."""
from __future__ import annotations

from bson import ObjectId

from app.agent.types import ToolDef
from app.db.mongo import chunks
from app.lib.graph import entities_col, entity_key, relations_col

_KINDS = ("owes", "works_with", "manages", "discusses")

_DECL = {
    "name": "expand_via_graph",
    "description": (
        "Walk the memory graph to fetch chunks connected to a specific person, project, or topic — "
        "even chunks that don't share keywords with the original query. Use this AFTER search_memory "
        "when you've found a key entity and want to pull in everything else they're connected to. "
        "Returns chunks plus the path of entities traversed."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "entity": {"type": "string", "description": "Canonical name of the seed entity (case-insensitive)."},
            "entities": {"type": "array", "items": {"type": "string"}, "description": "Optional: multiple seed entities."},
            "depth": {"type": "integer", "description": "Hops to traverse. 1 = seed + neighbours. Default 1, max 2."},
            "kinds": {"type": "array", "items": {"type": "string", "enum": list(_KINDS)},
                      "description": "Optional: restrict traversal to specific relation kinds."},
            "limit": {"type": "integer", "description": "Max chunks to return. Default 12, max 30."},
        },
    },
}


def _clamp(raw, default, lo, hi):
    try:
        return max(lo, min(hi, int(raw)))
    except (TypeError, ValueError):
        return default


async def _handler(args: dict, ctx: dict | None = None) -> dict:
    seeds: list[str] = []
    if isinstance(args.get("entity"), str) and args["entity"].strip():
        seeds.append(args["entity"].strip())
    if isinstance(args.get("entities"), list):
        seeds += [e.strip() for e in args["entities"] if isinstance(e, str) and e.strip()]
    if not seeds:
        return {"ok": False, "error": "at least one entity name is required"}
    depth = _clamp(args.get("depth"), 1, 1, 2)
    limit = _clamp(args.get("limit"), 12, 1, 30)
    kinds = [k for k in (args.get("kinds") or []) if k in _KINDS] or None

    try:
        ents, rels = entities_col(), relations_col()
        seed_keys: set[str] = set()
        seed_entities: list[dict] = []
        for s in seeds:
            exact = await ents.find_one({"key": entity_key(s)})
            if exact:
                seed_keys.add(exact["key"])
                seed_entities.append({"key": exact["key"], "name": exact["name"], "kind": exact["kind"]})
                continue
            fuzzy = await ents.find_one({"name": {"$regex": s, "$options": "i"}})
            if fuzzy:
                seed_keys.add(fuzzy["key"])
                seed_entities.append({"key": fuzzy["key"], "name": fuzzy["name"], "kind": fuzzy["kind"]})

        if not seed_entities:
            return {"ok": True, "data": {"resolved": [], "chunks": [], "traversed": [], "chunksFound": 0},
                    "summary": f"no entities matched: {', '.join(seeds)}"}

        visited = set(seed_keys)
        traversed_rels: list[dict] = []
        frontier = list(seed_keys)
        for _ in range(depth):
            if not frontier:
                break
            rel_flt: dict = {"$or": [{"from": {"$in": frontier}}, {"to": {"$in": frontier}}]}
            if kinds:
                rel_flt["kind"] = {"$in": kinds}
            found = await rels.find(rel_flt, limit=200).to_list(length=None)
            next_frontier: list[str] = []
            for r in found:
                other = r["to"] if r["from"] in frontier else r["from"]
                if other not in visited:
                    visited.add(other)
                    next_frontier.append(other)
                traversed_rels.append({"from": r["from"], "to": r["to"], "kind": r["kind"]})
            frontier = next_frontier

        all_entities = await ents.find({"key": {"$in": list(visited)}}).to_list(length=None)
        chunk_ids: set[str] = set()
        for e in all_entities:
            for cid in e.get("chunkIds", []):
                chunk_ids.add(cid)

        oids = [ObjectId(cid) for cid in chunk_ids if ObjectId.is_valid(cid)]
        rows = await chunks().find(
            {"_id": {"$in": oids}},
            projection={"_id": 1, "documentId": 1, "source": 1, "title": 1, "text": 1, "ordinal": 1, "metadata": 1},
            limit=limit,
        ).to_list(length=None) if oids else []

        citations = [{
            "chunkId": str(c["_id"]), "documentId": str(c.get("documentId", "")), "source": c.get("source"),
            "title": str(c.get("title", "")), "score": 1, "ordinal": int(c.get("ordinal", 0)),
            "text": (c.get("text") or "")[:300],
        } for c in rows]

        data = {
            "resolved": seed_entities,
            "traversed": [{"name": e["name"], "kind": e["kind"], "key": e["key"]} for e in all_entities],
            "relations": traversed_rels[:50],
            "chunksFound": len(chunk_ids),
            "chunks": [{
                "chunkId": str(c["_id"]), "title": c.get("title"), "source": c.get("source"),
                "ordinal": c.get("ordinal"), "text": c.get("text"), "metadata": c.get("metadata"),
            } for c in rows],
        }
        return {"ok": True, "data": data, "citations": citations,
                "summary": f"graph expand · {len(seed_entities)} seed → {len(all_entities)} entities · depth {depth} · {len(rows)}/{len(chunk_ids)} chunks"}
    except Exception as err:  # noqa: BLE001
        return {"ok": False, "error": str(err)}


tool = ToolDef(declaration=_DECL, handler=_handler)
