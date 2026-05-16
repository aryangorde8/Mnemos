import type { SearchHit } from "@/lib/api";
import { SourceMark } from "./source-mark";

export function ResultCard({ hit, rank }: { hit: SearchHit; rank: number }) {
  const score = formatScore(hit.score);
  const date = readDate(hit.metadata);
  const from = readString(hit.metadata, "from");
  const participants = readStringArray(hit.metadata, "participants");
  const ticket = readString(hit.metadata, "ticket");

  return (
    <article className="group grid grid-cols-[3.5rem_1fr_auto] gap-x-6 gap-y-2 border-b border-[color:var(--color-rule)] py-6 last:border-b-0 md:gap-x-8">
      <div className="flex flex-col items-end pt-1 font-mono text-[0.78rem] tabular-nums text-[color:var(--color-paper-faint)]">
        <span>{String(rank).padStart(2, "0")}</span>
        <span className="mt-1 text-[color:var(--color-vermilion)]">{score}</span>
      </div>

      <div className="min-w-0">
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h3 className="display text-[1.45rem] italic leading-tight text-[color:var(--color-paper)]">
            {hit.title}
          </h3>
          <SourceMark source={hit.source} />
          {ticket ? (
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-[color:var(--color-paper-faint)]">
              {ticket}
            </span>
          ) : null}
        </header>

        <p className="mt-3 max-w-[68ch] whitespace-pre-wrap text-[0.95rem] leading-[1.6] text-[color:var(--color-paper-dim)]">
          {truncate(hit.text, 480)}
        </p>

        <footer className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 chrome">
          {date ? <span>{date}</span> : null}
          {from ? <span>from {from}</span> : null}
          {participants && participants.length > 0 ? (
            <span>{participants.slice(0, 3).join(", ")}{participants.length > 3 ? " +" + (participants.length - 3) : ""}</span>
          ) : null}
          <span className="text-[color:var(--color-paper-faint)]">
            chunk {hit.ordinal + 1}
          </span>
        </footer>
      </div>

      <div className="hidden md:block">
        <span className="block h-px w-10 translate-y-3 bg-[color:var(--color-rule-strong)] transition-colors group-hover:bg-[color:var(--color-vermilion)]" />
      </div>
    </article>
  );
}

function formatScore(score: number): string {
  if (!Number.isFinite(score)) return "—";
  return score.toFixed(3);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const last = cut.lastIndexOf(" ");
  return (last > n * 0.7 ? cut.slice(0, last) : cut) + "…";
}

function readDate(meta: Record<string, unknown>): string | null {
  const raw = meta["date"] ?? meta["eventTime"];
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function readString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function readStringArray(meta: Record<string, unknown>, key: string): string[] | null {
  const v = meta[key];
  if (!Array.isArray(v)) return null;
  const arr = v.filter((x): x is string => typeof x === "string");
  return arr.length > 0 ? arr : null;
}
