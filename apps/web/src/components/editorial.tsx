import type { ReactNode } from "react";
import { Sparkline } from "./sparkline";

/* ============================================================
   SECTION HEAD — ── 03 · multi-step reasoning
   ============================================================ */
export function SectionHead({
  num,
  title,
  tone = "vermilion",
}: {
  num: string;
  title: string;
  tone?: "vermilion" | "saffron";
}) {
  const color = tone === "saffron" ? "var(--color-saffron)" : "var(--color-vermilion)";
  return (
    <div className="flex items-center gap-3">
      <span className="block h-px w-12" style={{ background: color }} />
      <span className="section-head-num">{num} · {title}</span>
    </div>
  );
}

/* ============================================================
   STATUS PILL — dot + label + value + latency + sparkline
   ============================================================ */
export function StatusPill({
  label,
  value,
  state = "on",
  latency,
  seed = 0,
}: {
  label: string;
  value: string;
  state?: "on" | "pending" | "off";
  latency?: number;
  seed?: number;
}) {
  const dotClass =
    state === "on" ? "pulse-dot"
    : state === "pending" ? "pulse-dot pulse-dot-saffron"
    : "pulse-dot pulse-dot-muted";

  return (
    <div className="status-pill focusable">
      <span className={dotClass} />
      <span className="status-pill-lbl">{label}</span>
      <span className={"status-pill-val" + (state === "off" ? " off" : "")}>
        {value}
      </span>
      {latency !== undefined && (
        <span className="chrome tabular" style={{ fontSize: "0.66rem" }}>
          {latency}ms
        </span>
      )}
      <Sparkline live={state === "on"} seed={seed} />
    </div>
  );
}

/* ============================================================
   DECISIVE BUTTON
   ============================================================ */
export function DecisiveButton({
  children,
  onClick,
  variant = "default",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "ghost";
  type?: "button" | "submit";
}) {
  const cls =
    variant === "primary" ? "btn-decisive primary"
    : variant === "ghost" ? "btn-decisive ghost"
    : "btn-decisive";
  return (
    <button type={type} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/* ============================================================
   CITATION CHIP — vermilion superscript + display title + src tag
   ============================================================ */
export function Cite({
  n,
  title,
  src,
  excerpt,
}: {
  n: number;
  title: string;
  src: string;
  excerpt?: string;
}) {
  return (
    <span className="group relative inline-block">
      <span className="cite">
        <span className="cite-sup">{String(n).padStart(2, "0")}</span>
        <span className="cite-ttl">{title}</span>
        <span className="cite-src">{src}</span>
      </span>
      {excerpt && (
        <span
          className="rise pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-30 hidden w-[360px] group-hover:block"
          style={{
            padding: "14px 16px",
            background: "var(--color-ink-1)",
            border: "1px solid var(--color-rule-strong)",
          }}
        >
          <span className="chrome mb-2 flex justify-between">
            <span style={{ color: "var(--color-vermilion)" }}>
              citation {String(n).padStart(2, "0")}
            </span>
            <span>{src}</span>
          </span>
          <span className="hair mb-2.5 block" />
          <span
            className="display-i mb-2 block"
            style={{ fontSize: "1.1rem", color: "var(--color-paper)" }}
          >
            "{title}"
          </span>
          <span
            className="block"
            style={{
              fontSize: "0.82rem",
              color: "var(--color-paper-dim)",
              lineHeight: 1.55,
            }}
          >
            {excerpt}
          </span>
        </span>
      )}
    </span>
  );
}

/* ============================================================
   EMPTY STATE — ghosted glyph + single editorial line
   ============================================================ */
export function EmptyState({
  glyph,
  kicker,
  headline,
  cta,
  ctaSub,
  onCta,
}: {
  glyph: string;
  kicker: string;
  headline: string;
  cta?: string;
  ctaSub?: string;
  onCta?: () => void;
}) {
  return (
    <div className="relative overflow-hidden" style={{ padding: "120px 0 80px" }}>
      <span
        className="ghost-glyph absolute"
        style={{ right: -40, top: -20 }}
      >
        {glyph}
      </span>
      <div className="rise relative" style={{ maxWidth: 520 }}>
        <div className="label mb-6">{kicker}</div>
        <h2
          className="display-i m-0 mb-7"
          style={{
            fontSize: "3.2rem",
            color: "var(--color-paper)",
            letterSpacing: "-0.015em",
          }}
        >
          {headline}
        </h2>
        {cta && (
          <div className="rise delay-2 flex items-center gap-4">
            <DecisiveButton variant="primary" onClick={onCta}>
              {cta}
            </DecisiveButton>
            {ctaSub && <span className="chrome">{ctaSub}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
