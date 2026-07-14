"""Amazon Bedrock backend (Converse API) for generation + streaming tool use.

Only the generation path lives here; embeddings stay on Gemini/Vertex (see
genai_client). boto3's Converse stream is synchronous, so streaming is bridged
to async via a worker thread feeding an asyncio.Queue — nothing blocks the loop.

Credentials come from the standard AWS chain (AWS_ACCESS_KEY_ID /
AWS_SECRET_ACCESS_KEY env, shared config, or an instance role). Model access
must be enabled for BEDROCK_MODEL_ID in the Bedrock console for the region.
"""
from __future__ import annotations

import asyncio
import json
import threading
from functools import lru_cache
from typing import AsyncIterator

from app.config import settings
from app.llm.neutral import to_bedrock_messages, tools_to_bedrock


@lru_cache(maxsize=1)
def _client():
    import boto3  # imported lazily so the module loads without boto3 present
    return boto3.client("bedrock-runtime", region_name=settings.bedrock_region or None)


async def generate(prompt: str, *, system: str | None, temperature: float,
                   max_tokens: int) -> tuple[str, str | None]:
    """Single-shot Converse. Returns (text, stop_reason)."""
    kwargs: dict = {
        "modelId": settings.bedrock_model_id,
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
        "inferenceConfig": {"temperature": temperature, "maxTokens": max_tokens},
    }
    if system:
        kwargs["system"] = [{"text": system}]
    resp = await asyncio.to_thread(_client().converse, **kwargs)
    blocks = (resp.get("output", {}).get("message", {}) or {}).get("content", []) or []
    text = "".join(b.get("text", "") for b in blocks if "text" in b)
    return text, resp.get("stopReason")


async def stream(*, system: str | None, messages: list[dict], tools: list[dict] | None,
                 temperature: float, max_tokens: int) -> AsyncIterator[dict]:
    """Streaming Converse. Yields neutral chunk dicts:
      {"text": str} | {"tool_call": {"id","name","args"}}
      | {"usage": {...}} | {"finish_reason": str} | {"error": str}
    """
    kwargs: dict = {
        "modelId": settings.bedrock_model_id,
        "messages": to_bedrock_messages(messages),
        "inferenceConfig": {"temperature": temperature, "maxTokens": max_tokens},
    }
    if system:
        kwargs["system"] = [{"text": system}]
    tool_cfg = tools_to_bedrock(tools)
    if tool_cfg:
        kwargs["toolConfig"] = tool_cfg

    resp = await asyncio.to_thread(_client().converse_stream, **kwargs)
    event_stream = resp["stream"]

    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def worker():
        # Accumulates a tool-use block's streamed JSON `input` until its stop event.
        pending: dict | None = None  # {"id","name","buf"}
        try:
            for ev in event_stream:
                if "contentBlockStart" in ev:
                    start = ev["contentBlockStart"].get("start", {})
                    tu = start.get("toolUse")
                    if tu:
                        pending = {"id": tu["toolUseId"], "name": tu["name"], "buf": ""}
                elif "contentBlockDelta" in ev:
                    delta = ev["contentBlockDelta"].get("delta", {})
                    if "text" in delta:
                        loop.call_soon_threadsafe(queue.put_nowait, {"text": delta["text"]})
                    elif "toolUse" in delta and pending is not None:
                        pending["buf"] += delta["toolUse"].get("input", "")
                elif "contentBlockStop" in ev:
                    if pending is not None:
                        try:
                            args = json.loads(pending["buf"]) if pending["buf"].strip() else {}
                        except json.JSONDecodeError:
                            args = {}
                        loop.call_soon_threadsafe(queue.put_nowait, {"tool_call": {
                            "id": pending["id"], "name": pending["name"], "args": args}})
                        pending = None
                elif "messageStop" in ev:
                    loop.call_soon_threadsafe(queue.put_nowait, {
                        "finish_reason": ev["messageStop"].get("stopReason")})
                elif "metadata" in ev:
                    u = ev["metadata"].get("usage", {})
                    loop.call_soon_threadsafe(queue.put_nowait, {"usage": {
                        "prompt": u.get("inputTokens", 0), "candidates": u.get("outputTokens", 0),
                        "thoughts": 0, "total": u.get("totalTokens", 0)}})
        except Exception as err:  # noqa: BLE001
            loop.call_soon_threadsafe(queue.put_nowait, {"error": str(err)})
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)  # sentinel

    threading.Thread(target=worker, daemon=True).start()

    while True:
        item = await queue.get()
        if item is None:
            break
        if "error" in item:
            raise RuntimeError(f"bedrock: {item['error']}")
        yield item
