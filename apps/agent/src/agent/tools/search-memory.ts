import { config } from "../../config.js";
import { embedQuery, generate } from "../../lib/vertex.js";
import { getCollections } from "../../lib/mongo.js";
import { searchViaMcp } from "../../mcp/mongo-mcp-client.js";
import type { Citation, ToolDef } from "../types.js";

/**
 * Hybrid retrieval pipeline:
 *   1. $vectorSearch over `chunks.embedding` (semantic, cosine)
 *   2. $search over `chunks.{text,title}` (lexical BM25 via lucene.english)
 *   3. Reciprocal Rank Fusion merges the two ranked lists
 *   4. Optional Gemini rerank pass over the top candidates
 *
 * The agent always gets the same shape back — phases[] explains how the
 * top N was assembled, so the reasoning stream can show the pipeline.
 */
export const searchMemoryTool: ToolDef = {
  declaration: {
    name: "search_memory",
    description:
      "Hybrid retrieval across Alex's professional memory (emails, calendar, meeting notes, shared docs, slack, personal jots). Runs $vectorSearch (semantic) and $search (BM25) in parallel, merges via Reciprocal Rank Fusion, and optionally reranks the top candidates with Gemini for harder queries. Returns ranked chunks with citations.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "string",
          description: "Focused question or phrase to match against memory.",
        },
        limit: {
          type: "integer",
          description: "Max chunks to return. Default 8, max 20.",
        },
        source: {
          type: "string",
          enum: [
            "email",
            "calendar",
            "meeting_notes",
            "shared_doc",
            "slack",
            "notes",
          ],
          description: "Optional filter to one source kind.",
        },
        rerank: {
          type: "boolean",
          description: "Set true to apply a Gemini rerank pass over the top candidates. Use this for ambiguous or multi-faceted queries where ranking quality matters more than latency. Default false.",
        },
      },
      required: ["query"],
    },
  },
  handler: async (args) => {
    const query = String(args["query"] ?? "").trim();
    if (!query) return { ok: false, error: "missing query" };
    const limit = clampInt(args["limit"], 8, 1, 20);
    const source = typeof args["source"] === "string" ? (args["source"] as string) : undefined;
    const wantRerank = args["rerank"] === true;

    try {
      const t0 = Date.now();
      const candidatePool = Math.max(20, limit * 3);

      const [vectorHits, textHits] = await Promise.all([
        runVector(query, candidatePool, source),
        runText(query, candidatePool, source),
      ]);

      const tVector = vectorHits.length;
      const tText = textHits.length;

      const merged = rrfMerge([vectorHits, textHits], 60);

      // Take the top (limit*2 if reranking, else limit) for the next stage.
      const toRerank = wantRerank ? merged.slice(0, Math.min(merged.length, limit * 2)) : merged.slice(0, limit);

      let final = toRerank;
      let reranked = false;
      if (wantRerank && toRerank.length > 1) {
        const reorder = await rerankWithGemini(query, toRerank);
        if (reorder && reorder.length === toRerank.length) {
          final = reorder.slice(0, limit);
          reranked = true;
        } else {
          final = toRerank.slice(0, limit);
        }
      } else if (!wantRerank) {
        final = toRerank.slice(0, limit);
      }

      const tookMs = Date.now() - t0;
      const phases = [
        `vector ${tVector}`,
        `bm25 ${tText}`,
        `rrf → ${merged.length}`,
        reranked ? `rerank · gemini · top ${final.length}` : `top ${final.length}`,
      ];

      return shape(query, final, { phases, tookMs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
};

interface RawHit {
  _id: string;
  documentId: string;
  source: Citation["source"];
  title: string;
  text: string;
  ordinal: number;
  metadata?: Record<string, unknown>;
  score: number;
  // After RRF the `score` becomes the fused score; sources tracked separately.
  fromVector?: boolean;
  fromText?: boolean;
}

async function runVector(
  query: string,
  limit: number,
  source: string | undefined,
): Promise<RawHit[]> {
  const vector = await embedQuery(query);

  // Prefer MCP path when enabled (per architectural commitment).
  const mcpResults = await searchViaMcp({
    index: config.MONGODB_VECTOR_INDEX,
    queryVector: vector,
    limit,
    ...(source ? { source } : {}),
  });
  if (mcpResults) return mcpResults.map(toRawHit);

  const { chunks } = await getCollections();
  const pipeline: Record<string, unknown>[] = [
    {
      $vectorSearch: {
        index: config.MONGODB_VECTOR_INDEX,
        path: "embedding",
        queryVector: vector,
        numCandidates: Math.max(100, limit * 10),
        limit,
        ...(source ? { filter: { source } } : {}),
      },
    },
    {
      $project: {
        _id: 1,
        documentId: 1,
        source: 1,
        title: 1,
        text: 1,
        ordinal: 1,
        metadata: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];
  const raw = await chunks.aggregate(pipeline).toArray();
  return raw.map(toRawHit);
}

async function runText(
  query: string,
  limit: number,
  source: string | undefined,
): Promise<RawHit[]> {
  const { chunks } = await getCollections();
  const must: Record<string, unknown>[] = [
    {
      text: {
        query,
        path: ["text", "title"],
        fuzzy: { maxEdits: 1, prefixLength: 2 },
      },
    },
  ];
  if (source) {
    must.push({ equals: { path: "source", value: source } });
  }
  const pipeline: Record<string, unknown>[] = [
    {
      $search: {
        index: config.MONGODB_TEXT_INDEX,
        compound: { must },
      },
    },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        documentId: 1,
        source: 1,
        title: 1,
        text: 1,
        ordinal: 1,
        metadata: 1,
        score: { $meta: "searchScore" },
      },
    },
  ];
  try {
    const raw = await chunks.aggregate(pipeline).toArray();
    return raw.map(toRawHit);
  } catch (err) {
    // Atlas Search index may not be live yet — degrade silently to vector-only.
    if (err instanceof Error && /index|search/i.test(err.message)) {
      return [];
    }
    throw err;
  }
}

function toRawHit(r: Record<string, unknown>): RawHit {
  return {
    _id: String(r["_id"] ?? r["chunkId"] ?? ""),
    documentId: String(r["documentId"] ?? ""),
    source: r["source"] as Citation["source"],
    title: String(r["title"] ?? ""),
    text: typeof r["text"] === "string" ? (r["text"] as string) : "",
    ordinal: Number(r["ordinal"] ?? 0),
    metadata: (r["metadata"] as Record<string, unknown> | undefined) ?? {},
    score: Number(r["score"] ?? 0),
  };
}

// Reciprocal Rank Fusion — Cormack et al, k=60 by convention.
function rrfMerge(lists: RawHit[][], k: number): RawHit[] {
  const byId = new Map<string, RawHit & { fused: number }>();
  for (let li = 0; li < lists.length; li++) {
    const list = lists[li]!;
    for (let rank = 0; rank < list.length; rank++) {
      const hit = list[rank]!;
      const id = hit._id;
      const contribution = 1 / (k + rank + 1);
      const existing = byId.get(id);
      if (existing) {
        existing.fused += contribution;
        if (li === 0) existing.fromVector = true;
        else existing.fromText = true;
      } else {
        byId.set(id, {
          ...hit,
          fused: contribution,
          fromVector: li === 0,
          fromText: li === 1,
        });
      }
    }
  }
  const arr = Array.from(byId.values()).sort((a, b) => b.fused - a.fused);
  return arr.map((h) => ({ ...h, score: h.fused }));
}

async function rerankWithGemini(
  query: string,
  candidates: RawHit[],
): Promise<RawHit[] | null> {
  if (candidates.length <= 1) return candidates;
  const numbered = candidates.map((c, i) => `[${i}] ${c.title} — ${c.text.slice(0, 280)}`).join("\n\n");
  const prompt = `Query: "${query}"

Rerank these ${candidates.length} retrieved chunks by relevance to the query, best to worst.

Output ONLY a JSON object — no preamble, no markdown, no explanation. The first character of your response must be '{'.

Schema: {"order":[<index>,...]}  — exactly ${candidates.length} integers in [0,${candidates.length - 1}], no duplicates.

Chunks:
${numbered}`;

  try {
    const r = await generate({
      system: "You are a retrieval reranker. Your entire response is a single JSON object — never prose.",
      prompt,
      temperature: 0,
      maxTokens: 2048,  // Gemini 3.x consumes thinking tokens regardless of budget — leave headroom
      responseMimeType: "application/json",
      thinkingBudget: 0,
    });
    const text = r.text.trim();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
    const slice = text.slice(jsonStart, jsonEnd + 1);
    let parsed: { order?: unknown };
    try {
      parsed = JSON.parse(slice) as { order?: unknown };
    } catch {
      return null;
    }
    if (!Array.isArray(parsed.order)) return null;
    const order = parsed.order.filter((n): n is number => typeof n === "number" && n >= 0 && n < candidates.length);
    if (order.length === 0) return null;
    // De-dup and append any missing indices in original order so we don't drop hits.
    const seen = new Set<number>();
    const reordered: RawHit[] = [];
    for (const idx of order) {
      if (seen.has(idx)) continue;
      seen.add(idx);
      reordered.push(candidates[idx]!);
    }
    for (let i = 0; i < candidates.length; i++) {
      if (!seen.has(i)) reordered.push(candidates[i]!);
    }
    return reordered;
  } catch {
    return null;
  }
}

function shape(
  query: string,
  hits: RawHit[],
  meta: { phases: string[]; tookMs: number },
) {
  const citations: Citation[] = hits.map((r) => ({
    chunkId: r._id,
    documentId: r.documentId,
    source: r.source,
    title: r.title,
    score: r.score,
    ordinal: r.ordinal,
    text: r.text.slice(0, 300),
  }));
  const data = {
    query,
    count: hits.length,
    phases: meta.phases,
    tookMs: meta.tookMs,
    chunks: hits.map((r) => ({
      chunkId: r._id,
      title: r.title,
      source: r.source,
      score: r.score,
      ordinal: r.ordinal,
      text: r.text,
      metadata: r.metadata,
      ...(r.fromVector !== undefined ? { fromVector: r.fromVector } : {}),
      ...(r.fromText !== undefined ? { fromText: r.fromText } : {}),
    })),
  };
  return {
    ok: true,
    data,
    citations,
    summary: `hybrid · ${meta.phases.join(" → ")} · ${meta.tookMs}ms`,
  };
}

function clampInt(raw: unknown, dflt: number, lo: number, hi: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
