import { getCollections } from "../../lib/mongo.js";
import { listCommitmentRecords, publicCommitment } from "../../lib/commitments.js";
import type { ToolDef } from "../types.js";

export const listCommitmentsTool: ToolDef = {
  declaration: {
    name: "list_commitments",
    description:
      "List open commitments — promises Alex made (outgoing) or that others made to Alex (incoming). Use this for the commitment ledger, or when a question asks 'what do I owe X' / 'who owes me'.",
    parameters: {
      type: "OBJECT",
      properties: {
        direction: {
          type: "string",
          enum: ["incoming", "outgoing", "all"],
          description: "Filter to commitments owed TO Alex (incoming), owed BY Alex (outgoing), or all.",
        },
        actor: {
          type: "string",
          description: "Optional case-insensitive substring match on the other party's name.",
        },
        limit: {
          type: "integer",
          description: "Max commitments to return. Default 12, max 50.",
        },
      },
    },
  },
  handler: async (args) => {
    try {
      const direction =
        typeof args["direction"] === "string"
          ? (args["direction"] as "incoming" | "outgoing" | "all")
          : "all";
      const actor = typeof args["actor"] === "string" ? args["actor"].trim() : "";
      const limit = clampInt(args["limit"], 12, 1, 50);

      // ── Primary path: the persisted, LLM-extracted ledger. ──
      const records = await listCommitmentRecords({
        direction,
        ...(actor ? { actor } : {}),
        status: "open",
        limit,
      });
      if (records.length > 0) {
        return {
          ok: true,
          data: {
            direction,
            actor: actor || null,
            count: records.length,
            source: "ledger",
            commitments: records.map(publicCommitment),
          },
          summary: `${records.length} ${direction === "all" ? "" : direction + " "}commitments${actor ? ` involving ${actor}` : ""} · ledger`,
        };
      }

      // ── Fallback: regex heuristic over chunk text (used when the ledger
      // hasn't been built yet, so the demo still shows something). ──
      const { chunks } = await getCollections();
      const commitmentRegex =
        "(owe[ds]?|owed|will deliver|by Friday|by Mon|by Tue|by Wed|by Thu|by EOD|by next|committed to|promised|action item|owner:|due\\s)";
      const filter: Record<string, unknown> = {
        text: { $regex: commitmentRegex, $options: "i" },
      };
      if (actor) {
        filter["text"] = {
          $regex: `${commitmentRegex}.*${escapeRegex(actor)}|${escapeRegex(actor)}.*${commitmentRegex}`,
          $options: "is",
        };
      }

      const raw = await chunks
        .find(filter, {
          projection: { _id: 1, title: 1, source: 1, text: 1, metadata: 1 },
          limit: limit * 3,
        })
        .toArray();

      const inferred = raw.map((c) => ({
        chunkId: String(c._id),
        title: c.title,
        source: c.source,
        excerpt: typeof c.text === "string" ? trimToCommitment(c.text) : null,
        date: (c.metadata?.["date"] as string | undefined) ?? null,
        thread: (c.metadata?.["threadId"] as string | undefined) ?? null,
        direction: classifyDirection(typeof c.text === "string" ? c.text : ""),
      }));

      const filtered = inferred.filter((c) => direction === "all" || c.direction === direction).slice(0, limit);

      return {
        ok: true,
        data: {
          direction,
          actor: actor || null,
          count: filtered.length,
          commitments: filtered,
        },
        summary: `${filtered.length} ${direction === "all" ? "" : direction + " "}commitments${actor ? ` involving ${actor}` : ""}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
};

function classifyDirection(text: string): "incoming" | "outgoing" | "unknown" {
  const lower = text.toLowerCase();
  if (/\b(alex (will|to|owes|is delivering|to send|to ship|to deliver))\b/.test(lower)) {
    return "outgoing";
  }
  if (/\b(owes alex|to alex|will send alex|will deliver to alex|alex is waiting|alex expects)\b/.test(lower)) {
    return "incoming";
  }
  if (/\bi (will|owe|to)\b/.test(lower)) return "outgoing";
  return "unknown";
}

function trimToCommitment(text: string): string {
  const idx = text.search(
    /(owe|owed|will deliver|by Friday|by Mon|by Tue|by Wed|by Thu|by EOD|by next|committed|promised|action item|owner:|due\s)/i,
  );
  const start = idx >= 0 ? Math.max(0, idx - 60) : 0;
  return text.slice(start, start + 280).trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampInt(raw: unknown, dflt: number, lo: number, hi: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
