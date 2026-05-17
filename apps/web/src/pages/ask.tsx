import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SearchInput } from "@/components/search-input";
import {
  ReasoningStream,
  type Citation,
  type StreamItem,
} from "@/components/reasoning-stream";
import { streamAsk } from "@/lib/sse";
import type { CritiqueFinding, FindingSeverity } from "@/lib/api";

interface AgentEnvelope<T = unknown> {
  event: string;
  data: T;
}

export default function AskPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<StreamItem[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoRanRef = useRef(false);

  const runWith = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setItems([]);
    setRunId(null);
    setRunning(true);

    try {
      await streamAsk({
        query: trimmed,
        signal: ac.signal,
        onEvent: (env: AgentEnvelope) => {
          handleEvent(env, setItems, setRunId);
        },
      });
    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setItems((prev) => [...prev, { kind: "error", message: msg, at: Date.now() }]);
    } finally {
      setRunning(false);
    }
  }, []);

  const submit = useCallback(async () => {
    if (running) return;
    await runWith(query);
  }, [query, running, runWith]);

  useEffect(() => {
    if (!router.isReady || autoRanRef.current) return;
    const q = typeof router.query.q === "string" ? router.query.q : "";
    const run = router.query.run === "1";
    if (q.length > 0) {
      setQuery(q);
      if (run) {
        autoRanRef.current = true;
        void runWith(q);
      }
    }
  }, [router.isReady, router.query.q, router.query.run, runWith]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  return (
    <>
      <Head>
        <title>Mnemos — ask the agent</title>
      </Head>
      <main className="relative min-h-dvh w-full">
        <header className="border-b border-[color:var(--color-rule)]/70">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-4 md:px-16">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="display text-[1.4rem] italic leading-none text-[color:var(--color-paper)]">
                Mnemos
              </span>
              <span className="label">μν. · ask the agent</span>
            </Link>
            <nav className="flex items-center gap-5 chrome">
              <Link
                href="/search"
                className="transition-colors hover:text-[color:var(--color-paper-dim)]"
              >
                search
              </Link>
              <span aria-hidden>·</span>
              <Link
                href="/ask"
                className="text-[color:var(--color-paper-dim)]"
              >
                ask
              </Link>
            </nav>
          </div>
        </header>

        <section className="mx-auto max-w-[1240px] px-10 pb-32 pt-14 md:px-16">
          <div className="flex items-center gap-3">
            <span className="block h-px w-10 bg-[color:var(--color-vermilion)]" />
            <span className="label">03 · multi-step reasoning</span>
          </div>

          <h1 className="display mt-6 max-w-[28ch] text-[clamp(2rem,5vw,3.2rem)] italic leading-[1.05] text-[color:var(--color-paper)]">
            What should the agent
            <span style={{ color: "var(--color-paper-muted)" }}> do for you?</span>
          </h1>

          <div className="mt-12 max-w-[60ch]">
            <SearchInput
              value={query}
              onChange={setQuery}
              onSubmit={submit}
              pending={running}
            />
            {running ? (
              <button
                onClick={cancel}
                className="mt-3 inline-flex items-center gap-2 border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-3 py-1 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-[color:var(--color-paper-dim)] transition-colors hover:border-[color:var(--color-vermilion)] hover:text-[color:var(--color-paper)]"
              >
                <span>esc</span>
                <span className="text-[color:var(--color-paper-faint)]">cancel</span>
              </button>
            ) : null}
          </div>

          <div className="mt-12">
            <ReasoningStream items={items} running={running} runId={runId} />
          </div>

          {items.length === 0 && !running ? (
            <ExampleStrip onPick={(s) => setQuery(s)} />
          ) : null}
        </section>
      </main>
    </>
  );
}

function ExampleStrip({ onPick }: { onPick: (q: string) => void }) {
  const examples = [
    "what did I commit to Sarah last week",
    "draft a polite decline to Marcus and propose Thursday at 2pm",
    "brief me on the Q3 Planning with Eng Leads meeting",
    "list every commitment I owe by Friday",
  ];
  return (
    <div className="mt-10 border-t border-[color:var(--color-rule)] pt-8">
      <p className="label">try a prompt</p>
      <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {examples.map((q) => (
          <li key={q}>
            <button
              onClick={() => onPick(q)}
              className="group flex w-full items-baseline gap-3 border border-[color:var(--color-rule)] bg-[color:var(--color-ink-1)] px-4 py-3 text-left text-[0.92rem] text-[color:var(--color-paper-dim)] transition-colors hover:border-[color:var(--color-vermilion)] hover:text-[color:var(--color-paper)]"
            >
              <span className="font-mono text-[0.78rem] text-[color:var(--color-vermilion)]">›</span>
              <span>{q}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function handleEvent(
  env: AgentEnvelope,
  setItems: (fn: (prev: StreamItem[]) => StreamItem[]) => void,
  setRunId: (id: string | null) => void,
) {
  const data = env.data as Record<string, unknown>;
  const at = typeof data["at"] === "number" ? (data["at"] as number) : Date.now();
  switch (env.event) {
    case "start": {
      if (typeof data["runId"] === "string") setRunId(data["runId"]);
      return;
    }
    case "thought": {
      const chunk = typeof data["chunk"] === "string" ? data["chunk"] : "";
      setItems((prev) => appendStream(prev, "thought", chunk, at));
      return;
    }
    case "answer": {
      const chunk = typeof data["chunk"] === "string" ? data["chunk"] : "";
      setItems((prev) => appendStream(prev, "answer", chunk, at));
      return;
    }
    case "tool_call": {
      setItems((prev) => [
        ...sealOpen(prev),
        {
          kind: "tool_call",
          id: String(data["id"] ?? ""),
          name: String(data["name"] ?? ""),
          args:
            (data["args"] as Record<string, unknown> | undefined) ?? {},
          at,
        },
      ]);
      return;
    }
    case "observation": {
      const result =
        (data["result"] as
          | {
              ok: boolean;
              summary?: string;
              error?: string;
              data?: Record<string, unknown>;
            }
          | undefined) ?? { ok: false, error: "no result" };
      const actionId =
        result.data && typeof result.data["actionId"] === "string"
          ? (result.data["actionId"] as string)
          : undefined;
      const name = String(data["name"] ?? "");
      const critique =
        name === "critique_draft" && result.ok && result.data
          ? extractCritique(result.data)
          : undefined;
      setItems((prev) => [
        ...sealOpen(prev),
        {
          kind: "observation",
          id: String(data["id"] ?? ""),
          name,
          ok: result.ok,
          ...(result.summary ? { summary: result.summary } : {}),
          ...(result.error ? { error: result.error } : {}),
          ...(actionId ? { actionId } : {}),
          ...(critique ? { critique } : {}),
          durationMs: Number(data["durationMs"] ?? 0),
          at,
        },
      ]);
      return;
    }
    case "citations": {
      const list = (data["citations"] as Citation[] | undefined) ?? [];
      setItems((prev) => [...sealOpen(prev), { kind: "citations", citations: list, at }]);
      return;
    }
    case "done": {
      setItems((prev) => [
        ...sealOpen(prev),
        {
          kind: "done",
          turns: Number(data["turns"] ?? 0),
          totalMs: Number(data["totalMs"] ?? 0),
          at,
        },
      ]);
      return;
    }
    case "error": {
      setItems((prev) => [
        ...sealOpen(prev),
        { kind: "error", message: String(data["message"] ?? "unknown error"), at },
      ]);
      return;
    }
  }
}

function appendStream(
  prev: StreamItem[],
  kind: "thought" | "answer",
  chunk: string,
  at: number,
): StreamItem[] {
  const last = prev[prev.length - 1];
  if (last && last.kind === kind && !last.complete) {
    const updated: StreamItem = { ...last, text: last.text + chunk };
    return [...prev.slice(0, -1), updated];
  }
  return [...prev, { kind, text: chunk, complete: false, at }];
}

function sealOpen(prev: StreamItem[]): StreamItem[] {
  const last = prev[prev.length - 1];
  if (!last) return prev;
  if (last.kind === "thought" || last.kind === "answer") {
    const sealed: StreamItem = { ...last, complete: true };
    return [...prev.slice(0, -1), sealed];
  }
  return prev;
}

type RawFinding = {
  severity?: unknown;
  claim?: unknown;
  issue?: unknown;
  evidence?: unknown;
  citation?: unknown;
  suggestion?: unknown;
};

function extractCritique(d: Record<string, unknown>):
  | (NonNullable<Extract<StreamItem, { kind: "observation" }>["critique"]>)
  | undefined {
  if (typeof d["actionId"] !== "string") return undefined;
  const verdict = d["verdict"];
  if (verdict !== "approve" && verdict !== "revise" && verdict !== "reject") return undefined;
  const findingsRaw = Array.isArray(d["findings"]) ? (d["findings"] as RawFinding[]) : [];
  const findings: CritiqueFinding[] = findingsRaw
    .filter((f): f is RawFinding => typeof f === "object" && f !== null)
    .map((f): CritiqueFinding => {
      const sev: FindingSeverity =
        f.severity === "high" ? "high"
        : f.severity === "low" ? "low"
        : "medium";
      const ev: CritiqueFinding["evidence"] =
        f.evidence === "supported" ? "supported"
        : f.evidence === "unsupported" ? "unsupported"
        : f.evidence === "contradicted" ? "contradicted"
        : "missing";
      return {
        severity: sev,
        claim: typeof f.claim === "string" ? f.claim : "",
        issue: typeof f.issue === "string" ? f.issue : "",
        evidence: ev,
        ...(typeof f.citation === "string" ? { citation: f.citation } : {}),
        ...(typeof f.suggestion === "string" ? { suggestion: f.suggestion } : {}),
      };
    });
  const voiceRaw = d["voice"] as { score?: unknown; notes?: unknown } | undefined;
  const voice = {
    score: typeof voiceRaw?.score === "number" ? voiceRaw.score : 0,
    notes: typeof voiceRaw?.notes === "string" ? voiceRaw.notes : "",
  };
  return {
    actionId: d["actionId"] as string,
    verdict,
    summary: typeof d["summary"] === "string" ? d["summary"] : "",
    findings,
    voice,
    ...(typeof d["counts"] === "object" && d["counts"] !== null
      ? { counts: d["counts"] as { high: number; med: number; low: number } }
      : {}),
  };
}
