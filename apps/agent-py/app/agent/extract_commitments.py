"""Commitments extraction — port of apps/agent/src/agent/extract-commitments.ts."""
from __future__ import annotations

import json
import re
import time

from app.db.mongo import chunks
from app.lib.commitments import clear_commitments, is_alex, upsert_commitment
from app.llm.genai_client import generate

SYSTEM = """You extract OPEN COMMITMENTS from a senior PM (Alex Chen)'s corpus — emails, calendar, meeting notes, shared docs, slack, personal jots.

A commitment is a CONCRETE promise that someone will do something: "X will deliver Y by Z", "X promised Y", "AC: X to follow up on Y", "owner: X — due Friday". Vague intentions are NOT commitments.

For each batch of chunks, return STRICT JSON — no markdown, no preamble — with this exact shape:

{
  "commitments": [
    {
      "owedBy": "Alex Chen",
      "owedTo": "Sarah Okafor",
      "summary": "deliver the Q3 planning doc",
      "dueDate": "2026-05-20",
      "status": "open",
      "evidence": "verbatim phrase from the chunk that proves the commitment",
      "chunkId": "..."
    }
  ]
}

Rules:
- owedBy / owedTo MUST be named people (proper nouns). Use canonical full names. Alex is "Alex Chen".
- summary: a SHORT verb phrase describing the deliverable — no names, no date.
- dueDate: ISO date (YYYY-MM-DD) if stated/implied; otherwise null.
- status: "done" only if explicitly completed; otherwise "open".
- evidence: a verbatim excerpt (<=160 chars).
- chunkId: the chunkId the evidence came from.
- Do NOT hallucinate. An empty list is fine. Output JSON only; first character '{'."""

BATCH_SIZE = 12
RELEVANT = ["email", "calendar", "meeting_notes", "shared_doc", "slack", "notes"]


def _now() -> int:
    return int(time.time() * 1000)


async def run_commitment_extraction(*, rebuild: bool):
    started = time.time()
    try:
        if rebuild:
            await clear_commitments()
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
        batches = [inputs[i:i + BATCH_SIZE] for i in range(0, len(inputs), BATCH_SIZE)]
        total = 0
        for b, batch in enumerate(batches):
            body = "\n\n".join(
                f"--- chunkId: {c['chunkId']} | {c['source']} | {c['title']} "
                f"{('| ' + c['date']) if c['date'] else ''} ---\n{c['text']}" for c in batch)
            prompt = f"Extract open commitments from these {len(batch)} chunks. Return JSON only.\n\n{body}"
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
            added = 0
            for c in (parsed.get("commitments") or []):
                owed_by = (c.get("owedBy") or "").strip()
                owed_to = (c.get("owedTo") or "").strip()
                summary = (c.get("summary") or "").strip()
                evidence = (c.get("evidence") or "").strip()[:200]
                if not (owed_by and owed_to and summary and evidence):
                    continue
                due = c.get("dueDate")
                due = due[:10] if isinstance(due, str) and re.search(r"\d{4}-\d{2}-\d{2}", due) else None
                status = "done" if c.get("status") == "done" else "open"
                chunk_id = c.get("chunkId") if isinstance(c.get("chunkId"), str) else ""
                meta = next((bi for bi in batch if bi["chunkId"] == chunk_id), None) if chunk_id else None
                rec = {"direction": "outgoing" if is_alex(owed_by) else "incoming",
                       "owedBy": owed_by, "owedTo": owed_to, "summary": summary, "status": status,
                       "evidence": evidence}
                if due:
                    rec["dueDate"] = due
                if chunk_id:
                    rec["sourceChunkId"] = chunk_id
                if meta:
                    rec["sourceTitle"] = meta["title"]
                    rec["source"] = meta["source"]
                    if meta["date"]:
                        rec["date"] = meta["date"]
                try:
                    await upsert_commitment(rec)
                    added += 1
                except Exception:  # noqa: BLE001
                    pass
            total += added
            yield {"kind": "batch", "index": b + 1, "total": len(batches),
                   "chunksInBatch": len(batch), "commitmentsFound": added, "at": _now()}
        yield {"kind": "done", "totalCommitments": total, "totalMs": int((time.time() - started) * 1000), "at": _now()}
    except Exception as err:  # noqa: BLE001
        yield {"kind": "error", "message": str(err), "at": _now()}
