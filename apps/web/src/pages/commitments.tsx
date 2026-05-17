import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listCommitments, type Commitment, type CommitmentList } from "@/lib/api";

type Direction = "all" | "incoming" | "outgoing";

export default function CommitmentsPage() {
  const [direction, setDirection] = useState<Direction>("all");
  const [data, setData] = useState<CommitmentList | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void listCommitments({ direction, limit: 40 }).then((res) => {
      if (cancelled) return;
      if (!res) {
        setErr("ledger unreachable — boot apps/agent and confirm MONGODB_URI");
        setData(null);
      } else {
        setData(res);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [direction]);

  const incoming = data?.commitments.filter((c) => c.direction === "incoming") ?? [];
  const outgoing = data?.commitments.filter((c) => c.direction === "outgoing") ?? [];
  const unknown = data?.commitments.filter((c) => c.direction === "unknown") ?? [];

  return (
    <>
      <Head>
        <title>Mnemos — commitments</title>
      </Head>
      <main className="relative min-h-dvh w-full">
        <header className="border-b border-[color:var(--color-rule)]/70">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-4 md:px-16">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="display text-[1.4rem] italic leading-none text-[color:var(--color-paper)]">
                Mnemos
              </span>
              <span className="label">μν. · the promise ledger</span>
            </Link>
            <nav className="flex items-center gap-5 chrome">
              <Link href="/search" className="hover:text-[color:var(--color-paper-dim)]">search</Link>
              <span aria-hidden>·</span>
              <Link href="/ask" className="hover:text-[color:var(--color-paper-dim)]">ask</Link>
              <span aria-hidden>·</span>
              <Link href="/briefings" className="hover:text-[color:var(--color-paper-dim)]">briefings</Link>
              <span aria-hidden>·</span>
              <Link href="/commitments" className="text-[color:var(--color-paper-dim)]">commitments</Link>
              <span aria-hidden>·</span>
              <Link href="/actions" className="hover:text-[color:var(--color-paper-dim)]">actions</Link>
            </nav>
          </div>
        </header>

        <section className="mx-auto max-w-[1240px] px-10 pb-32 pt-14 md:px-16">
          <div className="flex items-center gap-3">
            <span className="block h-px w-10 bg-[color:var(--color-vermilion)]" />
            <span className="label">05 · the promise ledger</span>
          </div>

          <h1 className="display mt-6 max-w-[26ch] text-[clamp(2rem,5vw,3.2rem)] italic leading-[1.05] text-[color:var(--color-paper)]">
            What you owe
            <span style={{ color: "var(--color-paper-muted)" }}> · what you're owed.</span>
          </h1>
          <p className="mt-4 max-w-[60ch] text-[0.98rem] leading-relaxed text-[color:var(--color-paper-dim)]">
            Mnemos extracts open promises from across your memory — across email
            threads, meeting notes, and slack — and surfaces them where you can
            see them at a glance.
          </p>

          <div className="mt-10 flex items-baseline gap-x-6 gap-y-2 border-b border-[color:var(--color-rule)] pb-3">
            {(["all", "incoming", "outgoing"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={`font-mono text-[0.78rem] uppercase tracking-[0.14em] transition-colors ${
                  direction === d
                    ? "text-[color:var(--color-paper)]"
                    : "text-[color:var(--color-paper-faint)] hover:text-[color:var(--color-paper-dim)]"
                }`}
              >
                {d === "incoming" ? "owed to you" : d === "outgoing" ? "you owe" : "all"}
                {direction === d ? (
                  <span className="ml-2 text-[color:var(--color-vermilion)]">·</span>
                ) : null}
              </button>
            ))}
            <span className="ml-auto chrome">
              {data ? `${data.count} commitments` : ""}
            </span>
          </div>

          {loading ? (
            <SkeletonGrid />
          ) : err ? (
            <ErrorPanel message={err} />
          ) : data && data.count === 0 ? (
            <EmptyPanel direction={direction} />
          ) : (
            <div className="mt-10 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
              {(direction === "all" || direction === "outgoing") && (
                <Column label="you owe" tone="vermilion" commitments={direction === "outgoing" ? data?.commitments ?? [] : outgoing} empty="nothing outstanding on your side." />
              )}
              {(direction === "all" || direction === "incoming") && (
                <Column label="owed to you" tone="saffron" commitments={direction === "incoming" ? data?.commitments ?? [] : incoming} empty="nobody owes you anything just now." />
              )}
              {direction === "all" && unknown.length > 0 ? (
                <div className="md:col-span-2 mt-6 border-t border-[color:var(--color-rule)] pt-8">
                  <p className="label">unclassified</p>
                  <ul className="mt-4 space-y-3">
                    {unknown.slice(0, 6).map((c) => (
                      <CommitmentRow key={c.chunkId} c={c} tone="muted" />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function Column({
  label,
  tone,
  commitments,
  empty,
}: {
  label: string;
  tone: "vermilion" | "saffron";
  commitments: Commitment[];
  empty: string;
}) {
  const arrow = tone === "vermilion" ? "→ you owe" : "← owed to you";
  return (
    <section>
      <div className="flex items-baseline justify-between mb-6">
        <span
          className="display-i"
          style={{
            fontSize: "1.8rem",
            color: tone === "vermilion" ? "var(--color-vermilion)" : "var(--color-saffron)",
          }}
        >
          {arrow}
        </span>
        <span className="chrome tabular">
          {commitments.length} {tone === "vermilion" ? "open" : "expected"}
        </span>
      </div>
      {commitments.length === 0 ? (
        <p
          className="mt-2"
          style={{
            maxWidth: "40ch",
            fontSize: "0.92rem",
            lineHeight: 1.55,
            color: "var(--color-paper-faint)",
          }}
        >
          {empty}
        </p>
      ) : (
        <div className="space-y-0">
          {commitments.map((c) => (
            <CommitmentRow key={c.chunkId} c={c} tone={tone} />
          ))}
        </div>
      )}
    </section>
  );
}

function CommitmentRow({ c, tone }: { c: Commitment; tone: "vermilion" | "saffron" | "muted" }) {
  const arrowColor =
    tone === "vermilion" ? "var(--color-vermilion)"
    : tone === "saffron" ? "var(--color-saffron)"
    : "var(--color-paper-muted)";
  const date = formatDate(c.date);
  const who = extractWho(c.title);

  return (
    <div className="ledger-row group">
      <div className="flex items-baseline justify-between">
        <span
          className="mono"
          style={{ fontSize: "0.9rem", color: arrowColor }}
        >
          {tone === "vermilion" ? "→" : tone === "saffron" ? "←" : "·"} {who}
        </span>
        <span className="chrome tabular" style={{ fontSize: "0.7rem" }}>
          {date}
        </span>
      </div>
      <div
        className="display mt-1.5"
        style={{
          fontSize: "1.08rem",
          color: "var(--color-paper)",
          lineHeight: 1.4,
        }}
      >
        {c.excerpt ?? c.title}
      </div>
      {/* Hover anchor — reveals the source quote */}
      <div
        className="rise mt-2.5 hidden p-3 group-hover:block"
        style={{
          borderLeft: `2px solid ${arrowColor}`,
          background: "var(--color-ink-1)",
        }}
      >
        <div className="chrome mb-1">
          anchor · {c.source.replace("_", " ")} · {c.title}
        </div>
        <div
          className="display-i"
          style={{ fontSize: "1rem", color: "var(--color-paper-dim)" }}
        >
          "{c.excerpt ?? c.title}"
        </div>
      </div>
    </div>
  );
}

function extractWho(title: string): string {
  // Try to extract a name from a title like "Re: Q3 plan from Sarah Okafor"
  const m = title.match(/from\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/);
  if (m) return m[1] ?? title;
  return title.length > 36 ? title.slice(0, 33) + "…" : title;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SkeletonGrid() {
  return (
    <div className="mt-10 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
      {[0, 1].map((col) => (
        <div key={col}>
          <span className="block h-7 w-32 bg-[color:var(--color-rule)]" />
          <span className="mt-3 block h-px w-12 bg-[color:var(--color-rule-strong)]" />
          <ul className="mt-6 space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="space-y-2" style={{ opacity: 0.7 - i * 0.14 }}>
                <span className="block h-3 w-full max-w-[42ch] bg-[color:var(--color-rule)]" />
                <span className="block h-3 w-full max-w-[36ch] bg-[color:var(--color-rule)]" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function EmptyPanel({ direction }: { direction: Direction }) {
  const lines: Record<Direction, string> = {
    all: "no commitments extracted yet. ingest the corpus and re-run.",
    incoming: "nobody has a pending commitment to you right now.",
    outgoing: "you don't owe anyone anything in the current memory.",
  };
  return (
    <div className="mt-10 border-t border-[color:var(--color-rule)] pt-12">
      <p className="label">empty</p>
      <p className="mt-3 max-w-[52ch] text-[1.05rem] leading-relaxed text-[color:var(--color-paper-dim)]">
        {lines[direction]}
      </p>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="mt-10 border border-[color:var(--color-vermilion-deep)]/60 bg-[color:var(--color-ink-1)] p-6">
      <p className="label">ledger unavailable</p>
      <p className="mt-2 font-mono text-[0.85rem] text-[color:var(--color-paper-dim)]">{message}</p>
    </div>
  );
}
