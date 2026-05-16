import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { embedQuery } from "../lib/vertex.js";
import { getCollections } from "../lib/mongo.js";

const searchSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(50).optional(),
  source: z
    .enum(["email", "calendar", "meeting_notes", "shared_doc", "slack", "notes"])
    .optional(),
});

export const searchRouter: Router = createRouter();

searchRouter.post("/search", async (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", detail: parsed.error.flatten() });
  }
  const { query, limit = 10, source } = parsed.data;

  try {
    const vector = await embedQuery(query);
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

    const t0 = performance.now();
    const results = await chunks.aggregate(pipeline).toArray();
    const tookMs = Math.round(performance.now() - t0);

    return res.json({
      query,
      tookMs,
      count: results.length,
      results: results.map((r) => ({
        chunkId: String(r._id),
        documentId: String(r.documentId),
        source: r.source,
        title: r.title,
        text: r.text,
        ordinal: r.ordinal,
        score: r.score,
        metadata: r.metadata ?? {},
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "search_failed", detail: msg });
  }
});
