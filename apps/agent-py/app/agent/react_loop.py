"""ReAct loop — AWS variant, OpenAI-compatible tool-calling protocol.

Hand-rolled think→act→observe over streaming chat completions (Groq by
default). Yields AgentEvent dicts the SSE route serializes. Enforces the
Critic: every draft_email the model doesn't pair with its own critique_draft
is critiqued automatically and fed back into the same turn.

Protocol notes vs the Vertex/Gemini version on main:
- messages are plain OpenAI dicts; history role "model" maps to "assistant".
- tool results are {"role": "tool", "tool_call_id": ...} and MUST reference a
  tool call the assistant declared — so the auto-critique verdict is injected
  as a labeled user-role audit note instead of a fabricated tool response.
- no thought_signature to preserve; that was a Gemini 3.x requirement.
"""
from __future__ import annotations

import json
import time
import uuid
from typing import AsyncIterator

from app.agent.prompts import SYSTEM_PROMPT, user_framing
from app.agent.tools.registry import DECLARATIONS, TOOL_REGISTRY
from app.llm.llm_client import stream_generate

MAX_TURNS = 14


def _now() -> int:
    return int(time.time() * 1000)


def _estimate_cost(prompt_tokens: int, output_tokens: int) -> float:
    """Groq llama-3.3-70b-versatile list price: $0.59/1M input, $0.79/1M output.

    (Free-tier usage is billed at $0 — this reports the list-price equivalent.)
    """
    usd = (prompt_tokens / 1_000_000) * 0.59 + (output_tokens / 1_000_000) * 0.79
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
    messages: list[dict] = []
    if history:
        for turn in history:
            role = "assistant" if turn["role"] == "model" else "user"
            messages.append({"role": role, "content": turn["text"]})
    messages.append({"role": "user", "content": user_framing(query)})

    all_citations: list[dict] = []
    usage = {"prompt": 0, "candidates": 0, "thoughts": 0, "total": 0}
    critiqued_action_ids: set[str] = set()

    yield {"kind": "start", "query": query, "runId": run_id, "at": _now()}

    turn = 0
    while turn < max_turns:
        turn += 1
        turn_text = ""
        tool_calls: list[dict] = []  # {"id", "name", "args"}

        try:
            async for chunk in stream_generate(
                system=system_prompt or SYSTEM_PROMPT,
                messages=messages,
                tools=DECLARATIONS,
                temperature=0.4,
                max_tokens=2048,
            ):
                if chunk.text:
                    yield {"kind": "thought", "chunk": chunk.text, "at": _now()}
                    turn_text += chunk.text
                if chunk.function_call:
                    tool_calls.append(chunk.function_call)
                if chunk.usage:
                    usage.update({
                        "prompt": usage["prompt"] + chunk.usage["prompt"],
                        "candidates": usage["candidates"] + chunk.usage["candidates"],
                        "thoughts": 0,
                        "total": usage["total"] + chunk.usage["total"],
                    })
        except Exception as err:  # noqa: BLE001
            yield {"kind": "error", "message": str(err), "at": _now()}
            return

        # No tool calls → final answer turn.
        if not tool_calls:
            if not turn_text:
                yield {"kind": "error", "message": "model returned no content and no tool call", "at": _now()}
                return
            if all_citations:
                yield {"kind": "citations", "citations": _dedup_citations(all_citations), "at": _now()}
            yield {"kind": "answer", "chunk": turn_text, "at": _now()}
            out_tokens = usage["candidates"]
            yield {"kind": "done", "turns": turn, "totalMs": int((time.time() - started) * 1000),
                   "usage": {
                       "promptTokens": usage["prompt"], "candidatesTokens": usage["candidates"],
                       "thoughtsTokens": 0,
                       "totalTokens": usage["total"] or (usage["prompt"] + out_tokens),
                       "estimatedCostUsd": _estimate_cost(usage["prompt"], out_tokens),
                   }, "at": _now()}
            return

        # Record the assistant turn (text + declared tool calls) verbatim.
        messages.append({
            "role": "assistant",
            "content": turn_text or None,
            "tool_calls": [{
                "id": tc["id"], "type": "function",
                "function": {"name": tc["name"], "arguments": json.dumps(tc["args"])},
            } for tc in tool_calls],
        })

        drafted_this_turn: list[str] = []
        for call in tool_calls:
            call_id = str(uuid.uuid4())[:8]
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
            messages.append({
                "role": "tool", "tool_call_id": call["id"],
                "content": json.dumps(_trim_for_model(result), default=str),
            })

        # ── ENFORCE THE CRITIC ──
        # OpenAI-compat tool messages must match a declared tool call, so the
        # auto-critique verdict goes back as a labeled user-role audit note.
        critic = TOOL_REGISTRY.get("critique_draft")
        for action_id in drafted_this_turn:
            if action_id in critiqued_action_ids or not critic:
                continue
            call_id = str(uuid.uuid4())[:8]
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
            messages.append({
                "role": "user",
                "content": (
                    "[automatic critic audit — enforced by the runtime, not a user message] "
                    f"critique_draft ran on actionId {action_id}. Result: "
                    f"{json.dumps(_trim_for_model(result), default=str)} "
                    "Fold any high-severity findings into your next step per your instructions."
                ),
            })

    yield {"kind": "error", "message": f"exceeded max turns ({max_turns}) without final answer", "at": _now()}
