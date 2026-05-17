import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import { searchMemoryTool } from "../agent/tools/search-memory.js";

const searchSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(50).optional(),
  source: z
    .enum(["email", "calendar", "meeting_notes", "shared_doc", "slack", "notes"])
    .optional(),
  rerank: z.boolean().optional(),
});

export const searchRouter: Router = createRouter();

searchRouter.post("/search", async (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", detail: parsed.error.flatten() });
  }
  const { query, limit = 10, source, rerank } = parsed.data;

  const t0 = performance.now();
  const args: Record<string, unknown> = { query, limit };
  if (source) args["source"] = source;
  if (rerank) args["rerank"] = rerank;

  const result = await searchMemoryTool.handler(args);
  if (!result.ok) {
    return res.status(500).json({ error: "search_failed", detail: result.error });
  }
  const data = (result.data ?? {}) as {
    query: string;
    count: number;
    phases?: string[];
    chunks?: Array<{
      chunkId: string;
      title: string;
      source: string;
      score: number;
      ordinal: number;
      text: string;
      metadata?: Record<string, unknown>;
      fromVector?: boolean;
      fromText?: boolean;
    }>;
  };
  const tookMs = Math.round(performance.now() - t0);

  return res.json({
    query,
    tookMs,
    count: data.count ?? 0,
    phases: data.phases ?? [],
    results: (data.chunks ?? []).map((c) => ({
      chunkId: c.chunkId,
      documentId: "", // not currently surfaced by the tool, search UI doesn't need it
      source: c.source,
      title: c.title,
      text: c.text,
      ordinal: c.ordinal,
      score: c.score,
      metadata: c.metadata ?? {},
      fromVector: c.fromVector ?? undefined,
      fromText: c.fromText ?? undefined,
    })),
  });
});
