/**
 * Creates two Atlas Search indexes on `chunks`:
 *   1. Vector index (`mnemos_vector_index`) for $vectorSearch
 *   2. Full-text BM25 index (`mnemos_text_index`) for $search
 *
 * Mnemos uses both — hybrid retrieval (vector + BM25 + RRF + optional rerank).
 * Run once after pointing MONGODB_URI at a cluster with Atlas Search enabled.
 *
 *   npx tsx --env-file=.env.local scripts/setup-mongo-index.ts
 */

import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB ?? "mnemos";
const VECTOR_INDEX = process.env.MONGODB_VECTOR_INDEX ?? "mnemos_vector_index";
const TEXT_INDEX = process.env.MONGODB_TEXT_INDEX ?? "mnemos_text_index";
const DIMS = Number(process.env.MNEMOS_EMBEDDING_DIMS ?? 768);

if (!URI) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

const vectorDefinition = {
  name: VECTOR_INDEX,
  type: "vectorSearch" as const,
  definition: {
    fields: [
      {
        type: "vector",
        path: "embedding",
        numDimensions: DIMS,
        similarity: "cosine",
      },
      { type: "filter", path: "source" },
      { type: "filter", path: "documentId" },
      { type: "filter", path: "metadata.threadId" },
    ],
  },
};

const textDefinition = {
  name: TEXT_INDEX,
  type: "search" as const,
  definition: {
    mappings: {
      dynamic: false,
      fields: {
        text: { type: "string", analyzer: "lucene.english" },
        title: { type: "string", analyzer: "lucene.english" },
        source: { type: "token" },
      },
    },
  },
};

async function ensureCollection(client: MongoClient): Promise<void> {
  const db = client.db(DB);
  const existing = await db.listCollections({ name: "chunks" }).toArray();
  if (existing.length === 0) {
    await db.createCollection("chunks");
    console.log(`created collection ${DB}.chunks`);
  }
}

async function ensureIndex(
  chunks: ReturnType<MongoClient["db"]>["collection"],
  def: { name: string; type: "vectorSearch" | "search"; definition: unknown },
): Promise<void> {
  const indexes = await chunks.listSearchIndexes().toArray();
  const present = indexes.find((i) => i.name === def.name);
  if (present) {
    console.log(`index "${def.name}" already exists (status: ${present.status ?? "?"})`);
    return;
  }
  const name = await chunks.createSearchIndex(def);
  console.log(`created ${def.type} index "${name}" on ${DB}.chunks`);
}

async function main(): Promise<void> {
  const client = new MongoClient(URI!, { appName: "mnemos-setup" });
  await client.connect();
  try {
    await ensureCollection(client);
    const chunks = client.db(DB).collection("chunks");
    await ensureIndex(chunks, vectorDefinition);
    await ensureIndex(chunks, textDefinition);
    console.log("note: Atlas takes ~1–3 minutes to build each index before queries return results.");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
