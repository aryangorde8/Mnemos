import { useEffect, useState } from "react";

/**
 * InlineGraphTraversal — animated mini-constellation drawn inline in the
 * reasoning stream when `expand_via_graph` fires.
 *
 * Takes the tool's traversal payload (resolved seeds + traversed nodes +
 * relations) and lays them out radially around the seed(s) in an SVG.
 * Stars appear in sequence (~100ms apart), then edges draw from seed to
 * each visited entity, then the final chunk-count chip lands.
 *
 * Color code on edges by relation kind:
 *   - owes        → vermilion (#f25738)
 *   - works_with  → paper       (#f3ecdf)
 *   - manages     → saffron     (#e8c547)
 *   - discusses   → paper-muted (#9c9486)
 */

export interface TraversalPayload {
  resolved: Array<{ key: string; name: string; kind: string }>;
  traversed: Array<{ key: string; name: string; kind: string }>;
  relations: Array<{ from: string; to: string; kind: string }>;
  chunksFound: number;
  chunksReturned: number;
}

interface LaidOut {
  key: string;
  name: string;
  kind: string;
  isSeed: boolean;
  x: number;
  y: number;
}

const COLORS = {
  owes: "#f25738",
  works_with: "#f3ecdf",
  manages: "#e8c547",
  discusses: "#9c9486",
};

export function InlineGraphTraversal({ payload }: { payload: TraversalPayload }) {
  const [phase, setPhase] = useState<"intro" | "stars" | "edges" | "settled">("intro");

  useEffect(() => {
    setPhase("intro");
    const t1 = setTimeout(() => setPhase("stars"), 80);
    const t2 = setTimeout(() => setPhase("edges"), 600);
    const t3 = setTimeout(() => setPhase("settled"), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [payload]);

  const width = 640;
  const height = 220;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(height / 2 - 30, 90);

  // Seed entities (usually 1, sometimes more) — placed at center cluster.
  const seedKeys = new Set(payload.resolved.map((r) => r.key));
  const nonSeeds = payload.traversed.filter((t) => !seedKeys.has(t.key));

  // Layout: seeds at center, non-seeds radially around them.
  const nodes: LaidOut[] = [];
  if (payload.resolved.length === 1) {
    nodes.push({ ...payload.resolved[0]!, isSeed: true, x: cx, y: cy });
  } else {
    payload.resolved.forEach((s, i) => {
      const angle = (Math.PI * 2 * i) / payload.resolved.length - Math.PI / 2;
      nodes.push({
        ...s,
        isSeed: true,
        x: cx + Math.cos(angle) * 25,
        y: cy + Math.sin(angle) * 25,
      });
    });
  }
  nonSeeds.slice(0, 12).forEach((t, i) => {
    const angle = (Math.PI * 2 * i) / Math.min(nonSeeds.length, 12) - Math.PI / 2;
    nodes.push({
      ...t,
      isSeed: false,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  });

  const nodeByKey = new Map(nodes.map((n) => [n.key, n]));

  // Edges — only render relations where both endpoints are in the laid-out set,
  // and only between a seed and a non-seed (cleaner viz than the full graph).
  const edges = payload.relations
    .filter((r) => nodeByKey.has(r.from) && nodeByKey.has(r.to))
    .filter((r) => {
      const f = nodeByKey.get(r.from)!;
      const t = nodeByKey.get(r.to)!;
      return f.isSeed !== t.isSeed; // skip seed-seed and leaf-leaf
    })
    .slice(0, 24);

  const showStars = phase !== "intro";
  const showEdges = phase === "edges" || phase === "settled";
  const showChip = phase === "settled";

  return (
    <div
      style={{
        marginTop: 12,
        marginBottom: 6,
        border: "1px solid var(--color-rule)",
        background: "var(--color-ink-1)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ display: "block" }}>
        {/* Edges (drawn under stars) */}
        {showEdges &&
          edges.map((edge, i) => {
            const a = nodeByKey.get(edge.from)!;
            const b = nodeByKey.get(edge.to)!;
            const color = (COLORS as Record<string, string>)[edge.kind] ?? COLORS.discusses;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={a.isSeed || b.isSeed ? 0.8 : 0.4}
                strokeOpacity={a.isSeed || b.isSeed ? 0.55 : 0.25}
                strokeDasharray="3 2"
                style={{
                  animation: `edge-draw ${600 + (i % 8) * 60}ms cubic-bezier(.2,.7,.2,1) both`,
                  animationDelay: `${i * 35}ms`,
                }}
              />
            );
          })}

        {/* Stars */}
        {showStars &&
          nodes.map((n, i) => (
            <g
              key={n.key}
              style={{
                animation: `star-pop 380ms cubic-bezier(.34,1.56,.64,1) both`,
                animationDelay: `${i * 80}ms`,
                transformOrigin: `${n.x}px ${n.y}px`,
              }}
            >
              {/* Halo on seed only */}
              {n.isSeed && (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r="14"
                  fill="none"
                  stroke="#f25738"
                  strokeWidth="0.6"
                  strokeOpacity="0.55"
                  style={{
                    animation: "seed-pulse 1.6s ease-in-out infinite",
                    animationDelay: `${i * 80 + 400}ms`,
                  }}
                />
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r={n.isSeed ? 5.5 : 3.5}
                fill={n.isSeed ? "#f25738" : "#f3ecdf"}
                opacity={n.isSeed ? 1 : 0.85}
              />
              {/* Label */}
              <text
                x={n.x}
                y={n.y - (n.isSeed ? 12 : 9)}
                textAnchor="middle"
                fill={n.isSeed ? "#f3ecdf" : "#d8d2c5"}
                fontSize={n.isSeed ? "11" : "10"}
                fontFamily="var(--font-display)"
                fontStyle="italic"
                letterSpacing="-0.005em"
                style={{ pointerEvents: "none" }}
              >
                {truncate(n.name, n.isSeed ? 28 : 18)}
              </text>
              {/* Kind tag below for seed */}
              {n.isSeed && (
                <text
                  x={n.x}
                  y={n.y + 18}
                  textAnchor="middle"
                  fill="#6c645a"
                  fontSize="8"
                  fontFamily="var(--font-mono)"
                  letterSpacing="0.14em"
                >
                  SEED · {n.kind.toUpperCase()}
                </text>
              )}
            </g>
          ))}

        {/* Subtle background hairline scaffolding */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#2a2218"
          strokeWidth="0.4"
          strokeDasharray="1 4"
        />
        <circle cx={cx} cy={cy} r={radius * 0.55} fill="none" stroke="#2a2218" strokeWidth="0.3" strokeDasharray="1 4" />
      </svg>

      {/* Stats strip at bottom */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderTop: "1px solid var(--color-rule)",
          background: "var(--color-ink-2)",
          fontSize: 10,
          opacity: showChip ? 1 : 0.0,
          transition: "opacity 360ms cubic-bezier(.2,.7,.2,1)",
        }}
      >
        <span className="label">graph traversal</span>
        <span className="chrome tabular">
          <span style={{ color: "var(--color-vermilion)" }}>{payload.resolved.length}</span> seed
          <span style={{ color: "var(--color-rule-strong)", padding: "0 6px" }}>·</span>
          <span style={{ color: "var(--color-paper-dim)" }}>{payload.traversed.length}</span> entities
          <span style={{ color: "var(--color-rule-strong)", padding: "0 6px" }}>·</span>
          <span style={{ color: "var(--color-saffron)" }}>{edges.length}</span> edges drawn
          <span style={{ color: "var(--color-rule-strong)", padding: "0 6px" }}>·</span>
          <span style={{ color: "var(--color-paper)" }}>{payload.chunksReturned}</span>
          <span style={{ color: "var(--color-paper-faint)" }}>/{payload.chunksFound}</span> chunks pulled
        </span>
      </div>

      <style>{`
        @keyframes star-pop {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes edge-draw {
          from { stroke-dashoffset: 60; opacity: 0; }
          to   { stroke-dashoffset: 0;  opacity: 1; }
        }
        @keyframes seed-pulse {
          0%, 100% { stroke-opacity: 0.55; r: 14; }
          50%      { stroke-opacity: 0.18; r: 20; }
        }
      `}</style>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
