"""/commitments + /calendar/events — port of apps/agent/src/routes/commitments.ts."""
from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.agent.extract_commitments import run_commitment_extraction
from app.agent.tools.get_calendar_events import tool as calendar_tool
from app.agent.tools.list_commitments import tool as commitments_tool
from app.lib.commitments import count_commitments, set_commitment_status

router = APIRouter()
_SSE_HEADERS = {"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"}


@router.post("/commitments/extract")
async def commitments_extract(request: Request) -> StreamingResponse:
    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    rebuild = body.get("rebuild") is True or request.query_params.get("rebuild") == "1"

    async def gen():
        try:
            async for ev in run_commitment_extraction(rebuild=rebuild):
                yield f"event: {ev['kind']}\ndata: {json.dumps(ev, default=str)}\n\n"
        except Exception as err:  # noqa: BLE001
            yield f"event: error\ndata: {json.dumps({'message': str(err)})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers=_SSE_HEADERS)


@router.get("/commitments")
async def commitments_route(direction: Literal["incoming", "outgoing", "all"] | None = None,
                            actor: str | None = None, limit: int | None = None) -> JSONResponse:
    args: dict = {}
    if direction:
        args["direction"] = direction
    if actor:
        args["actor"] = actor
    if limit is not None:
        args["limit"] = limit
    result = await commitments_tool.handler(args, None)
    if not result.get("ok"):
        return JSONResponse(status_code=500, content={"error": "list_failed", "detail": result.get("error")})
    return JSONResponse({"summary": result.get("summary"), **(result.get("data") or {})})


@router.get("/commitments/stats")
async def commitments_stats_route() -> JSONResponse:
    return JSONResponse({"count": await count_commitments()})


class StatusBody(BaseModel):
    status: Literal["open", "done"]


@router.post("/commitments/{cid}/status")
async def commitment_status_route(cid: str, body: StatusBody) -> JSONResponse:
    updated = await set_commitment_status(cid, body.status)
    if not updated:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    return JSONResponse({"ok": True})


@router.get("/calendar/events")
async def calendar_events_route(from_: str | None = Query(default=None, alias="from"),
                                to: str | None = None,
                                title_contains: str | None = None) -> JSONResponse:
    args: dict = {}
    if from_:
        args["from"] = from_
    if to:
        args["to"] = to
    if title_contains:
        args["title_contains"] = title_contains
    result = await calendar_tool.handler(args, None)
    if not result.get("ok"):
        return JSONResponse(status_code=500, content={"error": "events_failed", "detail": result.get("error")})
    return JSONResponse({"summary": result.get("summary"), **(result.get("data") or {})})
