"""Google OAuth + Gmail send — port of apps/agent/src/lib/gmail.ts.

Reads/writes the SAME `gmail_tokens` collection the TS backend uses, so an
existing connection works here with no re-auth. OAuth token exchange/refresh
done with raw HTTP (httpx) to avoid extra deps.
"""
from __future__ import annotations

import base64
import os
import time
from datetime import datetime, timezone

import httpx

from app.db.mongo import collection

DEMO_USER_ID = "alex"

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def is_gmail_configured() -> bool:
    return bool(
        os.environ.get("GMAIL_OAUTH_CLIENT_ID")
        and os.environ.get("GMAIL_OAUTH_CLIENT_SECRET")
        and os.environ.get("GMAIL_OAUTH_REDIRECT_URI")
    )


def _oauth_params() -> dict:
    return {
        "client_id": os.environ.get("GMAIL_OAUTH_CLIENT_ID", ""),
        "client_secret": os.environ.get("GMAIL_OAUTH_CLIENT_SECRET", ""),
        "redirect_uri": os.environ.get("GMAIL_OAUTH_REDIRECT_URI", ""),
    }


def tokens_col():
    return collection("gmail_tokens")


def auth_url() -> str:
    p = _oauth_params()
    from urllib.parse import urlencode
    q = urlencode({
        "client_id": p["client_id"],
        "redirect_uri": p["redirect_uri"],
        "response_type": "code",
        "scope": " ".join(GMAIL_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    })
    return f"{_AUTH_URL}?{q}"


async def exchange_code(code: str) -> dict:
    p = _oauth_params()
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(_TOKEN_URL, data={
            "code": code, "client_id": p["client_id"], "client_secret": p["client_secret"],
            "redirect_uri": p["redirect_uri"], "grant_type": "authorization_code",
        })
        r.raise_for_status()
        return r.json()


async def fetch_email(access_token: str) -> str:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
        if r.status_code == 200:
            return r.json().get("email", "unknown@unknown")
    return "unknown@unknown"


async def save_tokens(rec: dict) -> None:
    rec = {**rec, "updatedAt": datetime.now(timezone.utc)}
    await tokens_col().update_one({"userId": rec["userId"]}, {"$set": rec}, upsert=True)


async def get_tokens(user_id: str) -> dict | None:
    return await tokens_col().find_one({"userId": user_id})


async def get_access_token(user_id: str) -> str | None:
    """Usable access token — refreshes if expired. None if unavailable."""
    if not is_gmail_configured():
        return None
    rec = await get_tokens(user_id)
    if not rec:
        return None
    now_ms = time.time() * 1000
    if rec.get("expiry", 0) > now_ms + 60_000:
        return rec.get("accessToken")
    # refresh
    p = _oauth_params()
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(_TOKEN_URL, data={
                "refresh_token": rec["refreshToken"], "client_id": p["client_id"],
                "client_secret": p["client_secret"], "grant_type": "refresh_token",
            })
            r.raise_for_status()
            tok = r.json()
        access = tok.get("access_token")
        if not access:
            return None
        new_rec = {
            "userId": rec["userId"],
            "accessToken": access,
            "refreshToken": tok.get("refresh_token", rec["refreshToken"]),
            "expiry": now_ms + tok.get("expires_in", 3500) * 1000,
            "scope": tok.get("scope", rec.get("scope", "")),
            "email": rec.get("email", ""),
        }
        await save_tokens(new_rec)
        return access
    except Exception:  # noqa: BLE001
        return None


def _b64url(s: str) -> str:
    return base64.urlsafe_b64encode(s.encode("utf-8")).decode("ascii").rstrip("=")


async def send_gmail(user_id: str, *, to: list[str], cc: list[str] | None,
                     subject: str, body: str) -> dict:
    access = await get_access_token(user_id)
    if not access:
        raise RuntimeError("gmail not connected — open /auth/google/start to authorize")
    rec = await get_tokens(user_id)
    from_addr = (rec or {}).get("email") or "me"
    lines = [f"To: {', '.join(to)}"]
    if cc:
        lines.append(f"Cc: {', '.join(cc)}")
    lines += [f"From: {from_addr}", f"Subject: {subject}",
              "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", body]
    raw = _b64url("\r\n".join(lines))
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {access}", "Content-Type": "application/json"},
            json={"raw": raw},
        )
        if r.status_code >= 400:
            raise RuntimeError(f"gmail.send {r.status_code}: {r.text}")
        data = r.json()
    return {"messageId": data["id"], "threadId": data.get("threadId"), "sentAs": from_addr}
