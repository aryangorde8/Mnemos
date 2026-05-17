import { ObjectId } from "mongodb";
import { generate } from "../lib/vertex.js";
import { getCollections } from "../lib/mongo.js";
import {
  clearGraph,
  entityKey,
  insertRelation,
  upsertEntity,
  type EntityKind,
  type RelationRecord,
} from "../lib/graph.js";

export type GraphEvent =
  | { kind: "start"; totalChunks: number; at: number }
  | { kind: "batch"; index: number; total: number; chunksInBatch: number; entitiesFound: number; relationsFound: number; at: number }
  | { kind: "done"; totalEntities: number; totalRelations: number; totalMs: number; at: number }
  | { kind: "error"; message: string; at: number };

const SYSTEM = `You extract a structured memory graph from a senior PM's corpus (emails, calendar, meeting notes, shared docs, slack, personal jots).

For each batch of chunks, return STRICT JSON — no markdown, no preamble — with this exact shape:

{
  "entities": [
    {
      "name": "Sarah Okafor",
      "kind": "person" | "project" | "topic",
      "role": "Director of Eng, Lantern team",
      "chunkIds": ["..."]
    }
  ],
  "relations": [
    {
      "from": "Alex Chen",
      "to": "Sarah Okafor",
      "kind": "owes" | "works_with" | "manages" | "discusses",
      "evidence": "verbatim phrase from the chunk",
      "chunkId": "..."
    }
  ]
}

Rules:
- Only extract entities that appear with a clear name (proper noun). Skip pronouns, anaphoric refs, vague descriptors.
- "person" = a named human. "project" = a named product / initiative / workstream. "topic" = a named theme that recurs across multiple chunks (rare — be conservative).
- Use canonical full names (e.g. "Sarah Okafor" not "Sarah", unless the chunk only says "Sarah").
- "role" should be ONE short clause derived from the chunks — what the entity is or does. Skip if unclear.
- "owes" relations require a concrete commitment: "X will deliver Y by Z", "X promised Y", "AC: X to follow up on Y".
- "works_with" is for collaboration ties evidenced by joint meetings / cc / co-authored docs.
- "manages" is reporting lines.
- "discusses" is the weakest tie — use only when stronger types don't fit.
- chunkIds in entities = list of chunkIds from THIS batch where the entity appears.
- chunkId in relations = single chunkId where the evidence lives.
- Do NOT hallucinate. If a chunk doesn't have a clear entity or relation, leave it out.
- Output JSON only. First character must be '{'.`;

interface ExtractInput {
  chunkId: string;
  source: string;
  title: string;
  date?: string;
  text: string;
}

interface ExtractResponse {
  entities?: Array<{
    name?: unknown;
    kind?: unknown;
    role?: unknown;
    chunkIds?: unknown;
  }>;
  relations?: Array<{
    from?: unknown;
    to?: unknown;
    kind?: unknown;
    evidence?: unknown;
    chunkId?: unknown;
  }>;
}

const BATCH_SIZE = 12;
const RELEVANT_SOURCES = new Set(["email", "calendar", "meeting_notes", "shared_doc", "slack", "notes"]);

export async function* runGraphExtraction({ rebuild }: { rebuild: boolean }): AsyncGenerator<GraphEvent, void, unknown> {
  const startedAt = Date.now();

  try {
    if (rebuild) await clearGraph();

    const { chunks } = await getCollections();
    const filter = { source: { $in: Array.from(RELEVANT_SOURCES) as unknown as ["email"] } };
    const all = await chunks
      .find(filter, {
        projection: {
          _id: 1,
          source: 1,
          title: 1,
          text: 1,
          "metadata.date": 1,
          "metadata.eventTime": 1,
        },
        sort: { "metadata.date": 1, "metadata.eventTime": 1 },
      })
      .toArray();

    const inputs: ExtractInput[] = all.map((c) => ({
      chunkId: String(c._id),
      source: String(c.source),
      title: String(c.title),
      text: typeof c["text"] === "string" ? (c["text"] as string) : "",
      date:
        typeof c["metadata"] === "object" && c["metadata"]
          ? (((c["metadata"] as Record<string, unknown>)["date"] as string | undefined) ??
            ((c["metadata"] as Record<string, unknown>)["eventTime"] as string | undefined))
          : undefined,
    }));

    yield { kind: "start", totalChunks: inputs.length, at: Date.now() };

    // Accumulator: collapse duplicate entities across batches and update aggregate fields.
    const entityAgg = new Map<
      string,
      {
        name: string;
        kind: EntityKind;
        role: string | undefined;
        chunkIds: Set<string>;
        dates: string[];
      }
    >();

    let totalRelations = 0;
    const batches: ExtractInput[][] = [];
    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      batches.push(inputs.slice(i, i + BATCH_SIZE));
    }

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b]!;
      const prompt = buildBatchPrompt(batch);

      const r = await generate({
        system: SYSTEM,
        prompt,
        temperature: 0.1,
        maxTokens: 8192,  // Gemini 3 consumes thinking tokens regardless of budget — leave headroom for entity-dense batches
        responseMimeType: "application/json",
        thinkingBudget: 0,
      });

      let parsed: ExtractResponse = {};
      try {
        const text = r.text.trim();
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start >= 0 && end > start) {
          parsed = JSON.parse(text.slice(start, end + 1)) as ExtractResponse;
        }
      } catch {
        // batch skipped on parse failure
      }

      const ents = Array.isArray(parsed.entities) ? parsed.entities : [];
      const rels = Array.isArray(parsed.relations) ? parsed.relations : [];

      let entsAdded = 0;
      for (const e of ents) {
        const name = typeof e.name === "string" ? e.name.trim() : "";
        if (!name) continue;
        const kind =
          e.kind === "person" || e.kind === "project" || e.kind === "topic"
            ? e.kind
            : null;
        if (!kind) continue;
        const role = typeof e.role === "string" ? e.role.trim() : undefined;
        const chunkIds = Array.isArray(e.chunkIds)
          ? e.chunkIds.filter((c): c is string => typeof c === "string")
          : [];
        const key = entityKey(name);
        if (!key) continue;
        entsAdded++;
        const dates: string[] = chunkIds
          .map((cid) => batch.find((bi) => bi.chunkId === cid)?.date)
          .filter((d): d is string => typeof d === "string");
        const existing = entityAgg.get(key + "::" + kind);
        if (existing) {
          for (const cid of chunkIds) existing.chunkIds.add(cid);
          existing.dates.push(...dates);
          // prefer a longer / more specific role
          if (role && (!existing.role || role.length > existing.role.length)) {
            existing.role = role;
          }
        } else {
          entityAgg.set(key + "::" + kind, {
            name,
            kind,
            role,
            chunkIds: new Set(chunkIds),
            dates,
          });
        }
      }

      let relsAdded = 0;
      for (const rel of rels) {
        const from = typeof rel.from === "string" ? rel.from.trim() : "";
        const to = typeof rel.to === "string" ? rel.to.trim() : "";
        const kind = (rel.kind === "owes" || rel.kind === "works_with" || rel.kind === "manages" || rel.kind === "discusses")
          ? rel.kind as RelationRecord["kind"]
          : null;
        const evidence = typeof rel.evidence === "string" ? rel.evidence.trim() : "";
        const chunkIdStr = typeof rel.chunkId === "string" ? rel.chunkId : "";
        if (!from || !to || !kind || !evidence) continue;
        const fromKey = entityKey(from);
        const toKey = entityKey(to);
        if (!fromKey || !toKey || fromKey === toKey) continue;
        const date = chunkIdStr ? batch.find((bi) => bi.chunkId === chunkIdStr)?.date : undefined;
        try {
          await insertRelation({
            from: fromKey,
            to: toKey,
            kind,
            evidence,
            ...(chunkIdStr ? { chunkId: chunkIdStr } : {}),
            ...(date ? { date } : {}),
          });
          relsAdded++;
        } catch {
          // best-effort
        }
      }
      totalRelations += relsAdded;

      yield {
        kind: "batch",
        index: b + 1,
        total: batches.length,
        chunksInBatch: batch.length,
        entitiesFound: entsAdded,
        relationsFound: relsAdded,
        at: Date.now(),
      };
    }

    // Flush accumulated entities to Mongo. Build sparkline series along the way.
    for (const e of entityAgg.values()) {
      const sorted = e.dates
        .map((d) => isoDay(d))
        .filter((d): d is string => !!d)
        .sort();
      const seriesMap = new Map<string, number>();
      for (const d of sorted) seriesMap.set(d, (seriesMap.get(d) ?? 0) + 1);
      const series = Array.from(seriesMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
      const firstSeen = sorted[0];
      const lastSeen = sorted[sorted.length - 1];

      try {
        await upsertEntity({
          name: e.name,
          key: entityKey(e.name),
          kind: e.kind,
          role: e.role,
          mentions: e.chunkIds.size,
          ...(firstSeen ? { firstSeen } : {}),
          ...(lastSeen ? { lastSeen } : {}),
          chunkIds: Array.from(e.chunkIds),
          series,
        });
      } catch {
        // best-effort
      }
    }

    yield {
      kind: "done",
      totalEntities: entityAgg.size,
      totalRelations,
      totalMs: Date.now() - startedAt,
      at: Date.now(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { kind: "error", message: msg, at: Date.now() };
  }
}

function buildBatchPrompt(batch: ExtractInput[]): string {
  const body = batch
    .map((c) => `--- chunkId: ${c.chunkId} | ${c.source} | ${c.title} ${c.date ? "| " + c.date : ""} ---\n${c.text}`)
    .join("\n\n");
  return `Extract entities and relations from these ${batch.length} chunks. Return JSON only.\n\n${body}`;
}

function isoDay(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// avoid unused import warning when ObjectId isn't referenced elsewhere
void ObjectId;
