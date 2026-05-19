import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ingestStats, ready, search, SearchFailed, type IngestStats, type ReadyResponse, type SearchResponse } from "@/lib/api";
import { SearchInput } from "@/components/search-input";
import { ResultCard } from "@/components/result-card";
import { SearchPipeline } from "@/components/search-pipeline";

interface UIState {
  query: string;
  pending: boolean;
  response: SearchResponse | null;
  error: string | null;
}

export default function SearchPage() {
  const router = useRouter();
  const [state, setState] = useState<UIState>({
    query: "",
    pending: false,
    response: null,
    error: null,
  });
  const [readyState, setReadyState] = useState<ReadyResponse | null>(null);
  const [stats, setStats] = useState<IngestStats | null>(null);
  const autoRanRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([ready(), ingestStats()]).then(([r, s]) => {
      if (cancelled) return;
      setReadyState(r);
      setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const runWith = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setState((s) => ({ ...s, query: trimmed, pending: true, error: null }));
    try {
      const r = await search(trimmed, { limit: 12 });
      setState((s) => ({ ...s, pending: false, response: r }));
    } catch (err) {
      const msg =
        err instanceof SearchFailed
          ? `${err.code}${err.status ? " · " + err.status : ""}`
          : err instanceof Error
            ? err.message
            : "unknown error";
      setState((s) => ({ ...s, pending: false, error: msg, response: null }));
    }
  }, []);

  async function run() {
    if (state.pending) return;
    await runWith(state.query);
  }

  useEffect(() => {
    if (!router.isReady || autoRanRef.current) return;
    const q = typeof router.query.q === "string" ? router.query.q : "";
    const auto = router.query.run === "1";
    if (q.length > 0) {
      setState((s) => ({ ...s, query: q }));
      if (auto) {
        autoRanRef.current = true;
        void runWith(q);
      }
    }
  }, [router.isReady, router.query.q, router.query.run, runWith]);

  return (
    <>
      <Head>
        <title>Mnemos — ask the vault</title>
      </Head>
      <main className="relative min-h-dvh w-full">
        <header className="border-b border-[color:var(--color-rule)]/70">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-4 md:px-16">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="display text-[1.4rem] italic leading-none text-[color:var(--color-paper)]">
                Mnemos
              </span>
              <span className="label">μν. · ask the vault</span>
            </Link>
            <div className="flex items-center gap-5">
              <nav className="flex items-center gap-5 chrome">
                <Link href="/search" className="text-[color:var(--color-paper-dim)]">
                  search
                </Link>
                <span aria-hidden>·</span>
                <Link
                  href="/ask"
                  className="transition-colors hover:text-[color:var(--color-paper-dim)]"
                >
                  ask
                </Link>
              </nav>
              <ReadyChip ready={readyState} stats={stats} />
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-[1240px] px-10 pb-32 pt-16 md:px-16">
          <div className="flex items-center gap-3">
            <span className="block h-px w-10 bg-[color:var(--color-vermilion)]" />
            <span className="label">02 · semantic recall</span>
          </div>

          <h1 className="display mt-6 max-w-[26ch] text-[clamp(2rem,5vw,3.2rem)] italic leading-[1.05] text-[color:var(--color-paper)]">
            What do you want
            <span style={{ color: "var(--color-paper-muted)" }}> to remember?</span>
          </h1>

          <div className="mt-12">
            <SearchInput
              value={state.query}
              onChange={(q) => setState((s) => ({ ...s, query: q }))}
              onSubmit={run}
              pending={state.pending}
            />
          </div>

          <div className="mt-16">
            {state.error ? <ErrorPanel message={state.error} /> : null}
            {state.pending ? <LoadingPanel /> : null}
            {!state.pending && state.response ? (
              <ResultsPanel response={state.response} />
            ) : null}
            {!state.pending && !state.response && !state.error ? (
              <EmptyPanel stats={stats} />
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}

function ReadyChip({
  ready,
  stats,
}: {
  ready: ReadyResponse | null;
  stats: IngestStats | null;
}) {
  if (!ready) {
    return (
      <span className="flex items-center gap-2">
        <span className="block h-1.5 w-1.5 rounded-full bg-[color:var(--color-paper-faint)]" />
        <span className="chrome">agent offline</span>
      </span>
    );
  }
  const both = ready.atlas === "configured" && ready.vertex === "configured";
  return (
    <span className="flex items-center gap-4">
      <span className="chrome">
        {stats ? `${stats.documents} docs · ${stats.chunks} chunks` : "vault empty"}
      </span>
      <span className="flex items-center gap-2">
        <span
          className={`block h-1.5 w-1.5 rounded-full ${
            both
              ? "bg-[color:var(--color-vermilion)] pulse-dot"
              : "bg-[color:var(--color-paper-faint)]"
          }`}
        />
        <span className="chrome">
          atlas · {ready.atlas} <span aria-hidden>·</span> vertex · {ready.vertex}
        </span>
      </span>
    </span>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="border border-[color:var(--color-vermilion-deep)]/60 bg-[color:var(--color-ink-1)] p-6">
      <div className="flex items-baseline gap-3">
        <span className="display text-[1.4rem] italic leading-none text-[color:var(--color-vermilion)]">
          ✕
        </span>
        <div>
          <p className="label">search failed</p>
          <p className="mt-2 font-mono text-[0.85rem] text-[color:var(--color-paper-dim)]">
            {message}
          </p>
          <p className="mt-3 text-[0.85rem] leading-relaxed text-[color:var(--color-paper-muted)]">
            The agent is reachable but couldn't complete the search. The most
            likely cause is missing credentials or an Atlas index that hasn't
            finished building yet — vector indexes take ~1–3 minutes to come
            online.
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="space-y-px overflow-hidden border-y border-[color:var(--color-rule)]">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[3.5rem_1fr] gap-x-6 py-6"
          style={{ opacity: 0.7 - i * 0.14 }}
        >
          <div className="flex flex-col items-end gap-2">
            <span className="block h-3 w-6 bg-[color:var(--color-rule-strong)]" />
            <span className="block h-3 w-8 bg-[color:var(--color-rule)]" />
          </div>
          <div className="space-y-3">
            <span className="block h-5 w-1/3 bg-[color:var(--color-rule-strong)]" />
            <span className="block h-3 w-full max-w-[58ch] bg-[color:var(--color-rule)]" />
            <span className="block h-3 w-full max-w-[52ch] bg-[color:var(--color-rule)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyPanel({ stats }: { stats: IngestStats | null }) {
  return (
    <div className="border-t border-[color:var(--color-rule)] pt-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_auto]">
        <div>
          <p className="label">try a question</p>
          <ul className="mt-4 space-y-2 text-[1rem] leading-relaxed text-[color:var(--color-paper-dim)]">
            <li className="flex items-baseline gap-3">
              <span className="font-mono text-[0.8rem] text-[color:var(--color-vermilion)]">›</span>
              what did I commit to Sarah last week
            </li>
            <li className="flex items-baseline gap-3">
              <span className="font-mono text-[0.8rem] text-[color:var(--color-vermilion)]">›</span>
              who has open threads with Acme Co.
            </li>
            <li className="flex items-baseline gap-3">
              <span className="font-mono text-[0.8rem] text-[color:var(--color-vermilion)]">›</span>
              find every mention of Project Lantern this fortnight
            </li>
          </ul>
        </div>
        <div className="md:text-right">
          <p className="label">vault status</p>
          {stats ? (
            <ul className="mt-4 space-y-1.5 font-mono text-[0.82rem] text-[color:var(--color-paper-dim)]">
              {stats.sources.map((s) => (
                <li key={s.source} className="flex items-baseline gap-4 md:justify-end">
                  <span className="text-[color:var(--color-paper-faint)]">{s.source}</span>
                  <span className="tabular-nums">{s.count}</span>
                </li>
              ))}
              <li className="flex items-baseline gap-4 border-t border-[color:var(--color-rule)] pt-1.5 md:justify-end">
                <span className="text-[color:var(--color-paper-faint)]">total</span>
                <span className="tabular-nums text-[color:var(--color-paper)]">
                  {stats.documents} docs · {stats.chunks} chunks
                </span>
              </li>
            </ul>
          ) : (
            <p className="mt-4 max-w-[34ch] text-[0.9rem] leading-relaxed text-[color:var(--color-paper-muted)] md:ml-auto">
              The vault is empty. Run the Alex Chen seed to ingest 247 documents,
              or POST a `.txt` payload to <code className="font-mono text-[0.82rem] text-[color:var(--color-paper-dim)]">/ingest</code>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsPanel({ response }: { response: SearchResponse }) {
  const [view, setView] = useState<"pipeline" | "results">("pipeline");

  if (response.count === 0) {
    return (
      <div className="border-t border-[color:var(--color-rule)] py-12">
        <p className="label">no recall</p>
        <p className="mt-3 max-w-[52ch] text-[1.05rem] leading-relaxed text-[color:var(--color-paper-dim)]">
          The vault has nothing that matches{" "}
          <em className="display italic text-[color:var(--color-paper)]">
            "{response.query}"
          </em>
          . Try a broader phrasing, or check whether the relevant source has been
          ingested.
        </p>
      </div>
    );
  }

  const phases = response.phases ?? [];

  return (
    <div>
      {/* view toggle */}
      <div className="flex items-baseline gap-1 border-b border-[color:var(--color-rule)]">
        {(["pipeline", "results"] as const).map((v) => {
          const active = view === v;
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              className="mono focusable"
              style={{
                padding: "10px 16px",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: active ? "var(--color-paper)" : "var(--color-paper-muted)",
                borderBottom: active ? "1px solid var(--color-vermilion)" : "1px solid transparent",
                transition: "all var(--snap) var(--ease)",
                background: active ? "var(--color-ink-2)" : "transparent",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  color: active ? "var(--color-vermilion)" : "var(--color-paper-faint)",
                  marginRight: 6,
                  fontSize: 9,
                }}
              >
                v.{v === "pipeline" ? "01" : "02"}
              </span>
              {v}
            </button>
          );
        })}
        <span className="ml-auto chrome tabular-nums" style={{ padding: "10px 0" }}>
          {phases.length > 0 ? phases.join(" → ") + " · " : ""}
          {response.tookMs} ms
        </span>
      </div>

      {view === "pipeline" ? (
        <div className="mt-8">
          <SearchPipeline response={response} />
          <div className="mt-10 border-t border-[color:var(--color-rule)] pt-6">
            <span className="label">cited hits</span>
            <div className="mt-4">
              {response.results.map((hit, i) => (
                <ResultCard key={hit.chunkId} hit={hit} rank={i + 1} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          {response.results.map((hit, i) => (
            <ResultCard key={hit.chunkId} hit={hit} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
