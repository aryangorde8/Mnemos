"""/actions + /critiques — port of apps/agent/src/routes/actions.ts."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.lib.actions import approve_action, get_action, list_actions, public_action, reject_action
from app.lib.critique import get_critique, get_critique_by_action, public_critique

router = APIRouter()


@router.get("/actions")
async def list_actions_route(status: Literal["proposed", "approved", "rejected", "sent"] | None = None,
                             kind: Literal["draft_email", "schedule_meeting"] | None = None,
                             limit: int | None = None) -> JSONResponse:
    records = await list_actions(status=status, kind=kind, limit=limit or 50)
    return JSONResponse({"count": len(records), "actions": [public_action(a) for a in records]})


@router.get("/actions/{aid}")
async def get_action_route(aid: str) -> JSONResponse:
    a = await get_action(aid)
    if not a:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    return JSONResponse(public_action(a))


class ApproveBody(BaseModel):
    edits: dict | None = None


@router.post("/actions/{aid}/approve")
async def approve_route(aid: str, body: ApproveBody | None = None) -> JSONResponse:
    a = await approve_action(aid, (body.edits if body else None))
    if not a:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    return JSONResponse(public_action(a))


class RejectBody(BaseModel):
    reason: str | None = None


@router.post("/actions/{aid}/reject")
async def reject_route(aid: str, body: RejectBody | None = None) -> JSONResponse:
    a = await reject_action(aid, (body.reason if body else None))
    if not a:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    return JSONResponse(public_action(a))


@router.get("/actions/{aid}/critique")
async def action_critique_route(aid: str) -> JSONResponse:
    c = await get_critique_by_action(aid)
    if not c:
        return JSONResponse(status_code=404, content={"error": "no_critique"})
    return JSONResponse(public_critique(c))


@router.get("/critiques/{cid}")
async def critique_route(cid: str) -> JSONResponse:
    c = await get_critique(cid)
    if not c:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    return JSONResponse(public_critique(c))
