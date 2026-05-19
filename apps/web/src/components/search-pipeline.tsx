import { useMemo, useState } from "react";
import type { SearchResponse } from "@/lib/api";

/**
 * SearchPipeline — six-phase header + scrub + right-rail inspector.
 *
 * Adapted from the Mnemos-III design, wired to live data from /search.
 *
 * The agent returns phases like ["vector 24", "bm25 24", "rrf → 32", "top 8"]
 * (or with "rerank · gemini · top 8" when rerank ran). We parse those into
 * per-phase counts and render the six-phase pipeline:
 *   01 embed → 02 vector → 03 bm25 → 04 rrf → 05 rerank → 06 result
 *
 * Each cell shows phase number, italic label, sub-method, output count.
 * The right-rail inspector shows what each phase produced — top vector
 * hits, top bm25 hits, RRF formula, rerank explanation, final composition.
 */

interface PhaseInfo {
  id: "embed" | "vector" | "bm25" | "rrf" | "rerank" | "result";
  label: string;
  sub: string;
  out: string;
  count: number | null;
  ran: boolean;
}

interface ParsedPipeline {
  phases: PhaseInfo[];
  reranked: boolean;
  totalMs: number;
  finalCount: number;
}

function parsePipeline(response: SearchResponse): ParsedPipeline {
  const phases = response.phases ?? [];

  // Try to extract counts from the phase strings.
  const num = (s: string): number | null => {
    const m = s.match(/\d+/);
    return m ? parseInt(m[0]!, 10) : null;
  };

  const vectorPhase = phases.find((p) => p.startsWith("vector"));
  const bm25Phase = phases.find((p) => p.startsWith("bm25"));
  const rrfPhase = phases.find((p) => p.includes("rrf"));
  const rerankPhase = phases.find((p) => p.includes("rerank"));
  const topPhase = phases.find((p) => p.startsWith("top") || p.includes(" top "));

  const reranked = !!rerankPhase;
  const finalCount = response.count ?? 0;

  return {
    reranked,
    finalCount,
    totalMs: response.tookMs ?? 0,
    phases: [
      {
        id: "embed",
        label: "embed",
        sub: "text-embedding-004 · 768d",
        out: "768-d query vector",
        count: null,
        ran: true,
      },
      {
        id: "vector",
        label: "vector",
        sub: "atlas $vectorSearch · cosine",
        out: vectorPhase ? `${num(vectorPhase) ?? "?"} candidates` : "no candidates",
        count: vectorPhase ? num(vectorPhase) : null,
        ran: !!vectorPhase,
      },
      {
        id: "bm25",
        label: "bm25",
        sub: "atlas $search · lucene.english",
        out: bm25Phase ? `${num(bm25Phase) ?? "?"} candidates` : "no candidates",
        count: bm25Phase ? num(bm25Phase) : null,
        ran: !!bm25Phase,
      },
      {
        id: "rrf",
        label: "rrf",
        sub: "reciprocal rank · k=60",
        out: rrfPhase ? `${num(rrfPhase) ?? "?"} merged` : "skipped",
        count: rrfPhase ? num(rrfPhase) : null,
        ran: !!rrfPhase,
      },
      {
        id: "rerank",
        label: "rerank",
        sub: "gemini · thinkingBudget=0",
        out: reranked ? `top ${finalCount} rescored` : "skipped",
        count: reranked ? finalCount : null,
        ran: reranked,
      },
      {
        id: "result",
        label: "result",
        sub: "cited · streamable",
        out: `${finalCount} hits`,
        count: finalCount,
        ran: finalCount > 0,
      },
    ],
  };
}

export function SearchPipeline({ response }: { response: SearchResponse }) {
  const parsed = useMemo(() => parsePipeline(response), [response]);
  // Default to the last phase that ran (so the inspector starts on the result)
  const [phase, setPhase] = useState<number>(() => {
    const lastRan = parsed.phases.map((p, i) => (p.ran ? i : -1)).filter((i) => i >= 0);
    return lastRan[lastRan.length - 1] ?? 0;
  });

  return (
    <div>
      {/* Pipeline header — six cells in a row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          border: "1px solid var(--color-rule)",
          background: "var(--color-ink-1)",
        }}
      >
        {parsed.phases.map((p, i) => {
          const isActive = i === phase;
          const isPast = i < phase && p.ran;
          const isSkipped = !p.ran;
          return (
            <div
              key={p.id}
              style={{
                padding: "14px 16px",
                borderRight: i < 5 ? "1px solid var(--color-rule)" : "none",
                position: "relative",
                opacity: isActive ? 1 : isSkipped ? 0.32 : isPast ? 0.7 : 0.5,
                transition: "opacity 280ms var(--ease)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                <span
                  className="mono tabular"
                  style={{ fontSize: 9, color: "var(--color-paper-faint)", letterSpacing: "0.14em" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {isActive && <span className="pulse-dot" />}
                {isPast && (
                  <span
                    style={{
                      color: "var(--color-paper-faint)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                    }}
                  >
                    ✓
                  </span>
                )}
                {isSkipped && (
                  <span
                    style={{
                      color: "var(--color-paper-faint)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.14em",
                    }}
                  >
                    skip
                  </span>
                )}
              </div>
              <div
                className="display-i"
                style={{
                  fontSize: 20,
                  color: isActive ? "var(--color-vermilion)" : "var(--color-paper)",
                  letterSpacing: "-0.005em",
                  lineHeight: 1,
                }}
              >
                {p.label}
              </div>
              <div className="chrome" style={{ fontSize: 10, marginTop: 4 }}>
                {p.sub}
              </div>
              <div
                className="chrome"
                style={{ fontSize: 9, marginTop: 10, color: "var(--color-paper-faint)" }}
              >
                ↳ {p.out}
              </div>
              {i < 5 && (
                <span
                  style={{
                    position: "absolute",
                    right: -6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--color-rule-strong)",
                    background: "var(--color-ink-1)",
                    padding: "0 2px",
                  }}
                >
                  ›
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Scrub buttons */}
      <div style={{ marginTop: 20, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }}>
        <span className="chrome">scrub:</span>
        {parsed.phases.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setPhase(i)}
            disabled={!p.ran}
            style={{
              padding: "4px 10px",
              border: "1px solid " + (phase === i ? "var(--color-vermilion)" : "var(--color-rule)"),
              color: !p.ran
                ? "var(--color-paper-ghost)"
                : phase === i
                  ? "var(--color-paper)"
                  : "var(--color-paper-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: p.ran ? "pointer" : "not-allowed",
              transition: "all 200ms var(--ease)",
              background: phase === i ? "var(--color-ink-2)" : "transparent",
            }}
          >
            {String(i + 1).padStart(2, "0")} · {p.label}
          </button>
        ))}
      </div>

      <PhaseInspector phase={parsed.phases[phase]!} parsed={parsed} response={response} />
    </div>
  );
}

function PhaseInspector({
  phase,
  parsed,
  response,
}: {
  phase: PhaseInfo;
  parsed: ParsedPipeline;
  response: SearchResponse;
}) {
  const hits = response.results;

  return (
    <div
      style={{
        marginTop: 28,
        border: "1px solid var(--color-rule)",
        background: "var(--color-ink-1)",
        padding: "22px 26px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <span className="label">phase {String(parsed.phases.indexOf(phase) + 1).padStart(2, "0")}</span>
        <span
          className="display-i"
          style={{
            fontSize: 24,
            color: "var(--color-paper)",
            lineHeight: 1,
            letterSpacing: "-0.005em",
          }}
        >
          {phase.label}.
        </span>
      </div>
      <div className="chrome" style={{ marginBottom: 18 }}>{phase.sub}</div>
      <hr style={{ borderColor: "var(--color-rule-soft)", marginBottom: 18 }} />

      {phase.id === "embed" && (
        <div>
          <div className="label" style={{ marginBottom: 8 }}>query</div>
          <div
            className="display-i"
            style={{ fontSize: 18, color: "var(--color-paper-dim)", marginBottom: 18 }}
          >
            “{response.query}”
          </div>
          <div className="label" style={{ marginBottom: 6 }}>token preview</div>
          <div className="mono" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {response.query.split(/\s+/).slice(0, 8).map((t, i) => (
              <span
                key={i}
                style={{
                  padding: "2px 8px",
                  border: "1px solid var(--color-vermilion)",
                  color: "var(--color-vermilion)",
                  fontSize: 11,
                  letterSpacing: "0.06em",
                }}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="chrome">
            Encoded to a 768-d float vector by <span style={{ color: "var(--color-paper-dim)" }}>text-embedding-004</span> with task_type=RETRIEVAL_QUERY.
          </div>
        </div>
      )}

      {phase.id === "vector" && (
        <div>
          <div className="chrome" style={{ marginBottom: 14 }}>
            Atlas <span style={{ color: "var(--color-paper-dim)" }}>$vectorSearch</span> ·{" "}
            {phase.count ?? 0} candidates returned, ranked by cosine similarity over{" "}
            <span style={{ color: "var(--color-paper-dim)" }}>chunks.embedding</span>.
          </div>
          <div className="label" style={{ marginBottom: 10 }}>top vector hits in the merged set</div>
          {hits
            .filter((h) => h.fromVector)
            .slice(0, 6)
            .map((h, i) => (
              <PhaseRow key={h.chunkId} rank={i + 1} title={h.title} value={h.score} tone="v" />
            ))}
        </div>
      )}

      {phase.id === "bm25" && (
        <div>
          <div className="chrome" style={{ marginBottom: 14 }}>
            Atlas <span style={{ color: "var(--color-paper-dim)" }}>$search</span> · lexical match
            over <span style={{ color: "var(--color-paper-dim)" }}>chunks.text</span> +{" "}
            <span style={{ color: "var(--color-paper-dim)" }}>chunks.title</span> via the{" "}
            <span style={{ color: "var(--color-paper-dim)" }}>lucene.english</span> analyzer.
          </div>
          <div className="label" style={{ marginBottom: 10 }}>top bm25 hits in the merged set</div>
          {hits
            .filter((h) => h.fromText)
            .slice(0, 6)
            .map((h, i) => (
              <PhaseRow key={h.chunkId} rank={i + 1} title={h.title} value={h.score} tone="s" />
            ))}
        </div>
      )}

      {phase.id === "rrf" && (
        <div>
          <div className="label" style={{ marginBottom: 6 }}>formula</div>
          <div
            className="mono"
            style={{
              fontSize: 13,
              color: "var(--color-paper-dim)",
              padding: "10px 12px",
              border: "1px solid var(--color-rule)",
              background: "var(--color-ink-2)",
              marginBottom: 14,
            }}
          >
            rrf(d) = Σ 1 / (k + rank<sub style={{ color: "var(--color-paper-faint)" }}>r</sub>(d))
            <br />
            <span className="chrome" style={{ fontSize: 11 }}>
              k = 60 · two rankings fused (vector ∪ bm25)
            </span>
          </div>
          <div className="chrome" style={{ marginBottom: 12 }}>
            {phase.count ?? "?"} unique chunks after merge. Each chunk's fused score is the sum of
            inverse ranks across both retrievers.
          </div>
          <div className="label" style={{ marginBottom: 10 }}>merged · top</div>
          {hits.slice(0, 5).map((h, i) => (
            <PhaseRow
              key={h.chunkId}
              rank={i + 1}
              title={h.title}
              value={h.score}
              tone="paper"
              hint={h.fromVector && h.fromText ? "V+T" : h.fromVector ? "V" : "T"}
            />
          ))}
        </div>
      )}

      {phase.id === "rerank" && parsed.reranked && (
        <div>
          <div className="chrome" style={{ marginBottom: 14 }}>
            Gemini reranker over the top {hits.length * 2} candidates. JSON output (no thinking
            budget) reorders by query-passage relevance. Returns the new top-{hits.length}.
          </div>
          <div className="label" style={{ marginBottom: 10 }}>rescored</div>
          {hits.slice(0, 5).map((h, i) => (
            <PhaseRow key={h.chunkId} rank={i + 1} title={h.title} value={h.score} tone="paper" />
          ))}
        </div>
      )}

      {phase.id === "rerank" && !parsed.reranked && (
        <div>
          <div className="chrome" style={{ marginBottom: 14 }}>
            Rerank was <span style={{ color: "var(--color-paper-dim)" }}>not run</span> for this
            query — the agent only invokes the Gemini reranker on ambiguous or multi-faceted
            queries (it costs latency). The RRF-merged top set was returned directly.
          </div>
          <div className="label" style={{ marginBottom: 10 }}>opt-in by setting</div>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--color-saffron)",
              padding: "8px 10px",
              border: "1px solid var(--color-rule)",
              background: "var(--color-ink-2)",
            }}
          >
            search_memory(query: "...", rerank: true)
          </div>
        </div>
      )}

      {phase.id === "result" && (
        <div>
          <div className="chrome" style={{ marginBottom: 14 }}>
            {parsed.finalCount} hits returned in{" "}
            <span style={{ color: "var(--color-paper)" }}>{parsed.totalMs}ms</span> total. Each
            chunk is citation-grounded and traceable to{" "}
            <span style={{ color: "var(--color-paper-dim)" }}>documents._id</span>.
          </div>
          <div className="label" style={{ marginBottom: 8 }}>composition · by source</div>
          {(() => {
            const bySource: Record<string, number> = {};
            for (const h of hits) bySource[h.source] = (bySource[h.source] ?? 0) + 1;
            return (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "6px 12px",
                  fontSize: 11,
                  marginBottom: 14,
                }}
              >
                {Object.entries(bySource).map(([k, v]) => (
                  <FragmentRow key={k} k={k} v={v} />
                ))}
              </div>
            );
          })()}
          <div className="label" style={{ marginBottom: 6 }}>flag legend</div>
          <div className="chrome" style={{ fontSize: 11, lineHeight: 1.6 }}>
            <span style={{ color: "var(--color-vermilion)" }}>V</span> = found by vector ·{" "}
            <span style={{ color: "var(--color-saffron)" }}>T</span> = found by BM25 ·{" "}
            <span style={{ color: "var(--color-paper)" }}>V+T</span> = agreed by both
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ k, v }: { k: string; v: number }) {
  return (
    <>
      <span className="chrome">{k}</span>
      <span className="mono tabular" style={{ color: "var(--color-paper)" }}>{v}</span>
    </>
  );
}

function PhaseRow({
  rank,
  title,
  value,
  tone,
  hint,
}: {
  rank: number;
  title: string;
  value: number;
  tone: "v" | "s" | "paper";
  hint?: string;
}) {
  const color =
    tone === "v" ? "var(--color-vermilion)" : tone === "s" ? "var(--color-saffron)" : "var(--color-paper)";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "24px 1fr auto auto",
        gap: 10,
        padding: "6px 0",
        borderBottom: "1px dotted var(--color-rule)",
        alignItems: "baseline",
      }}
    >
      <span className="mono tabular" style={{ fontSize: 10, color: "var(--color-paper-faint)" }}>
        {String(rank).padStart(2, "0")}
      </span>
      <span className="chrome" style={{ color: "var(--color-paper-dim)" }}>{title}</span>
      {hint && (
        <span
          style={{
            padding: "1px 5px",
            border: "1px solid var(--color-rule)",
            color: "var(--color-paper-faint)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.08em",
          }}
        >
          {hint}
        </span>
      )}
      <span className="mono tabular" style={{ fontSize: 11, color, minWidth: 56, textAlign: "right" }}>
        {value.toFixed(4)}
      </span>
    </div>
  );
}
