import { generate } from "../../lib/vertex.js";
import { getAction } from "../../lib/actions.js";
import { saveCritique, type CritiqueFinding, type FindingSeverity } from "../../lib/critique.js";
import type { ToolDef } from "../types.js";
import type { DraftEmailProposal } from "../../lib/actions.js";

const CRITIC_SYSTEM = `You are the Critic — an adversarial reviewer for drafts authored by another agent for Alex Chen, a senior PM.

Your only job: catch problems before the user sees the draft. You are NOT writing the email. You are auditing it.

Look for, in this order:
  1. UNSUPPORTED CLAIMS — anything stated as fact that isn't in the cited context. This is the highest-severity issue.
  2. HALLUCINATED PEOPLE / DATES / TICKET IDS / DOLLAR FIGURES — anything specific that didn't come from the context.
  3. VOICE MISMATCH — Alex's voice is lowercase-leaning, terse, em-dash heavy, signs "a.", never uses "circle back" / "touch base" / "hope this finds you well" / "I wanted to reach out".
  4. STRUCTURAL ISSUES — missing the ask, buried the lead, weak open, wrong tone for the relationship.
  5. SAFETY — anything that would be embarrassing to send (commits to deadlines Alex hasn't agreed to, makes promises on behalf of others, leaks confidential figures to the wrong recipient).

Output STRICT JSON in this exact shape — no markdown fences, no prose outside the JSON:

{
  "verdict": "approve" | "revise" | "reject",
  "summary": "one sentence overall read",
  "findings": [
    {
      "severity": "high" | "medium" | "low",
      "claim": "the exact phrase from the draft you're objecting to (quoted, max 120 chars)",
      "issue": "what's wrong with it",
      "evidence": "supported" | "unsupported" | "contradicted" | "missing",
      "citation": "title of the chunk that informs the verdict, or null",
      "suggestion": "concrete revision Alex could paste in, or null"
    }
  ],
  "voice": { "score": 0-10, "notes": "one-sentence read on voice fidelity" }
}

Rules on verdicts:
- "approve" = no high-severity findings; safe to send
- "revise" = one or more medium/high findings the user should see before sending
- "reject" = a safety or factuality issue serious enough that sending would be a mistake

If the draft is genuinely fine, output { "verdict": "approve", "summary": "...", "findings": [], "voice": {...} }.
Do NOT fabricate findings to look thorough. Be honest. Brevity beats padding.`;

export const critiqueDraftTool: ToolDef = {
  declaration: {
    name: "critique_draft",
    description:
      "Run the adversarial Critic agent against a drafted email. Required after every draft_email call — the Critic checks for unsupported claims, hallucinated specifics, voice mismatches, and safety issues. Returns structured findings the user sees alongside the draft.",
    parameters: {
      type: "OBJECT",
      properties: {
        action_id: {
          type: "string",
          description: "The actionId returned by draft_email.",
        },
      },
      required: ["action_id"],
    },
  },
  handler: async (args, ctx) => {
    const actionId = String(args["action_id"] ?? "").trim();
    if (!actionId) return { ok: false, error: "action_id is required" };

    const action = await getAction(actionId);
    if (!action) return { ok: false, error: `action ${actionId} not found` };
    if (action.kind !== "draft_email") {
      return { ok: false, error: `critique_draft only supports draft_email, got ${action.kind}` };
    }

    const draft = action.proposal as DraftEmailProposal;
    const context = (action as unknown as { context?: string }).context ?? "(no grounding context recorded — treat all specifics as unsupported)";

    const prompt = `DRAFT under review:

To: ${draft.to.join(", ")}
${draft.cc.length ? `Cc: ${draft.cc.join(", ")}\n` : ""}Subject: ${draft.subject}

Intent (stated by the primary agent): ${draft.intent}

---
Body:

${draft.body}

---
GROUNDING CONTEXT the primary agent claims to have used (this is your source of truth — anything in the draft not derivable from this is unsupported):

${context}

---

Now audit. Return JSON only.`;

    try {
      const result = await generate({
        system: CRITIC_SYSTEM,
        prompt,
        temperature: 0.2,
        maxTokens: 1200,
        responseMimeType: "application/json",
      });

      type RawCritique = {
        verdict?: string;
        summary?: string;
        findings?: Array<{
          severity?: string;
          claim?: string;
          issue?: string;
          evidence?: string;
          citation?: string | null;
          suggestion?: string | null;
        }>;
        voice?: { score?: number; notes?: string };
      };

      let parsed: RawCritique;
      try {
        parsed = JSON.parse(result.text) as RawCritique;
      } catch {
        return { ok: false, error: "critic returned invalid JSON" };
      }

      const verdict = normalizeVerdict(parsed.verdict);
      const findings: CritiqueFinding[] = (parsed.findings ?? []).map((f) => ({
        severity: normalizeSeverity(f.severity),
        claim: typeof f.claim === "string" ? f.claim.slice(0, 200) : "",
        issue: typeof f.issue === "string" ? f.issue : "",
        evidence: normalizeEvidence(f.evidence),
        ...(typeof f.citation === "string" && f.citation.length > 0 ? { citation: f.citation } : {}),
        ...(typeof f.suggestion === "string" && f.suggestion.length > 0 ? { suggestion: f.suggestion } : {}),
      }));

      const voice = {
        score: clampNum(parsed.voice?.score, 0, 10, 7),
        notes: typeof parsed.voice?.notes === "string" ? parsed.voice.notes : "",
      };

      const summary = typeof parsed.summary === "string" ? parsed.summary : "";

      let critiqueId: string | null = null;
      try {
        critiqueId = await saveCritique({
          actionId,
          ...(ctx?.runId ? { runId: ctx.runId } : {}),
          ...(ctx?.query ? { query: ctx.query } : {}),
          verdict,
          summary,
          findings,
          voice,
          ...(result.model ? { model: result.model } : {}),
        });
      } catch {
        // best-effort persistence
      }

      const high = findings.filter((f) => f.severity === "high").length;
      const med = findings.filter((f) => f.severity === "medium").length;
      const low = findings.filter((f) => f.severity === "low").length;

      return {
        ok: true,
        data: {
          critiqueId,
          actionId,
          verdict,
          summary,
          findings,
          voice,
          counts: { high, med, low },
        },
        summary: `critic · ${verdict} · ${high}H / ${med}M / ${low}L · voice ${voice.score}/10`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
};

function normalizeVerdict(v: unknown): "approve" | "revise" | "reject" {
  if (v === "approve" || v === "revise" || v === "reject") return v;
  return "revise";
}

function normalizeSeverity(s: unknown): FindingSeverity {
  if (s === "high" || s === "medium" || s === "low") return s;
  return "medium";
}

function normalizeEvidence(e: unknown): CritiqueFinding["evidence"] {
  if (e === "supported" || e === "unsupported" || e === "contradicted" || e === "missing") return e;
  return "missing";
}

function clampNum(raw: unknown, lo: number, hi: number, dflt: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}
