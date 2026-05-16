import type { SourceKind } from "@/lib/api";

const LABELS: Record<SourceKind, string> = {
  email: "email",
  calendar: "calendar",
  meeting_notes: "meeting",
  shared_doc: "doc",
  slack: "slack",
  notes: "note",
};

const GLYPHS: Record<SourceKind, string> = {
  email: "✉",
  calendar: "◷",
  meeting_notes: "❡",
  shared_doc: "§",
  slack: "⌗",
  notes: "✎",
};

export function SourceMark({ source }: { source: SourceKind }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="font-mono text-[0.8rem] leading-none text-[color:var(--color-vermilion)]"
      >
        {GLYPHS[source]}
      </span>
      <span className="label">{LABELS[source]}</span>
    </span>
  );
}
