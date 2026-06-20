import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import { listCommitmentsTool } from "../agent/tools/list-commitments.js";
import { getCalendarEventsTool } from "../agent/tools/get-calendar-events.js";
import { runCommitmentExtraction } from "../agent/extract-commitments.js";
import { countCommitments, setCommitmentStatus } from "../lib/commitments.js";

export const commitmentsRouter: Router = createRouter();

const commitmentQuery = z.object({
  direction: z.enum(["incoming", "outgoing", "all"]).optional(),
  actor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

commitmentsRouter.get("/commitments", async (req: Request, res: Response) => {
  const parsed = commitmentQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_query", detail: parsed.error.flatten() });
  }
  const args: Record<string, unknown> = {};
  if (parsed.data.direction) args["direction"] = parsed.data.direction;
  if (parsed.data.actor) args["actor"] = parsed.data.actor;
  if (parsed.data.limit !== undefined) args["limit"] = parsed.data.limit;

  const result = await listCommitmentsTool.handler(args);
  if (!result.ok) {
    return res.status(500).json({ error: "list_failed", detail: result.error });
  }
  return res.json({
    summary: result.summary,
    ...(result.data ?? {}),
  });
});

// POST /commitments/extract — (re)build the persisted ledger from the corpus,
// streaming progress as SSE. ?rebuild=1 or { rebuild: true } clears first.
commitmentsRouter.post("/commitments/extract", async (req: Request, res: Response) => {
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
    for await (const ev of runCommitmentExtraction({ rebuild })) {
      if (closed) break;
      sse(ev.kind, ev as unknown as Record<string, unknown>);
    }
  } catch (err) {
    sse("error", { message: err instanceof Error ? err.message : String(err), at: Date.now() });
  } finally {
    if (!closed) res.end();
  }
});

// GET /commitments/stats — quick count, so the UI can show whether the ledger
// has been built.
commitmentsRouter.get("/commitments/stats", async (_req: Request, res: Response) => {
  try {
    return res.json({ count: await countCommitments() });
  } catch (err) {
    return res.status(500).json({ error: "stats_failed", detail: err instanceof Error ? err.message : String(err) });
  }
});

// POST /commitments/:id/status — mark a commitment done/open.
const statusBody = z.object({ status: z.enum(["open", "done"]) });
commitmentsRouter.post("/commitments/:id/status", async (req: Request, res: Response) => {
  const parsed = statusBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", detail: parsed.error.flatten() });
  }
  const id = String(req.params["id"] ?? "");
  const updated = await setCommitmentStatus(id, parsed.data.status);
  if (!updated) return res.status(404).json({ error: "not_found" });
  return res.json({ ok: true });
});

const eventQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  title_contains: z.string().optional(),
});

commitmentsRouter.get("/calendar/events", async (req: Request, res: Response) => {
  const parsed = eventQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_query", detail: parsed.error.flatten() });
  }
  const args: Record<string, unknown> = {};
  if (parsed.data.from) args["from"] = parsed.data.from;
  if (parsed.data.to) args["to"] = parsed.data.to;
  if (parsed.data.title_contains) args["title_contains"] = parsed.data.title_contains;

  const result = await getCalendarEventsTool.handler(args);
  if (!result.ok) {
    return res.status(500).json({ error: "events_failed", detail: result.error });
  }
  return res.json({
    summary: result.summary,
    ...(result.data ?? {}),
  });
});
