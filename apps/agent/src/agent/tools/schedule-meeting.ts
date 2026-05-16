import { recordAction } from "../../lib/actions.js";
import type { ToolDef } from "../types.js";

export const scheduleMeetingTool: ToolDef = {
  declaration: {
    name: "schedule_meeting",
    description:
      "Propose a meeting and persist the proposal for user approval. This does NOT call Google Calendar — it stores a proposed meeting in Mongo as the source of truth for the demo. The user will approve before anything is sent.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "string", description: "Meeting title." },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "Attendee email addresses (excluding Alex, who is implicit organizer).",
        },
        proposed_times: {
          type: "array",
          items: { type: "string" },
          description: "ISO datetimes in priority order. The first that fits Alex's calendar is preferred.",
        },
        duration_minutes: {
          type: "integer",
          description: "Meeting length in minutes. Default 30.",
        },
        location: {
          type: "string",
          description: "Zoom link or room name. Optional.",
        },
        agenda: {
          type: "string",
          description: "Short agenda — 1–4 bullets joined with '\\n- '.",
        },
      },
      required: ["title", "attendees", "proposed_times"],
    },
  },
  handler: async (args, ctx) => {
    try {
      const title = String(args["title"] ?? "").trim();
      const attendees = Array.isArray(args["attendees"]) ? (args["attendees"] as string[]) : [];
      const proposedTimes = Array.isArray(args["proposed_times"]) ? (args["proposed_times"] as string[]) : [];
      const durationMinutes = clampInt(args["duration_minutes"], 30, 5, 480);
      const location = typeof args["location"] === "string" ? args["location"] : null;
      const agenda = typeof args["agenda"] === "string" ? args["agenda"] : null;

      if (!title || attendees.length === 0 || proposedTimes.length === 0) {
        return { ok: false, error: "title, attendees, and proposed_times are required" };
      }

      const proposal = {
        title,
        attendees,
        proposedTimes,
        durationMinutes,
        location,
        agenda,
      };

      let actionId: string | null = null;
      try {
        actionId = await recordAction({
          kind: "schedule_meeting",
          proposal,
          ...(ctx?.query ? { query: ctx.query } : {}),
          ...(ctx?.runId ? { runId: ctx.runId } : {}),
        });
      } catch {
        // persistence is best-effort
      }

      return {
        ok: true,
        data: {
          actionId,
          title,
          attendees,
          proposedTimes,
          durationMinutes,
          location,
          agenda,
          status: "proposed",
          requiresApproval: true,
        },
        summary: `proposed "${title}" with ${attendees.length} attendees · ${proposedTimes.length} options${actionId ? " · awaiting approval" : ""}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
};

function clampInt(raw: unknown, dflt: number, lo: number, hi: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
