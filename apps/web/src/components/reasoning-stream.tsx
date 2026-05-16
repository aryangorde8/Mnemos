import { useEffect, useRef } from "react";
import { ApprovalCard } from "./approval-card";

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
  | { kind: "thought"; text: string; complete: boolean }
  | {
      kind: "tool_call";
      id: string;
      name: string;
      args: Record<string, unknown>;
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
    }
  | { kind: "answer"; text: string; complete: boolean }
  | { kind: "citations"; citations: Citation[] }
  | { kind: "done"; turns: number; totalMs: number }
  | { kind: "error"; message: string };

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

  return (
    <section
      aria-label="agent reasoning"
      className="relative overflow-hidden border border-[color:var(--color-rule)] bg-[color:var(--color-ink-1)] shadow-[0_1px_0_0_var(--color-rule)_inset]"
    >
      <header className="flex items-center justify-between border-b border-[color:var(--color-rule)] bg-[color:var(--color-ink-2)] px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span
            className={`block h-1.5 w-1.5 rounded-full ${
              running
                ? "pulse-dot bg-[color:var(--color-vermilion)]"
                : "bg-[color:var(--color-paper-faint)]"
            }`}
          />
          <span className="label">
            reasoning stream {runId ? "· " + runId.slice(0, 8) : ""}
          </span>
        </div>
        <span className="chrome">
          {running ? "live · gemini-3-pro" : "idle"}
        </span>
      </header>

      <div className="max-h-[60vh] overflow-y-auto px-5 py-5 font-mono text-[0.84rem] leading-[1.55]">
        {items.length === 0 ? (
          <p className="text-[color:var(--color-paper-faint)]">
            <span className="caret inline-block h-[1em] w-[2px] bg-[color:var(--color-vermilion)] align-[-2px]" />
            <span className="ml-2">awaiting prompt…</span>
          </p>
        ) : null}
        {items.map((it, i) => (
          <Line key={i} item={it} live={running && i === items.length - 1} />
        ))}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}

function Line({ item, live }: { item: StreamItem; live: boolean }) {
  switch (item.kind) {
    case "thought":
      return (
        <p className="mb-3 whitespace-pre-wrap text-[color:var(--color-paper-dim)]">
          <span className="mr-2 select-none text-[color:var(--color-paper-faint)]">›</span>
          {item.text}
          {live && !item.complete ? <Caret /> : null}
        </p>
      );
    case "tool_call":
      return (
        <div className="mb-3">
          <p className="text-[color:var(--color-vermilion)]">
            <span className="mr-2 select-none">→</span>
            <span className="font-medium">{item.name}</span>
            <span className="text-[color:var(--color-paper-faint)]">
              ({summarizeArgs(item.args)})
            </span>
          </p>
        </div>
      );
    case "observation":
      return (
        <div className="mb-3">
          <p
            className={
              item.ok
                ? "text-[color:var(--color-saffron)]"
                : "text-[color:var(--color-vermilion)]"
            }
          >
            <span className="mr-2 select-none">←</span>
            <span className="font-medium">{item.name}</span>
            <span className="text-[color:var(--color-paper-faint)]">
              {" · "}
              {item.ok ? item.summary ?? "ok" : item.error ?? "failed"}
              {" · "}
              {item.durationMs}ms
            </span>
          </p>
          {item.actionId ? <ApprovalCard actionId={item.actionId} /> : null}
        </div>
      );
    case "answer":
      return (
        <div className="mt-5 border-t border-[color:var(--color-rule)] pt-5">
          <p className="label mb-3">answer</p>
          <p
            className="whitespace-pre-wrap text-[0.98rem] leading-[1.65] text-[color:var(--color-paper)]"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {item.text}
            {live && !item.complete ? <Caret /> : null}
          </p>
        </div>
      );
    case "citations":
      return (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.citations.map((c) => (
            <span
              key={c.chunkId}
              title={c.text ?? c.title}
              className="group relative inline-flex cursor-default items-baseline gap-1.5 border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-2 py-1 text-[0.72rem] tracking-[0.02em] text-[color:var(--color-paper-dim)] hover:border-[color:var(--color-vermilion)] hover:bg-[color:var(--color-ink-1)]"
            >
              <span className="text-[color:var(--color-vermilion)]">[{c.source}]</span>
              <span>{c.title}</span>
              <span className="text-[color:var(--color-paper-faint)]">·{c.score.toFixed(3)}</span>
              {c.text && (
                <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 hidden w-[300px] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink)] p-3 font-mono text-[0.72rem] leading-[1.55] text-[color:var(--color-paper-dim)] shadow-lg group-hover:block">
                  {c.text.length > 280 ? c.text.slice(0, 277) + "…" : c.text}
                </span>
              )}
            </span>
          ))}
        </div>
      );
    case "done":
      return (
        <p className="mt-5 border-t border-[color:var(--color-rule)] pt-4 text-[color:var(--color-paper-faint)]">
          done · {item.turns} turns · {item.totalMs}ms
        </p>
      );
    case "error":
      return (
        <p className="mt-3 border border-[color:var(--color-vermilion-deep)]/60 bg-[color:var(--color-ink-2)] p-3 text-[color:var(--color-vermilion)]">
          error · {item.message}
        </p>
      );
  }
}

function Caret() {
  return (
    <span className="caret ml-1 inline-block h-[1em] w-[2px] bg-[color:var(--color-vermilion)] align-[-2px]" />
  );
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
  return out.join(", ");
}

function lastChunkSig(items: StreamItem[]): string {
  const last = items[items.length - 1];
  if (!last) return "0";
  if (last.kind === "thought" || last.kind === "answer") {
    return last.kind + ":" + last.text.length;
  }
  return last.kind;
}
