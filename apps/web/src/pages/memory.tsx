import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { getGraph, type Entity, type GraphResponse, type Relation } from "@/lib/api";
import { AmbientOrbs, Tilt3D, ScrollReveal } from "@/components/parallax";
import { ResponsiveConstellation, HoverDetail } from "@/components/constellation-chart";

const AGENT = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8787";

type Phase = "idle" | "extracting" | "done" | "error";

interface Progress {
  index: number;
  total: number;
  entities: number;
  relations: number;
  currentChunks: number;
}

export default function MemoryPage() {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<Progress>({ index: 0, total: 0, entities: 0, relations: 0, currentChunks: 0 });
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, []);

  async function load() {
    const g = await getGraph();
    setGraph(g);
  }

  async function extract(rebuild: boolean) {
    if (phase === "extracting") return;
    setPhase("extracting");
    setErr(null);
    setProgress({ index: 0, total: 0, entities: 0, relations: 0, currentChunks: 0 });
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(`${AGENT}/graph/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ rebuild }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => res.statusText);
        setErr(txt);
        setPhase("error");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let entitiesAcc = 0;
      let relationsAcc = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        let eventName = "";
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith("data:")) continue;
          try {
            const data = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
            if (eventName === "start") {
              setProgress((p) => ({ ...p, total: Number(data["totalChunks"] ?? 0) }));
            } else if (eventName === "batch") {
              const ef = Number(data["entitiesFound"] ?? 0);
              const rf = Number(data["relationsFound"] ?? 0);
              entitiesAcc += ef;
              relationsAcc += rf;
              setProgress({
                index: Number(data["index"] ?? 0),
                total: Number(data["total"] ?? 0),
                entities: entitiesAcc,
                relations: relationsAcc,
                currentChunks: Number(data["chunksInBatch"] ?? 0),
              });
            } else if (eventName === "done") {
              setPhase("done");
              await load();
            } else if (eventName === "error") {
              setErr(String(data["message"] ?? "extraction failed"));
              setPhase("error");
            }
          } catch { /* malformed */ }
        }
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      setErr((e as Error).message);
      setPhase("error");
    }
  }

  const totalEntities = (graph?.stats.entities.person ?? 0) +
    (graph?.stats.entities.project ?? 0) +
    (graph?.stats.entities.topic ?? 0);

  const hasGraph = totalEntities > 0;
  const [view, setView] = useState<"constellation" | "ledger">("constellation");
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <>
      <Head>
        <title>Mnemos — the memory graph</title>
      </Head>
      <main className="relative min-h-dvh w-full scene-3d">
        <div className="pointer-events-none fixed inset-0 z-0">
          <AmbientOrbs />
        </div>
        <header className="relative z-10 border-b border-[color:var(--color-rule)]/70">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-4 md:px-16">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="display text-[1.4rem] italic leading-none text-[color:var(--color-paper)]">
                Mnemos
              </span>
              <span className="label">μν. · the memory graph</span>
            </Link>
            <nav className="flex items-center gap-5 chrome">
              <Link href="/search" className="hover:text-[color:var(--color-paper-dim)]">search</Link>
              <span aria-hidden>·</span>
              <Link href="/ask" className="hover:text-[color:var(--color-paper-dim)]">ask</Link>
              <span aria-hidden>·</span>
              <Link href="/memory" className="text-[color:var(--color-paper-dim)]">memory</Link>
              <span aria-hidden>·</span>
              <Link href="/commitments" className="hover:text-[color:var(--color-paper-dim)]">commitments</Link>
            </nav>
          </div>
        </header>

        <section className="relative z-10 mx-auto max-w-[1240px] px-10 pb-32 pt-14 md:px-16">
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
          >
            <span className="block h-px w-10 bg-[color:var(--color-vermilion)]" />
            <span className="label">08 · the memory graph</span>
          </motion.div>

          <motion.h1
            className="display mt-6 max-w-[26ch] text-[clamp(2rem,5vw,3.2rem)] italic leading-[1.05] text-[color:var(--color-paper)]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          >
            Everyone, everything,
            <br />
            <span style={{ color: "var(--color-paper-muted)" }}>extracted.</span>
          </motion.h1>
          <motion.p
            className="mt-4 max-w-[60ch] text-[0.98rem] leading-relaxed text-[color:var(--color-paper-dim)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Mnemos scans the corpus chunk-by-chunk and lifts named entities — people,
            projects, commitments — into a structured graph. Every mention gets
            counted; every commitment gets a directional edge.
          </motion.p>

          {/* stats bar — 3D tilt on each tile */}
          <motion.div
            className="scene-3d mt-12 grid grid-cols-2 gap-px overflow-hidden border border-[color:var(--color-rule)] bg-[color:var(--color-rule)] md:grid-cols-4"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <Tilt3D max={4} lift={6}><StatTile label="people" value={graph?.stats.entities.person ?? 0} accent="vermilion" /></Tilt3D>
            <Tilt3D max={4} lift={6}><StatTile label="projects" value={graph?.stats.entities.project ?? 0} accent="saffron" /></Tilt3D>
            <Tilt3D max={4} lift={6}><StatTile label="topics" value={graph?.stats.entities.topic ?? 0} accent="muted" /></Tilt3D>
            <Tilt3D max={4} lift={6}><StatTile label="relations" value={graph?.stats.relations ?? 0} accent="vermilion" /></Tilt3D>
          </motion.div>

          {/* extraction controls */}
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button
              disabled={phase === "extracting"}
              onClick={() => extract(!hasGraph ? false : true)}
              className="btn-decisive primary"
            >
              {phase === "extracting" ? "extracting…" : hasGraph ? "↻ re-extract graph" : "→ extract graph"}
            </button>
            {phase === "extracting" && (
              <ProgressInline progress={progress} />
            )}
            {phase === "error" && err && (
              <span className="chrome" style={{ color: "var(--color-vermilion)" }}>{err}</span>
            )}
          </div>

          {/* view selector — constellation (canon) vs ledger (fallback) */}
          {hasGraph && (
            <div className="mt-16 flex items-baseline gap-1 border-b border-[color:var(--color-rule)]">
              {(["constellation", "ledger"] as const).map((v) => {
                const active = view === v;
                return (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className="mono"
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
                    <span style={{ color: active ? "var(--color-vermilion)" : "var(--color-paper-faint)", marginRight: 6, fontSize: 9 }}>
                      v.{v === "constellation" ? "01" : "02"}
                    </span>
                    {v}
                  </button>
                );
              })}
              <span className="ml-auto chrome" style={{ padding: "10px 0" }}>
                {graph!.entities.person.length} stars · {graph!.entities.project.length} constellations · {graph!.stats.relations} edges
              </span>
            </div>
          )}

          {/* the graph itself */}
          {!hasGraph ? (
            <EmptyPanel />
          ) : view === "constellation" ? (
            <div className="mt-8">
              <div
                className="grid items-start gap-8"
                style={{ gridTemplateColumns: "minmax(0, 1fr) 320px" }}
              >
                <div
                  style={{
                    border: "1px solid var(--color-rule)",
                    background: "var(--color-ink-1)",
                    position: "relative",
                  }}
                >
                  <ResponsiveConstellation graph={graph!} onHover={setHovered} />
                </div>
                <aside
                  style={{
                    paddingLeft: 20,
                    borderLeft: "1px solid var(--color-rule)",
                    minHeight: 580,
                  }}
                >
                  <HoverDetail hovered={hovered} graph={graph!} relations={graph!.relations} />
                </aside>
              </div>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-3">
              <ScrollReveal delay={0}>
                <Column label="people" tone="vermilion" entities={graph?.entities.person ?? []} relations={graph?.relations ?? []} />
              </ScrollReveal>
              <ScrollReveal delay={0.1}>
                <Column label="projects" tone="saffron" entities={graph?.entities.project ?? []} relations={graph?.relations ?? []} />
              </ScrollReveal>
              <ScrollReveal delay={0.2}>
                <Column label="topics" tone="muted" entities={graph?.entities.topic ?? []} relations={graph?.relations ?? []} />
              </ScrollReveal>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent: "vermilion" | "saffron" | "muted" }) {
  const color =
    accent === "vermilion" ? "var(--color-vermilion)"
    : accent === "saffron" ? "var(--color-saffron)"
    : "var(--color-paper-muted)";
  return (
    <div className="bg-[color:var(--color-ink-1)] px-6 py-7">
      <div className="display tabular text-[2.4rem] italic leading-none" style={{ color: "var(--color-paper)" }}>
        {value}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="block h-px w-6" style={{ background: color }} />
        <span className="label">{label}</span>
      </div>
    </div>
  );
}

function ProgressInline({ progress }: { progress: Progress }) {
  const pct = progress.total > 0 ? Math.round((progress.index / progress.total) * 100) : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col">
        <span className="chrome">
          batch <span className="tabular text-[color:var(--color-paper-dim)]">{progress.index}</span> / <span className="tabular">{progress.total}</span>
        </span>
        <span className="chrome">
          <span className="tabular text-[color:var(--color-paper-dim)]">{progress.entities}</span> entities ·{" "}
          <span className="tabular text-[color:var(--color-paper-dim)]">{progress.relations}</span> relations
        </span>
      </div>
      <div className="h-px w-32 overflow-hidden bg-[color:var(--color-rule-strong)]">
        <div className="h-full bg-[color:var(--color-vermilion)] transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono tabular text-[0.78rem]" style={{ color: "var(--color-vermilion)" }}>
        {pct}%
      </span>
    </div>
  );
}

function Column({
  label,
  tone,
  entities,
  relations,
}: {
  label: string;
  tone: "vermilion" | "saffron" | "muted";
  entities: Entity[];
  relations: Relation[];
}) {
  const accent =
    tone === "vermilion" ? "var(--color-vermilion)"
    : tone === "saffron" ? "var(--color-saffron)"
    : "var(--color-paper-muted)";
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="display text-[1.5rem] italic leading-none text-[color:var(--color-paper)]">{label}</h2>
        <span className="label">{entities.length}</span>
      </div>
      <span className="mt-3 block h-px w-12" style={{ background: accent }} />
      {entities.length === 0 ? (
        <p className="mt-6 max-w-[34ch] text-[0.9rem] leading-relaxed text-[color:var(--color-paper-faint)]">
          none extracted yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-5">
          {entities.map((e) => (
            <EntityRow key={e.id} e={e} relations={relations} accent={accent} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EntityRow({ e, relations, accent }: { e: Entity; relations: Relation[]; accent: string }) {
  const owes = relations.filter((r) => r.from === e.key && r.kind === "owes").slice(0, 3);
  const owedTo = relations.filter((r) => r.to === e.key && r.kind === "owes").slice(0, 3);
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="display text-[1.1rem] italic leading-tight text-[color:var(--color-paper)]">
            {e.name}
          </div>
          {e.role && (
            <p className="mt-1 text-[0.85rem] leading-snug text-[color:var(--color-paper-dim)]">
              {e.role}
            </p>
          )}
        </div>
        <div className="flex items-baseline gap-3 shrink-0">
          <DataSparkline series={e.series} accent={accent} />
          <span className="font-mono tabular text-[0.74rem] text-[color:var(--color-paper-faint)]">
            {e.mentions}×
          </span>
        </div>
      </div>
      {(owes.length > 0 || owedTo.length > 0) && (
        <ul className="mt-2 space-y-1">
          {owes.map((r) => (
            <li key={r.id} className="chrome">
              → owes <span className="text-[color:var(--color-paper-dim)]">{r.to}</span>: {r.evidence.slice(0, 80)}
            </li>
          ))}
          {owedTo.map((r) => (
            <li key={r.id} className="chrome">
              ← owed by <span className="text-[color:var(--color-paper-dim)]">{r.from}</span>: {r.evidence.slice(0, 80)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function DataSparkline({ series, accent }: { series: Entity["series"]; accent: string }) {
  if (series.length === 0) return null;
  const max = Math.max(...series.map((s) => s.count), 1);
  const width = 48;
  const height = 14;
  const step = series.length > 1 ? width / (series.length - 1) : width;
  const points = series
    .map((s, i) => `${i * step},${height - (s.count / max) * height}`)
    .join(" ");
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }} aria-hidden>
      <polyline
        fill="none"
        stroke={accent}
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        opacity={0.85}
      />
    </svg>
  );
}

function EmptyPanel() {
  return (
    <div className="mt-16 border border-[color:var(--color-rule)] bg-[color:var(--color-ink-1)] p-10">
      <p className="label">graph empty</p>
      <p className="mt-3 max-w-[52ch] text-[1rem] leading-relaxed text-[color:var(--color-paper-dim)]">
        Run the extractor above. Gemini will read the corpus chunk-by-chunk (batches
        of 12), pull out named entities, and write them to{" "}
        <code className="font-mono text-[0.88em] text-[color:var(--color-paper)]">mongo.entities</code>{" "}
        and{" "}
        <code className="font-mono text-[0.88em] text-[color:var(--color-paper)]">mongo.relations</code>.
        The run takes roughly 1 minute per 50 chunks.
      </p>
    </div>
  );
}
