import { useEffect, useRef } from "react";
import { ApprovalCard } from "./approval-card";
import { Cite } from "./editorial";

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
      at: number;
    }
  | { kind: "answer"; text: string; complete: boolean; at: number }
  | { kind: "citations"; citations: Citation[]; at: number }
  | { kind: "done"; turns: number; totalMs: number; at: number }
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
      <div className="rise mb-6 mt-2 flex flex-wrap gap-2">
        {item.citations.map((c, i) => (
          <Cite
            key={c.chunkId}
            n={i + 1}
            title={c.title}
            src={sourceLabel(c.source)}
            excerpt={c.text}
          />
        ))}
      </div>
    );
  }

  if (item.kind === "done") {
    return (
      <div
        className="rise mt-4 flex items-center justify-between border-t border-[color:var(--color-rule)] pt-4 chrome"
        style={{ marginLeft: -96 }}
      >
        <span>
          stream complete · {(item.totalMs / 1000).toFixed(2)}s · {item.turns} turn
          {item.turns === 1 ? "" : "s"}
        </span>
        <span className="text-[color:var(--color-paper-faint)]">— signed, the agent</span>
      </div>
    );
  }

  if (item.kind === "error") {
    return (
      <div
        className="rise mt-3 border bg-[color:var(--color-ink-2)] p-3 mono"
        style={{
          borderColor: "var(--color-vermilion-deep)",
          color: "var(--color-vermilion)",
          marginLeft: -96,
        }}
      >
        error · {item.message}
      </div>
    );
  }

  // Timeline row: time chip in gutter + node marker + content
  return (
    <div className="rise relative" style={{ minHeight: 84, paddingBottom: 6 }}>
      {/* Stream node — sits on the rule */}
      <div className={"stream-node " + nodeState} style={{ left: nodeState === "active" ? 74 : 76, top: 8 }} />

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
    </div>
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
        </div>
      );
    case "answer":
      return (
        <div
          className="display"
          style={{
            fontSize: "1.42rem",
            lineHeight: 1.4,
            color: "var(--color-paper)",
            maxWidth: 720,
            letterSpacing: "-0.005em",
          }}
        >
          {item.text}
          {live && !item.complete && <span className="caret-thin" />}
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
