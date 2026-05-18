import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ready, ingestStats } from "@/lib/api";
import { StatusPill } from "@/components/editorial";
import { Reveal, Drawline, stagger, fadeRise } from "@/components/motion-primitives";
import { Tilt3D } from "@/components/parallax";

type ReadyState = { atlas: boolean; vertex: boolean; agent: boolean } | null;
type StatsState = { docs: number; chunks: number } | null;

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

export default function OverviewPage() {
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
        <title>Mnemos — overview</title>
      </Head>
      <main className="relative min-h-dvh w-full">
        {/* Editorial header */}
        <header className="border-b border-[color:var(--color-rule)]/70">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-4 md:px-16">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span
                className="display-i leading-none"
                style={{ fontSize: "1.4rem", color: "var(--color-paper)" }}
              >
                Mnemos
              </span>
              <span className="label">μν. — overview</span>
            </Link>
            <nav className="flex items-center gap-5 chrome">
              <Link href="/" className="hover:text-[color:var(--color-paper-dim)]">home</Link>
              <span aria-hidden>·</span>
              <Link href="/ask" className="hover:text-[color:var(--color-paper-dim)]">ask</Link>
              <span aria-hidden>·</span>
              <Link href="/memory" className="hover:text-[color:var(--color-paper-dim)]">memory</Link>
              <span aria-hidden>·</span>
              <Link href="/search" className="hover:text-[color:var(--color-paper-dim)]">search</Link>
            </nav>
          </div>
        </header>

        <section className="mx-auto max-w-[1240px] px-10 pb-32 pt-14 md:px-16">
          {/* Kicker */}
          <motion.div
            className="label flex items-center gap-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <Drawline width={32} delay={0.1} />
            <span>── mnemos · overview · the four wedges</span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="display mt-6 max-w-[28ch]"
            style={{
              fontSize: "clamp(2rem, 5.4vw, 3.6rem)",
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              color: "var(--color-paper)",
            }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          >
            What Mnemos is,{" "}
            <span className="display-i" style={{ color: "var(--color-vermilion)" }}>
              in four lines.
            </span>
          </motion.h1>

          <Reveal delay={0.35}>
            <p
              className="mt-6 max-w-[60ch]"
              style={{
                fontSize: "1rem",
                color: "var(--color-paper-dim)",
                lineHeight: "26px",
              }}
            >
              Each tile below opens onto a working surface — the memory page is browseable,
              the reasoning stream is live, the critic is armed, the hybrid retrieval is
              real. Press a tile to enter the product where it actually does the thing.
            </p>
          </Reveal>

          {/* Four editorial tiles */}
          <motion.div
            className="scene-3d mt-16 grid grid-cols-1 md:grid-cols-4"
            variants={stagger(0.08, 0.55)}
            initial="hidden"
            animate="show"
          >
            {TILES.map((t, i) => (
              <motion.div key={t.title} variants={fadeRise}>
                <Tilt3D max={5} lift={10}>
                  <Tile tile={t} last={i === TILES.length - 1} />
                </Tilt3D>
              </motion.div>
            ))}
          </motion.div>
          <hr className="hair" />

          {/* Status pills */}
          <motion.div
            className="mt-12 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
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
