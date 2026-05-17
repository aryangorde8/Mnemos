import { useMemo } from "react";

interface Section {
  key: string;
  title: string;
  items: string[];
  paras: string[];
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
  const { lead, sections } = useMemo(() => parse(source), [source]);

  return (
    <article className="mt-12 space-y-14">
      {lead && (
        <p
          className="display max-w-[60ch]"
          style={{
            fontSize: "1.32rem",
            lineHeight: 1.45,
            color: "var(--color-paper-dim)",
          }}
        >
          {inlineFormat(lead)}
        </p>
      )}

      {sections.map((s, i) => (
        <SectionView key={i} section={s} index={i} />
      ))}

      {streaming && sections.length === 0 && !lead && (
        <span className="caret-thin" />
      )}
    </article>
  );
}

function SectionView({ section, index }: { section: Section; index: number }) {
  const accent = SECTION_ACCENT[section.key] ?? "var(--color-rule-strong)";
  const roman = ["i", "ii", "iii", "iv", "v"][index] ?? String(index + 1);

  return (
    <section className="rise">
      <div className="mb-7 flex items-center gap-3">
        <span className="block h-px w-12" style={{ background: accent }} />
        <span className="section-head-num">
          {roman} · {section.title}
        </span>
      </div>

      {section.key === "attendees" ? (
        <AttendeesView items={section.items} />
      ) : section.key === "open threads" ? (
        <ThreadsView items={section.items} />
      ) : section.key === "outstanding commitments" ? (
        <CommitmentsView items={section.items} />
      ) : section.key === "suggested talking points" ? (
        <TalkingPointsView items={section.items} />
      ) : (
        <DefaultListView items={section.items} paras={section.paras} />
      )}
    </section>
  );
}

/* ============================================================
   Attendees — credit-roll style
   ============================================================ */
function AttendeesView({ items }: { items: string[] }) {
  return (
    <div>
      {items.map((item, i) => {
        const parts = item.split(/\s*[—–-]\s+/, 2);
        const name = parts[0] ?? item;
        const role = parts[1] ?? "";
        return (
          <div key={i} className="brief-attendee">
            <div
              className="mono"
              style={{
                fontSize: "0.74rem",
                color: "var(--color-paper-faint)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {String(i + 1).padStart(2, "0")} · attendee
            </div>
            <div>
              <span
                className="display-i"
                style={{ fontSize: "1.5rem", color: "var(--color-paper)" }}
              >
                {name}
              </span>
              {role && (
                <span
                  className="ml-3"
                  style={{ color: "var(--color-paper-muted)", fontSize: "0.92rem" }}
                >
                  — {role}
                </span>
              )}
            </div>
            <div className="chrome tabular text-right" />
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Open threads — tagged ticker
   ============================================================ */
function ThreadsView({ items }: { items: string[] }) {
  return (
    <div className="border border-[color:var(--color-rule)] bg-[color:var(--color-ink-1)]">
      {items.map((item, i) => {
        const tag = pickTag(item);
        const tagColor =
          tag === "HOT" ? "var(--color-vermilion)"
          : tag === "NEW" ? "var(--color-saffron)"
          : "var(--color-paper-faint)";
        return (
          <div
            key={i}
            className="brief-thread"
            style={{
              borderBottom: i < items.length - 1 ? "1px solid var(--color-rule)" : "none",
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: "0.68rem",
                letterSpacing: "0.14em",
                color: tagColor,
                fontWeight: 500,
              }}
            >
              {tag}
            </span>
            <div style={{ fontSize: "0.98rem", color: "var(--color-paper-dim)" }}>
              {inlineFormat(stripTagPrefix(item))}
            </div>
            <div className="chrome tabular" />
          </div>
        );
      })}
    </div>
  );
}

function pickTag(text: string): string {
  const t = text.toLowerCase();
  if (t.match(/\bblocker|urgent|hot|unanswered|escalat/)) return "HOT";
  if (t.match(/\bnew|just|today|yesterday|recent|fresh/)) return "NEW";
  return "··";
}

function stripTagPrefix(text: string): string {
  return text.replace(/^\s*[[(]?(NEW|HOT|OPEN|··|·)[\])]?\s*[:—-]?\s*/i, "");
}

/* ============================================================
   Outstanding commitments — contract frame
   ============================================================ */
function CommitmentsView({ items }: { items: string[] }) {
  return (
    <div
      className="border border-[color:var(--color-rule)] bg-[color:var(--color-ink-1)]"
      style={{ padding: "26px 32px" }}
    >
      <div
        className="chrome mb-3"
        style={{ textTransform: "uppercase", letterSpacing: "0.16em" }}
      >
        ┌── outstanding from prior sessions ──────
      </div>
      {items.length === 0 ? (
        <p
          className="mono"
          style={{
            fontSize: "0.9rem",
            color: "var(--color-paper-muted)",
            padding: "10px 0",
          }}
        >
          Nothing tracked for this meeting.
        </p>
      ) : (
        items.map((item, i) => (
          <div key={i} className="brief-commit">
            <div
              className="mono"
              style={{
                color: "var(--color-vermilion)",
                paddingTop: 3,
                fontSize: "0.78rem",
                letterSpacing: "0.06em",
              }}
            >
              § {String(i + 1).padStart(2, "0")}
            </div>
            <div
              className="display"
              style={{
                fontSize: "1.16rem",
                color: "var(--color-paper)",
                lineHeight: 1.42,
              }}
            >
              {inlineFormat(item)}
            </div>
            <div
              className="mono"
              style={{
                fontSize: "0.74rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--color-paper-muted)",
                whiteSpace: "nowrap",
              }}
            />
          </div>
        ))
      )}
      <div
        className="chrome mt-3"
        style={{ textTransform: "uppercase", letterSpacing: "0.16em" }}
      >
        └─────────────────────────────────────
      </div>
    </div>
  );
}

/* ============================================================
   Suggested talking points — q.01 / q.02 prep cards
   ============================================================ */
function TalkingPointsView({ items }: { items: string[] }) {
  return (
    <div>
      {items.map((item, i) => {
        const parts = item.split(/\s*[—–-]\s+/, 2);
        const q = parts[0] ?? item;
        const a = parts[1] ?? "";
        return (
          <div
            key={i}
            className="brief-talk"
            style={{
              borderBottom: i < items.length - 1 ? "1px solid var(--color-rule)" : "none",
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: "0.82rem",
                color: "var(--color-paper-faint)",
                letterSpacing: "0.1em",
              }}
            >
              q.{String(i + 1).padStart(2, "0")}
            </div>
            <div>
              <div
                className="display-i mb-1.5"
                style={{
                  fontSize: "1.42rem",
                  color: "var(--color-paper)",
                  letterSpacing: "-0.005em",
                  lineHeight: 1.25,
                }}
              >
                {q}
              </div>
              {a && (
                <div
                  style={{
                    fontSize: "0.92rem",
                    color: "var(--color-paper-muted)",
                    maxWidth: 660,
                    lineHeight: 1.55,
                  }}
                >
                  — {inlineFormat(a)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Default fallback — bullet list
   ============================================================ */
function DefaultListView({ items, paras }: { items: string[]; paras: string[] }) {
  return (
    <div className="space-y-3">
      {paras.map((p, i) => (
        <p key={"p" + i} style={{ maxWidth: "68ch", color: "var(--color-paper-dim)" }}>
          {inlineFormat(p)}
        </p>
      ))}
      {items.length > 0 && (
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li
              key={i}
              className="relative pl-5"
              style={{ color: "var(--color-paper-dim)" }}
            >
              <span
                aria-hidden
                className="absolute left-0 top-[0.7em] block h-1 w-1 rounded-full"
                style={{ background: "var(--color-vermilion)" }}
              />
              {inlineFormat(it)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ============================================================
   PARSER
   ============================================================ */
function parse(source: string): { lead: string; sections: Section[] } {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  let lead = "";
  let current: Section | null = null;
  let leadCollecting = true;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith("## ")) {
      const title = line.slice(3).trim();
      current = {
        key: title.toLowerCase().replace(/^\d+\.\s*/, ""),
        title,
        items: [],
        paras: [],
      };
      sections.push(current);
      leadCollecting = false;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const item = line.replace(/^[-*]\s+/, "").trim();
      if (current) current.items.push(item);
      continue;
    }
    if (leadCollecting) {
      lead = lead ? lead + " " + line : line;
    } else if (current) {
      current.paras.push(line);
    }
  }
  return { lead, sections };
}

/* ============================================================
   INLINE FORMATTING
   ============================================================ */
function inlineFormat(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let k = 0;
  const patterns: Array<{
    regex: RegExp;
    wrap: (inner: string, key: string) => React.ReactElement;
  }> = [
    {
      regex: /\*\*([^*]+)\*\*/,
      wrap: (inner, key) => (
        <strong key={key} className="font-medium" style={{ color: "var(--color-paper)" }}>
          {inner}
        </strong>
      ),
    },
    {
      regex: /\*([^*]+)\*/,
      wrap: (inner, key) => (
        <em key={key} className="display-i" style={{ color: "var(--color-paper)" }}>
          {inner}
        </em>
      ),
    },
    {
      regex: /`([^`]+)`/,
      wrap: (inner, key) => (
        <code
          key={key}
          className="mono"
          style={{ fontSize: "0.9em", color: "var(--color-saffron)" }}
        >
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
