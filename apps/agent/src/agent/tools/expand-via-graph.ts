import { entitiesCol, relationsCol, entityKey } from "../../lib/graph.js";
import { getCollections } from "../../lib/mongo.js";
import { ObjectId } from "mongodb";
import type { Citation, ToolDef } from "../types.js";

/**
 * Graph-augmented retrieval.
 *
 * Given an entity name (or a list of them), walk the memory graph:
 *   1. Resolve each name → entity record (people / projects / topics).
 *   2. For depth ≥ 1, collect neighbours via the `relations` collection.
 *   3. Pull every chunkId referenced by the entity-set.
 *   4. Hydrate to full chunks and return as citations.
 *
 * This complements `search_memory` — that finds chunks that *look like* your
 * query; this finds chunks that are *about the same people* even when the
 * wording is different. Combine them for true graph-RAG.
 */
export const expandViaGraphTool: ToolDef = {
  declaration: {
    name: "expand_via_graph",
    description:
      "Walk the memory graph to fetch chunks connected to a specific person, project, or topic — even chunks that don't share keywords with the original query. Use this AFTER search_memory when you've found a key entity and want to pull in everything else they're connected to. Returns chunks plus the path of entities traversed.",
    parameters: {
      type: "OBJECT",
      properties: {
        entity: {
          type: "string",
          description: "Canonical name of the seed entity (e.g. 'Sarah Okafor', 'Lantern', 'Q3 planning'). Case-insensitive.",
        },
        entities: {
          type: "array",
          items: { type: "string" },
          description: "Optional: multiple seed entities to expand from in parallel.",
        },
        depth: {
          type: "integer",
          description: "Hops to traverse along relations. 1 = seed + immediate neighbours. 2 = also neighbours-of-neighbours. Default 1, max 2.",
        },
        kinds: {
          type: "array",
          items: { type: "string", enum: ["owes", "works_with", "manages", "discusses"] },
          description: "Optional: restrict traversal to specific relation kinds.",
        },
        limit: {
          type: "integer",
          description: "Max chunks to return. Default 12, max 30.",
        },
      },
    },
  },
  handler: async (args) => {
    const seeds: string[] = [];
    if (typeof args["entity"] === "string" && args["entity"].trim()) {
      seeds.push(args["entity"].trim());
    }
    if (Array.isArray(args["entities"])) {
      for (const e of args["entities"]) {
        if (typeof e === "string" && e.trim()) seeds.push(e.trim());
      }
    }
    if (seeds.length === 0) {
      return { ok: false, error: "at least one entity name is required" };
    }
    const depth = clampInt(args["depth"], 1, 1, 2);
    const limit = clampInt(args["limit"], 12, 1, 30);
    const kinds: Array<"owes" | "works_with" | "manages" | "discusses"> | null =
      Array.isArray(args["kinds"]) && args["kinds"].length > 0
        ? args["kinds"].filter(
            (k): k is "owes" | "works_with" | "manages" | "discusses" =>
              k === "owes" || k === "works_with" || k === "manages" || k === "discusses",
          )
        : null;

    try {
      const ents = await entitiesCol();
      const rels = await relationsCol();

      // Resolve seed names → entity records (case-insensitive contains match).
      const seedKeys = new Set<string>();
      const seedEntities: Array<{ key: string; name: string; kind: string }> = [];
      for (const s of seeds) {
        const direct = entityKey(s);
        // Try exact key match first, then partial name match.
        const exact = await ents.findOne({ key: direct });
        if (exact) {
          seedKeys.add(exact.key);
          seedEntities.push({ key: exact.key, name: exact.name, kind: exact.kind });
          continue;
        }
        const fuzzy = await ents.findOne({ name: { $regex: s, $options: "i" } });
        if (fuzzy) {
          seedKeys.add(fuzzy.key);
          seedEntities.push({ key: fuzzy.key, name: fuzzy.name, kind: fuzzy.kind });
        }
      }

      if (seedEntities.length === 0) {
        return {
          ok: true,
          data: { resolved: [], chunks: [], traversed: [], chunksFound: 0 },
          summary: `no entities matched: ${seeds.join(", ")}`,
        };
      }

      // BFS traversal across the relations graph.
      const visited = new Set<string>(seedKeys);
      const traversedRels: Array<{ from: string; to: string; kind: string }> = [];
      let frontier = Array.from(seedKeys);

      for (let d = 0; d < depth; d++) {
        if (frontier.length === 0) break;
        const relFilter: Record<string, unknown> = {
          $or: [{ from: { $in: frontier } }, { to: { $in: frontier } }],
        };
        if (kinds) relFilter["kind"] = { $in: kinds };
        const found = await rels.find(relFilter, { limit: 200 }).toArray();

        const nextFrontier: string[] = [];
        for (const r of found) {
          const other = frontier.includes(r.from) ? r.to : r.from;
          if (!visited.has(other)) {
            visited.add(other);
            nextFrontier.push(other);
          }
          traversedRels.push({ from: r.from, to: r.to, kind: r.kind });
        }
        frontier = nextFrontier;
      }

      // Pull chunkIds referenced by ALL visited entities.
      const allEntities = await ents.find({ key: { $in: Array.from(visited) } }).toArray();
      const chunkIdSet = new Set<string>();
      for (const e of allEntities) {
        for (const cid of e.chunkIds ?? []) chunkIdSet.add(cid);
      }

      // Hydrate to full chunks (with metadata for citations).
      const { chunks: chunksCol } = await getCollections();
      const chunkOids: ObjectId[] = [];
      for (const cid of chunkIdSet) {
        if (ObjectId.isValid(cid)) chunkOids.push(new ObjectId(cid));
      }
      const chunks = chunkOids.length > 0
        ? await chunksCol
            .find(
              { _id: { $in: chunkOids } },
              {
                projection: {
                  _id: 1,
                  documentId: 1,
                  source: 1,
                  title: 1,
                  text: 1,
                  ordinal: 1,
                  metadata: 1,
                },
                limit,
              },
            )
            .toArray()
        : [];

      const citations: Citation[] = chunks.map((c) => ({
        chunkId: String(c._id),
        documentId: String(c.documentId),
        source: c.source as Citation["source"],
        title: String(c.title),
        score: 1, // graph-fetched, no relevance score
        ordinal: Number(c.ordinal ?? 0),
        text: typeof c.text === "string" ? c.text.slice(0, 300) : undefined,
      }));

      const data = {
        resolved: seedEntities,
        traversed: allEntities.map((e) => ({ name: e.name, kind: e.kind, key: e.key })),
        relations: traversedRels.slice(0, 50),
        chunksFound: chunkIdSet.size,
        chunks: chunks.map((c) => ({
          chunkId: String(c._id),
          title: c.title,
          source: c.source,
          ordinal: c.ordinal,
          text: c.text,
          metadata: c.metadata,
        })),
      };

      return {
        ok: true,
        data,
        citations,
        summary: `graph expand · ${seedEntities.length} seed → ${allEntities.length} entities · depth ${depth} · ${chunks.length}/${chunkIdSet.size} chunks`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
};

function clampInt(raw: unknown, dflt: number, lo: number, hi: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
