import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { z } from "zod";
import { runAgent } from "../agent/react-loop.js";
import { generate } from "../lib/vertex.js";
import { DEVIL_SYSTEM, PRIMARY_SYSTEM, SYNTHESIZER_SYSTEM } from "../agent/debate-prompts.js";
import type { AgentEvent, Citation } from "../agent/types.js";

const debateSchema = z.object({
  query: z.string().min(1).max(4000),
  maxTurns: z.number().int().min(1).max(12).optional(),
});

export const debateRouter: Router = createRouter();

/**
 * /debate — runs the Primary agent and the Devil's Advocate in parallel
 * on the same query. Multiplexes their event streams into a single SSE
 * connection, tagged with `agent: "primary" | "devil"`. After both
 * complete, fires the Synthesizer agent to produce a consensus answer
 * and streams that as `event: synthesis`.
 *
 * Output event shape (extends the standard agent event):
 *   { agent: "primary" | "devil", ...AgentEvent }
 *
 * Plus a final:
 *   event: synthesis  data: { text, citations, totalMs }
 *
 * Errors from either agent are tagged with the same `agent` field and
 * don't kill the other side.
 */
debateRouter.post("/debate", async (req: Request, res: Response) => {
  const parsed = debateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", detail: parsed.error.flatten() });
  }

  const { query, maxTurns } = parsed.data;
  const startedAt = Date.now();

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(": connected\n\n");

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);

  let closed = false;
  res.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
  });

  const write = (event: string, payload: unknown) => {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // Track each agent's final answer + citations so we can hand them to the synthesizer
  const collected = {
    primary: { answer: "", citations: [] as Citation[] },
    devil: { answer: "", citations: [] as Citation[] },
  };

  // Tee one agent stream into the shared response with an `agent` tag
  async function teeStream(label: "primary" | "devil", systemPrompt: string): Promise<void> {
    try {
      for await (const ev of runAgent({ query, maxTurns, systemPrompt })) {
        if (closed) return;
        write(ev.kind, { agent: label, ...ev });
        // Capture final answer + citations
        if (ev.kind === "answer") {
          collected[label].answer += ev.chunk;
        }
        if (ev.kind === "citations") {
          collected[label].citations = ev.citations;
        }
        if (ev.kind === "done" || ev.kind === "error") return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      write("error", { agent: label, kind: "error", message: msg, at: Date.now() });
    }
  }

  write("debate_start", {
    query,
    agents: ["primary", "devil"],
    at: startedAt,
  });

  // Run both agents in parallel. allSettled so one failing doesn't poison the other.
  await Promise.allSettled([
    teeStream("primary", PRIMARY_SYSTEM),
    teeStream("devil", DEVIL_SYSTEM),
  ]);

  if (closed) {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
    return;
  }

  // Synthesize — only if at least one side produced an answer
  const havePrimary = collected.primary.answer.trim().length > 0;
  const haveDevil = collected.devil.answer.trim().length > 0;

  if (!havePrimary && !haveDevil) {
    write("synthesis_error", { message: "neither agent produced an answer" });
  } else {
    // Build a merged, de-duped citation list (primary first, then devil's new ones)
    const seen = new Set<string>();
    const merged: Citation[] = [];
    for (const c of collected.primary.citations) {
      if (!seen.has(c.chunkId)) { seen.add(c.chunkId); merged.push(c); }
    }
    for (const c of collected.devil.citations) {
      if (!seen.has(c.chunkId)) { seen.add(c.chunkId); merged.push(c); }
    }

    write("synthesis_start", { mergedCitations: merged.length, at: Date.now() });

    try {
      const prompt =
        `USER QUERY:\n${query}\n\n` +
        `PRIMARY ANSWER:\n${collected.primary.answer || "(no answer)"}\n\n` +
        `DEVIL'S ADVOCATE ANSWER:\n${collected.devil.answer || "(no answer)"}\n\n` +
        `MERGED CITATION LIST (1-indexed):\n` +
        merged.map((c, i) => `[${i + 1}] (${c.source}) "${c.title}"`).join("\n") +
        `\n\nProduce the three-paragraph synthesis now.`;
      const r = await generate({
        system: SYNTHESIZER_SYSTEM,
        prompt,
        temperature: 0.45,
        maxTokens: 1800,
        thinkingBudget: 0,
      });
      write("synthesis", {
        text: r.text.trim(),
        citations: merged,
        model: r.model,
        at: Date.now(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      write("synthesis_error", { message: msg, at: Date.now() });
    }
  }

  write("debate_done", { totalMs: Date.now() - startedAt, at: Date.now() });
  clearInterval(heartbeat);
  if (!res.writableEnded) res.end();
});

// Silence unused-export lint
void ([] as AgentEvent[]);
