import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongo.js";

export type ActionKind = "draft_email" | "schedule_meeting";
export type ActionStatus = "proposed" | "approved" | "rejected" | "sent";

export interface DraftEmailProposal {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  intent: string;
}

export interface ScheduleMeetingProposal {
  title: string;
  attendees: string[];
  proposedTimes: string[];
  durationMinutes: number;
  location: string | null;
  agenda: string | null;
}

export type ProposalData = DraftEmailProposal | ScheduleMeetingProposal;

export interface ActionRecord<P extends ProposalData = ProposalData> {
  _id?: ObjectId;
  kind: ActionKind;
  status: ActionStatus;
  proposal: P;
  final?: P;
  reason?: string;
  query?: string;
  runId?: string;
  origin: "agent" | "manual";
  model?: string;
  createdAt: Date;
  decidedAt?: Date;
}

export async function actionsCol(): Promise<Collection<ActionRecord>> {
  const db = await getDb();
  return db.collection<ActionRecord>("actions");
}

export interface RecordOptions {
  kind: ActionKind;
  proposal: ProposalData;
  query?: string;
  runId?: string;
  model?: string;
}

export async function recordAction(opts: RecordOptions): Promise<string> {
  const col = await actionsCol();
  const doc: ActionRecord = {
    kind: opts.kind,
    status: "proposed",
    proposal: opts.proposal,
    origin: "agent",
    createdAt: new Date(),
    ...(opts.query ? { query: opts.query } : {}),
    ...(opts.runId ? { runId: opts.runId } : {}),
    ...(opts.model ? { model: opts.model } : {}),
  };
  const ins = await col.insertOne(doc);
  return ins.insertedId.toString();
}

export async function getAction(id: string): Promise<ActionRecord | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await actionsCol();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function listActions(opts: {
  status?: ActionStatus;
  kind?: ActionKind;
  limit?: number;
}): Promise<ActionRecord[]> {
  const col = await actionsCol();
  const filter: Record<string, unknown> = {};
  if (opts.status) filter["status"] = opts.status;
  if (opts.kind) filter["kind"] = opts.kind;
  return col
    .find(filter, { limit: opts.limit ?? 50, sort: { createdAt: -1 } })
    .toArray();
}

export async function approveAction(
  id: string,
  edits?: Partial<ProposalData>,
): Promise<ActionRecord | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await actionsCol();
  const existing = await col.findOne({ _id: new ObjectId(id) });
  if (!existing) return null;
  if (existing.status !== "proposed") return existing;

  const final = (edits ? { ...existing.proposal, ...edits } : existing.proposal) as ProposalData;
  await col.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: "sent",
        final,
        decidedAt: new Date(),
      },
    },
  );
  return col.findOne({ _id: new ObjectId(id) });
}

export async function rejectAction(
  id: string,
  reason?: string,
): Promise<ActionRecord | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await actionsCol();
  const existing = await col.findOne({ _id: new ObjectId(id) });
  if (!existing) return null;
  if (existing.status !== "proposed") return existing;

  await col.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: "rejected",
        ...(reason ? { reason } : {}),
        decidedAt: new Date(),
      },
    },
  );
  return col.findOne({ _id: new ObjectId(id) });
}

export function publicAction(a: ActionRecord): Record<string, unknown> {
  return {
    id: a._id?.toString() ?? "",
    kind: a.kind,
    status: a.status,
    proposal: a.proposal,
    final: a.final ?? null,
    reason: a.reason ?? null,
    query: a.query ?? null,
    runId: a.runId ?? null,
    origin: a.origin,
    model: a.model ?? null,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    decidedAt:
      a.decidedAt instanceof Date
        ? a.decidedAt.toISOString()
        : a.decidedAt ?? null,
  };
}
