"""Firebase ID-token verification — port of apps/agent/src/lib/firebase-auth.ts.

Config-gated: if FIREBASE_PROJECT_ID isn't set, the middleware is a no-op.
Verifies RS256 ID tokens against Google's public x509 certs with PyJWT.
"""
from __future__ import annotations

import os
import time

import httpx
import jwt
from cryptography.x509 import load_pem_x509_certificate
from fastapi import Request
from fastapi.responses import JSONResponse

_CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_cert_cache: dict = {"certs": {}, "expires_at": 0.0}


def _project_id() -> str:
    return os.environ.get("FIREBASE_PROJECT_ID") or os.environ.get("NEXT_PUBLIC_FIREBASE_PROJECT_ID") or ""


def is_firebase_configured() -> bool:
    return len(_project_id()) > 0


async def _get_certs() -> dict:
    now = time.time()
    if _cert_cache["certs"] and _cert_cache["expires_at"] > now:
        return _cert_cache["certs"]
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(_CERT_URL)
        r.raise_for_status()
        certs = r.json()
        cc = r.headers.get("cache-control", "")
        import re
        m = re.search(r"max-age=(\d+)", cc)
        max_age = int(m.group(1)) if m else 3600
    _cert_cache.update({"certs": certs, "expires_at": now + max_age})
    return certs


async def verify_firebase_token(token: str) -> dict:
    pid = _project_id()
    if not pid:
        raise ValueError("firebase: not configured")
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    if not kid:
        raise ValueError("firebase: missing kid")
    certs = await _get_certs()
    cert_pem = certs.get(kid)
    if not cert_pem:
        raise ValueError("firebase: no matching public cert")
    public_key = load_pem_x509_certificate(cert_pem.encode()).public_key()
    payload = jwt.decode(
        token, public_key, algorithms=["RS256"], audience=pid,
        issuer=f"https://securetoken.google.com/{pid}",
    )
    if not payload.get("sub"):
        raise ValueError("firebase: missing subject")
    return {"uid": payload["sub"], "email": payload.get("email"),
            "emailVerified": payload.get("email_verified"), "name": payload.get("name")}


def _bearer(request: Request) -> str | None:
    h = request.headers.get("authorization")
    if not h:
        return None
    parts = h.split(None, 1)
    return parts[1] if len(parts) == 2 and parts[0].lower() == "bearer" else None


async def firebase_middleware(request: Request, call_next):
    """No-op unless configured. Reads + /auth/* pass; mutations need a token."""
    if not is_firebase_configured():
        return await call_next(request)
    method = request.method.upper()
    is_read = method in ("GET", "HEAD", "OPTIONS")
    path = request.url.path
    is_auth_route = path.startswith("/auth") or path in ("/health", "/ready")

    token = _bearer(request)
    if token:
        try:
            request.state.user = await verify_firebase_token(token)
            return await call_next(request)
        except Exception as err:  # noqa: BLE001
            return JSONResponse(status_code=401, content={"error": "unauthorized", "detail": str(err)})
    if is_read or is_auth_route:
        return await call_next(request)
    return JSONResponse(status_code=401, content={"error": "unauthorized", "detail": "missing Firebase ID token"})
