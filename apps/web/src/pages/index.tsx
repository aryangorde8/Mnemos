import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ready, ingestStats } from "@/lib/api";
import { StatusPill } from "@/components/editorial";
import { Spotlight } from "@/components/spotlight";
import { Reveal, Words, Drawline, stagger, fadeRise } from "@/components/motion-primitives";

type ReadyState = { atlas: boolean; vertex: boolean; agent: boolean } | null;
type StatsState = { docs: number; chunks: number } | null;

export default function Dashboard() {
  const [status, setStatus] = useState<ReadyState>(null);
  const [stats, setStats] = useState<StatsState>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const [r, s] = await Promise.all([ready(), ingestStats()]);
      if (cancelled) return;
      if (r) setStatus({ atlas: r.atlas === "configured", vertex: r.vertex === "configured", agent: true });
      else setStatus({ atlas: false, vertex: false, agent: false });
      if (s) setStats({ docs: s.documents, chunks: s.chunks });
    }
    poll();
    const id = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <>
      <Head>
        <title>Mnemos — the memory agent</title>
      </Head>
      <main className="relative min-h-dvh w-full overflow-hidden">
        <Spotlight intensity={0.38} />
        <TopBar status={status} />
        <LeftRail />
        <BottomBar atlasOk={status?.atlas} stats={stats} />

        <section className="relative z-10 mx-auto max-w-[1240px] px-10 pb-32 pt-32 md:px-16">
          {/* Hero kicker */}
          <motion.div
            className="label flex items-center gap-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <Drawline width={40} delay={0.1} />
            <span>day {hackathonDay()} · the rapid agent hackathon · mongodb partner track</span>
          </motion.div>

          {/* Hero headline — word-by-word reveal */}
          <motion.h1
            className="display mt-7"
            style={{
              fontSize: "clamp(2.8rem, 7.4vw, 6.6rem)",
              lineHeight: 0.94,
              letterSpacing: "-0.02em",
              color: "var(--color-paper)",
              maxWidth: "22ch",
            }}
            variants={stagger(0.05, 0.18)}
            initial="hidden"
            animate="show"
          >
            <Words text="The first agent that takes" gap={0.045} />
            <br />
            <motion.em
              variants={fadeRise}
              className="display-i"
              style={{ display: "inline-block", color: "var(--color-paper)" }}
            >
              multi-step actions
            </motion.em>{" "}
            <motion.span variants={fadeRise} style={{ display: "inline-block", color: "var(--color-paper-dim)" }}>
              on top
            </motion.span>
            <br />
            <Words
              text="of your professional memory."
              gap={0.045}
              style={{ color: "var(--color-paper-dim)" }}
            />
          </motion.h1>

          {/* Sub-paragraph */}
          <Reveal delay={1.0}>
            <p
              className="mt-9"
              style={{
                maxWidth: 640,
                fontSize: "1.02rem",
                color: "var(--color-paper-muted)",
                lineHeight: 1.6,
              }}
            >
              Mnemos ingests your corpus once — every email, calendar event, meeting note, shared doc,
              slack message, and stray jot. From then on it retrieves, reasons in a live stream, and
              proposes concrete actions that wait for one&#8209;click approval. Not search. Not notes.
            </p>
          </Reveal>

          {/* CTA row */}
          <Reveal delay={1.2}>
            <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-3">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link href="/ingest" className="btn-decisive primary">begin ingest</Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link href="/ask" className="btn-decisive">ask the agent</Link>
              </motion.div>
              <span className="chrome ml-3">
                press <span style={{ color: "var(--color-paper)" }}>⌘K</span> anywhere to ask
              </span>
            </div>
          </Reveal>

          <hr className="hair mt-16" />

          {/* Three editorial tiles — staggered scale-in */}
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3"
            variants={stagger(0.08, 1.4)}
            initial="hidden"
            animate="show"
          >
            {TILES.map((t, i) => (
              <motion.div key={t.title} variants={fadeRise}>
                <Tile tile={t} last={i === TILES.length - 1} />
              </motion.div>
            ))}
          </motion.div>
          <hr className="hair" />

          {/* Status pills row */}
          <motion.div
            className="mt-12 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <StatusPill
              label="Atlas"
              value={status?.atlas ? "connected" : "offline"}
              state={status === null ? "pending" : status.atlas ? "on" : "off"}
              latency={status?.atlas ? 12 : undefined}
              seed={1}
            />
            <StatusPill
              label="Vertex"
              value={status?.vertex ? "connected" : "awaiting creds"}
              state={status === null ? "pending" : status.vertex ? "on" : "off"}
              latency={status?.vertex ? 86 : undefined}
              seed={2}
            />
            <StatusPill
              label="Agent"
              value={status?.agent ? "live" : "offline"}
              state={status === null ? "pending" : status.agent ? "on" : "off"}
              latency={status?.agent ? 4 : undefined}
              seed={3}
            />
          </motion.div>

          {/* Sign-off */}
          <div className="mt-16 flex flex-wrap items-baseline justify-between gap-y-2">
            <span className="chrome">
              corpus: <span className="tabular">{stats ? `${stats.docs} / 247` : "0 / 247"}</span>{" "}
              documents{stats && stats.chunks > 0 ? ` · ${stats.chunks} chunks` : " · vault offline until ingest"}
            </span>
            <span className="chrome">— signed, the agent.</span>
          </div>
        </section>
      </main>
    </>
  );
}

const TILES = [
  {
    num: "01",
    glyph: "❡",
    title: "Memory",
    italic: "ingested.",
    body: "A unified vault of mail, calendar, notes, slack and shared docs — stored as vectors in MongoDB Atlas, queryable in milliseconds.",
    href: "/search",
  },
  {
    num: "02",
    glyph: "⌗",
    title: "Reasoning",
    italic: "streamed.",
    body: "Watch Gemini 3 Pro think out loud over a server-sent event stream. Every thought, every retrieval, every citation — in order.",
    href: "/ask",
  },
  {
    num: "03",
    glyph: "✎",
    title: "Action",
    italic: "proposed.",
    body: "The agent drafts the email, schedules the meeting, books the follow-up. You approve in one click. Nothing happens without you.",
    href: "/actions",
  },
];

function Tile({ tile, last }: { tile: (typeof TILES)[number]; last: boolean }) {
  return (
    <Link
      href={tile.href}
      className="rise focusable group relative block"
      style={{
        padding: "36px 32px 32px",
        borderRight: last ? "none" : "1px solid var(--color-rule)",
        borderTop: "1px solid var(--color-rule)",
      }}
    >
      {/* Hover hairline */}
      <span
        className="absolute left-8 right-8 top-0 block h-px origin-left scale-x-0 transition-transform duration-500 ease-out group-hover:scale-x-100"
        style={{ background: "var(--color-vermilion)" }}
      />
      <div className="mb-8 flex items-baseline justify-between">
        <span className="label">{tile.num}</span>
        <span
          className="display-i"
          style={{ fontSize: "2.4rem", color: "var(--color-ink-3)", lineHeight: 1 }}
        >
          {tile.glyph}
        </span>
      </div>
      <div
        className="display"
        style={{ fontSize: "2.5rem", lineHeight: 1, letterSpacing: "-0.015em" }}
      >
        {tile.title}{" "}
        <span className="display-i" style={{ color: "var(--color-vermilion)" }}>
          {tile.italic}
        </span>
      </div>
      <p
        className="mt-5"
        style={{
          fontSize: "0.92rem",
          color: "var(--color-paper-muted)",
          lineHeight: 1.6,
          maxWidth: "34ch",
        }}
      >
        {tile.body}
      </p>
    </Link>
  );
}

function TopBar({ status }: { status: ReadyState }) {
  const anyLive = status?.atlas || status?.vertex || status?.agent;
  return (
    <header className="absolute inset-x-0 top-0 z-20 border-b border-[color:var(--color-rule)]/70">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-4 md:px-16">
        <Link href="/" className="flex items-baseline gap-2.5">
          <span
            className="display-i leading-none"
            style={{ fontSize: "1.4rem", color: "var(--color-paper)" }}
          >
            Mnemos
          </span>
          <span className="label">μν. — memory agent</span>
        </Link>
        <div className="flex items-center gap-6">
          <span className="chrome hidden md:inline">
            2026 · vol. 001 · day {hackathonDay()} / 028
          </span>
          <span className="flex items-center gap-2">
            <span className={anyLive ? "pulse-dot" : "pulse-dot pulse-dot-muted"} />
            <span className="chrome">{anyLive ? "live" : "idle"}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

function LeftRail() {
  return (
    <aside
      aria-hidden
      className="pointer-events-none absolute bottom-24 left-3 top-24 z-10 hidden flex-col items-center justify-between md:flex"
    >
      <span className="vrail whitespace-nowrap">
        Mnemos · the memory agent · v0.0.1
      </span>
      <span className="vrail whitespace-nowrap">
        an editorial built on what you've seen
      </span>
    </aside>
  );
}

function BottomBar({ atlasOk, stats }: { atlasOk?: boolean; stats: StatsState }) {
  return (
    <footer className="absolute inset-x-0 bottom-0 z-20 border-t border-[color:var(--color-rule)]/70">
      <div className="mx-auto grid max-w-[1240px] grid-cols-2 items-center gap-4 px-10 py-4 md:grid-cols-3 md:px-16">
        <span className="chrome">a memory-first agent · built for action</span>
        <span className="chrome hidden text-center md:block">
          {isoDate()} —{" "}
          <span style={{ color: "var(--color-paper-muted)" }}>
            {atlasOk
              ? stats && stats.docs > 0
                ? `vault active · ${stats.docs} docs`
                : "vault active · empty"
              : "vault offline"}
          </span>
        </span>
        <span className="chrome text-right">
          press <span style={{ color: "var(--color-paper-dim)" }}>⌘K</span> to begin
        </span>
      </div>
    </footer>
  );
}

const HACKATHON_START = new Date("2026-05-16T00:00:00Z").getTime();
const HACKATHON_TOTAL = 28;
function hackathonDay(): string {
  const d = Math.max(1, Math.min(HACKATHON_TOTAL, Math.floor((Date.now() - HACKATHON_START) / 86400_000) + 1));
  return String(d).padStart(3, "0");
}
function isoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
