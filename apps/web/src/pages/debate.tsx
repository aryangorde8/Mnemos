import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SearchInput } from "@/components/search-input";
import { ReasoningStream, type Citation, type StreamItem } from "@/components/reasoning-stream";
import { streamDebate } from "@/lib/sse";
import { Drawline } from "@/components/motion-primitives";

/**
 * /debate — runs the agent twice in parallel on the same query:
 *  - Primary (standard system prompt)
 *  - Devil's Advocate (adversarial framing, must disagree on substance)
 *
 * After both complete, a Synthesizer fires and produces the consensus
 * answer below.
 *
 * Both streams share the existing ReasoningStream component — events
 * arrive on a single SSE connection multiplexed by an `agent` field.
 */

type Side = "primary" | "devil";

interface SideState {
  items: StreamItem[];
  runId: string | null;
}

interface SynthesisState {
  text: string;
  citations: Citation[];
  ready: boolean;
  error: string | null;
}

interface AgentEnvelope<T = unknown> {
  event: string;
  data: T;
}

export default function DebatePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [primary, setPrimary] = useState<SideState>({ items: [], runId: null });
  const [devil, setDevil] = useState<SideState>({ items: [], runId: null });
  const [synth, setSynth] = useState<SynthesisState>({ text: "", citations: [], ready: false, error: null });
  const abortRef = useRef<AbortController | null>(null);
  const autoRanRef = useRef(false);

  const runWith = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setPrimary({ items: [], runId: null });
    setDevil({ items: [], runId: null });
    setSynth({ text: "", citations: [], ready: false, error: null });
    setRunning(true);

    try {
      await streamDebate({
        query: trimmed,
        signal: ac.signal,
        onEvent: (env: AgentEnvelope) => handleEvent(env, setPrimary, setDevil, setSynth),
      });
    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setSynth((s) => ({ ...s, error: msg }));
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
        <title>Mnemos — debate · two agents on one question</title>
      </Head>
      <main className="relative min-h-dvh w-full">
        <header className="border-b border-[color:var(--color-rule)]/70">
          <div className="mx-auto flex max-w-[1480px] items-center justify-between px-10 py-4 md:px-14">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="display-i leading-none" style={{ fontSize: "1.4rem", color: "var(--color-paper)" }}>
                Mnemos
              </span>
              <span className="label">μν. · debate</span>
            </Link>
            <nav className="flex items-center gap-5 chrome">
              <Link href="/ask" className="hover:text-[color:var(--color-paper-dim)]">ask</Link>
              <span aria-hidden>·</span>
              <Link href="/debate" className="text-[color:var(--color-paper-dim)]">debate</Link>
              <span aria-hidden>·</span>
              <Link href="/memory" className="hover:text-[color:var(--color-paper-dim)]">memory</Link>
              <span aria-hidden>·</span>
              <Link href="/runs" className="hover:text-[color:var(--color-paper-dim)]">runs</Link>
            </nav>
          </div>
        </header>

        <section className="mx-auto max-w-[1480px] px-10 pb-32 pt-12 md:px-14">
          <motion.div
            className="label flex items-center gap-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Drawline width={32} delay={0.05} />
            <span>── mnemos · 04 · two agents · one question</span>
          </motion.div>

          <motion.h1
            className="display mt-5 max-w-[26ch]"
            style={{ fontSize: "clamp(1.9rem, 4.6vw, 3.2rem)", lineHeight: 1.05, color: "var(--color-paper)", letterSpacing: "-0.018em" }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Watch them{" "}
            <span className="display-i" style={{ color: "var(--color-vermilion)" }}>
              disagree.
            </span>
          </motion.h1>

          <p className="mt-4 max-w-[68ch]" style={{ fontSize: "0.98rem", color: "var(--color-paper-dim)", lineHeight: "26px" }}>
            Same query, two agents, parallel reasoning. The primary works the question; the
            Devil's Advocate hunts the counter-evidence the primary will miss. A third agent
            synthesizes the disagreement below.
          </p>

          <div className="mt-8 max-w-[68ch]">
            <SearchInput value={query} onChange={setQuery} onSubmit={submit} pending={running} />
            {running ? (
              <button onClick={cancel} className="mt-3 inline-flex items-center gap-2 border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-3 py-1 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-[color:var(--color-paper-dim)] transition-colors hover:border-[color:var(--color-vermilion)] hover:text-[color:var(--color-paper)]">
                <span>esc</span><span className="text-[color:var(--color-paper-faint)]">cancel both</span>
              </button>
            ) : null}
          </div>

          {(primary.items.length > 0 || devil.items.length > 0 || running) && (
            <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-2">
              <SideColumn
                label="primary"
                accent="var(--color-paper)"
                items={primary.items}
                runId={primary.runId}
                running={running}
              />
              <SideColumn
                label="devil's advocate"
                accent="var(--color-vermilion)"
                items={devil.items}
                runId={devil.runId}
                running={running}
              />
            </div>
          )}

          <AnimatePresence>
            {synth.ready && (
              <motion.div
                key="synth"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="mt-16 border bg-[color:var(--color-ink-1)] px-7 py-7"
                style={{ borderColor: "var(--color-rule-strong)", borderLeftWidth: 2, borderLeftColor: "var(--color-saffron)" }}
              >
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="label" style={{ color: "var(--color-saffron)" }}>synthesis · the consensus</span>
                  <span className="chrome">· {synth.citations.length} merged citations</span>
                </div>
                <div className="display" style={{ fontSize: "1.18rem", lineHeight: 1.55, color: "var(--color-paper)", whiteSpace: "pre-wrap", maxWidth: 880 }}>
                  {synth.text}
                </div>
                {synth.citations.length > 0 && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {synth.citations.map((c, i) => (
                      <span
                        key={c.chunkId}
                        title={c.text ?? c.title}
                        className="inline-flex items-baseline gap-1.5 border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-2 py-1"
                        style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--color-paper-muted)" }}
                      >
                        <span style={{ color: "var(--color-saffron)" }}>[{i + 1}]</span>
                        <span>{c.title}</span>
                        <span style={{ color: "var(--color-paper-faint)" }}>· {c.source}</span>
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {synth.error && (
            <div className="mt-8 border border-[color:var(--color-vermilion-deep)]/60 bg-[color:var(--color-ink-1)] p-4 font-mono text-[0.85rem]" style={{ color: "var(--color-vermilion)" }}>
              synthesis · {synth.error}
            </div>
          )}

          {primary.items.length === 0 && devil.items.length === 0 && !running && (
            <ExampleStrip onPick={(q) => setQuery(q)} />
          )}
        </section>
      </main>
    </>
  );
}

function SideColumn({
  label,
  accent,
  items,
  runId,
  running,
}: {
  label: string;
  accent: string;
  items: StreamItem[];
  runId: string | null;
  running: boolean;
}) {
  return (
    <div>
      <div className="mb-4 flex items-baseline gap-3 border-b border-[color:var(--color-rule)] pb-3">
        <span className="block h-px w-8" style={{ background: accent }} />
        <span className="label" style={{ color: accent }}>
          {label}
        </span>
        <span className="chrome">{items.length} nodes</span>
      </div>
      <ReasoningStream items={items} running={running} runId={runId} />
    </div>
  );
}

function ExampleStrip({ onPick }: { onPick: (q: string) => void }) {
  const examples = [
    "should I accept the Acme Co. discount or hold the line on Q3 pricing?",
    "draft a polite decline to Marcus for Monday coffee and propose Thursday at 2pm",
    "is the Lantern v3 launch on track for Q3?",
    "should I escalate the Sarah dependency to Priya?",
  ];
  return (
    <div className="mt-10 border-t border-[color:var(--color-rule)] pt-8">
      <p className="label">try a contested question</p>
      <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {examples.map((q) => (
          <li key={q}>
            <button
              onClick={() => onPick(q)}
              className="group flex w-full items-baseline gap-3 border border-[color:var(--color-rule)] bg-[color:var(--color-ink-1)] px-4 py-3 text-left text-[0.92rem] text-[color:var(--color-paper-dim)] transition-colors hover:border-[color:var(--color-vermilion)] hover:text-[color:var(--color-paper)]"
            >
              <span className="mono" style={{ fontSize: "0.78rem", color: "var(--color-vermilion)" }}>⚔</span>
              <span>{q}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SSE event handler — multiplexes by `agent` field
// ─────────────────────────────────────────────────────────────
function handleEvent(
  env: AgentEnvelope,
  setPrimary: React.Dispatch<React.SetStateAction<SideState>>,
  setDevil: React.Dispatch<React.SetStateAction<SideState>>,
  setSynth: React.Dispatch<React.SetStateAction<SynthesisState>>,
) {
  const data = env.data as Record<string, unknown>;
  const agent = data["agent"] as "primary" | "devil" | undefined;
  const at = typeof data["at"] === "number" ? (data["at"] as number) : Date.now();

  // Synthesis events have no `agent` tag
  if (env.event === "synthesis") {
    const text = typeof data["text"] === "string" ? (data["text"] as string) : "";
    const citations = Array.isArray(data["citations"]) ? (data["citations"] as Citation[]) : [];
    setSynth({ text, citations, ready: true, error: null });
    return;
  }
  if (env.event === "synthesis_error") {
    setSynth((s) => ({ ...s, error: String(data["message"] ?? "synthesis failed") }));
    return;
  }
  if (env.event === "synthesis_start") return;
  if (env.event === "debate_start" || env.event === "debate_done") return;

  if (!agent) return;
  const setter = agent === "primary" ? setPrimary : setDevil;

  switch (env.event) {
    case "start": {
      const runId = typeof data["runId"] === "string" ? (data["runId"] as string) : null;
      setter((s) => ({ ...s, runId }));
      return;
    }
    case "thought":
    case "answer": {
      const chunk = typeof data["chunk"] === "string" ? (data["chunk"] as string) : "";
      const kind = env.event as "thought" | "answer";
      setter((s) => ({ ...s, items: appendStream(s.items, kind, chunk, at) }));
      return;
    }
    case "tool_call": {
      setter((s) => ({
        ...s,
        items: [
          ...sealOpen(s.items),
          {
            kind: "tool_call",
            id: String(data["id"] ?? ""),
            name: String(data["name"] ?? ""),
            args: (data["args"] as Record<string, unknown> | undefined) ?? {},
            at,
          },
        ],
      }));
      return;
    }
    case "observation": {
      const result =
        (data["result"] as { ok: boolean; summary?: string; error?: string; data?: Record<string, unknown> } | undefined) ?? { ok: false, error: "no result" };
      const actionId =
        result.data && typeof result.data["actionId"] === "string" ? (result.data["actionId"] as string) : undefined;
      setter((s) => ({
        ...s,
        items: [
          ...sealOpen(s.items),
          {
            kind: "observation",
            id: String(data["id"] ?? ""),
            name: String(data["name"] ?? ""),
            ok: result.ok,
            ...(result.summary ? { summary: result.summary } : {}),
            ...(result.error ? { error: result.error } : {}),
            ...(actionId ? { actionId } : {}),
            durationMs: Number(data["durationMs"] ?? 0),
            at,
          },
        ],
      }));
      return;
    }
    case "citations": {
      const list = Array.isArray(data["citations"]) ? (data["citations"] as Citation[]) : [];
      setter((s) => ({ ...s, items: [...sealOpen(s.items), { kind: "citations", citations: list, at }] }));
      return;
    }
    case "done": {
      setter((s) => ({
        ...s,
        items: [...sealOpen(s.items), { kind: "done", turns: Number(data["turns"] ?? 0), totalMs: Number(data["totalMs"] ?? 0), at }],
      }));
      return;
    }
    case "error": {
      setter((s) => ({ ...s, items: [...sealOpen(s.items), { kind: "error", message: String(data["message"] ?? "unknown error"), at }] }));
      return;
    }
  }
}

function appendStream(prev: StreamItem[], kind: "thought" | "answer", chunk: string, at: number): StreamItem[] {
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
