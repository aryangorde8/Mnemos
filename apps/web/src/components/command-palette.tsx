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
  { id: "briefings", label: "briefings", hint: "1-pagers for upcoming meetings", href: "/briefings" },
  { id: "commitments", label: "commitments", hint: "promises in & out", href: "/commitments" },
  { id: "actions", label: "actions ledger", hint: "approvals and history", href: "/actions" },
  { id: "ingest", label: "ingest the demo corpus", hint: "load alex · 247 docs → atlas", href: "/ingest" },
  { id: "home", label: "back to dashboard", hint: "the empty vault", href: "/" },
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
      label: `ask the agent: "${trimmed}"`,
      hint: "multi-step reasoning · sse stream",
      kind: "ask",
      run: () => {
        onClose();
        void router.push({ pathname: "/ask", query: { q: trimmed, run: "1" } });
      },
    };
    const searchCmd: PaletteCommand = {
      id: "search:dynamic",
      label: `search the vault: "${trimmed}"`,
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
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      onClick={onClose}
      onKeyDown={onKeyDown}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[color:var(--color-ink)]/82 backdrop-blur-[3px]"
      />
      <section
        className="relative w-full max-w-[640px] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-1)] shadow-[0_20px_60px_-10px_rgba(0,0,0,0.7),0_0_0_1px_var(--color-rule)_inset]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between border-b border-[color:var(--color-rule)] px-5 py-3">
          <span className="label">μν. · command palette</span>
          <span className="chrome">
            <kbd className="border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.1em]">
              esc
            </kbd>{" "}
            to close
          </span>
        </header>

        <div className="flex items-baseline gap-3 px-5 py-4">
          <span className="display text-[1.6rem] italic leading-none text-[color:var(--color-vermilion)]">?</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ask the vault, jump to a page, or just start typing"
            spellCheck={false}
            autoComplete="off"
            className="display w-full bg-transparent text-[1.4rem] italic leading-tight text-[color:var(--color-paper)] outline-none placeholder:font-mono placeholder:not-italic placeholder:text-[0.78em] placeholder:tracking-[0.005em] placeholder:text-[color:var(--color-paper-faint)]"
          />
        </div>

        <ul role="listbox" className="max-h-[55vh] overflow-y-auto border-t border-[color:var(--color-rule)]">
          {commands.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => c.run()}
              className={`group flex cursor-pointer items-baseline justify-between px-5 py-3 transition-colors ${
                i === active
                  ? "bg-[color:var(--color-ink-2)]"
                  : "hover:bg-[color:var(--color-ink-2)]/60"
              }`}
            >
              <span className="flex items-baseline gap-3 min-w-0">
                <span
                  className={`font-mono text-[0.78rem] ${
                    i === active ? "text-[color:var(--color-vermilion)]" : "text-[color:var(--color-paper-faint)]"
                  }`}
                >
                  {c.kind === "ask" ? "→" : c.kind === "search" ? "›" : "·"}
                </span>
                <span className="truncate text-[0.96rem] text-[color:var(--color-paper)]">
                  {c.label}
                </span>
              </span>
              <span className="hidden whitespace-nowrap chrome md:inline">
                {c.hint}
              </span>
            </li>
          ))}
        </ul>

        <footer className="flex items-center justify-between border-t border-[color:var(--color-rule)] px-5 py-2.5 chrome">
          <span>
            <kbd className="border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.1em]">↑↓</kbd>{" "}
            navigate
            <span className="px-2 text-[color:var(--color-rule-strong)]">·</span>
            <kbd className="border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.1em]">⏎</kbd>{" "}
            select
          </span>
          <span>{commands.length} options</span>
        </footer>
      </section>
    </div>
  );
}
