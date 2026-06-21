"""/briefings — port of apps/agent/src/routes/briefings.ts."""
from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.agent.briefing import run_briefing
from app.lib.briefings import get_briefing, list_briefings, public_briefing

router = APIRouter()
_SSE_HEADERS = {"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"}


@router.get("/briefings")
async def list_route() -> JSONResponse:
    records = await list_briefings(30)
    return JSONResponse({"count": len(records), "briefings": [public_briefing(b) for b in records]})


@router.get("/briefings/{bid}")
async def get_route(bid: str) -> JSONResponse:
    b = await get_briefing(bid)
    if not b:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    return JSONResponse(public_briefing(b))


class GenerateBody(BaseModel):
    event_id: str | None = None
    event_title: str | None = None


@router.post("/briefings/generate")
async def generate_route(body: GenerateBody) -> StreamingResponse:
    async def gen():
        yield ": connected\n\n"
        try:
            async for ev in run_briefing(event_id=body.event_id, event_title=body.event_title):
                yield f"event: {ev['kind']}\ndata: {json.dumps(ev, default=str)}\n\n"
                if ev["kind"] in ("done", "error"):
                    break
        except Exception as err:  # noqa: BLE001
            yield f"event: error\ndata: {json.dumps({'kind': 'error', 'message': str(err)})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers=_SSE_HEADERS)
