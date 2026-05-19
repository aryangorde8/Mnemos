import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { listActions, getCritiqueForAction, type ActionRecord, type CritiqueRecord } from "@/lib/api";
import { Drawline } from "@/components/motion-primitives";

/**
 * /runs — time-travel index of every past agent run.
 *
 * Each run is a logical group of one or more actions sharing the same
 * runId. We pull the actions collection (already exposed via /actions),
 * group by runId client-side, and render each as a row with:
 *   - the original query
 *   - timestamp
 *   - tool fingerprint (action kinds in this run)
 *   - status summary (proposed / sent / rejected counts)
 *   - critique verdict if a critique exists for any draft in the run
 *   - "replay" button that navigates to /ask with the query pre-loaded
 *     and run=1 so the agent re-fires fresh on the live indexes
 *
 * No event persistence needed — replay = fresh re-run, which is arguably
 * MORE useful than a static recording (the agent sees the current vault).
 */

interface RunGroup {
  runId: string;
  query: string;
  firstAt: string;
  lastAt: string;
  actions: ActionRecord[];
  critique: CritiqueRecord | null;
}

export default function RunsPage() {
  const router = useRouter();
  const [actions, setActions] = useState<ActionRecord[] | null>(null);
  const [critiqueByAction, setCritiqueByAction] = useState<Record<string, CritiqueRecord | null>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const res = await listActions({ limit: 100 });
      if (cancelled) return;
      if (!res) {
        setErr("ledger unreachable — boot apps/agent and confirm MONGODB_URI");
        setActions([]);
      } else {
        setActions(res.actions);
        // Best-effort fetch critique per draft_email action (background)
        const drafts = res.actions.filter((a) => a.kind === "draft_email");
        const results = await Promise.allSettled(
          drafts.map((a) => getCritiqueForAction(a.id).then((c) => [a.id, c] as const)),
        );
        const map: Record<string, CritiqueRecord | null> = {};
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) {
            const [id, c] = r.value;
            map[id] = c;
          }
        }
        if (!cancelled) setCritiqueByAction(map);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Group actions by runId
  const runs: RunGroup[] = useMemo(() => {
    if (!actions) return [];
    const byRun = new Map<string, RunGroup>();
    for (const a of actions) {
      if (!a.runId) continue;
      const key = a.runId;
      const ex = byRun.get(key);
      if (ex) {
        ex.actions.push(a);
        if (a.createdAt < ex.firstAt) ex.firstAt = a.createdAt;
        if (a.createdAt > ex.lastAt) ex.lastAt = a.createdAt;
        if (!ex.query && a.query) ex.query = a.query;
        if (!ex.critique && critiqueByAction[a.id]) ex.critique = critiqueByAction[a.id]!;
      } else {
        byRun.set(key, {
          runId: key,
          query: a.query ?? "(no query recorded)",
          firstAt: a.createdAt,
          lastAt: a.createdAt,
          actions: [a],
          critique: critiqueByAction[a.id] ?? null,
        });
      }
    }
    return Array.from(byRun.values()).sort((a, b) => b.firstAt.localeCompare(a.firstAt));
  }, [actions, critiqueByAction]);

  function replay(r: RunGroup) {
    void router.push({ pathname: "/ask", query: { q: r.query, run: "1" } });
  }

  return (
    <>
      <Head>
        <title>Mnemos — runs · the agent's history</title>
      </Head>
      <main className="relative min-h-dvh w-full">
        <header className="border-b border-[color:var(--color-rule)]/70">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-4 md:px-16">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span
                className="display-i leading-none"
                style={{ fontSize: "1.4rem", color: "var(--color-paper)" }}
              >
                Mnemos
              </span>
              <span className="label">μν. · runs</span>
            </Link>
            <nav className="flex items-center gap-5 chrome">
              <Link href="/ask" className="hover:text-[color:var(--color-paper-dim)]">ask</Link>
              <span aria-hidden>·</span>
              <Link href="/memory" className="hover:text-[color:var(--color-paper-dim)]">memory</Link>
              <span aria-hidden>·</span>
              <Link href="/runs" className="text-[color:var(--color-paper-dim)]">runs</Link>
              <span aria-hidden>·</span>
              <Link href="/actions" className="hover:text-[color:var(--color-paper-dim)]">actions</Link>
            </nav>
          </div>
        </header>

        <section className="mx-auto max-w-[1240px] px-10 pb-32 pt-14 md:px-16">
          <motion.div
            className="label flex items-center gap-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <Drawline width={32} delay={0.05} />
            <span>── mnemos · runs · every past reasoning</span>
          </motion.div>

          <motion.h1
            className="display mt-6 max-w-[28ch]"
            style={{
              fontSize: "clamp(2rem, 5.4vw, 3.6rem)",
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              color: "var(--color-paper)",
            }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          >
            The agent's{" "}
            <span className="display-i" style={{ color: "var(--color-vermilion)" }}>
              memory of itself.
            </span>
          </motion.h1>

          <motion.p
            className="mt-5 max-w-[60ch]"
            style={{ fontSize: "1rem", color: "var(--color-paper-dim)", lineHeight: "26px" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.35 }}
          >
            Every past run, indexed by the runId the agent stamped on each tool call. Click any row
            to <em>replay</em> — Mnemos re-fires the original query against the current vault, so
            you see how the agent reasons now versus how it reasoned then.
          </motion.p>

          <hr className="hair mt-10" />

          {loading ? (
            <Skeleton />
          ) : err ? (
            <ErrorPanel message={err} />
          ) : runs.length === 0 ? (
            <EmptyPanel />
          ) : (
            <RunList runs={runs} onReplay={replay} />
          )}
        </section>
      </main>
    </>
  );
}

function RunList({ runs, onReplay }: { runs: RunGroup[]; onReplay: (r: RunGroup) => void }) {
  return (
    <ol className="mt-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {runs.map((r, i) => (
        <RunRow key={r.runId} run={r} rank={i + 1} onReplay={() => onReplay(r)} />
      ))}
    </ol>
  );
}

function RunRow({
  run,
  rank,
  onReplay,
}: {
  run: RunGroup;
  rank: number;
  onReplay: () => void;
}) {
  const kinds = Array.from(new Set(run.actions.map((a) => a.kind)));
  const statuses = run.actions.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});
  const date = new Date(run.firstAt);
  const verdict = run.critique?.verdict;
  return (
    <motion.li
      className="ledger-row"
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr 220px 140px",
        gap: 24,
        alignItems: "baseline",
      }}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.32, delay: Math.min(rank * 0.03, 0.4), ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="mono tabular"
        style={{ fontSize: 12, color: "var(--color-paper-faint)" }}
      >
        {String(rank).padStart(2, "0")}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          className="display-i"
          style={{
            fontSize: "1.15rem",
            color: "var(--color-paper)",
            lineHeight: 1.35,
            letterSpacing: "-0.005em",
            marginBottom: 6,
          }}
        >
          “{run.query}”
        </div>
        <div className="chrome" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <span className="tabular" style={{ color: "var(--color-paper-muted)" }}>
            run {run.runId.slice(0, 8)}
          </span>
          <span style={{ color: "var(--color-rule-strong)" }}>·</span>
          <span>
            {kinds.map((k, i) => (
              <span key={k}>
                {i > 0 && <span style={{ color: "var(--color-rule-strong)" }}> + </span>}
                <span style={{ color: "var(--color-paper-dim)" }}>{k.replace("_", " ")}</span>
              </span>
            ))}
          </span>
          {verdict && (
            <>
              <span style={{ color: "var(--color-rule-strong)" }}>·</span>
              <span
                style={{
                  color:
                    verdict === "approve"
                      ? "var(--color-paper-muted)"
                      : verdict === "reject"
                        ? "var(--color-vermilion)"
                        : "var(--color-saffron)",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  fontSize: 10,
                }}
              >
                critic {verdict}
              </span>
            </>
          )}
        </div>
      </div>

      <div
        className="chrome tabular"
        style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 2 }}
      >
        <span style={{ color: "var(--color-paper-dim)" }}>{formatDate(date)}</span>
        <span style={{ color: "var(--color-paper-faint)", fontSize: 10 }}>
          {Object.entries(statuses)
            .map(([k, v]) => `${v} ${k}`)
            .join(" · ")}
        </span>
      </div>

      <div style={{ textAlign: "right" }}>
        <button
          onClick={onReplay}
          className="mono focusable"
          style={{
            padding: "6px 14px",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-paper-dim)",
            border: "1px solid var(--color-rule-strong)",
            background: "var(--color-ink-2)",
            cursor: "pointer",
            transition: "all var(--snap) var(--ease)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--color-vermilion)";
            e.currentTarget.style.color = "var(--color-paper)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--color-rule-strong)";
            e.currentTarget.style.color = "var(--color-paper-dim)";
          }}
        >
          <span style={{ color: "var(--color-vermilion)", marginRight: 6 }}>↻</span>
          replay
        </button>
      </div>
    </motion.li>
  );
}

function formatDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return "—";
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return Math.floor(diff / 60_000) + " min ago";
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + "h ago";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Skeleton() {
  return (
    <div className="mt-4 space-y-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="grid items-baseline gap-6 py-4"
          style={{ gridTemplateColumns: "44px 1fr 220px 140px", opacity: 0.6 - i * 0.1 }}
        >
          <span className="block h-3 w-6 bg-[color:var(--color-rule)]" />
          <div className="space-y-2">
            <span className="block h-4 w-2/3 bg-[color:var(--color-rule-strong)]" />
            <span className="block h-3 w-1/3 bg-[color:var(--color-rule)]" />
          </div>
          <span className="block h-3 w-32 bg-[color:var(--color-rule)]" />
          <span className="block h-7 w-24 bg-[color:var(--color-rule)]" />
        </div>
      ))}
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="mt-10 border border-[color:var(--color-vermilion-deep)]/60 bg-[color:var(--color-ink-1)] p-6">
      <p className="label">history unavailable</p>
      <p className="mt-2 font-mono text-[0.85rem] text-[color:var(--color-paper-dim)]">{message}</p>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="mt-12 border-t border-[color:var(--color-rule)] pt-10">
      <p className="label">no runs yet</p>
      <p className="mt-3 max-w-[52ch] text-[1.05rem] leading-relaxed text-[color:var(--color-paper-dim)]">
        Every time the agent fires a tool, it stamps a <em>runId</em> on the action it persists.
        Ask it something on{" "}
        <Link href="/ask" className="underline" style={{ color: "var(--color-paper)" }}>
          /ask
        </Link>{" "}
        and the run will appear here.
      </p>
    </div>
  );
}
