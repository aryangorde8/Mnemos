import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongo.js";
import { entityKey } from "./graph.js";

export type CommitmentDirection = "incoming" | "outgoing";
export type CommitmentStatus = "open" | "done";

/**
 * A persisted, structured commitment — a concrete promise extracted from the
 * corpus by the LLM (see agent/extract-commitments.ts), as opposed to the older
 * regex-at-query-time approach. `direction` is relative to Alex:
 *   outgoing = Alex owes someone   ·   incoming = someone owes Alex
 */
export interface CommitmentRecord {
  _id?: ObjectId;
  key: string; // dedup key: owedByKey|owedToKey|summary-slug
  direction: CommitmentDirection;
  owedBy: string; // canonical name of who owes
  owedTo: string; // canonical name of who is owed
  summary: string; // short description of the commitment
  dueDate?: string; // ISO date the thing is due, if stated
  status: CommitmentStatus;
  evidence: string; // verbatim phrase from the chunk
  sourceChunkId?: string;
  sourceTitle?: string;
  source?: string; // source kind (email, meeting_notes, ...)
  date?: string; // when the commitment was made (chunk date)
  createdAt: Date;
  updatedAt: Date;
}

const ALEX_KEYS = new Set(["alex-chen", "alex", "ac"]);

export function isAlex(name: string): boolean {
  return ALEX_KEYS.has(entityKey(name));
}

export function commitmentKey(owedBy: string, owedTo: string, summary: string): string {
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return `${entityKey(owedBy)}|${entityKey(owedTo)}|${slug}`;
}

export async function commitmentsCol(): Promise<Collection<CommitmentRecord>> {
  const db = await getDb();
  return db.collection<CommitmentRecord>("commitments");
}

export async function upsertCommitment(
  rec: Omit<CommitmentRecord, "_id" | "createdAt" | "updatedAt" | "key">,
): Promise<void> {
  const col = await commitmentsCol();
  const key = commitmentKey(rec.owedBy, rec.owedTo, rec.summary);
  const now = new Date();
  await col.updateOne(
    { key },
    {
      $set: {
        direction: rec.direction,
        owedBy: rec.owedBy,
        owedTo: rec.owedTo,
        summary: rec.summary,
        ...(rec.dueDate ? { dueDate: rec.dueDate } : {}),
        status: rec.status,
        evidence: rec.evidence,
        ...(rec.sourceChunkId ? { sourceChunkId: rec.sourceChunkId } : {}),
        ...(rec.sourceTitle ? { sourceTitle: rec.sourceTitle } : {}),
        ...(rec.source ? { source: rec.source } : {}),
        ...(rec.date ? { date: rec.date } : {}),
        updatedAt: now,
      },
      $setOnInsert: { key, createdAt: now },
    },
    { upsert: true },
  );
}

export interface ListCommitmentsOpts {
  direction?: CommitmentDirection | "all";
  actor?: string;
  status?: CommitmentStatus | "all";
  limit?: number;
}

export async function listCommitmentRecords(opts: ListCommitmentsOpts = {}): Promise<CommitmentRecord[]> {
  const col = await commitmentsCol();
  const filter: Record<string, unknown> = {};
  if (opts.direction && opts.direction !== "all") filter["direction"] = opts.direction;
  if (opts.status && opts.status !== "all") filter["status"] = opts.status;
  if (opts.actor) {
    const rx = { $regex: opts.actor, $options: "i" };
    filter["$or"] = [{ owedBy: rx }, { owedTo: rx }];
  }
  return col
    .find(filter, {
      limit: opts.limit ?? 50,
      // open first, then most-recently-made
      sort: { status: 1, dueDate: 1, date: -1 },
    })
    .toArray();
}

export async function countCommitments(): Promise<number> {
  const col = await commitmentsCol();
  return col.countDocuments({});
}

export async function clearCommitments(): Promise<void> {
  const col = await commitmentsCol();
  await col.deleteMany({});
}

export async function setCommitmentStatus(id: string, status: CommitmentStatus): Promise<CommitmentRecord | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await commitmentsCol();
  await col.updateOne({ _id: new ObjectId(id) }, { $set: { status, updatedAt: new Date() } });
  return col.findOne({ _id: new ObjectId(id) });
}

/**
 * Public shape. Kept backward-compatible with the old regex tool output
 * (chunkId/title/source/excerpt/date/thread/direction) so the existing web UI
 * keeps working, while exposing the richer structured fields alongside.
 */
export function publicCommitment(c: CommitmentRecord): Record<string, unknown> {
  return {
    id: c._id?.toString() ?? "",
    chunkId: c.sourceChunkId ?? "",
    title: c.sourceTitle ?? c.summary,
    source: c.source ?? "notes",
    excerpt: c.evidence || c.summary,
    date: c.dueDate ?? c.date ?? null,
    thread: null,
    direction: c.direction,
    // richer structured fields (ignored by older UI code)
    summary: c.summary,
    owedBy: c.owedBy,
    owedTo: c.owedTo,
    dueDate: c.dueDate ?? null,
    status: c.status,
  };
}
