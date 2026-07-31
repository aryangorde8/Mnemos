"""/auth/google/* — Google OAuth, one connection per browser session.

Token records are keyed by the consenting account's Google `sub`, not by a single
shared literal, so two people connecting no longer overwrite each other. The session
cookie minted here is what ties a browser to its own connection; without one a request
falls back to `session.ANON_USER_ID` and behaves exactly as the app did before.
"""
from __future__ import annotations

import os
import secrets
import time

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from app.lib import session as sess
from app.lib.gmail import (
    GMAIL_SCOPES, auth_url, exchange_code, fetch_userinfo, get_access_token, get_tokens,
    is_gmail_configured, save_tokens, tokens_col,
)

router = APIRouter()

# Short-lived CSRF state for the consent round-trip. Held in memory: a forged callback
# is only useful within this window, and a restart simply invalidates in-flight consents.
_STATE_TTL_S = 600
_pending_states: dict[str, float] = {}


def _issue_state() -> str:
    now = time.time()
    for k, exp in list(_pending_states.items()):
        if exp < now:
            _pending_states.pop(k, None)
    token = secrets.token_urlsafe(24)
    _pending_states[token] = now + _STATE_TTL_S
    return token


def _consume_state(token: str) -> bool:
    exp = _pending_states.pop(token, None)
    return exp is not None and exp > time.time()


def _frontend() -> str:
    return os.environ.get("MNEMOS_WEB_URL") or os.environ.get("FRONTEND_URL") or ""


@router.get("/auth/google/start")
async def start():
    if not is_gmail_configured():
        return JSONResponse(status_code=503, content={
            "error": "gmail_not_configured",
            "detail": "Set GMAIL_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI on the agent to enable Google auth.",
        })
    return RedirectResponse(auth_url(state=_issue_state()))


@router.get("/auth/google/callback")
async def callback(request: Request):
    if not is_gmail_configured():
        return HTMLResponse("Gmail not configured.", status_code=503)
    code = request.query_params.get("code")
    if not code:
        return HTMLResponse("Missing code.", status_code=400)
    # Reject a callback we didn't initiate — without this, anyone could drive a victim's
    # browser through a consent they never asked for.
    if not _consume_state(request.query_params.get("state") or ""):
        return HTMLResponse("Invalid or expired OAuth state — start again from the app.",
                            status_code=400)
    try:
        tokens = await exchange_code(code)
        if not tokens.get("access_token") or not tokens.get("refresh_token"):
            return HTMLResponse("Token exchange failed — no access_token or refresh_token.",
                                status_code=400)
        info = await fetch_userinfo(tokens["access_token"])
        # `sub` is the tenant key. Without it we cannot tell connections apart, so fall
        # back to the shared identity rather than keying on something unstable.
        user_id = info["sub"] if (info["sub"] and sess.is_sessions_enabled()) else sess.ANON_USER_ID
        await save_tokens({
            "userId": user_id, "accessToken": tokens["access_token"],
            "refreshToken": tokens["refresh_token"],
            "expiry": time.time() * 1000 + tokens.get("expires_in", 3500) * 1000,
            "scope": tokens.get("scope", " ".join(GMAIL_SCOPES)), "email": info["email"],
        })

        frontend = _frontend()
        if frontend:
            response = RedirectResponse(f"{frontend}/approve?connected=gmail")
        else:
            response = HTMLResponse(
                f'<!doctype html><body style="font-family:system-ui;padding:48px;'
                f'background:#0e0a05;color:#f3ecdf">'
                f'<h1 style="font-family:Georgia,serif;font-style:italic;color:#f25738">'
                f'Gmail connected.</h1>'
                f'<p>Connected as <strong>{info["email"]}</strong>. '
                f'You can close this tab.</p></body>')
        if sess.is_sessions_enabled() and info["sub"]:
            sess.set_cookie(response, sess.mint(info["sub"], info["email"]))
        return response
    except Exception as err:  # noqa: BLE001
        return HTMLResponse(f"OAuth callback error: {err}", status_code=500)


@router.get("/auth/google/status")
async def status(request: Request):
    if not is_gmail_configured():
        return JSONResponse({"configured": False, "connected": False,
                             "multiUser": sess.is_sessions_enabled()})
    user_id = sess.current_user_id(request)
    base = {"configured": True, "multiUser": sess.is_sessions_enabled(),
            "shared": user_id == sess.ANON_USER_ID}
    try:
        tokens = await get_tokens(user_id)
        if not tokens:
            return JSONResponse({**base, "connected": False, "calendar": False})
        access = await get_access_token(user_id)
        return JSONResponse({
            **base, "connected": bool(access),
            "calendar": bool(access) and "calendar" in (tokens.get("scope") or ""),
            "email": tokens.get("email"),
            # A record that exists but yields no access token is orphaned — its refresh
            # token belongs to an OAuth client that no longer accepts it. Reconnecting is
            # the only fix, so say so rather than showing a bare "not connected".
            "stale": not access,
        })
    except Exception as err:  # noqa: BLE001
        return JSONResponse(status_code=500,
                            content={**base, "connected": False, "error": str(err)})


@router.post("/auth/google/disconnect")
async def disconnect(request: Request):
    if not is_gmail_configured():
        return JSONResponse(status_code=503, content={"error": "gmail_not_configured"})
    user_id = sess.current_user_id(request)
    await tokens_col().delete_one({"userId": user_id})
    response = JSONResponse({"ok": True})
    sess.clear_cookie(response)
    return response


@router.get("/auth/google/connections")
async def connections():
    """How many distinct Google accounts are connected, for the UI's status line.

    Emails only — no tokens ever leave the agent.
    """
    if not is_gmail_configured():
        return JSONResponse({"count": 0, "emails": []})
    try:
        rows = await tokens_col().find({}, projection={"_id": 0, "email": 1}).to_list(length=100)
        emails = sorted({r.get("email") for r in rows if r.get("email")})
        return JSONResponse({"count": len(emails), "emails": emails})
    except Exception:  # noqa: BLE001
        return JSONResponse({"count": 0, "emails": []})
