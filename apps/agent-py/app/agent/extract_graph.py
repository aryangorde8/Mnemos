"""Graph extraction — port of apps/agent/src/agent/extract-graph.ts."""
from __future__ import annotations

import json
import time
from collections import defaultdict

from app.db.mongo import chunks
from app.lib.graph import clear_graph, entity_key, insert_relation, upsert_entity
from app.llm.genai_client import generate

SYSTEM = """You extract a structured memory graph from a senior PM's corpus (emails, calendar, meeting notes, shared docs, slack, personal jots).

For each batch of chunks, return STRICT JSON — no markdown, no preamble — with this exact shape:

{
  "entities": [
    {"name": "Sarah Okafor", "kind": "person" | "project" | "topic", "role": "Director of Eng, Lantern team", "chunkIds": ["..."]}
  ],
  "relations": [
    {"from": "Alex Chen", "to": "Sarah Okafor", "kind": "owes" | "works_with" | "manages" | "discusses", "evidence": "verbatim phrase", "chunkId": "..."}
  ]
}

Rules:
- Only extract entities that appear with a clear name (proper noun). Skip pronouns/vague descriptors.
- "person" = a named human. "project" = a named product/initiative. "topic" = a named recurring theme (rare).
- Use canonical full names. "role" = ONE short clause derived from the chunks; skip if unclear.
- "owes" requires a concrete commitment. "works_with" = collaboration. "manages" = reporting lines. "discusses" = weakest tie.
- chunkIds in entities = chunkIds from THIS batch where the entity appears. chunkId in relations = single chunkId.
- Do NOT hallucinate. Output JSON only; first character '{'."""

BATCH_SIZE = 12
RELEVANT = ["email", "calendar", "meeting_notes", "shared_doc", "slack", "notes"]
_REL_KINDS = ("owes", "works_with", "manages", "discusses")


def _now() -> int:
    return int(time.time() * 1000)


def _iso_day(raw):
    if not raw:
        return None
    try:
        from datetime import datetime
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None


async def run_graph_extraction(*, rebuild: bool):
    started = time.time()
    try:
        if rebuild:
            await clear_graph()
        rows = await chunks().find(
            {"source": {"$in": RELEVANT}},
            projection={"_id": 1, "source": 1, "title": 1, "text": 1, "metadata.date": 1, "metadata.eventTime": 1},
            sort=[("metadata.date", 1), ("metadata.eventTime", 1)],
        ).to_list(length=None)
        inputs = [{
            "chunkId": str(c["_id"]), "source": str(c["source"]), "title": str(c.get("title", "")),
            "text": c.get("text") if isinstance(c.get("text"), str) else "",
            "date": (c.get("metadata") or {}).get("date") or (c.get("metadata") or {}).get("eventTime"),
        } for c in rows]

        yield {"kind": "start", "totalChunks": len(inputs), "at": _now()}

        # entity_agg[key::kind] = {name, kind, role, chunkIds:set, dates:list}
        entity_agg: dict[str, dict] = {}
        total_relations = 0
        batches = [inputs[i:i + BATCH_SIZE] for i in range(0, len(inputs), BATCH_SIZE)]

        for b, batch in enumerate(batches):
            body = "\n\n".join(
                f"--- chunkId: {c['chunkId']} | {c['source']} | {c['title']} "
                f"{('| ' + c['date']) if c['date'] else ''} ---\n{c['text']}" for c in batch)
            prompt = f"Extract entities and relations from these {len(batch)} chunks. Return JSON only.\n\n{body}"
            r = await generate(prompt, system=SYSTEM, temperature=0.1, max_tokens=8192,
                               response_mime_type="application/json", thinking_budget=0)
            parsed = {}
            try:
                t = r.text.strip()
                s, e = t.find("{"), t.rfind("}")
                if s >= 0 and e > s:
                    parsed = json.loads(t[s:e + 1])
            except json.JSONDecodeError:
                parsed = {}

            ents_added = 0
            for ent in (parsed.get("entities") or []):
                name = (ent.get("name") or "").strip() if isinstance(ent.get("name"), str) else ""
                kind = ent.get("kind") if ent.get("kind") in ("person", "project", "topic") else None
                if not name or not kind:
                    continue
                role = ent.get("role").strip() if isinstance(ent.get("role"), str) else None
                chunk_ids = [c for c in (ent.get("chunkIds") or []) if isinstance(c, str)]
                key = entity_key(name)
                if not key:
                    continue
                ents_added += 1
                dates = [bi["date"] for cid in chunk_ids for bi in batch if bi["chunkId"] == cid and bi["date"]]
                k = f"{key}::{kind}"
                if k in entity_agg:
                    ex = entity_agg[k]
                    ex["chunkIds"].update(chunk_ids)
                    ex["dates"].extend(dates)
                    if role and (not ex["role"] or len(role) > len(ex["role"])):
                        ex["role"] = role
                else:
                    entity_agg[k] = {"name": name, "kind": kind, "role": role,
                                     "chunkIds": set(chunk_ids), "dates": list(dates)}

            rels_added = 0
            for rel in (parsed.get("relations") or []):
                frm = (rel.get("from") or "").strip() if isinstance(rel.get("from"), str) else ""
                to = (rel.get("to") or "").strip() if isinstance(rel.get("to"), str) else ""
                kind = rel.get("kind") if rel.get("kind") in _REL_KINDS else None
                evidence = (rel.get("evidence") or "").strip() if isinstance(rel.get("evidence"), str) else ""
                chunk_id = rel.get("chunkId") if isinstance(rel.get("chunkId"), str) else ""
                if not (frm and to and kind and evidence):
                    continue
                fk, tk = entity_key(frm), entity_key(to)
                if not fk or not tk or fk == tk:
                    continue
                date = next((bi["date"] for bi in batch if bi["chunkId"] == chunk_id), None) if chunk_id else None
                rec = {"from": fk, "to": tk, "kind": kind, "evidence": evidence}
                if chunk_id:
                    rec["chunkId"] = chunk_id
                if date:
                    rec["date"] = date
                try:
                    await insert_relation(rec)
                    rels_added += 1
                except Exception:  # noqa: BLE001
                    pass
            total_relations += rels_added
            yield {"kind": "batch", "index": b + 1, "total": len(batches), "chunksInBatch": len(batch),
                   "entitiesFound": ents_added, "relationsFound": rels_added, "at": _now()}

        for ent in entity_agg.values():
            sorted_days = sorted(d for d in (_iso_day(d) for d in ent["dates"]) if d)
            series_map: dict[str, int] = defaultdict(int)
            for d in sorted_days:
                series_map[d] += 1
            series = [{"date": d, "count": n} for d, n in sorted(series_map.items())]
            try:
                await upsert_entity({
                    "name": ent["name"], "key": entity_key(ent["name"]), "kind": ent["kind"],
                    "role": ent["role"], "mentions": len(ent["chunkIds"]),
                    "firstSeen": sorted_days[0] if sorted_days else None,
                    "lastSeen": sorted_days[-1] if sorted_days else None,
                    "chunkIds": list(ent["chunkIds"]), "series": series,
                })
            except Exception:  # noqa: BLE001
                pass

        yield {"kind": "done", "totalEntities": len(entity_agg), "totalRelations": total_relations,
               "totalMs": int((time.time() - started) * 1000), "at": _now()}
    except Exception as err:  # noqa: BLE001
        yield {"kind": "error", "message": str(err), "at": _now()}
