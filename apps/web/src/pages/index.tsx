import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ready, ingestStats } from "@/lib/api";
import { StatusPill } from "@/components/editorial";
import { Spotlight } from "@/components/spotlight";
import { Reveal, Words, Drawline, stagger, fadeRise } from "@/components/motion-primitives";
import { AmbientOrbs, Tilt3D, ScrollReveal } from "@/components/parallax";
import { ConstellationCanvas } from "@/components/constellation-canvas";
import { LiveStreamCorner } from "@/components/live-stream-corner";

type ReadyState = { atlas: boolean; vertex: boolean; agent: boolean } | null;
type StatsState = { docs: number; chunks: number } | null;

export default function Dashboard() {
  const [status, setStatus] = useState<ReadyState>(null);
  const [stats, setStats] = useState<StatsState>(null);
  const { scrollY } = useScroll();
  // Hero parallax — text drifts up at half the scroll speed
  const heroY = useTransform(scrollY, [0, 600], [0, -80]);
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0.4]);
  const kickerX = useTransform(scrollY, [0, 600], [0, 30]);

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
      <main className="relative min-h-dvh w-full overflow-x-hidden scene-3d">
        <Spotlight intensity={0.55} />
        {/* Constellation canvas — fills the top of the page, sits behind everything.
            Particle field of stars, hairline links, auto-firing vermilion reasoning
            traces, click-to-trace. Mnemos-III centerpiece. */}
        <div className="pointer-events-none fixed inset-x-0 top-0 z-0" style={{ height: 720 }}>
          <div className="pointer-events-auto absolute inset-0">
            <ConstellationCanvas density={1.1} traceOn height={720} />
          </div>
          {/* gentle bottom fade so the headline reads */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, transparent 55%, rgba(5,4,2,0.65) 88%, rgba(5,4,2,0.95) 100%)",
            }}
          />
        </div>
        {/* keep a single low-opacity orb for the warmth, drop the trio (constellation is busy enough) */}
        <div className="pointer-events-none fixed inset-0 z-0 opacity-50">
          <AmbientOrbs />
        </div>
        <TopBar status={status} />
        <LeftRail />
        <BottomBar atlasOk={status?.atlas} stats={stats} />

        <motion.section
          className="relative z-10 mx-auto max-w-[1240px] px-10 pb-32 pt-28 md:px-16"
          style={{ y: heroY, opacity: heroOpacity }}
        >
          {/* Hero kicker */}
          <motion.div
            className="label flex items-center gap-3"
            style={{ x: kickerX }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <Drawline width={32} delay={0.1} />
            <span>── mnemos · the memory agent</span>
          </motion.div>

          {/* Hero composition — headline left, live stream corner right */}
          <div className="mt-7 grid items-start gap-12 md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              {/* Hero headline — Mnemos-III copy + word reveal */}
              <motion.h1
                className="display"
                style={{
                  fontSize: "clamp(2.6rem, 7vw, 5.8rem)",
                  lineHeight: 1.0,
                  letterSpacing: "-0.022em",
                  color: "var(--color-paper)",
                  textWrap: "balance",
                }}
                variants={stagger(0.05, 0.18)}
                initial="hidden"
                animate="show"
              >
                <Words text="Your professional memory," gap={0.045} />
                <br />
                <motion.span variants={fadeRise} className="display-i" style={{ display: "inline-block", color: "var(--color-vermilion)" }}>
                  made navigable.
                </motion.span>
              </motion.h1>
            </div>

            {/* Live stream corner — proof, not decoration */}
            <Reveal delay={1.05}>
              <div className="corner-stream-pane m3-rise-up">
                <div className="mb-3.5 flex items-baseline justify-between">
                  <span className="label">live · stream 0x4a91</span>
                  <span className="pulse-dot" />
                </div>
                <LiveStreamCorner />
              </div>
            </Reveal>
          </div>

          {/* Sub-paragraph */}
          <Reveal delay={1.0}>
            <p
              className="mt-8"
              style={{
                maxWidth: 560,
                fontSize: "1rem",
                color: "var(--color-paper-dim)",
                lineHeight: "26px",
              }}
            >
              Ingest your email, calendar, notes, slack, and docs. Mnemos reasons over the corpus
              with Gemini 3 Pro, drafts the action, and a second{" "}
              <em style={{ color: "var(--color-saffron)", fontStyle: "normal" }}>Critic agent</em>{" "}
              audits the draft — before you approve with one click.
            </p>
          </Reveal>

          {/* CTA row */}
          <Reveal delay={1.2}>
            <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-3">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link href="/ask" className="btn-decisive primary">watch it reason →</Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link href="/memory" className="btn-decisive">tour the memory</Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link href="/overview" className="btn-decisive ghost">read the overview</Link>
              </motion.div>
              <span className="chrome ml-3">click anywhere on the field to trace</span>
            </div>
          </Reveal>

        </motion.section>
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
    body: "Mail, calendar, notes, slack, docs — vectorized in MongoDB Atlas, queryable in milliseconds.",
    href: "/memory",
  },
  {
    num: "02",
    glyph: "◆",
    title: "Reasoning",
    italic: "streamed.",
    body: "Gemini 3 Pro thinks out loud over SSE. Every thought, retrieval, observation, citation — in order.",
    href: "/ask",
  },
  {
    num: "03",
    glyph: "✎",
    title: "Critique",
    italic: "audited.",
    body: "A second agent red-pencils the first. Drafts arrive with their own copy-editor's notes.",
    href: "/ask",
  },
  {
    num: "04",
    glyph: "⌗",
    title: "Hybrid retrieval",
    italic: "cited.",
    body: "Vector + BM25 fused via RRF and reranked. Every claim traceable to a chunk in the vault.",
    href: "/search",
  },
];

function Tile({ tile, last }: { tile: (typeof TILES)[number]; last: boolean }) {
  return (
    <Link
      href={tile.href}
      className="tilt-card focusable group relative block"
      style={{
        padding: "36px 32px 32px",
        borderRight: last ? "none" : "1px solid var(--color-rule)",
        borderTop: "1px solid var(--color-rule)",
        background:
          "linear-gradient(180deg, rgba(50, 35, 22, 0.18) 0%, rgba(28, 20, 12, 0.0) 100%)",
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
