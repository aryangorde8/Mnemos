import { getCollections } from "../../lib/mongo.js";
import type { ToolDef } from "../types.js";

export const getCalendarEventsTool: ToolDef = {
  declaration: {
    name: "get_calendar_events",
    description:
      "Return Alex's calendar events within a date window. Use to check availability, find a specific meeting, or list what's on the calendar this week. Times are interpreted in UTC.",
    parameters: {
      type: "OBJECT",
      properties: {
        from: {
          type: "string",
          description: "ISO date (inclusive). Default: today.",
        },
        to: {
          type: "string",
          description: "ISO date (inclusive). Default: from + 7 days.",
        },
        title_contains: {
          type: "string",
          description: "Optional case-insensitive substring filter on event title.",
        },
      },
    },
  },
  handler: async (args) => {
    try {
      const { documents } = await getCollections();
      const fromIso = typeof args["from"] === "string" ? args["from"] : new Date().toISOString();
      const toIso =
        typeof args["to"] === "string"
          ? args["to"]
          : new Date(new Date(fromIso).getTime() + 7 * 86400_000).toISOString();
      const title = typeof args["title_contains"] === "string" ? args["title_contains"] : "";

      const filter: Record<string, unknown> = { source: "calendar" };
      const dateClauses: Record<string, unknown>[] = [
        { "metadata.eventTime": { $gte: fromIso, $lte: toIso } },
        { "metadata.date": { $gte: fromIso, $lte: toIso } },
      ];
      filter["$or"] = dateClauses;
      if (title) filter["title"] = { $regex: title, $options: "i" };

      const events = await documents
        .find(filter, {
          projection: {
            _id: 1,
            title: 1,
            body: 1,
            "metadata.eventTime": 1,
            "metadata.date": 1,
            "metadata.attendees": 1,
            "metadata.eventLocation": 1,
            "metadata.organizer": 1,
            "metadata.threadId": 1,
          },
          limit: 50,
          sort: { "metadata.eventTime": 1, "metadata.date": 1 },
        })
        .toArray();

      return {
        ok: true,
        data: {
          from: fromIso,
          to: toIso,
          count: events.length,
          events: events.map((e) => ({
            id: String(e._id),
            title: e.title,
            when: e.metadata?.["eventTime"] ?? e.metadata?.["date"],
            location: e.metadata?.["eventLocation"] ?? null,
            attendees: e.metadata?.["attendees"] ?? [],
            organizer: e.metadata?.["organizer"] ?? null,
            agendaExcerpt: typeof e.body === "string" ? e.body.slice(0, 240) : null,
          })),
        },
        summary: `${events.length} events in window`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
};
