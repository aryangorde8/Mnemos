"""Provider-neutral chat messages + tool declarations, with converters to each
backend's native wire format.

Pure functions — no SDK calls, no network — so the translation is unit-testable
without cloud credentials. The ReAct loop and briefing build neutral messages;
the Gemini and Bedrock backends convert them at call time.

Neutral message:  {"role": "user" | "assistant", "parts": [Part, ...]}
Neutral part (exactly one key):
  {"text": str}
  {"tool_call":   {"id": str, "name": str, "args": dict}}
  {"tool_result": {"id": str, "name": str, "content": dict}}

Tool declarations stay in the repo's existing Gemini shape:
  {"name", "description", "parameters": {"type": "OBJECT", "properties", "required"}}
and are translated to JSON Schema for Bedrock here.
"""
from __future__ import annotations

from typing import Any


# ─────────────────────────── Gemini (google-genai) ───────────────────────────

def to_gemini_contents(messages: list[dict]) -> list:
    """Neutral messages → list[types.Content]. Imported lazily so this module
    stays importable (and testable) without the google-genai SDK present."""
    from google.genai import types

    out = []
    for m in messages:
        role = "model" if m["role"] == "assistant" else "user"
        parts = []
        for p in m.get("parts", []):
            if "text" in p:
                if p["text"]:
                    parts.append(types.Part(text=p["text"]))
            elif "tool_call" in p:
                tc = p["tool_call"]
                parts.append(types.Part(function_call=types.FunctionCall(
                    name=tc["name"], args=tc.get("args") or {})))
            elif "tool_result" in p:
                tr = p["tool_result"]
                parts.append(types.Part(function_response=types.FunctionResponse(
                    name=tr["name"], response=tr.get("content") or {})))
        out.append(types.Content(role=role, parts=parts))
    return out


# ─────────────────────────────── Bedrock (Converse) ──────────────────────────

def _lower_types(node: Any) -> Any:
    """Recursively lowercase Gemini's UPPERCASE JSON-schema type names
    (OBJECT/STRING/ARRAY/INTEGER/NUMBER/BOOLEAN) to JSON Schema's lowercase."""
    if isinstance(node, dict):
        return {k: (v.lower() if k == "type" and isinstance(v, str) else _lower_types(v))
                for k, v in node.items()}
    if isinstance(node, list):
        return [_lower_types(x) for x in node]
    return node


def to_bedrock_messages(messages: list[dict]) -> list[dict]:
    """Neutral messages → Bedrock Converse `messages`. A message with no content
    blocks is dropped (Converse rejects empty content)."""
    out = []
    for m in messages:
        content = []
        for p in m.get("parts", []):
            if "text" in p:
                if p["text"]:
                    content.append({"text": p["text"]})
            elif "tool_call" in p:
                tc = p["tool_call"]
                content.append({"toolUse": {
                    "toolUseId": tc["id"], "name": tc["name"], "input": tc.get("args") or {}}})
            elif "tool_result" in p:
                tr = p["tool_result"]
                content.append({"toolResult": {
                    "toolUseId": tr["id"], "content": [{"json": tr.get("content") or {}}]}})
        if content:
            out.append({"role": m["role"], "content": content})
    return out


def tools_to_bedrock(declarations: list[dict] | None) -> dict | None:
    """Gemini FunctionDeclaration dicts → Bedrock `toolConfig`."""
    if not declarations:
        return None
    specs = []
    for d in declarations:
        params = d.get("parameters") or {"type": "object", "properties": {}}
        specs.append({"toolSpec": {
            "name": d["name"],
            "description": d.get("description", ""),
            "inputSchema": {"json": _lower_types(params)},
        }})
    return {"tools": specs}
