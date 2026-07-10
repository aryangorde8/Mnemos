"""LLM + embeddings for the AWS-native variant — zero Google stack.

Chat goes to any OpenAI-compatible endpoint via raw httpx; the default is
Groq's free tier (llama-3.3-70b-versatile: streaming + tool calling + JSON
mode). Swap providers by changing LLM_BASE_URL / LLM_MODEL / GROQ_API_KEY —
no code change.

Embeddings go to Cohere (free trial key). embed-english-v3.0 keeps the
asymmetric task-type split the retrieval design depends on:
documents embed with input_type="search_document", queries with
"search_query" (the Vertex RETRIEVAL_DOCUMENT/RETRIEVAL_QUERY equivalent).
NOTE: 1024-dim — the Atlas vector index must be built for 1024, not 768.

Public surface (generate / embed / embed_query / stream_generate /
GenerateResult / StreamChunk) is signature-compatible with the Vertex client
on main, so tools and the ReAct loop call it unchanged. Gemini-only params
(thinking_budget) are accepted and ignored.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass
from typing import Any, AsyncIterator

import httpx

from app.config import is_embeddings_configured, is_llm_configured, settings

# Free-tier TPM/RPM limits (Groq/Cohere) surface as 429s mid-run — a ReAct
# loop re-sends its growing context every turn, so multi-turn asks hit the
# window routinely. Retry with the server's retry-after instead of dying.
_MAX_429_RETRIES = 3
_DEFAULT_BACKOFF_S = 22.0
_MAX_BACKOFF_S = 90.0


def _retry_after_s(resp: httpx.Response) -> float:
    try:
        return min(float(resp.headers.get("retry-after", _DEFAULT_BACKOFF_S)) + 1.0, _MAX_BACKOFF_S)
    except ValueError:
        return _DEFAULT_BACKOFF_S

_GEN_TIMEOUT = httpx.Timeout(connect=10.0, read=180.0, write=30.0, pool=10.0)
_STREAM_TIMEOUT = httpx.Timeout(connect=10.0, read=600.0, write=30.0, pool=10.0)
_EMBED_TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=30.0, pool=10.0)

_COHERE_EMBED_URL = "https://api.cohere.com/v2/embed"


def _chat_headers() -> dict:
    return {"Authorization": f"Bearer {settings.groq_api_key}",
            "Content-Type": "application/json"}


# Gemini-style declarations use "type": "OBJECT" (and sometimes other
# uppercase types); OpenAI-compatible endpoints want lowercase JSON Schema.
_TYPE_MAP = {"OBJECT": "object", "STRING": "string", "NUMBER": "number",
             "INTEGER": "integer", "BOOLEAN": "boolean", "ARRAY": "array"}


def _norm_schema(node: Any) -> Any:
    if isinstance(node, dict):
        return {k: (_TYPE_MAP.get(v, v.lower()) if k == "type" and isinstance(v, str) and v.isupper()
                    else _norm_schema(v))
                for k, v in node.items()}
    if isinstance(node, list):
        return [_norm_schema(x) for x in node]
    return node


def _to_openai_tools(declarations: list[dict]) -> list[dict]:
    return [{
        "type": "function",
        "function": {
            "name": d["name"],
            "description": d.get("description", ""),
            "parameters": _norm_schema(d.get("parameters") or {"type": "object", "properties": {}}),
        },
    } for d in declarations]


@dataclass
class GenerateResult:
    text: str
    model: str
    finish_reason: str | None = None


async def generate(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.4,
    max_tokens: int = 2048,
    response_mime_type: str | None = None,
    thinking_budget: int | None = None,  # Gemini-ism; accepted and ignored
) -> GenerateResult:
    """Single-shot generation (used by critic, rerank, extraction, drafts)."""
    if not is_llm_configured():
        raise RuntimeError("llm: GROQ_API_KEY not configured")

    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload: dict = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_mime_type == "application/json":
        # JSON mode — Groq/OpenAI-compat require the word "JSON" in the prompt,
        # which every JSON-emitting caller in this repo already includes.
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=_GEN_TIMEOUT) as client:
        for attempt in range(_MAX_429_RETRIES + 1):
            resp = await client.post(f"{settings.llm_base_url}/chat/completions",
                                     headers=_chat_headers(), json=payload)
            if resp.status_code == 429 and attempt < _MAX_429_RETRIES:
                await asyncio.sleep(_retry_after_s(resp))
                continue
            if resp.status_code >= 400:
                # keep the provider's body — it names which limit (TPM/TPD) was hit
                raise RuntimeError(f"llm error {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            break

    choice = (data.get("choices") or [{}])[0]
    text = (choice.get("message") or {}).get("content") or ""
    finish = choice.get("finish_reason")
    return GenerateResult(text=text, model=settings.llm_model,
                          finish_reason=str(finish) if finish is not None else None)


async def _cohere_embed(texts: list[str], input_type: str) -> list[list[float]]:
    if not is_embeddings_configured():
        raise RuntimeError("embeddings: COHERE_API_KEY not configured")
    payload = {
        "model": settings.cohere_embed_model,
        "texts": texts,
        "input_type": input_type,
        "embedding_types": ["float"],
    }
    headers = {"Authorization": f"Bearer {settings.cohere_api_key}",
               "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=_EMBED_TIMEOUT) as client:
        for attempt in range(_MAX_429_RETRIES + 1):
            resp = await client.post(_COHERE_EMBED_URL, headers=headers, json=payload)
            if resp.status_code == 429 and attempt < _MAX_429_RETRIES:
                await asyncio.sleep(_retry_after_s(resp))
                continue
            if resp.status_code >= 400:
                raise RuntimeError(f"embed error {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            break
    return [list(v) for v in data["embeddings"]["float"]]


async def embed(texts: list[str]) -> list[list[float]]:
    """Embed documents (search_document — asymmetric with embed_query)."""
    if not texts:
        return []
    return await _cohere_embed(texts, "search_document")


async def embed_query(text: str) -> list[float]:
    """Embed a query (search_query)."""
    return (await _cohere_embed([text], "search_query"))[0]


@dataclass
class StreamChunk:
    text: str | None = None
    function_call: dict | None = None  # {"id": str, "name": str, "args": dict}
    usage: dict | None = None  # {"prompt","candidates","thoughts","total"}
    finish_reason: str | None = None


async def stream_generate(
    *,
    system: str | None,
    messages: list[dict],
    tools: list[dict] | None = None,
    temperature: float = 0.4,
    max_tokens: int = 2048,
    frequency_penalty: float = 0.4,
) -> AsyncIterator[StreamChunk]:
    """Streaming chat with OpenAI-style tool calling — drives the ReAct loop.

    `messages` are OpenAI-format dicts (user/assistant/tool). `tools` are the
    registry's Gemini-style FunctionDeclaration dicts; converted here so the
    registry stays untouched. Text deltas stream live; tool calls arrive as
    argument fragments and are yielded complete at end of stream.
    """
    if not is_llm_configured():
        raise RuntimeError("llm: GROQ_API_KEY not configured")

    payload: dict = {
        "model": settings.llm_model,
        "messages": ([{"role": "system", "content": system}] if system else []) + messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "frequency_penalty": frequency_penalty,
        "stream": True,
    }
    if tools:
        payload["tools"] = _to_openai_tools(tools)
        payload["tool_choice"] = "auto"

    # index -> {"id","name","arguments"} accumulated across deltas
    pending: dict[int, dict] = {}
    usage: dict | None = None
    finish: str | None = None

    async with httpx.AsyncClient(timeout=_STREAM_TIMEOUT) as client:
        for attempt in range(_MAX_429_RETRIES + 1):
            async with client.stream("POST", f"{settings.llm_base_url}/chat/completions",
                                     headers=_chat_headers(), json=payload) as resp:
                # 429 arrives with the headers, before any chunk is yielded —
                # safe to back off and retry the whole request.
                if resp.status_code == 429 and attempt < _MAX_429_RETRIES:
                    await resp.aread()
                    await asyncio.sleep(_retry_after_s(resp))
                    continue
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", "replace")[:500]
                    raise RuntimeError(f"llm stream error {resp.status_code}: {body}")
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if raw == "[DONE]":
                        break
                    try:
                        obj = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    u = (obj.get("x_groq") or {}).get("usage") or obj.get("usage")
                    if u:
                        usage = u
                    choices = obj.get("choices") or []
                    if not choices:
                        continue
                    choice = choices[0]
                    delta = choice.get("delta") or {}
                    if delta.get("content"):
                        yield StreamChunk(text=delta["content"])
                    for tc in delta.get("tool_calls") or []:
                        idx = tc.get("index", 0)
                        slot = pending.setdefault(idx, {"id": "", "name": "", "arguments": ""})
                        if tc.get("id"):
                            slot["id"] = tc["id"]
                        fn = tc.get("function") or {}
                        if fn.get("name"):
                            slot["name"] = fn["name"]
                        if fn.get("arguments"):
                            slot["arguments"] += fn["arguments"]
                    if choice.get("finish_reason"):
                        finish = str(choice["finish_reason"])
            break

    # Flush completed tool calls (arguments accumulate across deltas, so they
    # are only reliably complete once the stream ends).
    for idx in sorted(pending):
        slot = pending[idx]
        if not slot["name"]:
            continue
        try:
            args = json.loads(slot["arguments"]) if slot["arguments"].strip() else {}
            if not isinstance(args, dict):
                args = {}
        except json.JSONDecodeError:
            args = {}
        yield StreamChunk(function_call={
            "id": slot["id"] or f"call_{uuid.uuid4().hex[:8]}",
            "name": slot["name"], "args": args,
        })

    if usage:
        yield StreamChunk(usage={
            "prompt": usage.get("prompt_tokens", 0) or 0,
            "candidates": usage.get("completion_tokens", 0) or 0,
            "thoughts": 0,
            "total": usage.get("total_tokens", 0) or 0,
        })
    if finish:
        yield StreamChunk(finish_reason=finish)
