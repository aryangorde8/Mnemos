import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
      <article className="approval rise" style={{ padding: "32px 36px" }}>
        <div className="h-24 animate-pulse bg-[color:var(--color-rule)]/40" />
      </article>
    );
  }
  if (err || !action) {
    return (
      <article className="approval rise" style={{ padding: "20px 24px" }}>
        <p className="mono text-[0.82rem]" style={{ color: "var(--color-vermilion)" }}>
          {err ?? "unknown error"}
        </p>
      </article>
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
    <motion.article
      className="approval"
      style={{ padding: "32px 36px 28px" }}
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Top meta strip */}
      <header className="mb-5 flex items-baseline justify-between">
        <div className="chrome flex items-center gap-3.5">
          <span className={decided ? "pulse-dot pulse-dot-muted" : "pulse-dot"} />
          <span
            style={{
              color: decided ? "var(--color-paper-muted)" : "var(--color-vermilion)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontSize: "0.7rem",
              fontWeight: 500,
            }}
          >
            {action.status} · {action.kind === "draft_email" ? "draft email" : "scheduled meeting"}
          </span>
          {action.runId && (
            <>
              <span>·</span>
              <span>run {action.runId.slice(0, 8)}</span>
            </>
          )}
          <span>·</span>
          <span className="tabular">{fmtTime(action.createdAt)}</span>
        </div>
        <div className="chrome">
          {decided ? statusFooter(action) : "awaiting one-click approval"}
        </div>
      </header>

      {/* Editorial body */}
      {action.kind === "draft_email" ? (
        <DraftEmailView
          proposal={proposal as DraftEmailProposal}
          editing={editing && !decided}
          onChange={(p) => setAction({ ...action, proposal: p })}
        />
      ) : (
        <MeetingView proposal={proposal as ScheduleMeetingProposal} />
      )}

      {/* Decision rail */}
      {!decided ? (
        <div
          className="mt-8 flex items-center gap-3 border-t border-[color:var(--color-rule)] pt-6"
        >
          <button
            disabled={busy !== null}
            onClick={() => onApprove(editing ? (proposal as unknown as Record<string, unknown>) : undefined)}
            className="btn-decisive primary"
          >
            ✓ {busy === "approve" ? "sending…" : editing ? "approve edits" : "approve & send"}
          </button>
          {action.kind === "draft_email" ? (
            <button
              disabled={busy !== null}
              onClick={() => setEditing((e) => !e)}
              className="btn-decisive"
            >
              ⋯ {editing ? "cancel edit" : "edit"}
            </button>
          ) : null}
          <button
            disabled={busy !== null}
            onClick={onReject}
            className="btn-decisive ghost"
          >
            ✕ {busy === "reject" ? "…" : "reject"}
          </button>
          <div className="flex-1" />
          <div className="chrome hidden md:block">↵ to approve · ⌘E to edit · esc to dismiss</div>
        </div>
      ) : null}
    </motion.article>
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
    <div>
      {/* Meta block — labeled mono, two-column grid */}
      <div
        className="mb-7 grid border-b border-[color:var(--color-rule)] pb-6"
        style={{
          gridTemplateColumns: "90px 1fr",
          gap: "8px 28px",
        }}
      >
        <div className="label" style={{ paddingTop: 3 }}>to</div>
        <div className="mono" style={{ fontSize: "0.86rem", color: "var(--color-paper)" }}>
          {proposal.to.join(", ")}
        </div>
        {proposal.cc.length > 0 && (
          <>
            <div className="label" style={{ paddingTop: 3 }}>cc</div>
            <div className="mono" style={{ fontSize: "0.86rem", color: "var(--color-paper)" }}>
              {proposal.cc.join(", ")}
            </div>
          </>
        )}
        <div className="label" style={{ paddingTop: 3 }}>subject</div>
        {editing ? (
          <input
            value={proposal.subject}
            onChange={(e) => onChange({ ...proposal, subject: e.target.value })}
            className="mono border-b border-[color:var(--color-rule-strong)] bg-transparent text-[color:var(--color-paper)] focus:border-[color:var(--color-vermilion)] focus:outline-none"
            style={{ fontSize: "0.86rem" }}
          />
        ) : (
          <div className="mono" style={{ fontSize: "0.86rem", color: "var(--color-paper)" }}>
            {proposal.subject}
          </div>
        )}
      </div>

      {/* Subject as display headline */}
      <div
        className="display-i mb-5"
        style={{
          fontSize: "1.6rem",
          color: "var(--color-paper)",
          letterSpacing: "-0.005em",
          lineHeight: 1.15,
        }}
      >
        {proposal.subject}
      </div>

      {/* Body — serif pull-quote weight */}
      {editing ? (
        <textarea
          value={proposal.body}
          onChange={(e) => onChange({ ...proposal, body: e.target.value })}
          rows={Math.max(6, proposal.body.split("\n").length + 1)}
          className="display block w-full resize-y bg-transparent text-[color:var(--color-paper-dim)] focus:outline-none"
          style={{
            fontSize: "1.18rem",
            lineHeight: 1.45,
            letterSpacing: "-0.003em",
          }}
        />
      ) : (
        <div
          className="display"
          style={{
            fontSize: "1.18rem",
            lineHeight: 1.45,
            color: "var(--color-paper-dim)",
            letterSpacing: "-0.003em",
            whiteSpace: "pre-wrap",
          }}
        >
          {proposal.body}
        </div>
      )}
    </div>
  );
}

function MeetingView({ proposal }: { proposal: ScheduleMeetingProposal }) {
  return (
    <div>
      {/* Meta block */}
      <div
        className="mb-7 grid border-b border-[color:var(--color-rule)] pb-6"
        style={{ gridTemplateColumns: "90px 1fr", gap: "8px 28px" }}
      >
        <div className="label" style={{ paddingTop: 3 }}>with</div>
        <div className="mono" style={{ fontSize: "0.86rem", color: "var(--color-paper)" }}>
          {proposal.attendees.join(", ")}
        </div>
        <div className="label" style={{ paddingTop: 3 }}>when</div>
        <div className="mono" style={{ fontSize: "0.86rem", color: "var(--color-paper)" }}>
          {proposal.proposedTimes.map((t, i) => {
            const slot = proposal.slots?.[i];
            const isPreferred = (proposal.preferredIdx ?? -1) === i;
            const free = slot?.free ?? true;
            return (
              <div key={t} style={{ marginBottom: 6, lineHeight: 1.45 }}>
                <span
                  style={{
                    color: isPreferred
                      ? "var(--color-vermilion)"
                      : free
                        ? "var(--color-paper-faint)"
                        : "var(--color-saffron)",
                    fontWeight: 500,
                  }}
                >
                  {isPreferred ? "→" : free ? "✓" : "✗"}
                </span>{" "}
                {fmtTime(t)}
                {slot && (
                  <span style={{ marginLeft: 8, fontSize: "0.78rem", color: free ? "#7a8a44" : "var(--color-saffron)" }}>
                    {free ? "free" : `conflicts with ${slot.conflicts.length} event${slot.conflicts.length === 1 ? "" : "s"}`}
                  </span>
                )}
                {slot && !free && slot.conflicts.length > 0 && (
                  <ul style={{ marginTop: 4, marginLeft: 18, fontSize: "0.74rem", color: "var(--color-paper-muted)", listStyle: "none", paddingLeft: 0 }}>
                    {slot.conflicts.slice(0, 2).map((c) => (
                      <li key={c.id}>
                        <span style={{ color: "var(--color-vermilion)" }}>·</span>{" "}
                        {c.title}
                        {c.location && (
                          <span style={{ color: "var(--color-paper-faint)" }}> · {c.location}</span>
                        )}
                      </li>
                    ))}
                    {slot.conflicts.length > 2 && (
                      <li style={{ color: "var(--color-paper-faint)" }}>+ {slot.conflicts.length - 2} more</li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <div className="label" style={{ paddingTop: 3 }}>duration</div>
        <div className="mono" style={{ fontSize: "0.86rem", color: "var(--color-paper)" }}>
          {proposal.durationMinutes} min
        </div>
        {proposal.location && (
          <>
            <div className="label" style={{ paddingTop: 3 }}>where</div>
            <div className="mono" style={{ fontSize: "0.86rem", color: "var(--color-paper)" }}>
              {proposal.location}
            </div>
          </>
        )}
      </div>

      {/* Title as display headline */}
      <div
        className="display-i mb-5"
        style={{
          fontSize: "1.6rem",
          color: "var(--color-paper)",
          letterSpacing: "-0.005em",
        }}
      >
        {proposal.title}
      </div>

      {proposal.agenda && (
        <div
          className="display"
          style={{
            fontSize: "1.1rem",
            lineHeight: 1.45,
            color: "var(--color-paper-dim)",
            whiteSpace: "pre-wrap",
          }}
        >
          {proposal.agenda}
        </div>
      )}
    </div>
  );
}

function statusFooter(a: ActionRecord): string {
  if (a.status === "sent") {
    if (a.sentVia === "gmail" && a.gmailMessageId) {
      return `sent via gmail · ${a.gmailMessageId.slice(0, 12)} · ${fmtTime(a.decidedAt ?? a.createdAt)}`;
    }
    if (a.gmailError) {
      return `sent (gmail err: ${a.gmailError.slice(0, 40)}) · ${fmtTime(a.decidedAt ?? a.createdAt)}`;
    }
    return `sent · ${fmtTime(a.decidedAt ?? a.createdAt)}`;
  }
  if (a.status === "rejected")
    return `rejected · ${a.reason ?? "no reason given"}`;
  return "";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
