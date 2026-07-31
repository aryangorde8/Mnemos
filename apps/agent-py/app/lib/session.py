"""Per-browser session identity, so Google connections don't collide.

Before this, every token operation was keyed to the literal `DEMO_USER_ID = "alex"`,
so there was exactly one Google connection for the whole deployment: a second person
consenting overwrote the first, and the next approved email went out from whichever
account connected most recently.

A session is a signed JWT the agent mints at the end of the OAuth callback and sets as
an HttpOnly cookie. The browser talks to two origins (web and agent subdomains), so the
cookie is scoped to their shared parent via SESSION_COOKIE_DOMAIN; the web app also
forwards it on its server-side calls, which do not carry browser cookies.

No session -> DEMO_USER_ID, i.e. exactly the previous single-user behaviour. That keeps
local dev and any deployment without SESSION_SECRET working unchanged.
"""
from __future__ import annotations

import time

import jwt
from fastapi import Request

from app.config import settings

COOKIE_NAME = "mnemos_session"
# Web -> agent calls are server-side and carry no browser cookies, so the web app
# copies the session across in this header instead.
HEADER_NAME = "x-mnemos-session"

_ALGO = "HS256"
_TTL_S = 60 * 60 * 24 * 30  # 30 days

# Identity used when no session is present. Every pre-existing token record and every
# local-dev flow is keyed to this, so it must stay the anonymous fallback.
ANON_USER_ID = "alex"


def is_sessions_enabled() -> bool:
    """Multi-user requires a signing secret. Without one everyone shares ANON_USER_ID."""
    return len(settings.session_secret) > 0


def mint(sub: str, email: str = "") -> str:
    now = int(time.time())
    return jwt.encode({"sub": sub, "email": email, "iat": now, "exp": now + _TTL_S},
                      settings.session_secret, algorithm=_ALGO)


def verify(token: str) -> dict | None:
    if not token or not is_sessions_enabled():
        return None
    try:
        payload = jwt.decode(token, settings.session_secret, algorithms=[_ALGO])
    except jwt.PyJWTError:
        return None
    return payload if payload.get("sub") else None


def _raw_token(request: Request) -> str:
    return request.cookies.get(COOKIE_NAME) or request.headers.get(HEADER_NAME) or ""


def current_session(request: Request) -> dict | None:
    """The verified session payload, or None when anonymous."""
    return verify(_raw_token(request))


def current_user_id(request: Request) -> str:
    """Which Google connection this request acts as.

    Falls back to ANON_USER_ID so a deployment without SESSION_SECRET behaves exactly
    as it did before sessions existed.
    """
    sess = current_session(request)
    return sess["sub"] if sess else ANON_USER_ID


def user_id_from_token(token: str | None) -> str:
    """Same resolution for callers that hold the raw token rather than a Request."""
    sess = verify(token or "")
    return sess["sub"] if sess else ANON_USER_ID


def set_cookie(response, token: str) -> None:
    """Attach the session to a redirect leaving the OAuth callback.

    Cross-subdomain by design: the callback is served by the agent origin but the user
    lands back on the web origin, and both must see it.
    """
    domain = settings.session_cookie_domain or None
    response.set_cookie(
        COOKIE_NAME, token,
        max_age=_TTL_S,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        domain=domain,
        path="/",
    )


def clear_cookie(response) -> None:
    response.delete_cookie(COOKIE_NAME, domain=settings.session_cookie_domain or None, path="/")
