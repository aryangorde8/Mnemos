import { embedQuery } from "../../lib/vertex.js";
import { config } from "../../config.js";
import { getCollections } from "../../lib/mongo.js";
import type { Citation, ToolDef } from "../types.js";

export const getBriefingContextTool: ToolDef = {
  declaration: {
    name: "get_briefing_context",
    description:
      "Compose context for a 1-pager briefing on a calendar event: attendees, open threads with them, outstanding commitments, and recent artifacts referenced. Use the event title or id.",
    parameters: {
      type: "OBJECT",
      properties: {
        event_title: {
          type: "string",
          description: "Title of the calendar event. Case-insensitive substring match is used.",
        },
        event_id: {
          type: "string",
          description: "Optional Mongo _id of the calendar event document.",
        },
      },
    },
  },
  handler: async (args) => {
    try {
      const { documents, chunks } = await getCollections();
      const eventTitle =
        typeof args["event_title"] === "string" ? args["event_title"].trim() : "";
      if (!eventTitle && !args["event_id"]) {
        return { ok: false, error: "either event_title or event_id is required" };
      }

      const event = eventTitle
        ? await documents.findOne({
            source: "calendar",
            title: { $regex: eventTitle, $options: "i" },
          })
        : null;
      if (!event) {
        return {
          ok: false,
          error: `no calendar event matching "${eventTitle}"`,
        };
      }

      const attendees = (event.metadata?.["attendees"] as string[]) ?? [];
      const threadId = event.metadata?.["threadId"] as string | undefined;

      const vector = await embedQuery(
        `${event.title}\n\n${typeof event.body === "string" ? event.body : ""}`,
      );
      const related = await chunks
        .aggregate<Record<string, unknown>>([
          {
            $vectorSearch: {
              index: config.MONGODB_VECTOR_INDEX,
              path: "embedding",
              queryVector: vector,
              numCandidates: 200,
              limit: 8,
            },
          },
          {
            $project: {
              _id: 1,
              documentId: 1,
              source: 1,
              title: 1,
              text: 1,
              ordinal: 1,
              score: { $meta: "vectorSearchScore" },
              metadata: 1,
            },
          },
        ])
        .toArray();

      const commitmentChunks = await chunks
        .find(
          threadId
            ? { "metadata.threadId": threadId }
            : {
                text: {
                  $regex:
                    "(owe|owed|will deliver|by Friday|by Mon|by Tue|by Wed|by Thu|by EOD|by next|committed|promised)",
                  $options: "i",
                },
              },
          { limit: 12, projection: { _id: 1, title: 1, source: 1, text: 1, metadata: 1 } },
        )
        .toArray();

      const citations: Citation[] = related.map((r) => ({
        chunkId: String(r["_id"]),
        documentId: String(r["documentId"]),
        source: r["source"] as Citation["source"],
        title: String(r["title"]),
        score: Number(r["score"] ?? 0),
        ordinal: Number(r["ordinal"] ?? 0),
      }));

      return {
        ok: true,
        data: {
          event: {
            id: String(event._id),
            title: event.title,
            when: event.metadata?.["eventTime"] ?? event.metadata?.["date"],
            location: event.metadata?.["eventLocation"] ?? null,
            organizer: event.metadata?.["organizer"] ?? null,
            attendees,
            agendaExcerpt: typeof event.body === "string" ? event.body.slice(0, 360) : null,
          },
          related: related.map((r) => ({
            chunkId: String(r["_id"]),
            title: r["title"],
            source: r["source"],
            score: r["score"],
            text: typeof r["text"] === "string" ? (r["text"] as string).slice(0, 280) : null,
          })),
          commitmentLeads: commitmentChunks.map((c) => ({
            chunkId: String(c._id),
            title: c.title,
            source: c.source,
            excerpt: typeof c.text === "string" ? c.text.slice(0, 280) : null,
          })),
        },
        citations,
        summary: `briefing pulled for "${event.title}" — ${related.length} related, ${commitmentChunks.length} commitment leads`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
};
