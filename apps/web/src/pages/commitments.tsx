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
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="display text-[1.6rem] italic leading-none text-[color:var(--color-paper)]">
          {label}
        </h2>
        <span className="label">{commitments.length}</span>
      </div>
      <span
        className={`mt-3 block h-px w-12 ${
          tone === "vermilion"
            ? "bg-[color:var(--color-vermilion)]"
            : "bg-[color:var(--color-saffron)]"
        }`}
      />
      {commitments.length === 0 ? (
        <p className="mt-6 max-w-[40ch] text-[0.92rem] leading-relaxed text-[color:var(--color-paper-faint)]">
          {empty}
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {commitments.map((c) => (
            <CommitmentRow key={c.chunkId} c={c} tone={tone} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CommitmentRow({ c, tone }: { c: Commitment; tone: "vermilion" | "saffron" | "muted" }) {
  const dot =
    tone === "vermilion"
      ? "bg-[color:var(--color-vermilion)]"
      : tone === "saffron"
        ? "bg-[color:var(--color-saffron)]"
        : "bg-[color:var(--color-rule-strong)]";
  const date = formatDate(c.date);
  return (
    <li className="grid grid-cols-[10px_1fr_auto] items-baseline gap-x-3">
      <span className={`mt-2 inline-block h-1 w-1 rounded-full ${dot}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-[0.95rem] leading-[1.55] text-[color:var(--color-paper-dim)]">
          {c.excerpt ?? c.title}
        </p>
        <p className="mt-1 chrome">
          <span>{c.source.replace("_", " ")}</span>
          <span className="px-1.5 text-[color:var(--color-rule-strong)]">·</span>
          <span className="text-[color:var(--color-paper-muted)]">{c.title}</span>
        </p>
      </div>
      <span className="font-mono text-[0.78rem] tabular-nums text-[color:var(--color-paper-faint)]">
        {date}
      </span>
    </li>
  );
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
