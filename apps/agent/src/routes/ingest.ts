import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { chunk as chunkText } from "../ingest/chunker.js";
import { embedBatch } from "../ingest/embedder.js";
import { getCollections, ObjectId, type MnemosChunk, type MnemosDocument, type SourceKind } from "../lib/mongo.js";

const SOURCES: readonly SourceKind[] = [
  "email",
  "calendar",
  "meeting_notes",
  "shared_doc",
  "slack",
  "notes",
];

const ingestSchema = z.object({
  source: z.enum(SOURCES as readonly [SourceKind, ...SourceKind[]]),
  title: z.string().min(1),
  body: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ingestRouter: Router = createRouter();

ingestRouter.post("/ingest", async (req: Request, res: Response) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", detail: parsed.error.flatten() });
  }
  const { source, title, body, metadata = {} } = parsed.data;

  const chunks = chunkText(body);
  if (chunks.length === 0) {
    return res.status(400).json({ error: "empty_body" });
  }

  try {
    const { documents, chunks: chunksCol } = await getCollections();

    const doc: MnemosDocument = {
      source,
      title,
      body,
      metadata,
      createdAt: new Date(),
    };
    const ins = await documents.insertOne(doc);
    const documentId = ins.insertedId;

    const vectors = await embedBatch(chunks.map((c) => c.text));

    const chunkDocs: MnemosChunk[] = chunks.map((c, i) => {
      const vec = vectors[i];
      if (!vec) throw new Error(`missing embedding at ordinal ${i}`);
      return {
        documentId,
        source,
        title,
        text: c.text,
        ordinal: c.ordinal,
        embedding: vec,
        metadata,
        createdAt: new Date(),
      };
    });
    await chunksCol.insertMany(chunkDocs);

    return res.json({
      documentId: documentId.toString(),
      source,
      chunks: chunkDocs.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "ingest_failed", detail: msg });
  }
});

ingestRouter.get("/ingest/stats", async (_req: Request, res: Response) => {
  try {
    const { documents, chunks: chunksCol } = await getCollections();
    const [docCount, chunkCount, bySource] = await Promise.all([
      documents.countDocuments({}),
      chunksCol.countDocuments({}),
      documents
        .aggregate([{ $group: { _id: "$source", count: { $sum: 1 } } }])
        .toArray(),
    ]);
    return res.json({
      documents: docCount,
      chunks: chunkCount,
      sources: bySource.map((s) => ({ source: s._id, count: s.count })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "stats_failed", detail: msg });
  }
});

// SSE demo-corpus loader: reads scripts/fixtures/alex-data.json, ingests each doc
ingestRouter.post("/ingest/demo", async (req: Request, res: Response) => {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../../../../scripts/fixtures/alex-data.json"),
    resolve(process.cwd(), "scripts/fixtures/alex-data.json"),
    resolve(process.cwd(), "../../scripts/fixtures/alex-data.json"),
  ];

  let raw: string | null = null;
  for (const p of candidates) {
    try { raw = await readFile(p, "utf8"); break; } catch { /* try next */ }
  }
  if (!raw) {
    return res.status(404).json({ error: "fixture_not_found", detail: "Run scripts/seed-alex-data.ts first to generate scripts/fixtures/alex-data.json" });
  }

  type DocSeed = { source: SourceKind; title: string; body: string; metadata?: Record<string, unknown> };
  let docs: DocSeed[];
  try {
    docs = JSON.parse(raw) as DocSeed[];
  } catch {
    return res.status(400).json({ error: "fixture_invalid_json" });
  }
  if (!Array.isArray(docs) || docs.length === 0) {
    return res.status(400).json({ error: "fixture_empty", detail: "The fixture file exists but has no documents. Run the seed script with --load to generate data." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sse = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const total = docs.length;
  sse({ type: "start", total });

  let ok = 0;
  let fail = 0;

  for (const [i, doc] of docs.entries()) {
    if (res.writableEnded) break;
    try {
      const parsed = ingestSchema.safeParse(doc);
      if (!parsed.success) { fail++; continue; }
      const { source, title, body, metadata = {} } = parsed.data;
      const chunks = chunkText(body);
      if (chunks.length === 0) { fail++; continue; }
      const { documents, chunks: chunksCol } = await getCollections();
      const mdoc: MnemosDocument = { source, title, body, metadata, createdAt: new Date() };
      const ins = await documents.insertOne(mdoc);
      const vectors = await embedBatch(chunks.map((c) => c.text));
      const chunkDocs: MnemosChunk[] = chunks.map((c, j) => {
        const vec = vectors[j];
        if (!vec) throw new Error(`missing embedding at ${j}`);
        return { documentId: ins.insertedId, source, title, text: c.text, ordinal: c.ordinal, embedding: vec, metadata, createdAt: new Date() };
      });
      await chunksCol.insertMany(chunkDocs);
      ok++;
      sse({ type: "progress", index: i + 1, total, ok, fail, title });
    } catch (err) {
      fail++;
      sse({ type: "progress", index: i + 1, total, ok, fail, error: err instanceof Error ? err.message : String(err) });
    }
  }

  sse({ type: "done", total, ok, fail });
  res.end();
});

export { ObjectId };
