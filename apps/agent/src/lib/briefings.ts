import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongo.js";

export interface BriefingRecord {
  _id?: ObjectId;
  eventId: ObjectId;
  eventTitle: string;
  eventWhen: string | null;
  eventLocation: string | null;
  attendees: string[];
  markdown: string;
  contextSummary?: string | null;
  citations?: Array<{
    chunkId: string;
    documentId: string;
    source: string;
    title: string;
    score: number;
    ordinal: number;
  }>;
  model?: string;
  createdAt: Date;
}

export async function briefingsCol(): Promise<Collection<BriefingRecord>> {
  const db = await getDb();
  return db.collection<BriefingRecord>("briefings");
}

export async function saveBriefing(rec: Omit<BriefingRecord, "_id">): Promise<string> {
  const col = await briefingsCol();
  const res = await col.insertOne({ ...rec });
  return res.insertedId.toString();
}

export async function getBriefing(id: string): Promise<BriefingRecord | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await briefingsCol();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function listBriefings(limit = 30): Promise<BriefingRecord[]> {
  const col = await briefingsCol();
  return col
    .find({}, { limit, sort: { createdAt: -1 } })
    .toArray();
}

export async function findBriefingByEvent(eventId: string): Promise<BriefingRecord | null> {
  if (!ObjectId.isValid(eventId)) return null;
  const col = await briefingsCol();
  return col.findOne(
    { eventId: new ObjectId(eventId) },
    { sort: { createdAt: -1 } },
  );
}

export function publicBriefing(b: BriefingRecord): Record<string, unknown> {
  return {
    id: b._id?.toString() ?? "",
    eventId: b.eventId.toString(),
    eventTitle: b.eventTitle,
    eventWhen: b.eventWhen,
    eventLocation: b.eventLocation,
    attendees: b.attendees,
    markdown: b.markdown,
    contextSummary: b.contextSummary ?? null,
    citations: b.citations ?? [],
    model: b.model ?? null,
    createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
  };
}
