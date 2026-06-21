"""/agent/ask — SSE reasoning stream. Port of apps/agent/src/routes/agent.ts."""
from __future__ import annotations

import json
import time
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agent.react_loop import run_agent

router = APIRouter()

_SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


class HistoryItem(BaseModel):
    role: Literal["user", "model"]
    text: str = Field(min_length=1, max_length=8000)


class AskBody(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    maxTurns: int | None = Field(default=None, ge=1, le=12)
    history: list[HistoryItem] | None = Field(default=None, max_length=20)


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"


@router.post("/agent/ask")
async def ask(body: AskBody) -> StreamingResponse:
    history = [h.model_dump() for h in body.history] if body.history else None

    async def gen():
        yield ": connected\n\n"
        try:
            async for ev in run_agent(
                body.query,
                max_turns=body.maxTurns or 14,
                history=history,
            ):
                yield _sse(ev["kind"], ev)
                if ev["kind"] in ("done", "error"):
                    break
        except Exception as err:  # noqa: BLE001
            yield _sse("error", {"kind": "error", "message": str(err), "at": int(time.time() * 1000)})

    return StreamingResponse(gen(), media_type="text/event-stream", headers=_SSE_HEADERS)
