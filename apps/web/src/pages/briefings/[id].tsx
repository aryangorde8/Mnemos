import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBriefing, type BriefingRecord } from "@/lib/api";
import { streamBriefing } from "@/lib/sse";
import { BriefingMarkdown } from "@/components/briefing-markdown";

type Mode = "loading" | "generating" | "rendered" | "error" | "missing";

interface GenState {
  eventTitle: string | null;
  eventWhen: string | null;
  eventLocation: string | null;
  attendees: string[];
  markdown: string;
  briefingId: string | null;
  relatedCount: number;
  commitmentCount: number;
}

const INIT: GenState = {
  eventTitle: null,
  eventWhen: null,
  eventLocation: null,
  attendees: [],
  markdown: "",
  briefingId: null,
  relatedCount: 0,
  commitmentCount: 0,
};

export default function BriefingDetail() {
  const router = useRouter();
  const { id, generate } = router.query;

  const [mode, setMode] = useState<Mode>("loading");
  const [briefing, setBriefing] = useState<BriefingRecord | null>(null);
  const [gen, setGen] = useState<GenState>(INIT);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const idStr = typeof id === "string" ? id : "";
  const shouldGenerate = generate === "1";

  const beginGeneration = useCallback(async (eventId: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setMode("generating");
    setGen(INIT);
    setPhase("opening session");
    try {
      await streamBriefing({
        eventId,
        signal: ac.signal,
        onEvent: (env) => {
          if (ac.signal.aborted) return;
          const event = env.event;
          const data = (env.data ?? {}) as Record<string, unknown>;
          switch (event) {
            case "start":
              setPhase("reaching into the vault");
              return;
            case "event_loaded": {
              const e = data["event"] as Record<string, unknown> | undefined;
              setGen((prev) => ({
                ...prev,
                eventTitle: typeof e?.["title"] === "string" ? (e["title"] as string) : prev.eventTitle,
                eventWhen: typeof e?.["when"] === "string" ? (e["when"] as string) : prev.eventWhen,
                eventLocation: typeof e?.["location"] === "string" ? (e["location"] as string) : prev.eventLocation,
                attendees: Array.isArray(e?.["attendees"]) ? (e!["attendees"] as string[]) : prev.attendees,
              }));
              setPhase("event located");
              return;
            }
            case "context_loaded":
              setGen((prev) => ({
                ...prev,
                relatedCount: Number(data["relatedCount"] ?? 0),
                commitmentCount: Number(data["commitmentCount"] ?? 0),
              }));
              setPhase(
                `pulled ${data["relatedCount"]} related chunks · ${data["commitmentCount"]} commitment leads`,
              );
              return;
            case "synthesizing":
              setPhase("synthesizing 1-pager");
              return;
            case "chunk":
              setGen((prev) => ({
                ...prev,
                markdown: prev.markdown + String(data["text"] ?? ""),
              }));
              return;
            case "saved":
              setGen((prev) => ({
                ...prev,
                briefingId: typeof data["briefingId"] === "string" ? (data["briefingId"] as string) : prev.briefingId,
                eventTitle: typeof data["eventTitle"] === "string" ? (data["eventTitle"] as string) : prev.eventTitle,
                eventWhen: typeof data["eventWhen"] === "string" ? (data["eventWhen"] as string) : prev.eventWhen,
                eventLocation: typeof data["eventLocation"] === "string" ? (data["eventLocation"] as string) : prev.eventLocation,
                attendees: Array.isArray(data["attendees"]) ? (data["attendees"] as string[]) : prev.attendees,
              }));
              return;
            case "done":
              setMode("rendered");
              setPhase("complete");
              return;
            case "error":
              setErr(String(data["message"] ?? "unknown error"));
              setMode("error");
              return;
          }
        },
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      setErr(e instanceof Error ? e.message : String(e));
      setMode("error");
    }
  }, []);

  useEffect(() => {
    if (!router.isReady || !idStr) return;
    let cancelled = false;

    if (shouldGenerate) {
      void beginGeneration(idStr);
      return () => {
        cancelled = true;
        abortRef.current?.abort();
      };
    }

    setMode("loading");
    void getBriefing(idStr).then((b) => {
      if (cancelled) return;
      if (!b) {
        setMode("missing");
      } else {
        setBriefing(b);
        setMode("rendered");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router.isReady, idStr, shouldGenerate, beginGeneration]);

  const eventTitle = briefing?.eventTitle ?? gen.eventTitle;
  const eventWhen = briefing?.eventWhen ?? gen.eventWhen;
  const eventLocation = briefing?.eventLocation ?? gen.eventLocation;
  const attendees = briefing?.attendees ?? gen.attendees;
  const markdown = briefing?.markdown ?? gen.markdown;
  const citations = briefing?.citations ?? [];

  return (
    <>
      <Head>
        <title>{eventTitle ? `Briefing — ${eventTitle}` : "Mnemos briefing"}</title>
      </Head>
      <main className="relative min-h-dvh w-full">
        <header className="border-b border-[color:var(--color-rule)]/70">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-4 md:px-16">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="display text-[1.4rem] italic leading-none text-[color:var(--color-paper)]">
                Mnemos
              </span>
              <span className="label">μν. · briefing</span>
            </Link>
            <Link href="/briefings" className="chrome hover:text-[color:var(--color-paper-dim)]">
              ← all briefings
            </Link>
          </div>
        </header>

        <article className="mx-auto max-w-[820px] px-10 pb-32 pt-16 md:px-16">
          <div className="flex items-center gap-3">
            <span className="block h-px w-10 bg-[color:var(--color-vermilion)]" />
            <span className="label">briefing · 1-pager</span>
          </div>

          <h1 className="display mt-6 text-[clamp(2rem,4.6vw,3rem)] italic leading-[1.1] text-[color:var(--color-paper)]">
            {eventTitle ?? <Skeleton w="18ch" />}
          </h1>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 chrome">
            {eventWhen ? <span>{fmtFull(eventWhen)}</span> : null}
            {eventLocation ? <span>{eventLocation}</span> : null}
            {attendees.length > 0 ? (
              <span>
                {attendees.length} attendees ·{" "}
                <span className="text-[color:var(--color-paper-muted)]">
                  {attendees.slice(0, 4).join(", ")}
                  {attendees.length > 4 ? " +" + (attendees.length - 4) : ""}
                </span>
              </span>
            ) : null}
          </div>

          {mode === "generating" ? (
            <div className="mt-8 flex items-center gap-3 chrome">
              <span className="pulse-dot block h-1.5 w-1.5 rounded-full bg-[color:var(--color-vermilion)]" />
              <span>{phase}</span>
            </div>
          ) : null}
          {mode === "rendered" && briefing?.createdAt ? (
            <p className="mt-8 chrome">generated {fmtFull(briefing.createdAt)}</p>
          ) : null}

          <div className="mt-12">
            {mode === "loading" ? (
              <SkeletonDoc />
            ) : mode === "missing" ? (
              <Missing />
            ) : mode === "error" ? (
              <ErrorPanel message={err ?? "unknown error"} />
            ) : (
              <BriefingMarkdown source={markdown} streaming={mode === "generating"} />
            )}
          </div>

          {citations.length > 0 ? (
            <footer className="mt-16 border-t border-[color:var(--color-rule)] pt-6">
              <p className="label">citations</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {citations.map((c) => (
                  <li
                    key={c.chunkId}
                    className="inline-flex items-baseline gap-2 border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-2 py-1 font-mono text-[0.74rem] tracking-[0.02em] text-[color:var(--color-paper-dim)]"
                  >
                    <span className="text-[color:var(--color-vermilion)]">[{c.source}]</span>
                    <span>{c.title}</span>
                    <span className="text-[color:var(--color-paper-faint)]">{c.score.toFixed(3)}</span>
                  </li>
                ))}
              </ul>
            </footer>
          ) : null}
        </article>
      </main>
    </>
  );
}

function Skeleton({ w }: { w: string }) {
  return (
    <span className="inline-block h-[0.9em] bg-[color:var(--color-rule-strong)] align-middle" style={{ width: w }} />
  );
}

function SkeletonDoc() {
  return (
    <div className="space-y-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="block h-4 bg-[color:var(--color-rule)]"
          style={{ width: `${[78, 64, 70, 60, 50][i]}%`, opacity: 0.8 - i * 0.12 }}
        />
      ))}
    </div>
  );
}

function Missing() {
  return (
    <div className="border-t border-[color:var(--color-rule)] pt-10">
      <p className="label">not found</p>
      <p className="mt-3 max-w-[52ch] text-[1.05rem] leading-relaxed text-[color:var(--color-paper-dim)]">
        That briefing isn't in the vault. It may have been deleted, or the link is
        for a meeting that hasn't been briefed yet. Go to{" "}
        <Link href="/briefings" className="text-[color:var(--color-vermilion)] underline-offset-4 hover:underline">
          briefings
        </Link>{" "}
        to generate one.
      </p>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="border border-[color:var(--color-vermilion-deep)]/60 bg-[color:var(--color-ink-1)] p-6">
      <p className="label">generation failed</p>
      <p className="mt-2 font-mono text-[0.85rem] text-[color:var(--color-paper-dim)]">{message}</p>
      <p className="mt-3 text-[0.9rem] leading-relaxed text-[color:var(--color-paper-muted)]">
        Most often this is missing GCP credentials or an Atlas vector index still
        building.
      </p>
    </div>
  );
}

function fmtFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
