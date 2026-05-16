import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  listBriefings,
  listCalendarEvents,
  type BriefingRecord,
  type CalendarEvent,
} from "@/lib/api";

export default function BriefingsIndex() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [briefings, setBriefings] = useState<BriefingRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 14 * 86400_000);
    void Promise.all([
      listCalendarEvents({ from: from.toISOString(), to: to.toISOString() }),
      listBriefings(),
    ]).then(([eRes, bRes]) => {
      if (cancelled) return;
      if (!eRes) setErr("agent unreachable — boot apps/agent");
      setEvents(eRes?.events ?? []);
      setBriefings(bRes?.briefings ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Head>
        <title>Mnemos — briefings</title>
      </Head>
      <main className="relative min-h-dvh w-full">
        <header className="border-b border-[color:var(--color-rule)]/70">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-4 md:px-16">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="display text-[1.4rem] italic leading-none text-[color:var(--color-paper)]">
                Mnemos
              </span>
              <span className="label">μν. · briefings</span>
            </Link>
            <nav className="flex items-center gap-5 chrome">
              <Link href="/search" className="hover:text-[color:var(--color-paper-dim)]">search</Link>
              <span aria-hidden>·</span>
              <Link href="/ask" className="hover:text-[color:var(--color-paper-dim)]">ask</Link>
              <span aria-hidden>·</span>
              <Link href="/briefings" className="text-[color:var(--color-paper-dim)]">briefings</Link>
              <span aria-hidden>·</span>
              <Link href="/commitments" className="hover:text-[color:var(--color-paper-dim)]">commitments</Link>
              <span aria-hidden>·</span>
              <Link href="/actions" className="hover:text-[color:var(--color-paper-dim)]">actions</Link>
            </nav>
          </div>
        </header>

        <section className="mx-auto max-w-[1240px] px-10 pb-32 pt-14 md:px-16">
          <div className="flex items-center gap-3">
            <span className="block h-px w-10 bg-[color:var(--color-vermilion)]" />
            <span className="label">06 · meeting briefings</span>
          </div>

          <h1 className="display mt-6 max-w-[28ch] text-[clamp(2rem,5vw,3.2rem)] italic leading-[1.05] text-[color:var(--color-paper)]">
            What walks into the room
            <span style={{ color: "var(--color-paper-muted)" }}> with you.</span>
          </h1>
          <p className="mt-4 max-w-[60ch] text-[0.98rem] leading-relaxed text-[color:var(--color-paper-dim)]">
            Click any upcoming meeting and Mnemos assembles a 1-pager — attendees,
            open threads, outstanding commitments, and a few talking points — in
            sixty seconds, with citations.
          </p>

          {err ? <ErrorPanel message={err} /> : null}

          <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-[2fr_1fr]">
            <section>
              <div className="flex items-baseline justify-between">
                <h2 className="display text-[1.6rem] italic leading-none text-[color:var(--color-paper)]">
                  upcoming · next 14 days
                </h2>
                <span className="label">{events?.length ?? 0}</span>
              </div>
              <span className="mt-3 block h-px w-12 bg-[color:var(--color-vermilion)]" />

              {loading ? (
                <EventSkeleton />
              ) : events && events.length === 0 ? (
                <p className="mt-6 max-w-[42ch] text-[0.92rem] leading-relaxed text-[color:var(--color-paper-faint)]">
                  No upcoming events in the window. Ingest the corpus to see Alex's calendar.
                </p>
              ) : (
                <ul className="mt-6 divide-y divide-[color:var(--color-rule)]">
                  {(events ?? []).map((e) => (
                    <EventRow key={e.id} event={e} />
                  ))}
                </ul>
              )}
            </section>

            <aside>
              <div className="flex items-baseline justify-between">
                <h2 className="display text-[1.6rem] italic leading-none text-[color:var(--color-paper)]">
                  prior briefings
                </h2>
                <span className="label">{briefings?.length ?? 0}</span>
              </div>
              <span className="mt-3 block h-px w-12 bg-[color:var(--color-saffron)]" />
              {loading ? (
                <div className="mt-6 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="block h-12 bg-[color:var(--color-rule)]/60"
                      style={{ opacity: 0.7 - i * 0.18 }}
                    />
                  ))}
                </div>
              ) : briefings && briefings.length === 0 ? (
                <p className="mt-6 max-w-[34ch] text-[0.9rem] leading-relaxed text-[color:var(--color-paper-faint)]">
                  Nothing generated yet. Pick a meeting on the left to produce your first briefing.
                </p>
              ) : (
                <ul className="mt-6 space-y-3">
                  {(briefings ?? []).map((b) => (
                    <li key={b.id}>
                      <Link
                        href={`/briefings/${b.id}`}
                        className="group block border border-[color:var(--color-rule)] bg-[color:var(--color-ink-1)] p-4 transition-colors hover:border-[color:var(--color-vermilion)] hover:bg-[color:var(--color-ink-2)]"
                      >
                        <span className="block text-[0.95rem] leading-tight text-[color:var(--color-paper)]">
                          {b.eventTitle}
                        </span>
                        <span className="chrome mt-1 block">
                          {fmtDate(b.eventWhen ?? b.createdAt)}
                          <span className="px-1.5 text-[color:var(--color-rule-strong)]">·</span>
                          {b.attendees.length} attendees
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </section>
      </main>
    </>
  );
}

function EventRow({ event }: { event: CalendarEvent }) {
  const date = fmtDate(event.when);
  const time = fmtTime(event.when);
  return (
    <li className="grid grid-cols-[80px_1fr_auto] items-baseline gap-x-6 py-5 md:gap-x-10">
      <div className="font-mono text-[0.78rem] tabular-nums text-[color:var(--color-paper-faint)]">
        <div className="text-[color:var(--color-paper-dim)]">{date}</div>
        <div>{time}</div>
      </div>
      <div className="min-w-0">
        <h3 className="display text-[1.3rem] italic leading-tight text-[color:var(--color-paper)]">
          {event.title}
        </h3>
        <p className="mt-1 chrome">
          {event.location ? (
            <>
              <span>{event.location}</span>
              <span className="px-1.5 text-[color:var(--color-rule-strong)]">·</span>
            </>
          ) : null}
          <span>{event.attendees.length} attendees</span>
          {event.attendees[0] ? (
            <>
              <span className="px-1.5 text-[color:var(--color-rule-strong)]">·</span>
              <span className="text-[color:var(--color-paper-muted)]">
                {event.attendees.slice(0, 3).join(", ")}
                {event.attendees.length > 3 ? " +" + (event.attendees.length - 3) : ""}
              </span>
            </>
          ) : null}
        </p>
      </div>
      <Link
        href={`/briefings/${event.id}?generate=1`}
        className="inline-flex items-center gap-2 border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ink-2)] px-3 py-1.5 font-mono text-[0.74rem] uppercase tracking-[0.12em] text-[color:var(--color-paper-dim)] transition-colors hover:border-[color:var(--color-vermilion)] hover:text-[color:var(--color-paper)]"
      >
        generate
      </Link>
    </li>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function EventSkeleton() {
  return (
    <ul className="mt-6 divide-y divide-[color:var(--color-rule)]">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="grid grid-cols-[80px_1fr_auto] items-baseline gap-x-6 py-5"
          style={{ opacity: 0.7 - i * 0.14 }}
        >
          <span className="block h-3 w-12 bg-[color:var(--color-rule-strong)]" />
          <div className="space-y-2">
            <span className="block h-4 w-2/3 bg-[color:var(--color-rule-strong)]" />
            <span className="block h-3 w-1/2 bg-[color:var(--color-rule)]" />
          </div>
          <span className="block h-7 w-20 bg-[color:var(--color-rule)]" />
        </li>
      ))}
    </ul>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="mt-10 border border-[color:var(--color-vermilion-deep)]/60 bg-[color:var(--color-ink-1)] p-6">
      <p className="label">unavailable</p>
      <p className="mt-2 font-mono text-[0.85rem] text-[color:var(--color-paper-dim)]">{message}</p>
    </div>
  );
}
