import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import {
  graphStats,
  listEntities,
  listRelations,
  publicEntity,
  publicRelation,
  type EntityKind,
} from "../lib/graph.js";
import { runGraphExtraction } from "../agent/extract-graph.js";

export const graphRouter: Router = createRouter();

graphRouter.get("/graph", async (_req: Request, res: Response) => {
  try {
    const [stats, people, projects, topics, relations] = await Promise.all([
      graphStats(),
      listEntities({ kind: "person", limit: 60 }),
      listEntities({ kind: "project", limit: 30 }),
      listEntities({ kind: "topic", limit: 30 }),
      listRelations({ limit: 200 }),
    ]);
    return res.json({
      stats,
      entities: {
        person: people.map(publicEntity),
        project: projects.map(publicEntity),
        topic: topics.map(publicEntity),
      },
      relations: relations.map(publicRelation),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "graph_load_failed", detail: msg });
  }
});

graphRouter.get("/graph/stats", async (_req: Request, res: Response) => {
  try {
    return res.json(await graphStats());
  } catch (err) {
    return res.status(500).json({ error: "stats_failed", detail: err instanceof Error ? err.message : String(err) });
  }
});

const entitiesQuery = z.object({
  kind: z.enum(["person", "project", "topic"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

graphRouter.get("/graph/entities", async (req: Request, res: Response) => {
  const parsed = entitiesQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_query", detail: parsed.error.flatten() });
  }
  try {
    const opts: { kind?: EntityKind; limit?: number } = {};
    if (parsed.data.kind) opts.kind = parsed.data.kind;
    if (parsed.data.limit !== undefined) opts.limit = parsed.data.limit;
    const rows = await listEntities(opts);
    return res.json({ count: rows.length, entities: rows.map(publicEntity) });
  } catch (err) {
    return res.status(500).json({ error: "list_failed", detail: err instanceof Error ? err.message : String(err) });
  }
});

graphRouter.post("/graph/extract", async (req: Request, res: Response) => {
  const rebuild = req.body?.rebuild === true || req.query?.["rebuild"] === "1";

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let closed = false;
  res.on("close", () => { closed = true; });

  const sse = (event: string, data: Record<string, unknown>) => {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    for await (const ev of runGraphExtraction({ rebuild })) {
      if (closed) break;
      sse(ev.kind, ev as unknown as Record<string, unknown>);
    }
  } catch (err) {
    sse("error", { message: err instanceof Error ? err.message : String(err), at: Date.now() });
  } finally {
    if (!closed) res.end();
  }
});
