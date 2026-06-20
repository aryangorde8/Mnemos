import { ObjectId, type Collection } from "mongodb";
import { getDb } from "./mongo.js";

export type ActionKind = "draft_email" | "schedule_meeting";
export type ActionStatus = "proposed" | "approved" | "rejected" | "sent";

export interface DraftEmailProposal {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  intent: string;
}

export interface SlotEvaluation {
  start: string;
  end: string;
  conflicts: Array<{
    id: string;
    title: string;
    when: string;
    location: string | null;
  }>;
  free: boolean;
}

export interface ScheduleMeetingProposal {
  title: string;
  attendees: string[];
  proposedTimes: string[];
  durationMinutes: number;
  location: string | null;
  agenda: string | null;
  // populated when conflict detection ran
  slots?: SlotEvaluation[];
  preferredIdx?: number;
}

export type ProposalData = DraftEmailProposal | ScheduleMeetingProposal;

export interface ActionRecord<P extends ProposalData = ProposalData> {
  _id?: ObjectId;
  kind: ActionKind;
  status: ActionStatus;
  proposal: P;
  final?: P;
  reason?: string;
  query?: string;
  runId?: string;
  origin: "agent" | "manual";
  model?: string;
  // grounding context the primary agent passed in (for the Critic to audit against)
  context?: string;
  // populated when a real Gmail send happened on approval
  sentVia?: "simulated" | "gmail";
  sentAs?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  gmailError?: string;
  // populated when a schedule_meeting is approved
  bookedVia?: "simulated" | "google";
  calendarEventId?: string;
  calendarHtmlLink?: string;
  calendarError?: string;
  createdAt: Date;
  decidedAt?: Date;
}

export async function actionsCol(): Promise<Collection<ActionRecord>> {
  const db = await getDb();
  return db.collection<ActionRecord>("actions");
}

export interface RecordOptions {
  kind: ActionKind;
  proposal: ProposalData;
  query?: string;
  runId?: string;
  model?: string;
  context?: string;
}

export async function recordAction(opts: RecordOptions): Promise<string> {
  const col = await actionsCol();
  const doc: ActionRecord = {
    kind: opts.kind,
    status: "proposed",
    proposal: opts.proposal,
    origin: "agent",
    createdAt: new Date(),
    ...(opts.query ? { query: opts.query } : {}),
    ...(opts.runId ? { runId: opts.runId } : {}),
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.context ? { context: opts.context } : {}),
  };
  const ins = await col.insertOne(doc);
  return ins.insertedId.toString();
}

export async function getAction(id: string): Promise<ActionRecord | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await actionsCol();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function listActions(opts: {
  status?: ActionStatus;
  kind?: ActionKind;
  limit?: number;
}): Promise<ActionRecord[]> {
  const col = await actionsCol();
  const filter: Record<string, unknown> = {};
  if (opts.status) filter["status"] = opts.status;
  if (opts.kind) filter["kind"] = opts.kind;
  return col
    .find(filter, { limit: opts.limit ?? 50, sort: { createdAt: -1 } })
    .toArray();
}

export async function approveAction(
  id: string,
  edits?: Partial<ProposalData>,
): Promise<ActionRecord | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await actionsCol();
  const existing = await col.findOne({ _id: new ObjectId(id) });
  if (!existing) return null;
  if (existing.status !== "proposed") return existing;

  const final = (edits ? { ...existing.proposal, ...edits } : existing.proposal) as ProposalData;

  // If this is a draft_email AND Gmail is configured AND the demo user is
  // connected, actually send the email via the Gmail API. On success the
  // status remains "sent" and we annotate the record with gmailMessageId.
  // On failure we still mark the action sent BUT add a gmailError note —
  // we don't want to lose the audit trail.
  let gmailInfo: { messageId: string; threadId?: string; sentAs: string } | null = null;
  let gmailError: string | null = null;
  if (existing.kind === "draft_email") {
    try {
      const { sendGmail, getAccessToken, DEMO_USER_ID, isGmailConfigured } = await import(
        "./gmail.js"
      );
      if (isGmailConfigured()) {
        const token = await getAccessToken(DEMO_USER_ID);
        if (token) {
          const proposal = final as DraftEmailProposal;
          gmailInfo = await sendGmail(DEMO_USER_ID, {
            to: proposal.to,
            cc: proposal.cc,
            subject: proposal.subject,
            body: proposal.body,
          });
        }
      }
    } catch (err) {
      gmailError = err instanceof Error ? err.message : String(err);
    }
  }

  // If this is a schedule_meeting AND the calendar is connected, create a real
  // Google Calendar event on the preferred slot. On failure we still mark the
  // action sent but annotate calendarError so the audit trail is preserved.
  let calendarInfo: { eventId: string; htmlLink: string | null } | null = null;
  let calendarError: string | null = null;
  if (existing.kind === "schedule_meeting") {
    try {
      const { isCalendarConnected, insertCalendarEvent } = await import("./calendar.js");
      if (await isCalendarConnected()) {
        const meeting = final as ScheduleMeetingProposal;
        const idx = meeting.preferredIdx !== undefined && meeting.preferredIdx >= 0 ? meeting.preferredIdx : 0;
        const startIso = meeting.proposedTimes[idx] ?? meeting.proposedTimes[0];
        if (startIso) {
          const start = new Date(startIso);
          const end = new Date(start.getTime() + (meeting.durationMinutes ?? 30) * 60_000);
          const inserted = await insertCalendarEvent({
            summary: meeting.title,
            startIso: start.toISOString(),
            endIso: end.toISOString(),
            attendees: meeting.attendees,
            location: meeting.location,
            description: meeting.agenda,
          });
          calendarInfo = { eventId: inserted.id, htmlLink: inserted.htmlLink };
        }
      }
    } catch (err) {
      calendarError = err instanceof Error ? err.message : String(err);
    }
  }

  const update: Record<string, unknown> = {
    status: "sent",
    final,
    decidedAt: new Date(),
  };
  if (gmailInfo) {
    update["gmailMessageId"] = gmailInfo.messageId;
    if (gmailInfo.threadId) update["gmailThreadId"] = gmailInfo.threadId;
    update["sentVia"] = "gmail";
    update["sentAs"] = gmailInfo.sentAs;
  } else if (existing.kind === "draft_email") {
    update["sentVia"] = "simulated";
    if (gmailError) update["gmailError"] = gmailError;
  }
  if (calendarInfo) {
    update["bookedVia"] = "google";
    update["calendarEventId"] = calendarInfo.eventId;
    if (calendarInfo.htmlLink) update["calendarHtmlLink"] = calendarInfo.htmlLink;
  } else if (existing.kind === "schedule_meeting") {
    update["bookedVia"] = "simulated";
    if (calendarError) update["calendarError"] = calendarError;
  }

  await col.updateOne({ _id: new ObjectId(id) }, { $set: update });
  return col.findOne({ _id: new ObjectId(id) });
}

export async function rejectAction(
  id: string,
  reason?: string,
): Promise<ActionRecord | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await actionsCol();
  const existing = await col.findOne({ _id: new ObjectId(id) });
  if (!existing) return null;
  if (existing.status !== "proposed") return existing;

  await col.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: "rejected",
        ...(reason ? { reason } : {}),
        decidedAt: new Date(),
      },
    },
  );
  return col.findOne({ _id: new ObjectId(id) });
}

export function publicAction(a: ActionRecord): Record<string, unknown> {
  return {
    id: a._id?.toString() ?? "",
    kind: a.kind,
    status: a.status,
    proposal: a.proposal,
    final: a.final ?? null,
    reason: a.reason ?? null,
    query: a.query ?? null,
    runId: a.runId ?? null,
    origin: a.origin,
    model: a.model ?? null,
    sentVia: a.sentVia ?? null,
    sentAs: a.sentAs ?? null,
    gmailMessageId: a.gmailMessageId ?? null,
    gmailThreadId: a.gmailThreadId ?? null,
    gmailError: a.gmailError ?? null,
    bookedVia: a.bookedVia ?? null,
    calendarEventId: a.calendarEventId ?? null,
    calendarHtmlLink: a.calendarHtmlLink ?? null,
    calendarError: a.calendarError ?? null,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    decidedAt:
      a.decidedAt instanceof Date
        ? a.decidedAt.toISOString()
        : a.decidedAt ?? null,
  };
}
