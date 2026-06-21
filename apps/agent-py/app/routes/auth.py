"""/auth/google/* — port of apps/agent/src/routes/auth.ts (Google OAuth)."""
from __future__ import annotations

import os
import time

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from app.lib.gmail import (
    DEMO_USER_ID, GMAIL_SCOPES, auth_url, exchange_code, fetch_email,
    get_access_token, get_tokens, is_gmail_configured, save_tokens,
)

router = APIRouter()


@router.get("/auth/google/start")
async def start():
    if not is_gmail_configured():
        return JSONResponse(status_code=503, content={
            "error": "gmail_not_configured",
            "detail": "Set GMAIL_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI on the agent to enable Google auth.",
        })
    return RedirectResponse(auth_url())


@router.get("/auth/google/callback")
async def callback(request: Request):
    if not is_gmail_configured():
        return HTMLResponse("Gmail not configured.", status_code=503)
    code = request.query_params.get("code")
    if not code:
        return HTMLResponse("Missing code.", status_code=400)
    try:
        tokens = await exchange_code(code)
        if not tokens.get("access_token") or not tokens.get("refresh_token"):
            return HTMLResponse("Token exchange failed — no access_token or refresh_token.", status_code=400)
        email = await fetch_email(tokens["access_token"])
        await save_tokens({
            "userId": DEMO_USER_ID, "accessToken": tokens["access_token"],
            "refreshToken": tokens["refresh_token"],
            "expiry": time.time() * 1000 + tokens.get("expires_in", 3500) * 1000,
            "scope": tokens.get("scope", " ".join(GMAIL_SCOPES)), "email": email,
        })
        frontend = os.environ.get("MNEMOS_WEB_URL") or os.environ.get("FRONTEND_URL")
        if frontend:
            return RedirectResponse(f"{frontend}/actions?connected=gmail")
        return HTMLResponse(
            f'<!doctype html><body style="font-family:system-ui;padding:48px;background:#0e0a05;color:#f3ecdf">'
            f'<h1 style="font-family:Georgia,serif;font-style:italic;color:#f25738">Gmail connected.</h1>'
            f'<p>Connected as <strong>{email}</strong>. You can close this tab.</p></body>')
    except Exception as err:  # noqa: BLE001
        return HTMLResponse(f"OAuth callback error: {err}", status_code=500)


@router.get("/auth/google/status")
async def status():
    if not is_gmail_configured():
        return JSONResponse({"configured": False, "connected": False})
    try:
        tokens = await get_tokens(DEMO_USER_ID)
        if not tokens:
            return JSONResponse({"configured": True, "connected": False, "calendar": False})
        access = await get_access_token(DEMO_USER_ID)
        return JSONResponse({
            "configured": True, "connected": bool(access),
            "calendar": bool(access) and "calendar" in (tokens.get("scope") or ""),
            "email": tokens.get("email"),
        })
    except Exception as err:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"configured": True, "connected": False, "error": str(err)})


@router.post("/auth/google/disconnect")
async def disconnect():
    if not is_gmail_configured():
        return JSONResponse(status_code=503, content={"error": "gmail_not_configured"})
    from app.lib.gmail import tokens_col
    await tokens_col().delete_one({"userId": DEMO_USER_ID})
    return JSONResponse({"ok": True})
