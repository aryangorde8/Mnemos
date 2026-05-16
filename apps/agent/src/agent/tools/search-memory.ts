import { config } from "../../config.js";
import { embedQuery } from "../../lib/vertex.js";
import { getCollections } from "../../lib/mongo.js";
import { searchViaMcp } from "../../mcp/mongo-mcp-client.js";
import type { Citation, ToolDef } from "../types.js";

export const searchMemoryTool: ToolDef = {
  declaration: {
    name: "search_memory",
    description:
      "Semantic search across Alex's professional memory (emails, calendar, meeting notes, shared docs, slack, personal jots). Use a focused natural-language query. Returns ranked chunks with citations.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "string",
          description: "Focused question or phrase to match against memory.",
        },
        limit: {
          type: "integer",
          description: "Max chunks to return. Default 8, max 20.",
        },
        source: {
          type: "string",
          enum: [
            "email",
            "calendar",
            "meeting_notes",
            "shared_doc",
            "slack",
            "notes",
          ],
          description: "Optional filter to one source kind.",
        },
      },
      required: ["query"],
    },
  },
  handler: async (args) => {
    const query = String(args["query"] ?? "").trim();
    if (!query) return { ok: false, error: "missing query" };
    const limit = clampInt(args["limit"], 8, 1, 20);
    const source = typeof args["source"] === "string" ? (args["source"] as string) : undefined;

    try {
      const vector = await embedQuery(query);
      const mcpResults = await searchViaMcp({
        index: config.MONGODB_VECTOR_INDEX,
        queryVector: vector,
        limit,
        ...(source ? { source } : {}),
      });
      if (mcpResults) return shape(query, mcpResults);

      const { chunks } = await getCollections();
      const pipeline: Record<string, unknown>[] = [
        {
          $vectorSearch: {
            index: config.MONGODB_VECTOR_INDEX,
            path: "embedding",
            queryVector: vector,
            numCandidates: Math.max(100, limit * 10),
            limit,
            ...(source ? { filter: { source } } : {}),
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
            metadata: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ];
      const raw = await chunks.aggregate(pipeline).toArray();
      return shape(query, raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
};

function shape(query: string, raw: Array<Record<string, unknown>>) {
  const citations: Citation[] = raw.map((r) => ({
    chunkId: String(r["_id"] ?? r["chunkId"] ?? ""),
    documentId: String(r["documentId"] ?? ""),
    source: r["source"] as Citation["source"],
    title: String(r["title"] ?? ""),
    score: Number(r["score"] ?? 0),
    ordinal: Number(r["ordinal"] ?? 0),
    text: typeof r["text"] === "string" ? r["text"].slice(0, 300) : undefined,
  }));
  const data = {
    query,
    count: raw.length,
    chunks: raw.map((r) => ({
      chunkId: String(r["_id"] ?? r["chunkId"] ?? ""),
      title: r["title"],
      source: r["source"],
      score: r["score"],
      ordinal: r["ordinal"],
      text: r["text"],
      metadata: r["metadata"],
    })),
  };
  return {
    ok: true,
    data,
    citations,
    summary: `${raw.length} chunks for "${query}"`,
  };
}

function clampInt(raw: unknown, dflt: number, lo: number, hi: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
