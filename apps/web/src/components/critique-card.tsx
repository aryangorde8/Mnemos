import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  getCritiqueForAction,
  type CritiqueRecord,
  type CritiqueFinding,
  type FindingSeverity,
} from "@/lib/api";

interface Props {
  actionId: string;
  critiqueId?: string;
}

// Pre-loaded payload (passed from the SSE observation) so we render instantly
// without a second network call. Falls back to fetching by actionId.
export interface PreloadedCritique {
  verdict: "approve" | "revise" | "reject";
  summary: string;
  findings: CritiqueFinding[];
  voice: { score: number; notes: string };
  counts?: { high: number; med: number; low: number };
}

export function CritiqueCard({
  actionId,
  preloaded,
}: Props & { preloaded?: PreloadedCritique }) {
  const [crit, setCrit] = useState<CritiqueRecord | PreloadedCritique | null>(preloaded ?? null);
  const [loading, setLoading] = useState(!preloaded);

  useEffect(() => {
    if (preloaded) return;
    let cancelled = false;
    setLoading(true);
    void getCritiqueForAction(actionId).then((c) => {
      if (cancelled) return;
      setCrit(c);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [actionId, preloaded]);

  if (loading) {
    return (
      <aside className="critique rise" aria-label="critic findings">
        <div className="h-20 animate-pulse bg-[color:var(--color-rule)]/40" />
      </aside>
    );
  }
  if (!crit) return null;

  const { verdict, summary, findings, voice } = crit;
  const high = findings.filter((f) => f.severity === "high").length;
  const med = findings.filter((f) => f.severity === "medium").length;
  const low = findings.filter((f) => f.severity === "low").length;

  return (
    <motion.aside
      className="critique"
      aria-label="critic findings"
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
    >
      {/* header row */}
      <header className="critique-header">
        <div className="flex items-center gap-3">
          <span className={"verdict-dot " + verdict} />
          <span
            className="mono"
            style={{
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontSize: "0.7rem",
              fontWeight: 500,
              color:
                verdict === "approve" ? "var(--color-paper-muted)"
                : verdict === "reject" ? "var(--color-vermilion)"
                : "var(--color-saffron)",
            }}
          >
            critic · {verdict}
          </span>
          <span className="chrome">
            {high}H · {med}M · {low}L
          </span>
        </div>
        <span className="chrome">
          voice <span className="tabular" style={{ color: "var(--color-paper-dim)" }}>{voice.score.toFixed(1)}</span>
          <span style={{ color: "var(--color-rule-strong)" }}>/10</span>
        </span>
      </header>

      <p
        className="display"
        style={{
          fontSize: "1.05rem",
          fontStyle: "italic",
          color: "var(--color-paper-dim)",
          lineHeight: 1.45,
          marginTop: 14,
          marginBottom: findings.length > 0 ? 18 : 0,
          maxWidth: 640,
        }}
      >
        {summary || "no findings — draft is clean."}
      </p>

      {voice.notes && (
        <p className="chrome" style={{ marginBottom: findings.length > 0 ? 18 : 0, maxWidth: 640 }}>
          {voice.notes}
        </p>
      )}

      {findings.length > 0 && (
        <ol className="critique-findings">
          {findings.map((f, i) => (
            <FindingRow key={i} f={f} idx={i + 1} />
          ))}
        </ol>
      )}
    </motion.aside>
  );
}

function FindingRow({ f, idx }: { f: CritiqueFinding; idx: number }) {
  const sevColor = severityColor(f.severity);
  return (
    <li className="finding">
      <div className="finding-num mono tabular" style={{ color: sevColor }}>
        {String(idx).padStart(2, "0")}
      </div>
      <div className="finding-body">
        <div className="finding-meta">
          <span
            className="mono"
            style={{
              color: sevColor,
              fontSize: "0.66rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            {f.severity}
          </span>
          <span className="chrome">{f.evidence}</span>
          {f.citation && <span className="chrome">· {f.citation}</span>}
        </div>
        <blockquote className="finding-claim">
          &ldquo;{f.claim}&rdquo;
        </blockquote>
        <p className="finding-issue">{f.issue}</p>
        {f.suggestion && (
          <p className="finding-suggest">
            <span className="label" style={{ marginRight: 8 }}>fix</span>
            {f.suggestion}
          </p>
        )}
      </div>
    </li>
  );
}

function severityColor(s: FindingSeverity): string {
  return s === "high" ? "var(--color-vermilion)"
    : s === "medium" ? "var(--color-saffron)"
    : "var(--color-paper-muted)";
}
