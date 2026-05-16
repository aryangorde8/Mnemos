/**
 * Creates the Atlas Vector Search index on `chunks.embedding`.
 * Run once after pointing MONGODB_URI at a cluster with vector search enabled.
 *
 *   npx tsx --env-file=.env.local scripts/setup-mongo-index.ts
 */

import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB ?? "mnemos";
const INDEX_NAME = process.env.MONGODB_VECTOR_INDEX ?? "mnemos_vector_index";
const DIMS = Number(process.env.MNEMOS_EMBEDDING_DIMS ?? 768);

if (!URI) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

const definition = {
  name: INDEX_NAME,
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

async function ensureCollection(client: MongoClient): Promise<void> {
  const db = client.db(DB);
  const existing = await db.listCollections({ name: "chunks" }).toArray();
  if (existing.length === 0) {
    await db.createCollection("chunks");
    console.log(`created collection ${DB}.chunks`);
  }
}

async function main(): Promise<void> {
  const client = new MongoClient(URI!, { appName: "mnemos-setup" });
  await client.connect();
  try {
    await ensureCollection(client);
    const chunks = client.db(DB).collection("chunks");

    const indexes = await chunks.listSearchIndexes().toArray();
    const present = indexes.find((i) => i.name === INDEX_NAME);

    if (present) {
      console.log(`vector index "${INDEX_NAME}" already exists (status: ${present.status ?? "?"})`);
      return;
    }
    const name = await chunks.createSearchIndex(definition);
    console.log(`created vector index "${name}" on ${DB}.chunks`);
    console.log("note: Atlas takes ~1–3 minutes to build the index before $vectorSearch returns results.");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
