import type { ToolDef } from "../types.js";
import { searchMemoryTool } from "./search-memory.js";
import { getCalendarEventsTool } from "./get-calendar-events.js";
import { getBriefingContextTool } from "./get-briefing-context.js";
import { draftEmailTool } from "./draft-email.js";
import { listCommitmentsTool } from "./list-commitments.js";
import { scheduleMeetingTool } from "./schedule-meeting.js";
import { critiqueDraftTool } from "./critique-draft.js";
import { expandViaGraphTool } from "./expand-via-graph.js";

export const TOOLS: ToolDef[] = [
  searchMemoryTool,
  expandViaGraphTool,
  getCalendarEventsTool,
  getBriefingContextTool,
  draftEmailTool,
  listCommitmentsTool,
  scheduleMeetingTool,
  critiqueDraftTool,
];

export const TOOL_REGISTRY: Map<string, ToolDef> = new Map(
  TOOLS.map((t) => [t.declaration.name, t]),
);
