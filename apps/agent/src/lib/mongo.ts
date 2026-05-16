import { MongoClient, type Collection, type Db, ObjectId } from "mongodb";
import { config, isMongoConfigured } from "../config.js";

export type SourceKind =
  | "email"
  | "calendar"
  | "meeting_notes"
  | "shared_doc"
  | "slack"
  | "notes";

export interface MnemosDocument {
  _id?: ObjectId;
  source: SourceKind;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface MnemosChunk {
  _id?: ObjectId;
  documentId: ObjectId;
  source: SourceKind;
  title: string;
  text: string;
  ordinal: number;
  embedding: number[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

let clientPromise: Promise<MongoClient> | null = null;

export function getMongoClient(): Promise<MongoClient> {
  if (!isMongoConfigured()) {
    return Promise.reject(
      new Error("MONGODB_URI is not configured — set it in .env.local"),
    );
  }
  if (!clientPromise) {
    const client = new MongoClient(config.MONGODB_URI, {
      appName: "mnemos-agent",
    });
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(config.MONGODB_DB);
}

export async function getCollections(): Promise<{
  documents: Collection<MnemosDocument>;
  chunks: Collection<MnemosChunk>;
}> {
  const db = await getDb();
  return {
    documents: db.collection<MnemosDocument>("documents"),
    chunks: db.collection<MnemosChunk>("chunks"),
  };
}

export { ObjectId };
