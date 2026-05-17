import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongo.js";

export type EntityKind = "person" | "project" | "topic";

export interface EntityRecord {
  _id?: ObjectId;
  name: string;             // canonical display name
  key: string;              // lowercased + de-noised key for matching
  kind: EntityKind;
  role?: string;            // one-line description (e.g. "Director of Eng, Lantern team")
  mentions: number;         // count of chunks mentioning this entity
  firstSeen?: string;       // ISO date
  lastSeen?: string;        // ISO date
  chunkIds: string[];       // sample of chunks where mentioned (cap at 12)
  // sparkline series: mentions per day across the corpus window (sorted by date)
  series: Array<{ date: string; count: number }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RelationRecord {
  _id?: ObjectId;
  from: string;             // entity key (owner)
  to: string;               // entity key (recipient)
  kind: "owes" | "works_with" | "manages" | "discusses";
  evidence: string;         // verbatim phrase or short summary
  chunkId?: string;
  date?: string;
  createdAt: Date;
}

export async function entitiesCol(): Promise<Collection<EntityRecord>> {
  const db = await getDb();
  return db.collection<EntityRecord>("entities");
}

export async function relationsCol(): Promise<Collection<RelationRecord>> {
  const db = await getDb();
  return db.collection<RelationRecord>("relations");
}

export async function upsertEntity(rec: Omit<EntityRecord, "_id" | "createdAt" | "updatedAt">): Promise<void> {
  const col = await entitiesCol();
  const now = new Date();
  await col.updateOne(
    { key: rec.key, kind: rec.kind },
    {
      $set: {
        name: rec.name,
        role: rec.role,
        mentions: rec.mentions,
        firstSeen: rec.firstSeen,
        lastSeen: rec.lastSeen,
        chunkIds: rec.chunkIds.slice(0, 12),
        series: rec.series,
        updatedAt: now,
      },
      $setOnInsert: {
        key: rec.key,
        kind: rec.kind,
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

export async function insertRelation(rec: Omit<RelationRecord, "_id" | "createdAt">): Promise<void> {
  const col = await relationsCol();
  // de-dup on (from, to, kind, chunkId)
  const filter: Record<string, unknown> = { from: rec.from, to: rec.to, kind: rec.kind };
  filter["chunkId"] = rec.chunkId ?? { $exists: false };
  await col.updateOne(
    filter,
    { $setOnInsert: { ...rec, createdAt: new Date() } },
    { upsert: true },
  );
}

export async function listEntities(opts: { kind?: EntityKind; limit?: number } = {}): Promise<EntityRecord[]> {
  const col = await entitiesCol();
  const filter: Record<string, unknown> = {};
  if (opts.kind) filter["kind"] = opts.kind;
  return col.find(filter, { limit: opts.limit ?? 200, sort: { mentions: -1 } }).toArray();
}

export async function listRelations(opts: { kind?: RelationRecord["kind"]; limit?: number } = {}): Promise<RelationRecord[]> {
  const col = await relationsCol();
  const filter: Record<string, unknown> = {};
  if (opts.kind) filter["kind"] = opts.kind;
  return col.find(filter, { limit: opts.limit ?? 200, sort: { createdAt: -1 } }).toArray();
}

export async function graphStats(): Promise<{
  entities: { person: number; project: number; topic: number };
  relations: number;
}> {
  const ents = await entitiesCol();
  const rels = await relationsCol();
  const [people, projects, topics, relCount] = await Promise.all([
    ents.countDocuments({ kind: "person" }),
    ents.countDocuments({ kind: "project" }),
    ents.countDocuments({ kind: "topic" }),
    rels.countDocuments({}),
  ]);
  return { entities: { person: people, project: projects, topic: topics }, relations: relCount };
}

export async function clearGraph(): Promise<void> {
  const [ents, rels] = await Promise.all([entitiesCol(), relationsCol()]);
  await Promise.all([ents.deleteMany({}), rels.deleteMany({})]);
}

export function publicEntity(e: EntityRecord): Record<string, unknown> {
  return {
    id: e._id?.toString() ?? "",
    name: e.name,
    key: e.key,
    kind: e.kind,
    role: e.role ?? null,
    mentions: e.mentions,
    firstSeen: e.firstSeen ?? null,
    lastSeen: e.lastSeen ?? null,
    chunkIds: e.chunkIds,
    series: e.series,
  };
}

export function publicRelation(r: RelationRecord): Record<string, unknown> {
  return {
    id: r._id?.toString() ?? "",
    from: r.from,
    to: r.to,
    kind: r.kind,
    evidence: r.evidence,
    chunkId: r.chunkId ?? null,
    date: r.date ?? null,
  };
}

export function entityKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
