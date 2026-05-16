import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "running" | "done" | "error";

interface ProgressState {
  phase: Phase;
  total: number;
  ok: number;
  fail: number;
  currentTitle: string;
  error: string | null;
}

const AGENT = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8787";

export default function IngestPage() {
  const [state, setState] = useState<ProgressState>({
    phase: "idle",
    total: 0,
    ok: 0,
    fail: 0,
    currentTitle: "",
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  function start() {
    if (state.phase === "running") return;
    setState({ phase: "running", total: 0, ok: 0, fail: 0, currentTitle: "", error: null });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    void (async () => {
      try {
        const res = await fetch(`${AGENT}/ingest/demo`, {
          method: "POST",
          signal: ctrl.signal,
          headers: { "Accept": "text/event-stream" },
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => res.statusText);
          let detail = text;
          try { detail = (JSON.parse(text) as { detail?: string }).detail ?? text; } catch { /* raw */ }
          setState((s) => ({ ...s, phase: "error", error: detail }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            try {
              type Ev = { type: string; total?: number; ok?: number; fail?: number; title?: string; error?: string };
              const ev = JSON.parse(line.slice(5).trim()) as Ev;
              if (ev.type === "start") {
                setState((s) => ({ ...s, total: ev.total ?? 0 }));
              } else if (ev.type === "progress") {
                setState((s) => ({
                  ...s,
                  total: ev.total ?? s.total,
                  ok: ev.ok ?? s.ok,
                  fail: ev.fail ?? s.fail,
                  currentTitle: ev.title ?? s.currentTitle,
                }));
              } else if (ev.type === "done") {
                setState((s) => ({
                  ...s,
                  phase: "done",
                  total: ev.total ?? s.total,
                  ok: ev.ok ?? s.ok,
                  fail: ev.fail ?? s.fail,
                }));
              }
            } catch { /* malformed line */ }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setState((s) => ({ ...s, phase: "error", error: (err as Error).message }));
      }
    })();
  }

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const pct = state.total > 0 ? Math.round((state.ok / state.total) * 100) : 0;

  return (
    <>
      <Head>
        <title>Mnemos — load the corpus</title>
      </Head>
      <main className="relative min-h-dvh w-full">
        <header className="border-b border-[color:var(--color-rule)]/70">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-4 md:px-16">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="display text-[1.4rem] italic leading-none text-[color:var(--color-paper)]">
                Mnemos
              </span>
              <span className="label">μν. · load the corpus</span>
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-[1240px] px-10 pb-32 pt-14 md:px-16">
          <div className="flex items-center gap-3">
            <span className="block h-px w-10 bg-[color:var(--color-vermilion)]" />
            <span className="label">07 · ingest the demo corpus</span>
          </div>

          <h1 className="display mt-6 max-w-[26ch] text-[clamp(2rem,5vw,3.2rem)] italic leading-[1.05] text-[color:var(--color-paper)]">
            Loading{" "}
            <em style={{ color: "var(--color-paper-dim)" }}>Alex's memory.</em>
          </h1>
          <p className="mt-4 max-w-[60ch] text-[0.98rem] leading-relaxed text-[color:var(--color-paper-dim)]">
            247 synthetic emails, calendar events, meeting notes, and docs —
            chunked, embedded, and indexed in Atlas Vector Search.
          </p>

          <div className="mt-14 max-w-[640px]">
            {state.phase === "idle" && (
              <div className="border border-[color:var(--color-rule)] bg-[color:var(--color-ink-1)] p-8">
                <p className="label">ready to ingest</p>
                <p className="mt-3 max-w-[44ch] text-[0.95rem] leading-relaxed text-[color:var(--color-paper-dim)]">
                  This reads the pre-generated fixture at{" "}
                  <code className="font-mono text-[0.82rem] text-[color:var(--color-paper)]">
                    scripts/fixtures/alex-data.json
                  </code>{" "}
                  and loads it into Atlas. Run the seed script first if the
                  fixture is missing.
                </p>
                <button
                  onClick={start}
                  className="mt-7 inline-flex items-center gap-2 border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-4 py-2 font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[color:var(--color-paper-dim)] transition-colors hover:border-[color:var(--color-vermilion)] hover:text-[color:var(--color-paper)]"
                >
                  <span className="text-[color:var(--color-vermilion)]">→</span>
                  start ingestion
                </button>
              </div>
            )}

            {state.phase === "running" && (
              <IngestTile total={state.total} ok={state.ok} fail={state.fail} pct={pct} title={state.currentTitle} />
            )}

            {state.phase === "done" && (
              <div className="border border-[color:var(--color-rule)] bg-[color:var(--color-ink-1)] p-8">
                <IngestTile total={state.total} ok={state.ok} fail={state.fail} pct={100} title="" />
                <div className="mt-8 flex flex-wrap items-center gap-6">
                  <Link
                    href="/search"
                    className="inline-flex items-center gap-2 border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-4 py-2 font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[color:var(--color-paper-dim)] transition-colors hover:border-[color:var(--color-vermilion)] hover:text-[color:var(--color-paper)]"
                  >
                    → search the vault
                  </Link>
                  <Link href="/ask" className="chrome transition-colors hover:text-[color:var(--color-paper-dim)]">
                    ask the agent
                  </Link>
                </div>
              </div>
            )}

            {state.phase === "error" && (
              <div className="border border-[color:var(--color-vermilion-deep)]/60 bg-[color:var(--color-ink-1)] p-8">
                <p className="label">ingest failed</p>
                <p className="mt-3 font-mono text-[0.85rem] text-[color:var(--color-paper-dim)]">
                  {state.error}
                </p>
                <button
                  onClick={start}
                  className="mt-6 inline-flex items-center gap-2 border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-4 py-2 font-mono text-[0.78rem] uppercase tracking-[0.14em] text-[color:var(--color-paper-dim)] transition-colors hover:border-[color:var(--color-vermilion)] hover:text-[color:var(--color-paper)]"
                >
                  retry
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

function IngestTile({
  total,
  ok,
  fail,
  pct,
  title,
}: {
  total: number;
  ok: number;
  fail: number;
  pct: number;
  title: string;
}) {
  return (
    <div className="border border-[color:var(--color-rule)] bg-[color:var(--color-ink-1)] p-8">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="display text-[3.2rem] italic leading-none tabular-nums text-[color:var(--color-paper)]">
            {ok}
          </span>
          <span className="display ml-1 text-[1.8rem] italic leading-none text-[color:var(--color-paper-muted)]">
            / {total > 0 ? total : "—"}
          </span>
        </div>
        <span className="font-mono text-[1.1rem] tabular-nums" style={{ color: pct === 100 ? "#4ade80" : "var(--color-vermilion)" }}>
          {pct}%
        </span>
      </div>
      <span className="label mt-2 block">docs ingested</span>

      <div className="mt-5 h-px w-full overflow-hidden bg-[color:var(--color-rule-strong)]">
        <div
          className="h-full bg-[color:var(--color-vermilion)] transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {title && (
        <p className="mt-4 truncate font-mono text-[0.78rem] text-[color:var(--color-paper-faint)]">
          {title}
        </p>
      )}

      {fail > 0 && (
        <p className="mt-3 font-mono text-[0.78rem] text-[color:var(--color-paper-faint)]">
          {fail} failed
        </p>
      )}
    </div>
  );
}
