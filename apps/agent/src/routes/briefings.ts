import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import {
  getBriefing,
  listBriefings,
  publicBriefing,
} from "../lib/briefings.js";
import { runBriefing } from "../agent/briefing.js";

export const briefingsRouter: Router = createRouter();

briefingsRouter.get("/briefings", async (_req: Request, res: Response) => {
  try {
    const records = await listBriefings(30);
    return res.json({
      count: records.length,
      briefings: records.map(publicBriefing),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "list_failed", detail: msg });
  }
});

briefingsRouter.get("/briefings/:id", async (req: Request, res: Response) => {
  const raw = req.params["id"];
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!id) return res.status(400).json({ error: "missing_id" });
  try {
    const b = await getBriefing(id);
    if (!b) return res.status(404).json({ error: "not_found" });
    return res.json(publicBriefing(b));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "get_failed", detail: msg });
  }
});

const generateSchema = z.object({
  event_id: z.string().min(1).optional(),
  event_title: z.string().min(1).optional(),
});

briefingsRouter.post("/briefings/generate", async (req: Request, res: Response) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", detail: parsed.error.flatten() });
  }
  if (!parsed.data.event_id && !parsed.data.event_title) {
    return res.status(400).json({ error: "missing_event" });
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(": connected\n\n");

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);

  let closed = false;
  res.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
  });

  const write = (event: string, payload: unknown) => {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const opts: { eventId?: string; eventTitle?: string } = {};
    if (parsed.data.event_id) opts.eventId = parsed.data.event_id;
    if (parsed.data.event_title) opts.eventTitle = parsed.data.event_title;
    for await (const ev of runBriefing(opts)) {
      if (closed) break;
      write(ev.kind, ev);
      if (ev.kind === "done" || ev.kind === "error") break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    write("error", { kind: "error", message: msg, at: Date.now() });
  } finally {
    clearInterval(heartbeat);
    if (!closed) res.end();
  }
});
