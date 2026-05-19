import { useEffect, useMemo, useRef, useState } from "react";
import type { Entity, GraphResponse, Relation } from "@/lib/api";

/**
 * ConstellationChart — SVG star map of the memory graph.
 *
 * Adapted from the Mnemos-III design and wired to real entity data
 * from the /graph endpoint:
 *   - People entities → stars
 *     · x ("right ascension"): mapped from firstSeen date — newer entities
 *       on the right, older on the left, scaled 0..24h
 *     · y ("declination"): mapped from mention count — most-mentioned
 *       people higher up, scaled -60°..+60°
 *     · magnitude (star size): inverse of mention count (more mentions =
 *       brighter = bigger star, fewer mentions = dimmer)
 *   - Project entities → constellations (line graphs)
 *     · members derived by finding people who share chunkIds with the project
 *     · lines drawn between members in a stable order
 *     · project name shown at the centroid
 *   - Hover any star → "twinkle" cross + name label + sidebar update
 *   - Hover any legend item → isolate that constellation (dim everything else)
 */

interface MagPerson extends Entity {
  ra: number;     // 0..24
  dec: number;    // -60..+60
  mag: number;    // 1..4, smaller = brighter
}

interface Constellation {
  id: string;
  name: string;
  color: "vermilion" | "saffron" | "paper";
  memberIds: string[];
}

interface Props {
  graph: GraphResponse;
  width?: number;
  height?: number;
  onHover?: (id: string | null) => void;
}

export function ConstellationChart({ graph, width = 980, height = 560, onHover }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null); // constellation id

  const padding = { top: 32, right: 32, bottom: 40, left: 64 };
  const W = width - padding.left - padding.right;
  const H = height - padding.top - padding.bottom;

  // ── derive stars + constellations from the live graph ──
  const { stars, constellations } = useMemo(() => {
    const people = graph.entities.person ?? [];
    const projects = graph.entities.project ?? [];

    // mention extremes for scaling
    const mentionsArr = people.map((p) => p.mentions);
    const maxM = Math.max(...mentionsArr, 1);
    const minM = Math.min(...mentionsArr, 1);

    // first-seen extremes for x-axis
    const seenTimes = people
      .map((p) => (p.firstSeen ? new Date(p.firstSeen).getTime() : 0))
      .filter((t) => t > 0);
    const tMin = Math.min(...seenTimes, Date.now());
    const tMax = Math.max(...seenTimes, Date.now());
    const tRange = Math.max(1, tMax - tMin);

    const stars: MagPerson[] = people.map((p) => {
      const t = p.firstSeen ? new Date(p.firstSeen).getTime() : tMin;
      // newer entities (closer to tMax) → higher ra (toward 24h right side)
      const ra = ((t - tMin) / tRange) * 22 + 1; // 1..23
      // more mentions → higher dec (up to +55°)
      const dec = ((p.mentions - minM) / Math.max(1, maxM - minM)) * 110 - 55;
      // magnitude inversely proportional to mentions, clamped to 1.2..4.0
      const mag = Math.max(1.2, 4.0 - (p.mentions / maxM) * 2.8);
      return { ...p, ra, dec, mag };
    });

    // constellations from project entities — members are people who share chunkIds
    const palette: Array<Constellation["color"]> = ["vermilion", "saffron", "paper", "vermilion", "saffron", "paper"];
    const constellations: Constellation[] = projects.slice(0, 10).map((proj, i) => {
      const projChunks = new Set(proj.chunkIds);
      const memberIds = stars
        .filter((s) => s.chunkIds.some((c) => projChunks.has(c)))
        .map((s) => s.id);
      return {
        id: proj.id,
        name: proj.name,
        color: palette[i % palette.length]!,
        memberIds,
      };
    }).filter((c) => c.memberIds.length >= 2);

    return { stars, constellations };
  }, [graph]);

  const ra2x = (ra: number) => padding.left + (ra / 24) * W;
  const dec2y = (dec: number) => padding.top + ((60 - dec) / 120) * H;
  const mag2r = (mag: number) => Math.max(1.5, 6 - mag * 0.9);

  const accent = (c: Constellation["color"]) =>
    c === "vermilion" ? "#f25738" : c === "saffron" ? "#e8c547" : "#d8d2c5";

  useEffect(() => {
    onHover?.(hovered);
  }, [hovered, onHover]);

  const starById = useMemo(() => {
    const m = new Map<string, MagPerson>();
    for (const s of stars) m.set(s.id, s);
    return m;
  }, [stars]);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {/* RA grid */}
      {Array.from({ length: 13 }, (_, i) => i * 2).map((h) => (
        <g key={"ra-" + h}>
          <line
            x1={ra2x(h)}
            y1={padding.top}
            x2={ra2x(h)}
            y2={height - padding.bottom}
            stroke="#2a2218"
            strokeWidth="0.5"
            strokeDasharray={h % 6 === 0 ? "0" : "1 3"}
          />
          <text
            x={ra2x(h)}
            y={height - padding.bottom + 18}
            fill="#6c645a"
            fontSize="9"
            fontFamily="var(--font-mono)"
            textAnchor="middle"
            letterSpacing="0.08em"
          >
            {String(h).padStart(2, "0")}
            <tspan fill="#3a3024">h</tspan>
          </text>
        </g>
      ))}

      {/* Dec grid */}
      {[60, 30, 0, -30, -60].map((d) => (
        <g key={"dec-" + d}>
          <line
            x1={padding.left}
            y1={dec2y(d)}
            x2={width - padding.right}
            y2={dec2y(d)}
            stroke="#2a2218"
            strokeWidth="0.5"
            strokeDasharray={d === 0 ? "0" : "1 3"}
          />
          <text
            x={padding.left - 8}
            y={dec2y(d) + 3}
            fill="#6c645a"
            fontSize="9"
            fontFamily="var(--font-mono)"
            textAnchor="end"
            letterSpacing="0.08em"
          >
            {d > 0 ? "+" : ""}
            {d}
            <tspan fill="#3a3024">°</tspan>
          </text>
        </g>
      ))}

      {/* axis labels */}
      <text
        x={padding.left}
        y={padding.top - 14}
        fill="#9c9486"
        fontSize="9"
        fontFamily="var(--font-mono)"
        letterSpacing="0.14em"
      >
        — first seen (right ascension · 24h newest)
      </text>
      <text
        x={padding.left - 48}
        y={padding.top + 14}
        fill="#9c9486"
        fontSize="9"
        fontFamily="var(--font-mono)"
        letterSpacing="0.14em"
        transform={`rotate(-90, ${padding.left - 48}, ${padding.top + 14})`}
      >
        — mention frequency (declination)
      </text>

      {/* constellations */}
      {constellations.map((c) => {
        const isDimmed = focused && focused !== c.id;
        const isFocused = focused === c.id;
        const pts = c.memberIds.map((id) => starById.get(id)).filter((p): p is MagPerson => !!p);
        if (pts.length < 2) return null;
        return (
          <g key={c.id} style={{ opacity: isDimmed ? 0.08 : 1, transition: "opacity 280ms var(--ease)" }}>
            {pts.map((a, i) =>
              i < pts.length - 1 ? (
                <line
                  key={i}
                  x1={ra2x(a.ra)}
                  y1={dec2y(a.dec)}
                  x2={ra2x(pts[i + 1]!.ra)}
                  y2={dec2y(pts[i + 1]!.dec)}
                  stroke={accent(c.color)}
                  strokeWidth={isFocused ? 0.8 : 0.45}
                  strokeOpacity={isFocused ? 0.9 : 0.32}
                />
              ) : null,
            )}
            {/* close the loop on 3+ member constellations */}
            {pts.length >= 3 && (
              <line
                x1={ra2x(pts[pts.length - 1]!.ra)}
                y1={dec2y(pts[pts.length - 1]!.dec)}
                x2={ra2x(pts[0]!.ra)}
                y2={dec2y(pts[0]!.dec)}
                stroke={accent(c.color)}
                strokeWidth={isFocused ? 0.7 : 0.3}
                strokeOpacity={isFocused ? 0.6 : 0.16}
              />
            )}
            {/* centroid label */}
            {(() => {
              const cx = pts.reduce((s, x) => s + ra2x(x.ra), 0) / pts.length;
              const cy = pts.reduce((s, x) => s + dec2y(x.dec), 0) / pts.length;
              return (
                <text
                  x={cx}
                  y={cy + 4}
                  textAnchor="middle"
                  fill={accent(c.color)}
                  fontSize="11"
                  fontFamily="var(--font-display)"
                  fontStyle="italic"
                  style={{ opacity: isFocused ? 1 : 0.5, transition: "opacity 240ms" }}
                >
                  {c.name}
                </text>
              );
            })()}
          </g>
        );
      })}

      {/* stars */}
      {stars.map((p) => {
        const r = mag2r(p.mag);
        const isHovered = hovered === p.id;
        const isInFocus = focused
          ? constellations.find((c) => c.id === focused)?.memberIds.includes(p.id) ?? false
          : false;
        const isDimmed = focused && !isInFocus;
        return (
          <g
            key={p.id}
            onMouseEnter={() => setHovered(p.id)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: "pointer", opacity: isDimmed ? 0.18 : 1, transition: "opacity 280ms" }}
          >
            {(isHovered || isInFocus) && (
              <circle
                cx={ra2x(p.ra)}
                cy={dec2y(p.dec)}
                r={r + 6}
                fill="none"
                stroke="#f25738"
                strokeWidth="0.5"
                strokeOpacity="0.55"
              />
            )}
            <circle
              cx={ra2x(p.ra)}
              cy={dec2y(p.dec)}
              r={r}
              fill="#f3ecdf"
              style={{ transition: "r 220ms var(--ease)" }}
            />
            {/* twinkle cross on hover */}
            {isHovered && (
              <>
                <line
                  x1={ra2x(p.ra) - r - 4}
                  y1={dec2y(p.dec)}
                  x2={ra2x(p.ra) + r + 4}
                  y2={dec2y(p.dec)}
                  stroke="#f3ecdf"
                  strokeWidth="0.4"
                  strokeOpacity="0.6"
                />
                <line
                  x1={ra2x(p.ra)}
                  y1={dec2y(p.dec) - r - 4}
                  x2={ra2x(p.ra)}
                  y2={dec2y(p.dec) + r + 4}
                  stroke="#f3ecdf"
                  strokeWidth="0.4"
                  strokeOpacity="0.6"
                />
              </>
            )}
            {/* name label — always for the brightest, on hover otherwise */}
            {(p.mag < 2.0 || isHovered) && (
              <text
                x={ra2x(p.ra) + r + 4}
                y={dec2y(p.dec) + 3}
                fill={isHovered ? "#f3ecdf" : "#d8d2c5"}
                fontSize="10"
                fontFamily="var(--font-display)"
                fontStyle="italic"
              >
                {p.name}
              </text>
            )}
          </g>
        );
      })}

      {/* legend — top-right */}
      <g transform={`translate(${width - padding.right - 200}, ${padding.top + 8})`}>
        <text fill="#9c9486" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.14em">
          — constellations
        </text>
        {constellations.map((c, i) => (
          <g
            key={c.id}
            transform={`translate(0, ${20 + i * 16})`}
            onMouseEnter={() => setFocused(c.id)}
            onMouseLeave={() => setFocused(null)}
            style={{ cursor: "pointer" }}
          >
            <line
              x1={0}
              y1={6}
              x2={20}
              y2={6}
              stroke={accent(c.color)}
              strokeWidth="0.7"
              strokeOpacity={focused === c.id ? 1 : 0.5}
            />
            <text
              x={26}
              y={9}
              fill={focused === c.id ? "#f3ecdf" : "#9c9486"}
              fontSize="11"
              fontFamily="var(--font-display)"
              fontStyle="italic"
            >
              {c.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * HoverDetail — sidebar that updates as user hovers stars on the chart.
 */
export function HoverDetail({
  hovered,
  graph,
  relations,
}: {
  hovered: string | null;
  graph: GraphResponse;
  relations: Relation[];
}) {
  const allPeople = graph.entities.person;
  const p = allPeople.find((x) => x.id === hovered);

  if (!p) {
    return (
      <div style={{ color: "var(--color-paper-faint)" }}>
        <div
          className="display-i"
          style={{ fontSize: 24, color: "var(--color-paper-dim)", marginBottom: 12 }}
        >
          The room.
        </div>
        <p
          style={{
            fontSize: 13,
            lineHeight: "20px",
            color: "var(--color-paper-muted)",
            maxWidth: 260,
          }}
        >
          {allPeople.length} people across {graph.entities.project.length} projects, extracted
          from {graph.stats.relations} commitments + collaborations. Hover any star to read its
          history. Hover a constellation in the legend to isolate its members.
        </p>
        <div style={{ marginTop: 24 }}>
          <div className="label" style={{ marginBottom: 12 }}>scale</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { mag: 1.2, label: "mag 1.2 · most mentioned" },
              { mag: 2.0, label: "mag 2.0" },
              { mag: 3.2, label: "mag 3.2" },
              { mag: 4.0, label: "mag 4.0 · few mentions" },
            ].map((s, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}
              >
                <svg width="20" height="20" style={{ flex: "0 0 auto" }}>
                  <circle cx="10" cy="10" r={Math.max(1.5, 6 - s.mag * 0.9)} fill="#f3ecdf" />
                </svg>
                <span className="chrome">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Mention sparkline from the entity's series data (real, not synthetic)
  const series = p.series.slice(-14);
  const owedBy = relations.filter((r) => r.kind === "owes" && r.to === p.key).slice(0, 3);
  const owesTo = relations.filter((r) => r.kind === "owes" && r.from === p.key).slice(0, 3);
  const projectsInvolved = graph.entities.project
    .filter((proj) => p.chunkIds.some((c) => proj.chunkIds.includes(c)))
    .slice(0, 6);

  return (
    <div key={p.id} style={{ animation: "m3-rise-up 320ms var(--ease) both" }}>
      <div className="label" style={{ marginBottom: 6 }}>star</div>
      <div
        className="display-i"
        style={{ fontSize: 28, color: "var(--color-paper)", lineHeight: 1.05 }}
      >
        {p.name}
      </div>
      {p.role && (
        <div className="chrome" style={{ marginTop: 6, marginBottom: 24 }}>
          {p.role}
        </div>
      )}

      <hr style={{ borderColor: "var(--color-rule-soft)", marginBottom: 14 }} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "90px 1fr",
          gap: "8px 16px",
          fontSize: 12,
        }}
      >
        <span className="label">mentions</span>
        <span className="mono tabular" style={{ color: "var(--color-paper)" }}>
          {p.mentions}{" "}
          <span style={{ color: "var(--color-paper-faint)" }}>· across {p.chunkIds.length} chunks</span>
        </span>
        {p.firstSeen && (
          <>
            <span className="label">first seen</span>
            <span className="mono tabular" style={{ color: "var(--color-paper)" }}>
              {p.firstSeen}
            </span>
          </>
        )}
        {p.lastSeen && (
          <>
            <span className="label">last seen</span>
            <span className="mono tabular" style={{ color: "var(--color-paper)" }}>
              {p.lastSeen}
            </span>
          </>
        )}
      </div>

      {series.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            mention sparkline · last {series.length} days
          </div>
          <MiniSpark series={series} />
        </div>
      )}

      {projectsInvolved.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div className="label" style={{ marginBottom: 8 }}>constellations</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {projectsInvolved.map((pr) => (
              <span
                key={pr.id}
                className="mono"
                style={{
                  padding: "1px 6px",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  border: "1px solid var(--color-rule)",
                  color: "var(--color-paper-dim)",
                }}
              >
                {pr.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {(owedBy.length > 0 || owesTo.length > 0) && (
        <div style={{ marginTop: 20 }}>
          <div className="label" style={{ marginBottom: 8 }}>commitments</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, lineHeight: 1.55 }}>
            {owesTo.map((r) => (
              <li key={r.id} style={{ color: "var(--color-paper-dim)", marginBottom: 4 }}>
                <span style={{ color: "var(--color-vermilion)" }}>→</span> owes{" "}
                <em style={{ color: "var(--color-paper)" }}>{r.to}</em>:{" "}
                <span className="chrome">{r.evidence.slice(0, 70)}</span>
              </li>
            ))}
            {owedBy.map((r) => (
              <li key={r.id} style={{ color: "var(--color-paper-dim)", marginBottom: 4 }}>
                <span style={{ color: "var(--color-saffron)" }}>←</span> owed by{" "}
                <em style={{ color: "var(--color-paper)" }}>{r.from}</em>:{" "}
                <span className="chrome">{r.evidence.slice(0, 70)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MiniSpark({ series }: { series: Array<{ date: string; count: number }> }) {
  const max = Math.max(...series.map((s) => s.count), 1);
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 28 }}>
      {series.map((s, i) => (
        <span
          key={i}
          title={`${s.date} · ${s.count}`}
          style={{
            width: 6,
            height: Math.max(2, (s.count / max) * 28),
            background: "var(--color-vermilion)",
            opacity: 0.5 + (s.count / max) * 0.5,
          }}
        />
      ))}
    </span>
  );
}

/**
 * ResponsiveConstellation — wraps the chart in a ResizeObserver so it
 * fits the parent container nicely.
 */
export function ResponsiveConstellation({
  graph,
  onHover,
}: {
  graph: GraphResponse;
  onHover?: (id: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      setW(Math.max(560, Math.min(1200, e.contentRect.width)));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref}>
      <ConstellationChart graph={graph} width={w} height={580} onHover={onHover} />
    </div>
  );
}
