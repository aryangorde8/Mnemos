import { generate } from "../lib/vertex.js";
import { getCollections } from "../lib/mongo.js";
import {
  clearCommitments,
  isAlex,
  upsertCommitment,
  type CommitmentStatus,
} from "../lib/commitments.js";

export type CommitmentEvent =
  | { kind: "start"; totalChunks: number; at: number }
  | { kind: "batch"; index: number; total: number; chunksInBatch: number; commitmentsFound: number; at: number }
  | { kind: "done"; totalCommitments: number; totalMs: number; at: number }
  | { kind: "error"; message: string; at: number };

const SYSTEM = `You extract OPEN COMMITMENTS from a senior PM (Alex Chen)'s corpus — emails, calendar, meeting notes, shared docs, slack, personal jots.

A commitment is a CONCRETE promise that someone will do something: "X will deliver Y by Z", "X promised Y", "AC: X to follow up on Y", "owner: X — due Friday". Vague intentions ("we should sync sometime") are NOT commitments.

For each batch of chunks, return STRICT JSON — no markdown, no preamble — with this exact shape:

{
  "commitments": [
    {
      "owedBy": "Alex Chen",
      "owedTo": "Sarah Okafor",
      "summary": "deliver the Q3 planning doc",
      "dueDate": "2026-05-20",
      "status": "open",
      "evidence": "verbatim phrase from the chunk that proves the commitment",
      "chunkId": "..."
    }
  ]
}

Rules:
- owedBy / owedTo MUST be named people (proper nouns). Use canonical full names where the chunk gives them ("Sarah Okafor" not "Sarah", unless only "Sarah" appears). Alex is "Alex Chen".
- summary: a SHORT verb phrase describing the deliverable — no names, no date. ("send the revised SLO numbers")
- dueDate: ISO date (YYYY-MM-DD) if the chunk states or clearly implies one; otherwise null.
- status: "done" only if the chunk explicitly shows it was completed; otherwise "open".
- evidence: a verbatim excerpt (≤160 chars) from the chunk.
- chunkId: the chunkId of the chunk the evidence came from (from the batch).
- Do NOT hallucinate. If a chunk has no concrete commitment, leave it out. An empty list is fine.
- Output JSON only. The first character must be '{'.`;

interface ExtractInput {
  chunkId: string;
  source: string;
  title: string;
  date?: string;
  text: string;
}

interface ExtractResponse {
  commitments?: Array<{
    owedBy?: unknown;
    owedTo?: unknown;
    summary?: unknown;
    dueDate?: unknown;
    status?: unknown;
    evidence?: unknown;
    chunkId?: unknown;
  }>;
}

const BATCH_SIZE = 12;
const RELEVANT_SOURCES = new Set(["email", "calendar", "meeting_notes", "shared_doc", "slack", "notes"]);

export async function* runCommitmentExtraction({
  rebuild,
}: {
  rebuild: boolean;
}): AsyncGenerator<CommitmentEvent, void, unknown> {
  const startedAt = Date.now();
  try {
    if (rebuild) await clearCommitments();

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

    const batches: ExtractInput[][] = [];
    for (let i = 0; i < inputs.length; i += BATCH_SIZE) batches.push(inputs.slice(i, i + BATCH_SIZE));

    let totalCommitments = 0;
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b]!;
      const prompt = buildBatchPrompt(batch);

      const r = await generate({
        system: SYSTEM,
        prompt,
        temperature: 0.1,
        maxTokens: 8192, // Gemini 3 consumes thinking tokens regardless of budget — leave headroom
        responseMimeType: "application/json",
        thinkingBudget: 0,
      });

      let parsed: ExtractResponse = {};
      try {
        const text = r.text.trim();
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start >= 0 && end > start) parsed = JSON.parse(text.slice(start, end + 1)) as ExtractResponse;
      } catch {
        // batch skipped on parse failure
      }

      const list = Array.isArray(parsed.commitments) ? parsed.commitments : [];
      let added = 0;
      for (const c of list) {
        const owedBy = typeof c.owedBy === "string" ? c.owedBy.trim() : "";
        const owedTo = typeof c.owedTo === "string" ? c.owedTo.trim() : "";
        const summary = typeof c.summary === "string" ? c.summary.trim() : "";
        const evidence = typeof c.evidence === "string" ? c.evidence.trim().slice(0, 200) : "";
        if (!owedBy || !owedTo || !summary || !evidence) continue;

        const dueDate = typeof c.dueDate === "string" && /\d{4}-\d{2}-\d{2}/.test(c.dueDate) ? c.dueDate.slice(0, 10) : undefined;
        const status: CommitmentStatus = c.status === "done" ? "done" : "open";
        const chunkId = typeof c.chunkId === "string" ? c.chunkId : "";
        const sourceMeta = chunkId ? batch.find((bi) => bi.chunkId === chunkId) : undefined;
        // direction is relative to Alex: Alex owes => outgoing, else incoming.
        const direction = isAlex(owedBy) ? "outgoing" : "incoming";

        try {
          await upsertCommitment({
            direction,
            owedBy,
            owedTo,
            summary,
            ...(dueDate ? { dueDate } : {}),
            status,
            evidence,
            ...(chunkId ? { sourceChunkId: chunkId } : {}),
            ...(sourceMeta?.title ? { sourceTitle: sourceMeta.title } : {}),
            ...(sourceMeta?.source ? { source: sourceMeta.source } : {}),
            ...(sourceMeta?.date ? { date: sourceMeta.date } : {}),
          });
          added++;
        } catch {
          // best-effort
        }
      }
      totalCommitments += added;

      yield {
        kind: "batch",
        index: b + 1,
        total: batches.length,
        chunksInBatch: batch.length,
        commitmentsFound: added,
        at: Date.now(),
      };
    }

    yield { kind: "done", totalCommitments, totalMs: Date.now() - startedAt, at: Date.now() };
  } catch (err) {
    yield { kind: "error", message: err instanceof Error ? err.message : String(err), at: Date.now() };
  }
}

function buildBatchPrompt(batch: ExtractInput[]): string {
  const body = batch
    .map((c) => `--- chunkId: ${c.chunkId} | ${c.source} | ${c.title} ${c.date ? "| " + c.date : ""} ---\n${c.text}`)
    .join("\n\n");
  return `Extract open commitments from these ${batch.length} chunks. Return JSON only.\n\n${body}`;
}
