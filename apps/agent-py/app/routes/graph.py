"""/graph — port of apps/agent/src/routes/graph.ts (read endpoints)."""
from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.agent.extract_graph import run_graph_extraction
from app.lib.graph import graph_stats, list_entities, list_relations, public_entity, public_relation

router = APIRouter()
_SSE_HEADERS = {"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"}


@router.post("/graph/extract")
async def graph_extract(request: Request) -> StreamingResponse:
    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    rebuild = body.get("rebuild") is True or request.query_params.get("rebuild") == "1"

    async def gen():
        try:
            async for ev in run_graph_extraction(rebuild=rebuild):
                yield f"event: {ev['kind']}\ndata: {json.dumps(ev, default=str)}\n\n"
        except Exception as err:  # noqa: BLE001
            yield f"event: error\ndata: {json.dumps({'message': str(err)})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers=_SSE_HEADERS)


@router.get("/graph")
async def graph_route() -> JSONResponse:
    stats = await graph_stats()
    people = await list_entities("person", 60)
    projects = await list_entities("project", 30)
    topics = await list_entities("topic", 30)
    relations = await list_relations(200)
    return JSONResponse({
        "stats": stats,
        "entities": {
            "person": [public_entity(e) for e in people],
            "project": [public_entity(e) for e in projects],
            "topic": [public_entity(e) for e in topics],
        },
        "relations": [public_relation(r) for r in relations],
    })


@router.get("/graph/stats")
async def graph_stats_route() -> JSONResponse:
    return JSONResponse(await graph_stats())


@router.get("/graph/entities")
async def graph_entities_route(kind: Literal["person", "project", "topic"] | None = None,
                               limit: int | None = None) -> JSONResponse:
    rows = await list_entities(kind, limit or 200)
    return JSONResponse({"count": len(rows), "entities": [public_entity(e) for e in rows]})
