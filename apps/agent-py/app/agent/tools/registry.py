"""Tool registry — port of apps/agent/src/agent/tools/index.ts (same order)."""
from __future__ import annotations

from app.agent.tools.critique_draft import tool as critique_draft_tool
from app.agent.tools.draft_email import tool as draft_email_tool
from app.agent.tools.expand_via_graph import tool as expand_via_graph_tool
from app.agent.tools.get_briefing_context import tool as get_briefing_context_tool
from app.agent.tools.get_calendar_events import tool as get_calendar_events_tool
from app.agent.tools.list_commitments import tool as list_commitments_tool
from app.agent.tools.schedule_meeting import tool as schedule_meeting_tool
from app.agent.tools.search_memory_tool import tool as search_memory_tool
from app.agent.types import ToolDef

TOOLS: list[ToolDef] = [
    search_memory_tool,
    expand_via_graph_tool,
    get_calendar_events_tool,
    get_briefing_context_tool,
    draft_email_tool,
    list_commitments_tool,
    schedule_meeting_tool,
    critique_draft_tool,
]

TOOL_REGISTRY: dict[str, ToolDef] = {t.name: t for t in TOOLS}

DECLARATIONS: list[dict] = [t.declaration for t in TOOLS]
