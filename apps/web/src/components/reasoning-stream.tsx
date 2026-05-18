import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ApprovalCard } from "./approval-card";
import { CritiqueCard, type PreloadedCritique } from "./critique-card";
import { Cite } from "./editorial";

/**
 * Active citation context — when a user hovers `[N]` in the answer text, or
 * a chip in the citations row, the index is broadcast so the other side can
 * highlight in sync.
 */
interface ActiveCiteCtx {
  active: number | null;          // 1-indexed citation, or null
  setActive: (n: number | null) => void;
  citations: Citation[];
}
const ActiveCiteContext = createContext<ActiveCiteCtx>({
  active: null,
  setActive: () => undefined,
  citations: [],
});

export interface Citation {
  chunkId: string;
  documentId: string;
  source:
    | "email"
    | "calendar"
    | "meeting_notes"
    | "shared_doc"
    | "slack"
    | "notes";
  title: string;
  score: number;
  ordinal: number;
  text?: string;
}

export type StreamItem =
  | { kind: "thought"; text: string; complete: boolean; at: number }
  | {
      kind: "tool_call";
      id: string;
      name: string;
      args: Record<string, unknown>;
      at: number;
    }
  | {
      kind: "observation";
      id: string;
      name: string;
      ok: boolean;
      summary?: string;
      error?: string;
      durationMs: number;
      actionId?: string;
      critique?: PreloadedCritique & { actionId: string };
      at: number;
    }
  | { kind: "answer"; text: string; complete: boolean; at: number }
  | { kind: "citations"; citations: Citation[]; at: number }
  | {
      kind: "done";
      turns: number;
      totalMs: number;
      usage?: {
        promptTokens: number;
        candidatesTokens: number;
        thoughtsTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
      };
      at: number;
    }
  | { kind: "error"; message: string; at: number };

export function ReasoningStream({
  items,
  running,
  runId,
}: {
  items: StreamItem[];
  running: boolean;
  runId: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<number | null>(null);

  // Find the citations event so the cross-link knows the full list.
  const citationsItem = items.find((i) => i.kind === "citations") as
    | { kind: "citations"; citations: Citation[] }
    | undefined;
  const citations = citationsItem?.citations ?? [];
  const doneItem = items.find((i) => i.kind === "done") as
    | (StreamItem & { kind: "done" })
    | undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length, lastChunkSig(items)]);

  if (items.length === 0 && !running) {
    return (
      <div className="border-t border-[color:var(--color-rule)] pt-8">
        <p className="chrome">
          <span className="caret-thin" />
          <span className="ml-2">awaiting prompt — type a question and press ↵</span>
        </p>
      </div>
    );
  }

  return (
    <ActiveCiteContext.Provider value={{ active, setActive, citations }}>
    <section aria-label="agent reasoning" className="relative">
      {/* Stream header — minimal chrome */}
      <header className="mb-6 flex items-baseline justify-between border-b border-[color:var(--color-rule)] pb-3">
        <div className="flex items-center gap-3">
          <span className={running ? "pulse-dot" : "pulse-dot pulse-dot-muted"} />
          <span className="chrome" style={{ letterSpacing: "0.02em" }}>
            {running ? "streaming" : "complete"}
            {runId && (
              <>
                <span className="px-2 text-[color:var(--color-rule-strong)]">·</span>
                <span>run {runId.slice(0, 8)}</span>
              </>
            )}
            <span className="px-2 text-[color:var(--color-rule-strong)]">·</span>
            <span>gemini-3.1-pro · vertex</span>
            {doneItem?.usage && (
              <>
                <span className="px-2 text-[color:var(--color-rule-strong)]">·</span>
                <span
                  className="tabular"
                  title={`prompt: ${doneItem.usage.promptTokens} · completion: ${doneItem.usage.candidatesTokens} · thinking: ${doneItem.usage.thoughtsTokens}`}
                  style={{ color: "var(--color-paper-dim)" }}
                >
                  {formatTokens(doneItem.usage.totalTokens)} tok
                </span>
                <span className="px-2 text-[color:var(--color-rule-strong)]">·</span>
                <span className="tabular" style={{ color: "var(--color-vermilion)" }}>
                  {formatCost(doneItem.usage.estimatedCostUsd)}
                </span>
              </>
            )}
            {doneItem && (
              <>
                <span className="px-2 text-[color:var(--color-rule-strong)]">·</span>
                <span className="tabular" style={{ color: "var(--color-paper-dim)" }}>
                  {(doneItem.totalMs / 1000).toFixed(2)}s
                </span>
              </>
            )}
          </span>
        </div>
        <span className="chrome">
          {items.length} {items.length === 1 ? "node" : "nodes"}
        </span>
      </header>

      {/* Cinematic timeline */}
      <div className="relative" style={{ paddingLeft: 96 }}>
        <div className="stream-rule" style={{ left: 78 }} />

        {items.map((it, i) => (
          <StreamRow
            key={i}
            item={it}
            isLast={i === items.length - 1}
            live={running && i === items.length - 1}
          />
        ))}

        <div ref={bottomRef} />
      </div>
    </section>
    </ActiveCiteContext.Provider>
  );
}

/**
 * AnswerText — parses `[N]` and `[N][M]` markers from the agent's answer
 * and renders each as an interactive citation pill. Hover/focus syncs with
 * the citation chip row via ActiveCiteContext.
 */
function AnswerText({ text, live, complete }: { text: string; live: boolean; complete: boolean }) {
  const { citations, setActive } = useContext(ActiveCiteContext);
  // Match consecutive [N][M]... groups or single [N]
  const pattern = /(\[\d+\](?:\[\d+\])*)/g;
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    // Extract individual numbers in this group
    const nums = Array.from(m[0].matchAll(/\[(\d+)\]/g)).map((g) => Number(g[1]));
    parts.push(
      <span key={m.index} style={{ display: "inline-flex", gap: 1, marginLeft: 1 }}>
        {nums.map((n, i) => {
          const cit = citations[n - 1];
          if (!cit) {
            return (
              <span key={i} className="cite-pill cite-pill-orphan" aria-label={`citation ${n} (missing)`}>{n}</span>
            );
          }
          return (
            <button
              key={i}
              type="button"
              className="cite-pill"
              onMouseEnter={() => setActive(n)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(n)}
              onBlur={() => setActive(null)}
              onClick={() => {
                const el = document.querySelector(`[data-cite-chip="${n}"]`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                setActive(n);
                setTimeout(() => setActive(null), 1800);
              }}
              title={`${cit.source} · ${cit.title}${cit.text ? "\n\n" + cit.text.slice(0, 180) : ""}`}
            >
              {n}
            </button>
          );
        })}
      </span>,
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return (
    <>
      {parts}
      {live && !complete && <span className="caret-thin" />}
    </>
  );
}

function StreamRow({
  item,
  isLast,
  live,
}: {
  item: StreamItem;
  isLast: boolean;
  live: boolean;
}) {
  const nodeState =
    isLast && item.kind !== "answer" && item.kind !== "done" && item.kind !== "citations" && live
      ? "active"
      : "done";

  // Special-case rendering for citations / done / error that don't get a node + time chip
  if (item.kind === "citations") {
    return (
      <motion.div
        className="mb-6 mt-2 flex flex-wrap gap-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {item.citations.map((c, i) => (
          <motion.span
            key={c.chunkId}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.32, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: "inline-block" }}
          >
            <CiteHoverable n={i + 1} title={c.title} src={sourceLabel(c.source)} excerpt={c.text} />
          </motion.span>
        ))}
      </motion.div>
    );
  }

  if (item.kind === "done") {
    return (
      <motion.div
        className="mt-4 flex items-center justify-between border-t border-[color:var(--color-rule)] pt-4 chrome"
        style={{ marginLeft: -96 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <span>
          stream complete · {(item.totalMs / 1000).toFixed(2)}s · {item.turns} turn
          {item.turns === 1 ? "" : "s"}
        </span>
        <span className="text-[color:var(--color-paper-faint)]">— signed, the agent</span>
      </motion.div>
    );
  }

  if (item.kind === "error") {
    return (
      <motion.div
        className="mt-3 border bg-[color:var(--color-ink-2)] p-3 mono"
        style={{
          borderColor: "var(--color-vermilion-deep)",
          color: "var(--color-vermilion)",
          marginLeft: -96,
        }}
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        error · {item.message}
      </motion.div>
    );
  }

  // Timeline row: time chip in gutter + node marker + content
  return (
    <motion.div
      className="relative"
      style={{ minHeight: 84, paddingBottom: 6 }}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Stream node — sits on the rule */}
      <motion.div
        className={"stream-node " + nodeState}
        style={{ left: nodeState === "active" ? 74 : 76, top: 8 }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
      />

      {/* Time chip in left gutter */}
      <div
        className="chrome tabular absolute"
        style={{
          left: -96,
          top: 4,
          width: 96,
          fontSize: "0.66rem",
          color: "var(--color-paper-faint)",
          letterSpacing: 0,
          textAlign: "right",
          paddingRight: 12,
        }}
      >
        {formatTime(item.at)}
      </div>

      {/* Content — kind label + body */}
      <div style={{ paddingLeft: 28 }}>
        <KindLabel kind={item.kind} />
        <RowBody item={item} live={live} />
      </div>
    </motion.div>
  );
}

function KindLabel({ kind }: { kind: StreamItem["kind"] }) {
  const labels: Record<string, { text: string; glyph: string; color: string }> = {
    thought: { text: "thought", glyph: "·", color: "var(--color-vermilion)" },
    tool_call: { text: "tool_call", glyph: "›", color: "var(--color-saffron)" },
    observation: { text: "observation", glyph: "‹", color: "var(--color-paper-muted)" },
    answer: { text: "answer", glyph: "◆", color: "var(--color-paper)" },
  };
  const meta = labels[kind] ?? { text: kind, glyph: "·", color: "var(--color-paper-faint)" };
  return (
    <div className="mb-2 flex items-baseline gap-2.5">
      <span
        className="mono"
        style={{
          fontSize: "0.7rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: meta.color,
          fontWeight: 500,
        }}
      >
        <span style={{ marginRight: 6 }}>{meta.glyph}</span>
        {meta.text}
      </span>
    </div>
  );
}

function RowBody({ item, live }: { item: StreamItem; live: boolean }) {
  switch (item.kind) {
    case "thought":
      return (
        <div
          className="mono"
          style={{
            fontStyle: "italic",
            color: "var(--color-paper-dim)",
            fontSize: "0.86rem",
            lineHeight: 1.55,
            maxWidth: 720,
          }}
        >
          {item.text}
          {live && !item.complete && <span className="caret-thin" />}
        </div>
      );
    case "tool_call":
      return (
        <div>
          <div
            className="mono"
            style={{
              color: "var(--color-saffron)",
              fontSize: "0.92rem",
              marginBottom: 4,
              fontWeight: 500,
            }}
          >
            {item.name}
            <span style={{ color: "var(--color-paper-muted)" }}>(…)</span>
          </div>
          <div className="chrome" style={{ paddingLeft: 0 }}>
            {summarizeArgs(item.args)}
          </div>
        </div>
      );
    case "observation":
      return (
        <div>
          <div
            className="mono"
            style={{
              color: item.ok ? "var(--color-paper-muted)" : "var(--color-vermilion)",
              fontSize: "0.84rem",
            }}
          >
            ← {item.name}
            <span style={{ color: "var(--color-paper-faint)", marginLeft: 8 }}>
              · {item.ok ? item.summary ?? "ok" : item.error ?? "failed"} · {item.durationMs}ms
            </span>
          </div>
          {item.actionId && (
            <div className="mt-5">
              <ApprovalCard actionId={item.actionId} />
            </div>
          )}
          {item.critique && (
            <div className="mt-4">
              <CritiqueCard actionId={item.critique.actionId} preloaded={item.critique} />
            </div>
          )}
        </div>
      );
    case "answer":
      return (
        <div
          className="display answer-prose"
          style={{
            fontSize: "1.42rem",
            lineHeight: 1.45,
            color: "var(--color-paper)",
            maxWidth: 720,
            letterSpacing: "-0.005em",
            whiteSpace: "pre-wrap",
          }}
        >
          <AnswerText text={item.text} live={live} complete={item.complete} />
        </div>
      );
    default:
      return null;
  }
}

function formatTime(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const cs = String(Math.floor(d.getMilliseconds() / 10)).padStart(2, "0");
  return `${hh}:${mm}:${ss}.${cs}`;
}

function sourceLabel(s: Citation["source"]): string {
  const map: Record<Citation["source"], string> = {
    email: "email",
    calendar: "cal",
    meeting_notes: "note",
    shared_doc: "doc",
    slack: "slack",
    notes: "note",
  };
  return map[s];
}

function summarizeArgs(args: Record<string, unknown>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string") {
      out.push(`${k}: "${v.length > 60 ? v.slice(0, 57) + "…" : v}"`);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out.push(`${k}: ${v}`);
    } else if (Array.isArray(v)) {
      out.push(`${k}: [${v.length}]`);
    } else if (v && typeof v === "object") {
      out.push(`${k}: {…}`);
    }
  }
  return out.join(" · ");
}

function lastChunkSig(items: StreamItem[]): string {
  const last = items[items.length - 1];
  if (!last) return "0";
  if (last.kind === "thought" || last.kind === "answer") {
    return last.kind + ":" + last.text.length;
  }
  return last.kind;
}

/**
 * CiteHoverable — wraps the existing Cite chip and adds cross-link behavior
 * via ActiveCiteContext. When [N] in the answer is hovered, this chip
 * highlights too. When this chip is hovered, [N] markers in the answer
 * highlight.
 */
function formatTokens(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1) + "k";
  return n.toLocaleString("en-US");
}

function formatCost(usd: number): string {
  if (usd >= 0.01) return "$" + usd.toFixed(3);
  if (usd >= 0.001) return "$" + usd.toFixed(4);
  return "$" + usd.toFixed(5);
}

function CiteHoverable({
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
  const { active, setActive } = useContext(ActiveCiteContext);
  const isActive = active === n;
  return (
    <span
      data-cite-chip={n}
      data-active={isActive ? "1" : undefined}
      className={"cite-chip-wrap" + (isActive ? " cite-chip-active" : "")}
      onMouseEnter={() => setActive(n)}
      onMouseLeave={() => setActive(null)}
    >
      <Cite n={n} title={title} src={src} excerpt={excerpt} />
    </span>
  );
}
