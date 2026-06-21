"""Agent types — port of apps/agent/src/agent/types.ts."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

# A tool result: {"ok": bool, "data"?: dict, "error"?: str, "citations"?: list, "summary"?: str}
ToolResult = dict[str, Any]
ToolHandler = Callable[[dict, "dict | None"], Awaitable[ToolResult]]


@dataclass
class ToolDef:
    declaration: dict  # {"name", "description", "parameters": {"type":"OBJECT", "properties", "required"}}
    handler: ToolHandler

    @property
    def name(self) -> str:
        return self.declaration["name"]
