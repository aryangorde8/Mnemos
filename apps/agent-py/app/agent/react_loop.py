"""ReAct loop — port of apps/agent/src/agent/react-loop.ts.

Hand-rolled think→act→observe over google-genai streaming + function calling.
Yields AgentEvent dicts the SSE route serializes. Enforces the Critic: every
draft_email the model doesn't pair with its own critique_draft is critiqued
automatically and fed back into the same turn.
"""
from __future__ import annotations

import json
import time
import uuid
from typing import AsyncIterator

from app.agent.prompts import SYSTEM_PROMPT, user_framing
from app.agent.tools.registry import DECLARATIONS, TOOL_REGISTRY
from app.llm.genai_client import stream_generate

MAX_TURNS = 14


def _now() -> int:
    return int(time.time() * 1000)


def _estimate_cost(prompt_tokens: int, output_tokens: int) -> float:
    """Rough USD estimate from public list prices per 1M tokens (input, output),
    keyed by the active generation provider (and model, on Bedrock)."""
    from app.config import llm_provider, settings
    provider = llm_provider()
    if provider == "bedrock":
        mid = settings.bedrock_model_id.lower()
        bedrock_prices = {
            "nova-micro": (0.035, 0.14), "nova-lite": (0.06, 0.24),
            "nova-pro": (0.80, 3.20), "nova-premier": (2.50, 12.50),
            "claude": (3.0, 15.0),
        }
        pin, pout = next((v for k, v in bedrock_prices.items() if k in mid), (0.80, 3.20))
    else:
        pin, pout = {"gemini_api": (0.075, 0.30), "vertex": (1.25, 10.0)}.get(provider, (0.80, 3.20))
    usd = (prompt_tokens / 1_000_000) * pin + (output_tokens / 1_000_000) * pout
    return round(usd * 10000) / 10000


def _trim_for_model(result: dict) -> dict:
    if not result.get("ok"):
        return {"ok": False, "error": result.get("error", "tool failed")}
    out: dict = {"ok": True}
    if result.get("summary"):
        out["summary"] = result["summary"]
    if result.get("data"):
        out["data"] = result["data"]
    return out


def _dedup_citations(cites: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for c in cites:
        cid = c.get("chunkId")
        if not cid or cid in seen:
            continue
        seen.add(cid)
        out.append(c)
    out.sort(key=lambda c: c.get("score", 0), reverse=True)
    return out[:12]


async def run_agent(
    query: str,
    *,
    max_turns: int = MAX_TURNS,
    system_prompt: str | None = None,
    history: list[dict] | None = None,
) -> AsyncIterator[dict]:
    started = time.time()
    run_id = str(uuid.uuid4())
    # Provider-neutral conversation (app.llm.neutral): each backend converts at
    # call time, so the loop is identical on Bedrock, Gemini, and Vertex.
    messages: list[dict] = []
    if history:
        for turn in history:
            role = "assistant" if turn["role"] in ("assistant", "model") else "user"
            messages.append({"role": role, "parts": [{"text": turn["text"]}]})
    messages.append({"role": "user", "parts": [{"text": user_framing(query)}]})

    all_citations: list[dict] = []
    usage = {"prompt": 0, "candidates": 0, "thoughts": 0, "total": 0}
    critiqued_action_ids: set[str] = set()

    yield {"kind": "start", "query": query, "runId": run_id, "at": _now()}

    turn = 0
    while turn < max_turns:
        turn += 1
        collected_text: list[str] = []
        tool_calls: list[dict] = []  # each {"id", "name", "args"}

        try:
            async for chunk in stream_generate(
                system=system_prompt or SYSTEM_PROMPT,
                contents=messages,
                tools=DECLARATIONS,
                temperature=0.4,
                max_tokens=2048,
            ):
                if chunk.text:
                    yield {"kind": "thought", "chunk": chunk.text, "at": _now()}
                    collected_text.append(chunk.text)
                if chunk.function_call:
                    tool_calls.append(chunk.function_call)
                if chunk.usage:
                    usage.update({
                        "prompt": chunk.usage["prompt"], "candidates": chunk.usage["candidates"],
                        "thoughts": chunk.usage["thoughts"], "total": chunk.usage["total"],
                    })
        except Exception as err:  # noqa: BLE001
            yield {"kind": "error", "message": str(err), "at": _now()}
            return

        # No tool calls → final answer turn.
        if not tool_calls:
            final_text = "".join(collected_text)
            if not final_text:
                yield {"kind": "error", "message": "model returned no content and no tool call", "at": _now()}
                return
            if all_citations:
                yield {"kind": "citations", "citations": _dedup_citations(all_citations), "at": _now()}
            yield {"kind": "answer", "chunk": final_text, "at": _now()}
            out_tokens = usage["candidates"] + usage["thoughts"]
            yield {"kind": "done", "turns": turn, "totalMs": int((time.time() - started) * 1000),
                   "usage": {
                       "promptTokens": usage["prompt"], "candidatesTokens": usage["candidates"],
                       "thoughtsTokens": usage["thoughts"],
                       "totalTokens": usage["total"] or (usage["prompt"] + out_tokens),
                       "estimatedCostUsd": _estimate_cost(usage["prompt"], out_tokens),
                   }, "at": _now()}
            return

        # Record the model turn (text + tool calls) as a neutral assistant message.
        assistant_parts: list = []
        joined = "".join(collected_text)
        if joined:
            assistant_parts.append({"text": joined})
        for tc in tool_calls:
            assistant_parts.append({"tool_call": tc})
        messages.append({"role": "assistant", "parts": assistant_parts})

        response_parts: list = []
        drafted_this_turn: list[str] = []
        for call in tool_calls:
            call_id = call["id"]  # matches the tool_call id in the assistant turn
            tool = TOOL_REGISTRY.get(call["name"])
            yield {"kind": "tool_call", "id": call_id, "name": call["name"], "args": call["args"], "at": _now()}

            t0 = time.time()
            if not tool:
                result = {"ok": False, "error": f"unknown tool: {call['name']}"}
            else:
                try:
                    result = await tool.handler(call["args"], {"query": query, "runId": run_id})
                except Exception as err:  # noqa: BLE001
                    result = {"ok": False, "error": str(err)}
            duration_ms = int((time.time() - t0) * 1000)

            if call["name"] == "critique_draft":
                aid = call["args"].get("action_id")
                if isinstance(aid, str) and aid:
                    critiqued_action_ids.add(aid)
            elif call["name"] == "draft_email" and result.get("ok"):
                aid = (result.get("data") or {}).get("actionId")
                if isinstance(aid, str) and aid:
                    drafted_this_turn.append(aid)

            if result.get("citations"):
                all_citations.extend(result["citations"])

            yield {"kind": "observation", "id": call_id, "name": call["name"],
                   "result": result, "durationMs": duration_ms, "at": _now()}
            response_parts.append({"tool_result": {
                "id": call_id, "name": call["name"], "content": _trim_for_model(result)}})

        # ── ENFORCE THE CRITIC ──
        # The model didn't call critique_draft itself, so there's no matching
        # tool_call — feed the audit back as a text note (a synthetic tool_result
        # would be rejected by Bedrock's strict tool protocol).
        critic = TOOL_REGISTRY.get("critique_draft")
        for action_id in drafted_this_turn:
            if action_id in critiqued_action_ids or not critic:
                continue
            call_id = uuid.uuid4().hex[:8]
            yield {"kind": "tool_call", "id": call_id, "name": "critique_draft",
                   "args": {"action_id": action_id, "auto": True}, "at": _now()}
            t0 = time.time()
            try:
                result = await critic.handler({"action_id": action_id}, {"query": query, "runId": run_id})
            except Exception as err:  # noqa: BLE001
                result = {"ok": False, "error": str(err)}
            duration_ms = int((time.time() - t0) * 1000)
            critiqued_action_ids.add(action_id)
            if result.get("citations"):
                all_citations.extend(result["citations"])
            yield {"kind": "observation", "id": call_id, "name": "critique_draft",
                   "result": result, "durationMs": duration_ms, "at": _now()}
            response_parts.append({"text":
                f"[auto-critic] Audit of draft {action_id}: {json.dumps(_trim_for_model(result))}"})

        messages.append({"role": "user", "parts": response_parts})

    yield {"kind": "error", "message": f"exceeded max turns ({max_turns}) without final answer", "at": _now()}
