import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ready } from "@/lib/api";

type ReadyState = { atlas: boolean; vertex: boolean; agent: boolean } | null;

export default function Dashboard() {
  const [status, setStatus] = useState<ReadyState>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const r = await ready();
      if (cancelled) return;
      if (r) {
        setStatus({ atlas: r.atlas === "configured", vertex: r.vertex === "configured", agent: true });
      } else {
        setStatus({ atlas: false, vertex: false, agent: false });
      }
    }
    poll();
    const id = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <>
      <Head>
        <title>Mnemos — the empty vault</title>
      </Head>
      <main className="relative min-h-dvh w-full overflow-hidden">
        <TopBar />
        <LeftRail />
        <BottomBar atlasOk={status?.atlas} />

        <section className="relative z-10 mx-auto flex min-h-dvh max-w-[1240px] flex-col items-stretch justify-center px-10 pb-28 pt-24 md:px-16">
          <div className="rise delay-1 flex items-center gap-3">
            <span className="block h-px w-10 bg-[color:var(--color-vermilion)]" />
            <span className="label">01 · The empty vault</span>
          </div>

          <h1
            className="rise delay-2 display mt-7 max-w-[18ch] text-[clamp(2.6rem,7.6vw,6.4rem)] leading-[0.96]"
            style={{ color: "var(--color-paper)" }}
          >
            Mnemos <em className="italic" style={{ color: "var(--color-paper)" }}>remembers</em>
            <br />
            what you forget
            <span style={{ color: "var(--color-paper-muted)" }}> —</span>
            <br />
            <span style={{ color: "var(--color-paper-dim)" }}>and</span>{" "}
            <em className="italic" style={{ color: "var(--color-vermilion)" }}>acts</em>{" "}
            <span style={{ color: "var(--color-paper-dim)" }}>on it.</span>
          </h1>

          <div className="rise delay-3 mt-12 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/ask"
              className="group inline-flex items-center gap-1.5 rounded-[2px] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-2.5 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-[color:var(--color-paper-dim)] shadow-[inset_0_-1px_0_rgba(0,0,0,0.4)] transition-colors hover:border-[color:var(--color-vermilion)] hover:text-[color:var(--color-paper)]"
            >
              <span className="text-[0.85em]">⌘</span>
              <span>K</span>
            </Link>
            <Link
              href="/ask"
              className="chrome transition-colors hover:text-[color:var(--color-paper-dim)]"
            >
              open the agent · watch it reason
            </Link>
            <span aria-hidden className="chrome text-[color:var(--color-rule-strong)]">/</span>
            <Link
              href="/search"
              className="chrome transition-colors hover:text-[color:var(--color-paper-dim)]"
            >
              just search the vault
            </Link>
            <span aria-hidden className="chrome text-[color:var(--color-rule-strong)]">/</span>
            <Link
              href="/actions"
              className="chrome transition-colors hover:text-[color:var(--color-paper-dim)]"
            >
              review the ledger
            </Link>
          </div>

          <div className="rise delay-4 mt-20 grid grid-cols-1 gap-px overflow-hidden border border-[color:var(--color-rule)] bg-[color:var(--color-rule)] md:grid-cols-3">
            <Tile href="/search" heading="Memory" body="Every email, calendar event, doc, and note — semantically chunked, vector-indexed, and recallable in a single keystroke." index="i." />
            <Tile href="/ask" heading="Reasoning" body="A live stream of the agent's thoughts, tool calls, and observations. No black boxes — you watch it think." index="ii." />
            <Tile href="/actions" heading="Action" body="Drafts, schedules, replies, declines. Every multi-step action waits at your approval before it ships." index="iii." />
          </div>

          <div className="rise delay-5 mt-12 flex flex-wrap items-center gap-x-8 gap-y-2 chrome">
            <StatusPill label="Atlas" ok={status?.atlas} />
            <span aria-hidden>·</span>
            <StatusPill label="Vertex" ok={status?.vertex} />
            <span aria-hidden>·</span>
            <StatusPill label="Agent" ok={status?.agent} />
          </div>
        </section>
      </main>
    </>
  );
}

function TopBar() {
  return (
    <header className="absolute inset-x-0 top-0 z-20 border-b border-[color:var(--color-rule)]/70 backdrop-blur-[2px]">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-4 md:px-16">
        <a href="/" className="flex items-baseline gap-2.5">
          <span className="display text-[1.4rem] italic leading-none text-[color:var(--color-paper)]">
            Mnemos
          </span>
          <span className="label">μν. — memory agent</span>
        </a>
        <div className="flex items-center gap-6">
          <span className="chrome hidden md:inline">2026 · vol. 001 · {hackathonDay()}</span>
          <span className="flex items-center gap-2">
            <span className="pulse-dot block h-1.5 w-1.5 rounded-full bg-[color:var(--color-vermilion)]" />
            <span className="chrome">idle</span>
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
      <span
        className="chrome whitespace-nowrap"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        Mnemos · the memory agent · v0.0.1
      </span>
      <span
        className="chrome whitespace-nowrap"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        an editorial built on what you've seen
      </span>
    </aside>
  );
}

function BottomBar({ atlasOk }: { atlasOk?: boolean }) {
  return (
    <footer className="absolute inset-x-0 bottom-0 z-20 border-t border-[color:var(--color-rule)]/70">
      <div className="mx-auto grid max-w-[1240px] grid-cols-2 items-center gap-4 px-10 py-4 md:grid-cols-3 md:px-16">
        <span className="chrome">a memory-first agent · built for action</span>
        <span className="chrome hidden text-center md:block">
          {isoDate()} — <span className="text-[color:var(--color-paper-muted)]">{atlasOk ? "vault active" : "empty vault"}</span>
        </span>
        <span className="chrome text-right">
          press <span className="text-[color:var(--color-paper-dim)]">⌘K</span> to begin
        </span>
      </div>
    </footer>
  );
}

function Tile({ heading, body, index, href }: { heading: string; body: string; index: string; href?: string }) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    href ? (
      <Link href={href} className="group relative block bg-[color:var(--color-ink-1)] p-7 transition-colors hover:bg-[color:var(--color-ink-2)] md:p-8">
        {children}
      </Link>
    ) : (
      <article className="group relative bg-[color:var(--color-ink-1)] p-7 transition-colors hover:bg-[color:var(--color-ink-2)] md:p-8">
        {children}
      </article>
    );

  return (
    <Wrapper>
      <header className="flex items-baseline justify-between">
        <h2 className="display text-[1.7rem] italic leading-none text-[color:var(--color-paper)]">
          {heading}
        </h2>
        <span className="label">{index}</span>
      </header>
      <p className="mt-5 max-w-[34ch] text-[0.95rem] leading-[1.55] text-[color:var(--color-paper-dim)]">
        {body}
      </p>
      <span className="absolute left-7 right-7 top-0 block h-px origin-left scale-x-0 bg-[color:var(--color-vermilion)] transition-transform duration-500 ease-out group-hover:scale-x-100 md:left-8 md:right-8" />
    </Wrapper>
  );
}

function StatusPill({ label, ok }: { label: string; ok?: boolean }) {
  if (ok === undefined) {
    return (
      <span>
        {label} · <span style={{ color: "var(--color-paper-muted)" }}>checking…</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span
        className="block h-1.5 w-1.5 rounded-full"
        style={{ background: ok ? "#4ade80" : "var(--color-paper-muted)" }}
      />
      {label} · <span style={{ color: ok ? "#4ade80" : "var(--color-paper-muted)" }}>{ok ? "connected" : "offline"}</span>
    </span>
  );
}

// Hackathon runs May 16 → June 12 2026 (28 days total)
const HACKATHON_START = new Date("2026-05-16T00:00:00Z").getTime();
const HACKATHON_TOTAL = 28;

function hackathonDay(): string {
  const dayNum = Math.max(1, Math.min(HACKATHON_TOTAL, Math.floor((Date.now() - HACKATHON_START) / 86400_000) + 1));
  const pad = (n: number) => String(n).padStart(3, "0");
  return `day ${pad(dayNum)} / ${pad(HACKATHON_TOTAL)}`;
}

function isoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
