import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  kind: "nav" | "ask" | "search";
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const NAV_COMMANDS: Array<{ id: string; label: string; hint: string; href: string }> = [
  { id: "ask", label: "open the agent", hint: "watch it reason", href: "/ask" },
  { id: "search", label: "search the vault", hint: "ranked vector recall", href: "/search" },
  { id: "memory", label: "the memory graph", hint: "extracted people · projects · relations", href: "/memory" },
  { id: "briefings", label: "briefings · the morning paper", hint: "1-pagers for upcoming meetings", href: "/briefings" },
  { id: "commitments", label: "commitments · the ledger", hint: "promises in & out", href: "/commitments" },
  { id: "actions", label: "actions · the queue", hint: "approvals and history", href: "/actions" },
  { id: "ingest", label: "ingest the demo corpus", hint: "load alex · 247 docs → atlas", href: "/ingest" },
  { id: "home", label: "back to dashboard", hint: "the empty vault", href: "/" },
];

const QUICK_ACTIONS = [
  "what did I commit to Sarah last week",
  "draft a polite decline to Marcus and propose Thursday at 2pm",
  "brief me on the Q3 partner review",
  "open threads I owe a reply to",
];

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const navCommands: PaletteCommand[] = NAV_COMMANDS.map((n) => ({
      id: n.id,
      label: n.label,
      hint: n.hint,
      kind: "nav",
      run: () => {
        onClose();
        void router.push(n.href);
      },
    }));

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return navCommands;
    }

    const askCmd: PaletteCommand = {
      id: "ask:dynamic",
      label: trimmed,
      hint: "multi-step reasoning · sse stream",
      kind: "ask",
      run: () => {
        onClose();
        void router.push({ pathname: "/ask", query: { q: trimmed, run: "1" } });
      },
    };
    const searchCmd: PaletteCommand = {
      id: "search:dynamic",
      label: trimmed,
      hint: "vector + lexical recall",
      kind: "search",
      run: () => {
        onClose();
        void router.push({ pathname: "/search", query: { q: trimmed, run: "1" } });
      },
    };
    const filteredNav = navCommands.filter((c) =>
      c.label.toLowerCase().includes(trimmed.toLowerCase()),
    );
    return [askCmd, searchCmd, ...filteredNav];
  }, [query, router, onClose]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, commands.length - 1)));
  }, [commands.length]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, commands.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commands[active]?.run();
      }
    },
    [active, commands, onClose],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="command palette"
      className="cmdk-back"
      onClick={onClose}
      onKeyDown={onKeyDown}
    >
      <section className="cmdk-shell" onClick={(e) => e.stopPropagation()}>
        {/* Input row */}
        <div
          className="flex items-center gap-3.5 border-b border-[color:var(--color-rule)] px-5 py-4"
        >
          <span
            className="display-i"
            style={{
              color: "var(--color-vermilion)",
              fontSize: "1.5rem",
              lineHeight: 1,
            }}
          >
            ?
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ask · search · navigate"
            spellCheck={false}
            autoComplete="off"
            className="display-i flex-1 bg-transparent text-[color:var(--color-paper)] outline-none placeholder:font-mono placeholder:not-italic placeholder:text-[1rem] placeholder:tracking-[0.02em] placeholder:text-[color:var(--color-paper-faint)]"
            style={{ fontSize: "1.4rem", letterSpacing: "-0.005em" }}
          />
          <span className="chrome">esc</span>
        </div>

        {/* Results */}
        <ul role="listbox" className="max-h-[55vh] overflow-y-auto py-1.5">
          {commands.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => c.run()}
              className={"cmdk-row" + (i === active ? " sel" : "")}
            >
              <span
                className="mono"
                style={{
                  textAlign: "center",
                  fontSize: "1.1rem",
                  color: i === active ? "var(--color-vermilion)" : "var(--color-paper-faint)",
                }}
              >
                {c.kind === "ask" ? "?" : c.kind === "search" ? "⌗" : "→"}
              </span>
              <span className="min-w-0">
                <span
                  className="display-i block truncate"
                  style={{ fontSize: "1.08rem", color: "var(--color-paper)" }}
                >
                  {c.label}
                </span>
                <span className="chrome block" style={{ fontSize: "0.72rem", marginTop: 2 }}>
                  {c.hint}
                </span>
              </span>
              <span className={"cmdk-kind " + c.kind}>{c.kind}</span>
            </li>
          ))}
          {commands.length === 0 && (
            <li className="chrome p-10 text-center">
              no matches · press ↵ to ask anyway
            </li>
          )}
        </ul>

        {/* Quick-action chips */}
        <div className="border-t border-[color:var(--color-rule)] px-5 py-4">
          <div className="label mb-2.5">frequent</div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q}
                onClick={() => setQuery(q)}
                className="focusable mono"
                style={{
                  padding: "5px 10px",
                  border: "1px solid var(--color-rule)",
                  background: "transparent",
                  fontSize: "0.74rem",
                  color: "var(--color-paper-muted)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--color-vermilion)";
                  e.currentTarget.style.borderColor = "var(--color-vermilion)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--color-paper-muted)";
                  e.currentTarget.style.borderColor = "var(--color-rule)";
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer
          className="chrome flex items-center justify-between border-t border-[color:var(--color-rule)] px-5 py-2.5"
        >
          <span>↑↓ navigate · ↵ select · ⌘↵ open in new pane</span>
          <span>mnemos · v0.0.1</span>
        </footer>
      </section>
    </div>
  );
}
