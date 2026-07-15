"""Unit tests for the provider-neutral LLM message/tool converters.

Pure translation — no cloud calls — so this runs anywhere. Executable directly
(`python tests/test_llm_neutral.py`) or under pytest.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.llm.neutral import (  # noqa: E402
    _lower_types, to_bedrock_messages, to_gemini_contents, tools_to_bedrock,
)

_MESSAGES = [
    {"role": "user", "parts": [{"text": "draft a decline to Marcus"}]},
    {"role": "assistant", "parts": [
        {"text": "I'll search first."},
        {"tool_call": {"id": "tu_1", "name": "search_memory", "args": {"query": "Marcus"}}},
    ]},
    {"role": "user", "parts": [
        {"tool_result": {"id": "tu_1", "name": "search_memory", "content": {"ok": True, "summary": "3 hits"}}},
    ]},
]

_DECLS = [{
    "name": "schedule_meeting",
    "description": "Propose a meeting.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "title": {"type": "STRING"},
            "attendees": {"type": "ARRAY", "items": {"type": "STRING"}},
            "duration_minutes": {"type": "INTEGER"},
        },
        "required": ["title", "attendees"],
    },
}]


def test_bedrock_messages_shape():
    out = to_bedrock_messages(_MESSAGES)
    assert out[0] == {"role": "user", "content": [{"text": "draft a decline to Marcus"}]}
    # assistant text + toolUse
    assert out[1]["role"] == "assistant"
    assert out[1]["content"][0] == {"text": "I'll search first."}
    assert out[1]["content"][1] == {
        "toolUse": {"toolUseId": "tu_1", "name": "search_memory", "input": {"query": "Marcus"}}}
    # tool result → toolResult with matching id, wrapped in a json block
    assert out[2]["content"][0] == {
        "toolResult": {"toolUseId": "tu_1", "content": [{"json": {"ok": True, "summary": "3 hits"}}]}}


def test_bedrock_drops_empty_and_blank_text():
    msgs = [{"role": "assistant", "parts": [{"text": ""}]}]  # no real content
    assert to_bedrock_messages(msgs) == []  # empty message is dropped


def test_tools_lowercase_types():
    cfg = tools_to_bedrock(_DECLS)
    spec = cfg["tools"][0]["toolSpec"]
    assert spec["name"] == "schedule_meeting"
    schema = spec["inputSchema"]["json"]
    assert schema["type"] == "object"
    assert schema["properties"]["title"]["type"] == "string"
    assert schema["properties"]["attendees"]["type"] == "array"
    assert schema["properties"]["attendees"]["items"]["type"] == "string"
    assert schema["properties"]["duration_minutes"]["type"] == "integer"
    assert schema["required"] == ["title", "attendees"]


def test_tools_none():
    assert tools_to_bedrock(None) is None
    assert tools_to_bedrock([]) is None


def test_lower_types_is_recursive_and_pure():
    src = {"type": "OBJECT", "nested": {"type": "STRING"}, "keep": "OBJECT"}
    out = _lower_types(src)
    assert out == {"type": "object", "nested": {"type": "string"}, "keep": "OBJECT"}
    assert src["type"] == "OBJECT"  # original untouched


def test_gemini_contents_roundtrip():
    contents = to_gemini_contents(_MESSAGES)
    assert contents[0].role == "user"
    assert contents[0].parts[0].text == "draft a decline to Marcus"
    # assistant → "model" role; second part is a function_call
    assert contents[1].role == "model"
    assert contents[1].parts[1].function_call.name == "search_memory"
    # tool result → function_response
    assert contents[2].parts[0].function_response.name == "search_memory"


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  ok  {fn.__name__}")
    print(f"\n{len(fns)} tests passed")
