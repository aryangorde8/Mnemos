import { randomUUID } from "node:crypto";
import { streamGenerate, type Content, type ContentPart } from "../lib/vertex.js";
import { SYSTEM_PROMPT, userFraming } from "./prompts.js";
import { TOOL_REGISTRY, TOOLS } from "./tools/index.js";
import type { AgentEvent, Citation } from "./types.js";

const MAX_TURNS = 14;

export interface RunOptions {
  query: string;
  maxTurns?: number;
  /** Override the system prompt — used by the /debate route to spawn a
      Devil's Advocate variant on the same query. Defaults to SYSTEM_PROMPT. */
  systemPrompt?: string;
  /** Prior conversation turns. Passed verbatim as Gemini `contents` before
      the current user query. Each entry is what the user asked + what the
      agent answered. Used by /ask for multi-turn follow-ups. */
  history?: Array<{ role: "user" | "model"; text: string }>;
}

export async function* runAgent(
  opts: RunOptions,
): AsyncGenerator<AgentEvent, void, unknown> {
  const startedAt = Date.now();
  const runId = randomUUID();
  const maxTurns = opts.maxTurns ?? MAX_TURNS;
  const declarations = TOOLS.map((t) => t.declaration);
  const contents: Content[] = [];
  // Thread prior conversation turns first (if any). Each historical turn
  // is a user message followed by the model's answer — Gemini handles the
  // rest as native multi-turn context.
  if (opts.history && opts.history.length > 0) {
    for (const turn of opts.history) {
      contents.push({ role: turn.role, parts: [{ text: turn.text }] });
    }
  }
  contents.push({ role: "user", parts: [{ text: userFraming(opts.query) }] });
  const allCitations: Citation[] = [];
  const usage = { prompt: 0, candidates: 0, thoughts: 0, total: 0 };
  // Every draft_email must be audited by the Critic. We track which drafted
  // actions have already been critiqued (by the model OR by us) so the
  // invariant is enforced in code, not just requested in the prompt.
  const critiquedActionIds = new Set<string>();

  yield { kind: "start", query: opts.query, runId, at: Date.now() };

  let turn = 0;
  while (turn < maxTurns) {
    turn++;
    const collected: ContentPart[] = [];
    let pendingText = "";
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    try {
      for await (const chunk of streamGenerate({
        system: opts.systemPrompt ?? SYSTEM_PROMPT,
        contents,
        tools: declarations,
        temperature: 0.4,
        maxTokens: 2048,
      })) {
        if (chunk.text !== undefined && chunk.text.length > 0) {
          yield {
            kind: "thought",
            chunk: chunk.text,
            at: Date.now(),
          };
          if (chunk.thoughtSignature) {
            // A signed text part: flush any pending unsigned text, then push
            // this part with its signature preserved (required by Gemini 3.x).
            if (pendingText.length > 0) {
              collected.push({ text: pendingText });
              pendingText = "";
            }
            collected.push({
              text: chunk.text,
              thoughtSignature: chunk.thoughtSignature,
            });
          } else {
            pendingText += chunk.text;
          }
        }
        if (chunk.functionCall) {
          if (pendingText.length > 0) {
            collected.push({ text: pendingText });
            pendingText = "";
          }
          toolCalls.push(chunk.functionCall);
          collected.push({
            functionCall: chunk.functionCall,
            ...(chunk.thoughtSignature ? { thoughtSignature: chunk.thoughtSignature } : {}),
          });
        }
        if (chunk.usage) {
          // Vertex sometimes emits cumulative usage in later chunks of the same
          // turn — overwrite per-turn then add at the end. Here we track running
          // max for this turn and roll into the run total below.
          if (chunk.usage.promptTokens !== undefined) usage.prompt += chunk.usage.promptTokens;
          if (chunk.usage.candidatesTokens !== undefined) usage.candidates += chunk.usage.candidatesTokens;
          if (chunk.usage.thoughtsTokens !== undefined) usage.thoughts += chunk.usage.thoughtsTokens;
          if (chunk.usage.totalTokens !== undefined) usage.total += chunk.usage.totalTokens;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { kind: "error", message: msg, at: Date.now() };
      return;
    }

    if (pendingText.length > 0) {
      collected.push({ text: pendingText });
    }

    // No tool calls → this is the final answer turn.
    if (toolCalls.length === 0) {
      const finalText = collected
        .map((p) => p.text ?? "")
        .filter((t) => t.length > 0)
        .join("");
      if (finalText.length === 0) {
        yield {
          kind: "error",
          message: "model returned no content and no tool call",
          at: Date.now(),
        };
        return;
      }
      if (allCitations.length > 0) {
        yield { kind: "citations", citations: dedupCitations(allCitations), at: Date.now() };
      }
      yield { kind: "answer", chunk: finalText, at: Date.now() };
      yield {
        kind: "done",
        turns: turn,
        totalMs: Date.now() - startedAt,
        usage: {
          promptTokens: usage.prompt,
          candidatesTokens: usage.candidates,
          thoughtsTokens: usage.thoughts,
          totalTokens: usage.total > 0 ? usage.total : usage.prompt + usage.candidates + usage.thoughts,
          estimatedCostUsd: estimateCost(usage.prompt, usage.candidates + usage.thoughts),
        },
        at: Date.now(),
      };
      return;
    }

    // Record the full model turn (text + all function calls) verbatim.
    contents.push({ role: "model", parts: collected });

    // Execute every tool call in order, collecting one functionResponse per call.
    // Gemini 3.x requires the next user turn to contain a functionResponse for
    // *every* functionCall in the model turn — same count, same order.
    const responseParts: ContentPart[] = [];
    // Drafts produced this turn that still need a Critic pass.
    const draftedThisTurn: string[] = [];
    for (const call of toolCalls) {
      const callId = randomUUID().slice(0, 8);
      const tool = TOOL_REGISTRY.get(call.name);

      yield {
        kind: "tool_call",
        id: callId,
        name: call.name,
        args: call.args,
        at: Date.now(),
      };

      const t0 = Date.now();
      let result;
      if (!tool) {
        result = { ok: false, error: `unknown tool: ${call.name}` };
      } else {
        try {
          result = await tool.handler(call.args, { query: opts.query, runId });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result = { ok: false, error: msg };
        }
      }
      const durationMs = Date.now() - t0;

      // Track the draft/critique pairing so we can enforce the audit below.
      if (call.name === "critique_draft") {
        const aid = typeof call.args["action_id"] === "string" ? (call.args["action_id"] as string) : "";
        if (aid) critiquedActionIds.add(aid);
      } else if (call.name === "draft_email" && result.ok) {
        const aid = typeof result.data?.["actionId"] === "string" ? (result.data["actionId"] as string) : "";
        if (aid) draftedThisTurn.push(aid);
      }

      if (result.citations && result.citations.length > 0) {
        allCitations.push(...result.citations);
      }

      yield {
        kind: "observation",
        id: callId,
        name: call.name,
        result,
        durationMs,
        at: Date.now(),
      };

      responseParts.push({
        functionResponse: {
          name: call.name,
          response: trimForModel(result),
        },
      });
    }

    // ── ENFORCE THE CRITIC ──
    // For every draft_email this turn that the model did NOT pair with its own
    // critique_draft call, run the Critic ourselves and feed the verdict back
    // into the same user turn. This guarantees no draft ever reaches the user
    // un-audited, regardless of whether the model followed the prompt.
    const critic = TOOL_REGISTRY.get("critique_draft");
    for (const actionId of draftedThisTurn) {
      if (critiquedActionIds.has(actionId) || !critic) continue;
      const callId = randomUUID().slice(0, 8);
      // `auto: true` lets the UI distinguish an enforced critique from one the
      // model requested itself.
      yield {
        kind: "tool_call",
        id: callId,
        name: "critique_draft",
        args: { action_id: actionId, auto: true },
        at: Date.now(),
      };
      const t0 = Date.now();
      let result;
      try {
        result = await critic.handler({ action_id: actionId }, { query: opts.query, runId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result = { ok: false, error: msg };
      }
      const durationMs = Date.now() - t0;
      critiquedActionIds.add(actionId);

      if (result.citations && result.citations.length > 0) {
        allCitations.push(...result.citations);
      }

      yield {
        kind: "observation",
        id: callId,
        name: "critique_draft",
        result,
        durationMs,
        at: Date.now(),
      };

      responseParts.push({
        functionResponse: {
          name: "critique_draft",
          response: trimForModel(result),
        },
      });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  yield {
    kind: "error",
    message: `exceeded max turns (${maxTurns}) without final answer`,
    at: Date.now(),
  };
}

function trimForModel(result: {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  summary?: string;
}): Record<string, unknown> {
  if (!result.ok) {
    return { ok: false, error: result.error ?? "tool failed" };
  }
  return {
    ok: true,
    ...(result.summary ? { summary: result.summary } : {}),
    ...(result.data ? { data: result.data } : {}),
  };
}

function dedupCitations(list: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of list) {
    if (!c.chunkId || seen.has(c.chunkId)) continue;
    seen.add(c.chunkId);
    out.push(c);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 12);
}

/**
 * Cost estimate for Gemini 3 Pro Preview (per Vertex pricing as of May 2026):
 *   input  $1.25 / 1M tokens   (≤ 200k input)
 *   output $10.00 / 1M tokens  (≤ 200k input)
 * Thinking tokens are billed as output. We round the result so the chip
 * displays as $0.0021 not $0.00214837.
 */
function estimateCost(promptTokens: number, outputTokens: number): number {
  const inUsd = (promptTokens / 1_000_000) * 1.25;
  const outUsd = (outputTokens / 1_000_000) * 10.0;
  const total = inUsd + outUsd;
  return Math.round(total * 10000) / 10000;
}
