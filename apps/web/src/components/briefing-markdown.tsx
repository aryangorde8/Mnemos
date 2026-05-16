import { useMemo } from "react";

interface Block {
  kind: "h2" | "h3" | "p" | "ul" | "ol";
  text?: string;
  items?: string[];
}

const SECTION_ACCENT: Record<string, string> = {
  attendees: "var(--color-vermilion)",
  "open threads": "var(--color-saffron)",
  "outstanding commitments": "var(--color-vermilion)",
  "suggested talking points": "var(--color-saffron)",
};

export function BriefingMarkdown({
  source,
  streaming,
}: {
  source: string;
  streaming?: boolean;
}) {
  const blocks = useMemo(() => parse(source), [source]);

  return (
    <article
      className="space-y-7 text-[1.02rem] leading-[1.7] text-[color:var(--color-paper-dim)]"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {blocks.map((b, i) => {
        if (b.kind === "h2") {
          const key = (b.text ?? "").trim().toLowerCase();
          const accent = SECTION_ACCENT[key] ?? "var(--color-rule-strong)";
          return (
            <div key={i} className="mt-2 flex items-center gap-3">
              <span
                className="block h-px w-9"
                style={{ background: accent }}
              />
              <h2 className="label">{b.text}</h2>
            </div>
          );
        }
        if (b.kind === "h3") {
          return (
            <h3
              key={i}
              className="display mt-6 text-[1.2rem] italic leading-tight text-[color:var(--color-paper)]"
            >
              {b.text}
            </h3>
          );
        }
        if (b.kind === "p") {
          return (
            <p key={i} className="max-w-[68ch]">
              {inlineFormat(b.text ?? "")}
            </p>
          );
        }
        if (b.kind === "ul" || b.kind === "ol") {
          const Tag = b.kind === "ul" ? "ul" : "ol";
          return (
            <Tag
              key={i}
              className={`max-w-[68ch] space-y-2.5 ${
                b.kind === "ol" ? "list-decimal pl-5" : "list-none"
              }`}
            >
              {(b.items ?? []).map((it, j) => (
                <li
                  key={j}
                  className={
                    b.kind === "ul"
                      ? "relative pl-5"
                      : "marker:text-[color:var(--color-paper-faint)] marker:font-mono"
                  }
                >
                  {b.kind === "ul" ? (
                    <span
                      aria-hidden
                      className="absolute left-0 top-[0.7em] block h-1 w-1 rounded-full bg-[color:var(--color-vermilion)]"
                    />
                  ) : null}
                  {inlineFormat(it)}
                </li>
              ))}
            </Tag>
          );
        }
        return null;
      })}
      {streaming ? (
        <span className="caret inline-block h-[1em] w-[2px] bg-[color:var(--color-vermilion)] align-[-2px]" />
      ) : null}
    </article>
  );
}

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ kind: "h2", text: trimmed.slice(3).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ kind: "h3", text: trimmed.slice(4).trim() });
      i++;
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim().length > 0 &&
      !(lines[i] ?? "").trim().startsWith("## ") &&
      !(lines[i] ?? "").trim().startsWith("### ") &&
      !/^[-*]\s+/.test((lines[i] ?? "").trim()) &&
      !/^\d+\.\s+/.test((lines[i] ?? "").trim())
    ) {
      para.push((lines[i] ?? "").trim());
      i++;
    }
    blocks.push({ kind: "p", text: para.join(" ") });
  }
  return blocks;
}

type Node = string | React.ReactElement;

function inlineFormat(text: string): React.ReactNode {
  const nodes: Node[] = [];
  let remaining = text;
  let k = 0;
  const patterns: Array<{
    regex: RegExp;
    wrap: (inner: string, key: string) => React.ReactElement;
  }> = [
    {
      regex: /\*\*([^*]+)\*\*/,
      wrap: (inner, key) => (
        <strong key={key} className="text-[color:var(--color-paper)] font-medium">
          {inner}
        </strong>
      ),
    },
    {
      regex: /\*([^*]+)\*/,
      wrap: (inner, key) => (
        <em key={key} className="display italic text-[color:var(--color-paper)]">
          {inner}
        </em>
      ),
    },
    {
      regex: /`([^`]+)`/,
      wrap: (inner, key) => (
        <code key={key} className="font-mono text-[0.92em] text-[color:var(--color-saffron)]">
          {inner}
        </code>
      ),
    },
  ];

  while (remaining.length > 0) {
    let earliest: { idx: number; len: number; node: React.ReactElement } | null = null;
    for (const p of patterns) {
      const m = p.regex.exec(remaining);
      if (m && (earliest === null || m.index < earliest.idx)) {
        earliest = {
          idx: m.index,
          len: m[0].length,
          node: p.wrap(m[1] ?? "", `inl-${k++}`),
        };
      }
    }
    if (!earliest) {
      nodes.push(remaining);
      break;
    }
    if (earliest.idx > 0) nodes.push(remaining.slice(0, earliest.idx));
    nodes.push(earliest.node);
    remaining = remaining.slice(earliest.idx + earliest.len);
  }
  return nodes;
}
