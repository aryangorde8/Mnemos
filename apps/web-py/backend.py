"""Thin httpx client for the Mnemos agent backend (apps/agent-py)."""
from __future__ import annotations

import json
import os
from typing import AsyncIterator

import httpx

AGENT = os.environ.get("AGENT_URL", "http://localhost:8787")


async def get_json(path: str, params: dict | None = None) -> dict | list | None:
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(f"{AGENT}{path}", params=params)
            if r.status_code >= 400:
                return None
            return r.json()
    except Exception:  # noqa: BLE001
        return None


async def post_json(path: str, body: dict) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"{AGENT}{path}", json=body)
            return r.json() if r.status_code < 400 else {"error": r.text}
    except Exception as err:  # noqa: BLE001
        return {"error": str(err)}


async def stream_events(path: str, body: dict) -> AsyncIterator[dict]:
    """Proxy a backend SSE endpoint, yielding parsed event dicts (with `kind`)."""
    async with httpx.AsyncClient(timeout=None) as c:
        async with c.stream("POST", f"{AGENT}{path}", json=body,
                            headers={"Accept": "text/event-stream"}) as r:
            buffer = ""
            event_name = "message"
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
                    _ = event_name  # keep linters quiet
