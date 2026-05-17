import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongo.js";

export type FindingSeverity = "high" | "medium" | "low";

export interface CritiqueFinding {
  severity: FindingSeverity;
  claim: string;          // quoted from the draft
  issue: string;          // what's wrong
  evidence: "supported" | "unsupported" | "contradicted" | "missing";
  citation?: string;      // chunk id or title that informs the verdict
  suggestion?: string;    // concrete revision
}

export interface CritiqueRecord {
  _id?: ObjectId;
  actionId: string;            // string form of ActionRecord._id
  runId?: string;
  query?: string;
  verdict: "approve" | "revise" | "reject";
  summary: string;             // one-sentence overall read
  findings: CritiqueFinding[];
  voice: { score: number; notes: string };  // 0–10 + remarks
  model?: string;
  createdAt: Date;
}

export async function critiquesCol(): Promise<Collection<CritiqueRecord>> {
  const db = await getDb();
  return db.collection<CritiqueRecord>("critiques");
}

export async function saveCritique(rec: Omit<CritiqueRecord, "_id" | "createdAt">): Promise<string> {
  const col = await critiquesCol();
  const doc: CritiqueRecord = { ...rec, createdAt: new Date() };
  const ins = await col.insertOne(doc);
  return ins.insertedId.toString();
}

export async function getCritique(id: string): Promise<CritiqueRecord | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await critiquesCol();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function getCritiqueByAction(actionId: string): Promise<CritiqueRecord | null> {
  const col = await critiquesCol();
  return col.findOne({ actionId }, { sort: { createdAt: -1 } });
}

export function publicCritique(c: CritiqueRecord): Record<string, unknown> {
  return {
    id: c._id?.toString() ?? "",
    actionId: c.actionId,
    runId: c.runId ?? null,
    query: c.query ?? null,
    verdict: c.verdict,
    summary: c.summary,
    findings: c.findings,
    voice: c.voice,
    model: c.model ?? null,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  };
}
