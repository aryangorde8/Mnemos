"""Gemini + embeddings via the official google-genai SDK.

Two transports, one code path:
- GEMINI_API_KEY set  → the Gemini API (AI Studio free tier; no GCP billing).
- otherwise           → Vertex AI: the LLM on the `global` endpoint (Gemini 3.x
  preview), embeddings on the regional endpoint — same split as the TS backend.
  Auth from GOOGLE_APPLICATION_CREDENTIALS / ADC, picked up by the SDK.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, AsyncIterator

from google import genai
from google.genai import types

from app.config import is_llm_configured, settings

_NOT_CONFIGURED = "llm not configured — set GEMINI_API_KEY (free tier) or GOOGLE_CLOUD_PROJECT (Vertex)"


@lru_cache(maxsize=1)
def _llm_client() -> genai.Client:
    if settings.gemini_api_key:
        return genai.Client(api_key=settings.gemini_api_key)
    return genai.Client(
        vertexai=True,
        project=settings.google_cloud_project,
        location=settings.vertex_gemini_location,
    )


@lru_cache(maxsize=1)
def _embed_client() -> genai.Client:
    if settings.gemini_api_key:
        return genai.Client(api_key=settings.gemini_api_key)
    return genai.Client(
        vertexai=True,
        project=settings.google_cloud_project,
        location=settings.google_cloud_location,
    )


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
    thinking_budget: int | None = None,
) -> GenerateResult:
    """Single-shot generation (used by critic, rerank, extraction, drafts)."""
    if not is_llm_configured():
        raise RuntimeError(_NOT_CONFIGURED)

    cfg = types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=max_tokens,
    )
    if system:
        cfg.system_instruction = system
    if response_mime_type:
        cfg.response_mime_type = response_mime_type
    if thinking_budget is not None:
        cfg.thinking_config = types.ThinkingConfig(thinking_budget=thinking_budget)

    resp = await _llm_client().aio.models.generate_content(
        model=settings.vertex_gemini_model,
        contents=prompt,
        config=cfg,
    )
    finish = None
    if resp.candidates:
        finish = getattr(resp.candidates[0], "finish_reason", None)
        finish = str(finish) if finish is not None else None
    return GenerateResult(text=resp.text or "", model=settings.vertex_gemini_model, finish_reason=finish)


async def embed(texts: list[str]) -> list[list[float]]:
    """Embed documents (RETRIEVAL_DOCUMENT)."""
    if not is_llm_configured():
        raise RuntimeError(_NOT_CONFIGURED)
    if not texts:
        return []
    resp = await _embed_client().aio.models.embed_content(
        model=settings.vertex_embedding_model,
        contents=texts,
        config=types.EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"),
    )
    return [list(e.values) for e in resp.embeddings]


async def embed_query(text: str) -> list[float]:
    """Embed a query (RETRIEVAL_QUERY)."""
    if not is_llm_configured():
        raise RuntimeError(_NOT_CONFIGURED)
    resp = await _embed_client().aio.models.embed_content(
        model=settings.vertex_embedding_model,
        contents=text,
        config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
    )
    return list(resp.embeddings[0].values)


@dataclass
class StreamChunk:
    text: str | None = None
    function_call: dict | None = None  # {"name": str, "args": dict}
    thought_signature: Any | None = None
    part: Any | None = None  # raw types.Part, echoed back to preserve signatures
    usage: dict | None = None  # {"prompt","candidates","thoughts","total"}
    finish_reason: str | None = None


async def stream_generate(
    *,
    system: str | None,
    contents: list,
    tools: list[dict] | None = None,
    temperature: float = 0.4,
    max_tokens: int = 2048,
    frequency_penalty: float = 0.4,
) -> AsyncIterator[StreamChunk]:
    """Streaming generate with function calling — drives the ReAct loop.

    `tools` are FunctionDeclaration dicts (pydantic coerces them). Yields text
    deltas, function calls (with the raw Part so the loop can echo them back and
    preserve thoughtSignature), usage, and finish reasons.
    """
    if not is_llm_configured():
        raise RuntimeError(_NOT_CONFIGURED)

    cfg = types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=max_tokens,
        frequency_penalty=frequency_penalty,
    )
    if system:
        cfg.system_instruction = system
    if tools:
        cfg.tools = [types.Tool(function_declarations=tools)]
        cfg.tool_config = types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(mode="AUTO")
        )

    stream = await _llm_client().aio.models.generate_content_stream(
        model=settings.vertex_gemini_model,
        contents=contents,
        config=cfg,
    )
    async for chunk in stream:
        cand = chunk.candidates[0] if chunk.candidates else None
        if cand is not None and cand.content is not None and cand.content.parts:
            for part in cand.content.parts:
                ts = getattr(part, "thought_signature", None)
                if getattr(part, "text", None):
                    yield StreamChunk(text=part.text, thought_signature=ts, part=part)
                elif getattr(part, "function_call", None):
                    fc = part.function_call
                    yield StreamChunk(
                        function_call={"name": fc.name, "args": dict(fc.args or {})},
                        thought_signature=ts,
                        part=part,
                    )
        if cand is not None and getattr(cand, "finish_reason", None):
            yield StreamChunk(finish_reason=str(cand.finish_reason))
        um = getattr(chunk, "usage_metadata", None)
        if um is not None:
            yield StreamChunk(usage={
                "prompt": um.prompt_token_count or 0,
                "candidates": um.candidates_token_count or 0,
                "thoughts": getattr(um, "thoughts_token_count", 0) or 0,
                "total": um.total_token_count or 0,
            })
