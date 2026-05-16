import { useEffect, useState } from "react";
import {
  approveAction,
  getAction,
  rejectAction,
  type ActionRecord,
  type DraftEmailProposal,
  type ScheduleMeetingProposal,
} from "@/lib/api";

interface Props {
  actionId: string;
  onResolved?: (action: ActionRecord) => void;
}

export function ApprovalCard({ actionId, onResolved }: Props) {
  const [action, setAction] = useState<ActionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getAction(actionId).then((a) => {
      if (cancelled) return;
      setAction(a);
      setLoading(false);
      if (!a) setErr("action not found");
    });
    return () => { cancelled = true; };
  }, [actionId]);

  if (loading) {
    return (
      <Shell label="proposed action">
        <div className="h-20 animate-pulse bg-[color:var(--color-rule)]/40" />
      </Shell>
    );
  }
  if (err || !action) {
    return (
      <Shell label="proposed action" tone="error">
        <p className="font-mono text-[0.82rem] text-[color:var(--color-vermilion)]">
          {err ?? "unknown error"}
        </p>
      </Shell>
    );
  }

  const decided = action.status !== "proposed";
  const proposal = action.proposal;

  async function onApprove(edits?: Record<string, unknown>) {
    if (!action || decided || busy) return;
    setBusy("approve");
    try {
      const updated = await approveAction(action.id, edits);
      setAction(updated);
      setEditing(false);
      onResolved?.(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function onReject() {
    if (!action || decided || busy) return;
    setBusy("reject");
    try {
      const updated = await rejectAction(action.id);
      setAction(updated);
      setEditing(false);
      onResolved?.(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Shell
      label={
        action.kind === "draft_email"
          ? `draft email · ${statusLabel(action.status)}`
          : `proposed meeting · ${statusLabel(action.status)}`
      }
      tone={action.status === "sent" ? "ok" : action.status === "rejected" ? "muted" : "live"}
    >
      {action.kind === "draft_email" ? (
        <DraftEmailView
          proposal={proposal as DraftEmailProposal}
          editing={editing && !decided}
          onChange={(p) => {
            setAction({ ...action, proposal: p });
          }}
        />
      ) : (
        <MeetingView proposal={proposal as ScheduleMeetingProposal} />
      )}

      {action.status === "sent" && action.final ? (
        <p className="mt-4 font-mono text-[0.78rem] text-[color:var(--color-saffron)]">
          sent · {fmtDate(action.decidedAt ?? action.createdAt)}
        </p>
      ) : null}
      {action.status === "rejected" ? (
        <p className="mt-4 font-mono text-[0.78rem] text-[color:var(--color-paper-faint)]">
          rejected · {fmtDate(action.decidedAt ?? action.createdAt)}
          {action.reason ? ` · ${action.reason}` : ""}
        </p>
      ) : null}

      {!decided ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            disabled={busy !== null}
            onClick={() => onApprove(editing ? (proposal as unknown as Record<string, unknown>) : undefined)}
            className="inline-flex items-center gap-2 border border-[color:var(--color-vermilion)] bg-[color:var(--color-vermilion)] px-3 py-1.5 font-mono text-[0.78rem] uppercase tracking-[0.12em] text-[color:var(--color-ink)] transition-opacity disabled:opacity-50"
          >
            {busy === "approve" ? "sending…" : editing ? "approve edits" : "approve · send"}
          </button>
          {action.kind === "draft_email" ? (
            <button
              disabled={busy !== null}
              onClick={() => setEditing((e) => !e)}
              className="font-mono text-[0.78rem] uppercase tracking-[0.12em] text-[color:var(--color-paper-dim)] transition-colors hover:text-[color:var(--color-paper)] disabled:opacity-50"
            >
              {editing ? "cancel edit" : "edit"}
            </button>
          ) : null}
          <button
            disabled={busy !== null}
            onClick={onReject}
            className="font-mono text-[0.78rem] uppercase tracking-[0.12em] text-[color:var(--color-paper-faint)] transition-colors hover:text-[color:var(--color-vermilion)] disabled:opacity-50"
          >
            {busy === "reject" ? "…" : "reject"}
          </button>
        </div>
      ) : null}
    </Shell>
  );
}

function DraftEmailView({
  proposal,
  editing,
  onChange,
}: {
  proposal: DraftEmailProposal;
  editing: boolean;
  onChange: (p: DraftEmailProposal) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[64px_1fr] items-baseline gap-x-4 gap-y-1.5">
        <span className="label">to</span>
        <span className="font-mono text-[0.86rem] text-[color:var(--color-paper-dim)]">
          {proposal.to.join(", ")}
        </span>
        {proposal.cc.length > 0 ? (
          <>
            <span className="label">cc</span>
            <span className="font-mono text-[0.86rem] text-[color:var(--color-paper-dim)]">
              {proposal.cc.join(", ")}
            </span>
          </>
        ) : null}
        <span className="label">subject</span>
        {editing ? (
          <input
            value={proposal.subject}
            onChange={(e) => onChange({ ...proposal, subject: e.target.value })}
            className="border-b border-[color:var(--color-rule-strong)] bg-transparent font-mono text-[0.92rem] text-[color:var(--color-paper)] focus:border-[color:var(--color-vermilion)] focus:outline-none"
          />
        ) : (
          <span className="display text-[1.05rem] italic leading-tight text-[color:var(--color-paper)]">
            {proposal.subject}
          </span>
        )}
      </div>
      <div className="mt-3 border-t border-[color:var(--color-rule)] pt-4">
        {editing ? (
          <textarea
            value={proposal.body}
            onChange={(e) => onChange({ ...proposal, body: e.target.value })}
            rows={Math.max(8, proposal.body.split("\n").length + 1)}
            className="block w-full resize-y bg-transparent font-mono text-[0.9rem] leading-[1.6] text-[color:var(--color-paper)] focus:outline-none"
          />
        ) : (
          <p
            className="whitespace-pre-wrap text-[0.95rem] leading-[1.65] text-[color:var(--color-paper-dim)]"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {proposal.body}
          </p>
        )}
      </div>
    </div>
  );
}

function MeetingView({ proposal }: { proposal: ScheduleMeetingProposal }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-baseline gap-x-5 gap-y-2">
      <span className="label">title</span>
      <span className="display text-[1.1rem] italic leading-tight text-[color:var(--color-paper)]">
        {proposal.title}
      </span>
      <span className="label">attendees</span>
      <span className="font-mono text-[0.86rem] text-[color:var(--color-paper-dim)]">
        {proposal.attendees.join(", ")}
      </span>
      <span className="label">when</span>
      <ul className="space-y-0.5 font-mono text-[0.86rem] text-[color:var(--color-paper-dim)]">
        {proposal.proposedTimes.map((t, i) => (
          <li key={t}>
            <span className="text-[color:var(--color-paper-faint)]">
              {i === 0 ? "→" : " "}
            </span>{" "}
            {fmtTime(t)}
          </li>
        ))}
      </ul>
      <span className="label">duration</span>
      <span className="font-mono text-[0.86rem] text-[color:var(--color-paper-dim)]">
        {proposal.durationMinutes} min
      </span>
      {proposal.location ? (
        <>
          <span className="label">location</span>
          <span className="font-mono text-[0.86rem] text-[color:var(--color-paper-dim)]">
            {proposal.location}
          </span>
        </>
      ) : null}
      {proposal.agenda ? (
        <>
          <span className="label">agenda</span>
          <pre className="whitespace-pre-wrap font-mono text-[0.84rem] leading-[1.6] text-[color:var(--color-paper-dim)]">
            {proposal.agenda}
          </pre>
        </>
      ) : null}
    </div>
  );
}

function Shell({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "live" | "ok" | "error" | "muted";
  children: React.ReactNode;
}) {
  const accent =
    tone === "ok"
      ? "var(--color-saffron)"
      : tone === "error"
        ? "var(--color-vermilion)"
        : tone === "muted"
          ? "var(--color-rule-strong)"
          : "var(--color-vermilion)";
  return (
    <section
      className="my-5 border border-[color:var(--color-rule)] bg-[color:var(--color-ink-2)]"
      style={{ boxShadow: `inset 3px 0 0 0 ${accent}` }}
    >
      <header className="flex items-center justify-between border-b border-[color:var(--color-rule)] px-5 py-2.5">
        <span className="label">{label}</span>
        <span className="chrome">awaiting decision</span>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function statusLabel(s: string): string {
  return s.toLowerCase();
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
