"""/ingest — port of apps/agent/src/routes/ingest.ts."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.db.mongo import chunks, documents
from app.ingest.chunker import chunk as chunk_text
from app.ingest.embedder import embed_batch

router = APIRouter()
_SSE_HEADERS = {"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}

SourceKind = Literal["email", "calendar", "meeting_notes", "shared_doc", "slack", "notes"]
# apps/agent-py/app/routes/ingest.py -> parents[4] == repo root
_FIXTURE = Path(__file__).resolve().parents[4] / "scripts" / "fixtures" / "alex-data.json"


class IngestBody(BaseModel):
    source: SourceKind
    title: str
    body: str
    metadata: dict | None = None


async def _ingest_one(source: str, title: str, body: str, metadata: dict) -> int:
    pieces = chunk_text(body)
    if not pieces:
        return 0
    ins = await documents().insert_one(
        {"source": source, "title": title, "body": body, "metadata": metadata,
         "createdAt": datetime.now(timezone.utc)})
    vectors = await embed_batch([p["text"] for p in pieces])
    docs = [{"documentId": ins.inserted_id, "source": source, "title": title, "text": p["text"],
             "ordinal": p["ordinal"], "embedding": vectors[i], "metadata": metadata,
             "createdAt": datetime.now(timezone.utc)} for i, p in enumerate(pieces)]
    await chunks().insert_many(docs)
    return len(docs)


@router.post("/ingest")
async def ingest_route(body: IngestBody) -> JSONResponse:
    try:
        n = await _ingest_one(body.source, body.title, body.body, body.metadata or {})
        if n == 0:
            return JSONResponse(status_code=400, content={"error": "empty_body"})
        return JSONResponse({"source": body.source, "chunks": n})
    except Exception as err:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": "ingest_failed", "detail": str(err)})


def _iso(v):
    return v.isoformat() if isinstance(v, datetime) else v


@router.get("/ingest/documents")
async def list_documents(limit: int = 50, source: str | None = None) -> JSONResponse:
    """Recent ingested documents (newest first) with a chunk count — powers the manage view.

    `source` narrows to one kind (email / calendar / notes / …); omitted or 'all' means every source.
    """
    limit = max(1, min(limit, 200))
    flt = {"source": source} if source and source != "all" else {}
    docs = await documents().find(flt, sort=[("createdAt", -1)], limit=limit).to_list(length=None)
    counts = {
        c["_id"]: c["count"]
        for c in await chunks().aggregate(
            [{"$group": {"_id": "$documentId", "count": {"$sum": 1}}}]).to_list(length=None)
    }
    out = [{"id": str(d["_id"]), "source": d.get("source"),
            "title": d.get("title") or "(untitled)",
            "chunks": counts.get(d["_id"], 0), "createdAt": _iso(d.get("createdAt"))}
           for d in docs]
    return JSONResponse({"count": len(out), "documents": out})


@router.delete("/ingest/documents/{doc_id}")
async def delete_document(doc_id: str) -> JSONResponse:
    """Remove a document and every chunk (vector) it produced — a real delete from the vault."""
    if not ObjectId.is_valid(doc_id):
        return JSONResponse(status_code=400, content={"error": "bad_id"})
    oid = ObjectId(doc_id)
    if not await documents().find_one({"_id": oid}):
        return JSONResponse(status_code=404, content={"error": "not_found"})
    removed = (await chunks().delete_many({"documentId": oid})).deleted_count
    await documents().delete_one({"_id": oid})
    return JSONResponse({"deleted": True, "id": doc_id, "chunksDeleted": removed})


@router.get("/ingest/stats")
async def ingest_stats() -> JSONResponse:
    doc_count = await documents().count_documents({})
    chunk_count = await chunks().count_documents({})
    by_source = await documents().aggregate(
        [{"$group": {"_id": "$source", "count": {"$sum": 1}}}]).to_list(length=None)
    return JSONResponse({"documents": doc_count, "chunks": chunk_count,
                         "sources": [{"source": s["_id"], "count": s["count"]} for s in by_source]})


@router.post("/ingest/demo")
async def ingest_demo() -> StreamingResponse:
    async def gen():
        try:
            docs = json.loads(_FIXTURE.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            yield f"data: {json.dumps({'type': 'error', 'error': 'fixture_not_found'})}\n\n"
            return
        total = len(docs)
        yield f"data: {json.dumps({'type': 'start', 'total': total})}\n\n"
        ok = fail = 0
        for i, d in enumerate(docs):
            try:
                n = await _ingest_one(d["source"], d["title"], d["body"], d.get("metadata") or {})
                if n == 0:
                    fail += 1
                    continue
                ok += 1
                yield f"data: {json.dumps({'type': 'progress', 'index': i + 1, 'total': total, 'ok': ok, 'fail': fail, 'title': d['title']})}\n\n"
            except Exception as err:  # noqa: BLE001
                fail += 1
                yield f"data: {json.dumps({'type': 'progress', 'index': i + 1, 'total': total, 'ok': ok, 'fail': fail, 'error': str(err)})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'total': total, 'ok': ok, 'fail': fail})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers=_SSE_HEADERS)
