import { useEffect, useState } from "react";

/**
 * LiveStreamCorner — adapted from Mnemos-III design.
 *
 * An always-running miniature reasoning stream. Cycles a 7-step canned
 * trace every 1.9 seconds, fading the older lines and rising new ones in
 * from the left. Used as proof-of-life next to the hero headline.
 */

interface Node {
  kind: "thought" | "tool" | "observe" | "answer";
  text: string;
}

const CORNER_SCRIPT: Node[] = [
  { kind: "thought", text: "user wants to know if Q3 plan slipped" },
  { kind: "tool",    text: "memory.search · \"Q3 roadmap status\"" },
  { kind: "observe", text: "6 docs · top cosine 0.91" },
  { kind: "thought", text: "confirm via weekly sync notes" },
  { kind: "tool",    text: "memory.search · \"weekly sync inference SLO\"" },
  { kind: "observe", text: "3 notes · 2 mention slip · owner K. Reyes" },
  { kind: "answer",  text: "Yes — slipped one week. Inference SLO. Owner K. Reyes." },
];

const KIND_COLOR: Record<Node["kind"], string> = {
  thought: "var(--color-vermilion)",
  tool: "var(--color-saffron)",
  observe: "var(--color-paper-muted)",
  answer: "var(--color-paper)",
};
const KIND_GLYPH: Record<Node["kind"], string> = {
  thought: "·",
  tool: "›",
  observe: "‹",
  answer: "◆",
};

export function LiveStreamCorner() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % CORNER_SCRIPT.length), 1900);
    return () => clearInterval(id);
  }, []);
  const visible = CORNER_SCRIPT.slice(0, step + 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {visible.map((n, i) => {
        const isLast = i === visible.length - 1;
        return (
          <div
            key={i + "-" + step}
            style={{
              display: "grid",
              gridTemplateColumns: "14px 1fr",
              gap: 8,
              opacity: isLast ? 1 : 0.5,
              animation: "lsc-rise-left 320ms var(--ease) both",
              transition: "opacity 320ms var(--ease)",
            }}
          >
            <span
              style={{
                color: KIND_COLOR[n.kind],
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                paddingTop: 3,
              }}
            >
              {KIND_GLYPH[n.kind]}
            </span>
            {n.kind === "answer" ? (
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  fontSize: 15,
                  color: "var(--color-paper)",
                }}
              >
                {n.text}
              </span>
            ) : (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontStyle: n.kind === "thought" ? "italic" : "normal",
                  color:
                    n.kind === "tool"
                      ? "var(--color-saffron)"
                      : n.kind === "observe"
                        ? "var(--color-paper-muted)"
                        : "var(--color-paper-dim)",
                  lineHeight: "16px",
                }}
              >
                {n.text}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
