import { recordAction } from "../../lib/actions.js";
import { getCollections } from "../../lib/mongo.js";
import { getBusyIntervals, isCalendarConnected } from "../../lib/calendar.js";
import type { ToolDef } from "../types.js";

export const scheduleMeetingTool: ToolDef = {
  declaration: {
    name: "schedule_meeting",
    description:
      "Propose a meeting and persist the proposal for user approval. Checks the calendar for conflicts in each proposed time window (the live Google Calendar when connected, otherwise the Mongo-backed demo calendar) and surfaces them per slot. The proposal is NOT booked until the user approves — on approval a real Google Calendar event is created when connected.",
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
          description: "ISO datetimes in priority order. The first conflict-free slot will be marked preferred.",
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

      // ── Conflict detection ──
      // Pull every calendar event that could overlap ANY of the proposed times,
      // then per-slot check whether the [start, end) window intersects an event.
      const connected = await isCalendarConnected();
      const slotChecks = await Promise.all(
        proposedTimes.map((iso) => evaluateSlot(iso, durationMinutes, connected)),
      );

      const conflictCount = slotChecks.filter((s) => s.conflicts.length > 0).length;
      const conflictFreeCount = slotChecks.length - conflictCount;
      const preferredIdx = slotChecks.findIndex((s) => s.conflicts.length === 0);

      const proposal = {
        title,
        attendees,
        proposedTimes,
        durationMinutes,
        location,
        agenda,
        slots: slotChecks,
        preferredIdx,
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

      const verdict =
        conflictFreeCount === 0
          ? "all slots conflict — user must pick or rebook"
          : preferredIdx === 0
            ? "preferred slot is free"
            : `preferred slot conflicts; ${conflictFreeCount} alternate(s) free`;

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
          slots: slotChecks,
          preferredIdx,
          conflictCount,
          conflictFreeCount,
          status: "proposed",
          requiresApproval: true,
        },
        summary: `proposed "${title}" · ${proposedTimes.length} slot${proposedTimes.length === 1 ? "" : "s"} · ${verdict}${actionId ? " · awaiting approval" : ""}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
};

interface SlotEvaluation {
  start: string;            // ISO start of proposed slot
  end: string;              // ISO end of proposed slot
  conflicts: Array<{
    id: string;
    title: string;
    when: string;
    location: string | null;
  }>;
  free: boolean;
}

async function evaluateSlot(
  startIso: string,
  durationMinutes: number,
  connected: boolean,
): Promise<SlotEvaluation> {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    return {
      start: startIso,
      end: startIso,
      conflicts: [],
      free: false,
    };
  }
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const startMs = start.getTime();
  const endMs = end.getTime();

  // ── Primary path: live Google Calendar free/busy. ──
  if (connected) {
    try {
      const busy = await getBusyIntervals(start.toISOString(), end.toISOString());
      const conflicts: SlotEvaluation["conflicts"] = [];
      for (const b of busy) {
        const bStart = new Date(b.start).getTime();
        const bEnd = new Date(b.end).getTime();
        if (Number.isNaN(bStart) || Number.isNaN(bEnd)) continue;
        if (bEnd <= startMs || bStart >= endMs) continue;
        conflicts.push({ id: "busy", title: "Busy (calendar)", when: b.start, location: null });
      }
      return { start: start.toISOString(), end: end.toISOString(), conflicts, free: conflicts.length === 0 };
    } catch {
      // fall through to the Mongo-backed simulation on any API error
    }
  }

  try {
    const { documents } = await getCollections();
    // Pull a generous window: any calendar event whose start is within ±4 hours of the slot.
    // (Events in the corpus don't carry their own duration; we treat each as a 60-min block.)
    const fromIso = new Date(startMs - 4 * 3600_000).toISOString();
    const toIso = new Date(endMs + 4 * 3600_000).toISOString();
    const candidates = await documents
      .find(
        {
          source: "calendar",
          $or: [
            { "metadata.eventTime": { $gte: fromIso, $lte: toIso } },
            { "metadata.date": { $gte: fromIso, $lte: toIso } },
          ],
        },
        {
          projection: {
            _id: 1,
            title: 1,
            "metadata.eventTime": 1,
            "metadata.date": 1,
            "metadata.eventLocation": 1,
          },
          limit: 100,
        },
      )
      .toArray();

    const conflicts: SlotEvaluation["conflicts"] = [];
    for (const ev of candidates) {
      const evTimeStr =
        (typeof ev["metadata"] === "object" && ev["metadata"]
          ? ((ev["metadata"] as Record<string, unknown>)["eventTime"] as string | undefined) ??
            ((ev["metadata"] as Record<string, unknown>)["date"] as string | undefined)
          : undefined) ?? null;
      if (!evTimeStr) continue;
      const evStart = new Date(evTimeStr).getTime();
      if (Number.isNaN(evStart)) continue;
      const evEnd = evStart + 60 * 60_000; // assume 60-min block
      // overlap if not strictly before or after
      if (evEnd <= startMs || evStart >= endMs) continue;
      const loc =
        typeof ev["metadata"] === "object" && ev["metadata"]
          ? (((ev["metadata"] as Record<string, unknown>)["eventLocation"] as string | undefined) ?? null)
          : null;
      conflicts.push({
        id: String(ev._id),
        title: String(ev["title"] ?? "untitled"),
        when: evTimeStr,
        location: loc,
      });
    }

    return {
      start: start.toISOString(),
      end: end.toISOString(),
      conflicts,
      free: conflicts.length === 0,
    };
  } catch {
    // If calendar query fails (e.g. no DB), surface the slot as "unverified free"
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      conflicts: [],
      free: true,
    };
  }
}

function clampInt(raw: unknown, dflt: number, lo: number, hi: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
