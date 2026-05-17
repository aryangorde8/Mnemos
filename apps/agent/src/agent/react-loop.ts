import { randomUUID } from "node:crypto";
import { streamGenerate, type Content, type ContentPart } from "../lib/vertex.js";
import { SYSTEM_PROMPT, userFraming } from "./prompts.js";
import { TOOL_REGISTRY, TOOLS } from "./tools/index.js";
import type { AgentEvent, Citation } from "./types.js";

const MAX_TURNS = 6;

export interface RunOptions {
  query: string;
  maxTurns?: number;
}

export async function* runAgent(
  opts: RunOptions,
): AsyncGenerator<AgentEvent, void, unknown> {
  const startedAt = Date.now();
  const runId = randomUUID();
  const maxTurns = opts.maxTurns ?? MAX_TURNS;
  const declarations = TOOLS.map((t) => t.declaration);
  const contents: Content[] = [
    { role: "user", parts: [{ text: userFraming(opts.query) }] },
  ];
  const allCitations: Citation[] = [];

  yield { kind: "start", query: opts.query, runId, at: Date.now() };

  let turn = 0;
  while (turn < maxTurns) {
    turn++;
    const collected: ContentPart[] = [];
    let pendingText = "";
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    try {
      for await (const chunk of streamGenerate({
        system: SYSTEM_PROMPT,
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
