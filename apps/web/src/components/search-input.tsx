import { type KeyboardEvent, type FormEvent, useEffect, useRef } from "react";

export function SearchInput({
  value,
  onChange,
  onSubmit,
  pending,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  function handleForm(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={handleForm} className="relative">
      <div className="flex items-baseline gap-3">
        <span className="display select-none text-[2.4rem] italic leading-none text-[color:var(--color-vermilion)]">
          {pending ? caret() : "›"}
        </span>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          spellCheck={false}
          aria-label="Ask Mnemos"
          placeholder="ask the vault — e.g. what did I commit to Sarah last week"
          className="display block w-full resize-none bg-transparent text-[clamp(1.75rem,4.4vw,2.6rem)] italic leading-[1.18] tracking-[var(--tracking-display)] text-[color:var(--color-paper)] placeholder:text-[color:var(--color-paper-faint)] placeholder:not-italic focus:outline-none"
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="block h-px w-full bg-[color:var(--color-rule)]">
          <span
            className="block h-px bg-[color:var(--color-vermilion)] transition-[width] duration-500"
            style={{ width: pending ? "100%" : value ? "32%" : "0" }}
          />
        </span>
        <span className="chrome whitespace-nowrap">
          {pending ? "thinking…" : "⏎ to search"}
        </span>
      </div>
    </form>
  );
}

function caret(): string {
  return "▍";
}
