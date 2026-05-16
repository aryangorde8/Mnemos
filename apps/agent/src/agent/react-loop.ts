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
    let toolCall:
      | { name: string; args: Record<string, unknown> }
      | null = null;

    try {
      for await (const chunk of streamGenerate({
        system: SYSTEM_PROMPT,
        contents,
        tools: declarations,
        temperature: 0.4,
        maxTokens: 2048,
      })) {
        if (chunk.text !== undefined && chunk.text.length > 0) {
          pendingText += chunk.text;
          yield {
            kind: toolCall ? "thought" : "thought",
            chunk: chunk.text,
            at: Date.now(),
          };
        }
        if (chunk.functionCall) {
          if (pendingText.length > 0) {
            collected.push({ text: pendingText });
            pendingText = "";
          }
          toolCall = chunk.functionCall;
          collected.push({ functionCall: chunk.functionCall });
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

    if (!toolCall) {
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

    contents.push({ role: "model", parts: collected });

    const callId = randomUUID().slice(0, 8);
    const tool = TOOL_REGISTRY.get(toolCall.name);
    yield {
      kind: "tool_call",
      id: callId,
      name: toolCall.name,
      args: toolCall.args,
      at: Date.now(),
    };

    const t0 = Date.now();
    let result;
    if (!tool) {
      result = {
        ok: false,
        error: `unknown tool: ${toolCall.name}`,
      };
    } else {
      try {
        result = await tool.handler(toolCall.args, { query: opts.query, runId });
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
      name: toolCall.name,
      result,
      durationMs,
      at: Date.now(),
    };

    contents.push({
      role: "user",
      parts: [
        {
          functionResponse: {
            name: toolCall.name,
            response: trimForModel(result),
          },
        },
      ],
    });
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
