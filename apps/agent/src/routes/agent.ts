import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import { runAgent } from "../agent/react-loop.js";

const askSchema = z.object({
  query: z.string().min(1).max(4000),
  maxTurns: z.number().int().min(1).max(12).optional(),
});

export const agentRouter: Router = createRouter();

agentRouter.post("/agent/ask", async (req: Request, res: Response) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "invalid_body", detail: parsed.error.flatten() });
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
    for await (const ev of runAgent({
      query: parsed.data.query,
      ...(parsed.data.maxTurns ? { maxTurns: parsed.data.maxTurns } : {}),
    })) {
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
