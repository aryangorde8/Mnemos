import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import { listCommitmentsTool } from "../agent/tools/list-commitments.js";
import { getCalendarEventsTool } from "../agent/tools/get-calendar-events.js";

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
