"""Thin httpx client for the Mnemos agent backend (apps/agent-py)."""
from __future__ import annotations

import json
import os
from typing import AsyncIterator

import httpx

AGENT = os.environ.get("AGENT_URL", "http://localhost:8787")

# The agent URL the *browser* can reach — the Google OAuth consent flow round-trips
# through the agent, so the connect link must use a public URL, not an internal one.
# Defaults to AGENT, which is browser-reachable in both the local (localhost:8787)
# and deployed (public Cloud Run URL) setups.
AGENT_PUBLIC = os.environ.get("AGENT_PUBLIC_URL", AGENT)


# The agent identifies a visitor by a session cookie it set at the end of the OAuth
# callback. Web -> agent calls are server-side and carry no browser cookies, so every
# helper takes the session explicitly and forwards it in a header. Without this the
# agent would see every request as anonymous and fall back to the shared connection.
SESSION_COOKIE = "mnemos_session"
SESSION_HEADER = "x-mnemos-session"


def session_of(request) -> str:
    """Pull the session token off an inbound browser request ('' when absent)."""
    try:
        return request.cookies.get(SESSION_COOKIE, "") or ""
    except AttributeError:
        return ""


def _headers(session: str | None) -> dict:
    return {SESSION_HEADER: session} if session else {}


def google_connect_url() -> str:
    """Where the browser starts the one-time Google OAuth consent."""
    return f"{AGENT_PUBLIC}/auth/google/start"


async def google_status(session: str | None = None) -> dict | None:
    """Google OAuth state for *this* visitor (configured / connected / email).

    None when the agent is unreachable or errored — callers should render nothing
    rather than guess.
    """
    data = await get_json("/auth/google/status", session=session)
    return data if isinstance(data, dict) else None


async def google_connections() -> dict | None:
    """How many distinct Google accounts are connected to this deployment."""
    data = await get_json("/auth/google/connections")
    return data if isinstance(data, dict) else None


async def get_json(path: str, params: dict | None = None,
                   session: str | None = None) -> dict | list | None:
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(f"{AGENT}{path}", params=params, headers=_headers(session))
            if r.status_code >= 400:
                return None
            return r.json()
    except Exception:  # noqa: BLE001
        return None


async def post_json(path: str, body: dict, session: str | None = None) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"{AGENT}{path}", json=body, headers=_headers(session))
            return r.json() if r.status_code < 400 else {"error": r.text}
    except Exception as err:  # noqa: BLE001
        return {"error": str(err)}


async def delete_json(path: str, session: str | None = None) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.delete(f"{AGENT}{path}", headers=_headers(session))
            return r.json() if r.status_code < 400 else {"error": r.text}
    except Exception as err:  # noqa: BLE001
        return {"error": str(err)}


async def stream_events(path: str, body: dict,
                        session: str | None = None) -> AsyncIterator[dict]:
    """Proxy a backend SSE endpoint, yielding parsed event dicts (with `kind`).

    Tolerant of a down/unreachable agent: connection failures surface as a single `error` event
    rather than propagating, so the SSE surfaces degrade gracefully instead of hanging or 500-ing.
    The connect is bounded; only the read (streaming body) is allowed to run long.
    """
    timeout = httpx.Timeout(connect=8.0, read=None, write=8.0, pool=8.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            async with c.stream("POST", f"{AGENT}{path}", json=body,
                                headers={"Accept": "text/event-stream",
                                         **_headers(session)}) as r:
                if r.status_code >= 400:
                    yield {"kind": "error", "message": f"agent returned {r.status_code}"}
                    return
                buffer = ""
                async for chunk in r.aiter_text():
                    buffer += chunk
                    while "\n\n" in buffer:
                        block, buffer = buffer.split("\n\n", 1)
                        data_lines: list[str] = []
                        ev = "message"
                        for line in block.split("\n"):
                            if line.startswith(":"):
                                continue
                            if line.startswith("event:"):
                                ev = line[6:].strip()
                            elif line.startswith("data:"):
                                data_lines.append(line[5:].lstrip())
                        if not data_lines:
                            continue
                        raw = "\n".join(data_lines)
                        try:
                            parsed = json.loads(raw)
                        except json.JSONDecodeError:
                            parsed = {"kind": ev, "_raw": raw}
                        if "kind" not in parsed:
                            parsed["kind"] = ev
                        yield parsed
    except Exception as err:  # noqa: BLE001  — agent unreachable / stream dropped
        yield {"kind": "error", "message": f"agent unreachable: {err}"}
