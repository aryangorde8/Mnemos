import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "../../lib/vertex.js";
import { recordAction } from "../../lib/actions.js";
import type { ToolDef } from "../types.js";

const DEFAULT_VOICE_CUE = `Alex Chen's voice: warm but direct; lowercase-leaning openings; uses em-dashes; signs "a." (single letter + period); avoids exclamation marks; asks at most one clarifying question; never uses "Hope this finds you well," "circle back," or AI-stock phrases. Sentences are short. Specifics over generalities.`;

let cachedVoice: string | null = null;
let cachedVoiceAt = 0;

async function loadVoiceCue(): Promise<string> {
  if (cachedVoice && Date.now() - cachedVoiceAt < 60_000) return cachedVoice;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../../../../scripts/fixtures/alex-voice.md"),
    resolve(process.cwd(), "scripts/fixtures/alex-voice.md"),
    resolve(process.cwd(), "../../scripts/fixtures/alex-voice.md"),
  ];
  for (const p of candidates) {
    try {
      const md = await readFile(p, "utf8");
      cachedVoice = `${DEFAULT_VOICE_CUE}\n\n--- learned voice (from sampled outbound emails) ---\n${md.trim()}`;
      cachedVoiceAt = Date.now();
      return cachedVoice;
    } catch { /* try next path */ }
  }
  cachedVoice = DEFAULT_VOICE_CUE;
  cachedVoiceAt = Date.now();
  return cachedVoice;
}

export const draftEmailTool: ToolDef = {
  declaration: {
    name: "draft_email",
    description:
      "Compose a draft email in Alex's voice. The draft is NOT sent — it is returned for the user to approve, edit, or reject. Pass concrete context (e.g. retrieved chunks, key facts) so the draft is grounded.",
    parameters: {
      type: "OBJECT",
      properties: {
        to: {
          type: "array",
          items: { type: "string" },
          description: "Recipient email addresses.",
        },
        subject: {
          type: "string",
          description: "Subject line.",
        },
        intent: {
          type: "string",
          description:
            "One-sentence description of what the email should accomplish (e.g. 'politely decline the design review and propose Thursday 2pm').",
        },
        context: {
          type: "string",
          description:
            "Relevant facts retrieved from memory that should ground the draft. Quote dates, names, and commitments verbatim.",
        },
        cc: {
          type: "array",
          items: { type: "string" },
          description: "Optional cc recipients.",
        },
      },
      required: ["to", "subject", "intent"],
    },
  },
  handler: async (args, ctx) => {
    const to = Array.isArray(args["to"]) ? (args["to"] as string[]) : [];
    const cc = Array.isArray(args["cc"]) ? (args["cc"] as string[]) : [];
    const subject = String(args["subject"] ?? "").trim();
    const intent = String(args["intent"] ?? "").trim();
    const context = String(args["context"] ?? "").trim();

    if (to.length === 0 || !subject || !intent) {
      return { ok: false, error: "to, subject, intent are required" };
    }

    try {
      const voiceCue = await loadVoiceCue();
      const prompt = `Write the BODY ONLY of an email Alex Chen would send.

Recipients: ${to.join(", ")}
${cc.length ? `Cc: ${cc.join(", ")}\n` : ""}Subject: ${subject}

Intent: ${intent}

Grounding context (do not invent beyond this):
${context || "(none provided — keep the body terse and concrete; do not invent details)"}

${voiceCue}

Rules:
- 3–7 short paragraphs maximum.
- No emoji. No "Hope this finds you well." No "circle back."
- End with "a." on its own line as the sign-off — nothing more.
- Do NOT include the subject line in the body.
- Do NOT include "To:" / "From:" headers.`;

      const result = await generate({
        prompt,
        temperature: 0.55,
        maxTokens: 700,
      });

      const body = result.text.trim();
      const proposal = { to, cc, subject, body, intent };

      let actionId: string | null = null;
      try {
        actionId = await recordAction({
          kind: "draft_email",
          proposal,
          ...(ctx?.query ? { query: ctx.query } : {}),
          ...(ctx?.runId ? { runId: ctx.runId } : {}),
          model: result.model,
          ...(context ? { context } : {}),
        });
      } catch {
        // persistence is best-effort; surface the draft regardless
      }

      return {
        ok: true,
        data: {
          actionId,
          to,
          cc,
          subject,
          body,
          model: result.model,
          intent,
          requiresApproval: true,
        },
        summary: `drafted reply to ${to.join(", ")}: "${subject}"${actionId ? " · awaiting approval" : ""}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
};
