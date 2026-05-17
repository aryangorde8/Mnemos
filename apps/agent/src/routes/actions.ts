import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import {
  approveAction,
  getAction,
  listActions,
  publicAction,
  rejectAction,
  type ActionKind,
  type ActionStatus,
  type ProposalData,
} from "../lib/actions.js";
import { getCritique, getCritiqueByAction, publicCritique } from "../lib/critique.js";

export const actionsRouter: Router = createRouter();

const listQuery = z.object({
  status: z.enum(["proposed", "approved", "rejected", "sent"]).optional(),
  kind: z.enum(["draft_email", "schedule_meeting"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

actionsRouter.get("/actions", async (req: Request, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_query", detail: parsed.error.flatten() });
  }
  try {
    const opts: { status?: ActionStatus; kind?: ActionKind; limit?: number } = {};
    if (parsed.data.status) opts.status = parsed.data.status;
    if (parsed.data.kind) opts.kind = parsed.data.kind;
    if (parsed.data.limit !== undefined) opts.limit = parsed.data.limit;
    const records = await listActions(opts);
    return res.json({
      count: records.length,
      actions: records.map(publicAction),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "list_failed", detail: msg });
  }
});

actionsRouter.get("/actions/:id", async (req: Request, res: Response) => {
  const raw = req.params["id"];
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!id) return res.status(400).json({ error: "missing_id" });
  try {
    const a = await getAction(id);
    if (!a) return res.status(404).json({ error: "not_found" });
    return res.json(publicAction(a));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "get_failed", detail: msg });
  }
});

const approveBody = z.object({
  edits: z.record(z.string(), z.unknown()).optional(),
});

actionsRouter.post("/actions/:id/approve", async (req: Request, res: Response) => {
  const raw = req.params["id"];
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!id) return res.status(400).json({ error: "missing_id" });
  const parsed = approveBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", detail: parsed.error.flatten() });
  }
  try {
    const a = await approveAction(
      id,
      parsed.data.edits as Partial<ProposalData> | undefined,
    );
    if (!a) return res.status(404).json({ error: "not_found" });
    return res.json(publicAction(a));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "approve_failed", detail: msg });
  }
});

const rejectBody = z.object({
  reason: z.string().max(500).optional(),
});

actionsRouter.get("/actions/:id/critique", async (req: Request, res: Response) => {
  const raw = req.params["id"];
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!id) return res.status(400).json({ error: "missing_id" });
  try {
    const c = await getCritiqueByAction(id);
    if (!c) return res.status(404).json({ error: "no_critique" });
    return res.json(publicCritique(c));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "critique_lookup_failed", detail: msg });
  }
});

actionsRouter.get("/critiques/:id", async (req: Request, res: Response) => {
  const raw = req.params["id"];
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!id) return res.status(400).json({ error: "missing_id" });
  try {
    const c = await getCritique(id);
    if (!c) return res.status(404).json({ error: "not_found" });
    return res.json(publicCritique(c));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "get_failed", detail: msg });
  }
});

actionsRouter.post("/actions/:id/reject", async (req: Request, res: Response) => {
  const raw = req.params["id"];
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!id) return res.status(400).json({ error: "missing_id" });
  const parsed = rejectBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", detail: parsed.error.flatten() });
  }
  try {
    const a = await rejectAction(id, parsed.data.reason);
    if (!a) return res.status(404).json({ error: "not_found" });
    return res.json(publicAction(a));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "reject_failed", detail: msg });
  }
});
