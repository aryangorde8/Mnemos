"""/search — port of apps/agent/src/routes/search.ts."""
from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.agent.tools.search_memory import search_memory

router = APIRouter()

SourceKind = Literal["email", "calendar", "meeting_notes", "shared_doc", "slack", "notes"]


class SearchBody(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    limit: int | None = Field(default=None, ge=1, le=50)
    source: SourceKind | None = None
    rerank: bool | None = None


@router.post("/search")
async def search(body: SearchBody) -> JSONResponse:
    t0 = time.perf_counter()
    result = await search_memory(
        query=body.query,
        limit=body.limit or 10,
        source=body.source,
        rerank=bool(body.rerank),
    )
    if not result.get("ok"):
        return JSONResponse(status_code=500, content={"error": "search_failed", "detail": result.get("error")})

    data = result.get("data") or {}
    took_ms = round((time.perf_counter() - t0) * 1000)
    return JSONResponse(content={
        "query": body.query,
        "tookMs": took_ms,
        "count": data.get("count", 0),
        "phases": data.get("phases", []),
        "results": [{
            "chunkId": c["chunkId"],
            "documentId": "",
            "source": c["source"],
            "title": c["title"],
            "text": c["text"],
            "ordinal": c["ordinal"],
            "score": c["score"],
            "metadata": c.get("metadata") or {},
            **({"fromVector": c["fromVector"]} if "fromVector" in c else {}),
            **({"fromText": c["fromText"]} if "fromText" in c else {}),
        } for c in data.get("chunks", [])],
    })
