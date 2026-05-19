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

interface PastTurn {
  query: string;
  answer: string;
  items: StreamItem[];
  runId: string | null;
}

export default function AskPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<StreamItem[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  /** Past turns from this conversation — passed to the agent as history
      on every new query so it can reference earlier answers. */
  const [thread, setThread] = useState<PastTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const autoRanRef = useRef(false);
  // Latest streamed answer text — kept in a ref so we can capture it on
  // 'done' without waiting for a setState re-render.
  const itemsRef = useRef<StreamItem[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const runWith = useCallback(async (q: string, currentThread: PastTurn[]) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setItems([]);
    setRunId(null);
    setRunning(true);

    // Build the history payload from past turns: each turn becomes
    //   user → query
    //   model → final answer
    const history = currentThread.flatMap((t) => [
      { role: "user" as const, text: t.query },
      { role: "model" as const, text: t.answer },
    ]);

    let myRunId: string | null = null;
    try {
      await streamAsk({
        query: trimmed,
        ...(history.length > 0 ? { history } : {}),
        signal: ac.signal,
        onEvent: (env: AgentEnvelope) => {
          handleEvent(env, setItems, (id) => { myRunId = id; setRunId(id); });
        },
      });
      // On clean completion, archive this run as a past turn for the next query
      const finalItems = itemsRef.current;
      const answerItem = finalItems.find((i): i is Extract<StreamItem, { kind: "answer" }> => i.kind === "answer");
      const answerText = answerItem?.text ?? "";
      if (answerText.trim().length > 0) {
        setThread((prev) => [
          ...prev,
          { query: trimmed, answer: answerText, items: finalItems, runId: myRunId },
        ]);
        setItems([]); // clear the live stream — the archived card takes over
        setRunId(null);
        setQuery(""); // ready for the next follow-up
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setItems((prev) => [...prev, { kind: "error", message: msg, at: Date.now() }]);
    } finally {
      setRunning(false);
    }
  }, []);

  const resetThread = useCallback(() => {
    abortRef.current?.abort();
    setThread([]);
    setItems([]);
    setRunId(null);
    setQuery("");
    setRunning(false);
  }, []);

  const submit = useCallback(async () => {
    if (running) return;
    await runWith(query, thread);
  }, [query, thread, running, runWith]);

  useEffect(() => {
    if (!router.isReady || autoRanRef.current) return;
    const q = typeof router.query.q === "string" ? router.query.q : "";
    const run = router.query.run === "1";
    if (q.length > 0) {
      setQuery(q);
      if (run) {
        autoRanRef.current = true;
        void runWith(q, []); // URL-initiated runs always start a fresh thread
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

          {thread.length === 0 ? (
            <h1 className="display mt-6 max-w-[28ch] text-[clamp(2rem,5vw,3.2rem)] italic leading-[1.05] text-[color:var(--color-paper)]">
              What should the agent
              <span style={{ color: "var(--color-paper-muted)" }}> do for you?</span>
            </h1>
          ) : (
            <div className="mt-6 flex flex-wrap items-baseline justify-between gap-y-2">
              <h1
                className="display"
                style={{ fontSize: "clamp(1.5rem, 3.4vw, 2.2rem)", color: "var(--color-paper)", letterSpacing: "-0.012em" }}
              >
                Conversation{" "}
                <span className="display-i" style={{ color: "var(--color-vermilion)" }}>
                  · {thread.length} {thread.length === 1 ? "turn" : "turns"}
                </span>
              </h1>
              <button
                onClick={resetThread}
                className="mono focusable"
                style={{
                  padding: "5px 12px",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-paper-muted)",
                  border: "1px solid var(--color-rule-strong)",
                  background: "var(--color-ink-2)",
                  cursor: "pointer",
                }}
                title="start a fresh conversation"
              >
                ⏎ new thread
              </button>
            </div>
          )}

          {/* Past turns archive */}
          {thread.length > 0 && (
            <div className="mt-10 space-y-12">
              {thread.map((t, i) => (
                <PastTurnCard key={i} turn={t} index={i} />
              ))}
            </div>
          )}

          <div className={thread.length > 0 ? "mt-12 border-t border-[color:var(--color-rule)] pt-10" : "mt-12 max-w-[60ch]"}>
            {thread.length > 0 && (
              <div className="label mb-4">follow-up · the agent remembers</div>
            )}
            <div className="max-w-[60ch]">
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
          </div>

          <div className="mt-10">
            <ReasoningStream
              items={items}
              running={running}
              runId={runId}
              onReplay={() => {
                const lastTurn = thread[thread.length - 1];
                const q = lastTurn?.query || query;
                if (q.trim()) void runWith(q, thread.slice(0, -1));
              }}
            />
          </div>

          {thread.length === 0 && items.length === 0 && !running ? (
            <ExampleStrip onPick={(s) => setQuery(s)} />
          ) : null}
        </section>
      </main>
    </>
  );
}

/**
 * PastTurnCard — collapses a finished turn into a compact archive card.
 * The full reasoning stream stays browsable but folded; clicking the
 * "expand" toggle re-shows the live timeline for that turn.
 */
function PastTurnCard({ turn, index }: { turn: PastTurn; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <article
      style={{
        border: "1px solid var(--color-rule)",
        background: "var(--color-ink-1)",
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: -1,
          top: -1,
          bottom: -1,
          width: 2,
          background: "var(--color-rule-strong)",
        }}
      />
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid var(--color-rule)",
        }}
      >
        <div className="chrome" style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
          <span className="tabular" style={{ color: "var(--color-paper-faint)" }}>
            turn {String(index + 1).padStart(2, "0")}
          </span>
          <span style={{ color: "var(--color-rule-strong)" }}>·</span>
          {turn.runId && (
            <>
              <span className="tabular">run {turn.runId.slice(0, 8)}</span>
              <span style={{ color: "var(--color-rule-strong)" }}>·</span>
            </>
          )}
          <span>{turn.items.length} nodes</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="mono focusable"
          style={{
            padding: "3px 10px",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-paper-muted)",
            border: "1px solid var(--color-rule)",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          {open ? "▾ collapse" : "▸ expand stream"}
        </button>
      </header>

      <div style={{ padding: "20px 28px 24px" }}>
        <div className="label" style={{ marginBottom: 6 }}>you asked</div>
        <div
          className="display-i"
          style={{
            fontSize: "1.25rem",
            color: "var(--color-paper)",
            lineHeight: 1.4,
            letterSpacing: "-0.005em",
            marginBottom: 18,
          }}
        >
          “{turn.query}”
        </div>

        <div className="label" style={{ marginBottom: 6 }}>the agent answered</div>
        <div
          className="display"
          style={{
            fontSize: "1.05rem",
            color: "var(--color-paper-dim)",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            maxWidth: 760,
          }}
        >
          {turn.answer}
        </div>

        {open && turn.items.length > 0 && (
          <div className="mt-8 border-t border-[color:var(--color-rule)] pt-6">
            <div className="label mb-4">full reasoning stream</div>
            <ReasoningStream items={turn.items} running={false} runId={turn.runId} />
          </div>
        )}
      </div>
    </article>
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
      const traversal =
        name === "expand_via_graph" && result.ok && result.data
          ? extractTraversal(result.data)
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
          ...(traversal ? { traversal } : {}),
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
      const rawUsage = data["usage"] as
        | {
            promptTokens?: number;
            candidatesTokens?: number;
            thoughtsTokens?: number;
            totalTokens?: number;
            estimatedCostUsd?: number;
          }
        | undefined;
      const usage = rawUsage
        ? {
            promptTokens: Number(rawUsage.promptTokens ?? 0),
            candidatesTokens: Number(rawUsage.candidatesTokens ?? 0),
            thoughtsTokens: Number(rawUsage.thoughtsTokens ?? 0),
            totalTokens: Number(rawUsage.totalTokens ?? 0),
            estimatedCostUsd: Number(rawUsage.estimatedCostUsd ?? 0),
          }
        : undefined;
      setItems((prev) => [
        ...sealOpen(prev),
        {
          kind: "done",
          turns: Number(data["turns"] ?? 0),
          totalMs: Number(data["totalMs"] ?? 0),
          ...(usage ? { usage } : {}),
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

interface RawNode {
  key?: unknown;
  name?: unknown;
  kind?: unknown;
}
interface RawEdge {
  from?: unknown;
  to?: unknown;
  kind?: unknown;
}

function extractTraversal(
  d: Record<string, unknown>,
): NonNullable<Extract<StreamItem, { kind: "observation" }>["traversal"]> | undefined {
  const resolved = Array.isArray(d["resolved"]) ? (d["resolved"] as RawNode[]) : [];
  const traversed = Array.isArray(d["traversed"]) ? (d["traversed"] as RawNode[]) : [];
  const relations = Array.isArray(d["relations"]) ? (d["relations"] as RawEdge[]) : [];

  if (resolved.length === 0 && traversed.length === 0) return undefined;

  const normNode = (n: RawNode) => ({
    key: typeof n.key === "string" ? n.key : "",
    name: typeof n.name === "string" ? n.name : "",
    kind: typeof n.kind === "string" ? n.kind : "",
  });
  const normEdge = (e: RawEdge) => ({
    from: typeof e.from === "string" ? e.from : "",
    to: typeof e.to === "string" ? e.to : "",
    kind: typeof e.kind === "string" ? e.kind : "",
  });

  const chunksFound = Number(d["chunksFound"] ?? 0);
  const chunksReturned = Array.isArray(d["chunks"]) ? (d["chunks"] as unknown[]).length : 0;

  return {
    resolved: resolved.map(normNode).filter((n) => n.key),
    traversed: traversed.map(normNode).filter((n) => n.key),
    relations: relations.map(normEdge).filter((e) => e.from && e.to),
    chunksFound,
    chunksReturned,
  };
}
