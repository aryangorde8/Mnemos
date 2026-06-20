import { authHeaders } from "./auth-token";

const AGENT = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8787";

export type SourceKind =
  | "email"
  | "calendar"
  | "meeting_notes"
  | "shared_doc"
  | "slack"
  | "notes";

export interface SearchHit {
  chunkId: string;
  documentId: string;
  source: SourceKind;
  title: string;
  text: string;
  ordinal: number;
  score: number;
  metadata: Record<string, unknown>;
  fromVector?: boolean;
  fromText?: boolean;
}

export interface SearchResponse {
  query: string;
  tookMs: number;
  count: number;
  phases?: string[];
  results: SearchHit[];
}

export interface SearchError {
  error: string;
  detail?: unknown;
}

export async function search(query: string, opts?: {
  limit?: number;
  source?: SourceKind;
  signal?: AbortSignal;
}): Promise<SearchResponse> {
  const res = await fetch(`${AGENT}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      limit: opts?.limit ?? 10,
      ...(opts?.source ? { source: opts.source } : {}),
    }),
    signal: opts?.signal,
  });
  const data: unknown = await res.json();
  if (!res.ok) {
    const e = (data ?? { error: "unknown" }) as SearchError;
    throw new SearchFailed(e.error ?? "search_failed", res.status, e.detail);
  }
  return data as SearchResponse;
}

export class SearchFailed extends Error {
  constructor(
    public code: string,
    public status: number,
    public detail?: unknown,
  ) {
    super(`${code} (${status})`);
  }
}

export interface ReadyResponse {
  atlas: "configured" | "missing";
  vertex: "configured" | "missing";
  geminiModel: string;
  embeddingModel: string;
  region: string;
}

export async function ready(): Promise<ReadyResponse | null> {
  try {
    const res = await fetch(`${AGENT}/ready`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ReadyResponse;
  } catch {
    return null;
  }
}

export interface IngestStats {
  documents: number;
  chunks: number;
  sources: { source: SourceKind; count: number }[];
}

export async function ingestStats(): Promise<IngestStats | null> {
  try {
    const res = await fetch(`${AGENT}/ingest/stats`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as IngestStats;
  } catch {
    return null;
  }
}

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
  slots?: SlotEvaluation[];
  preferredIdx?: number;
}

export type ProposalData = DraftEmailProposal | ScheduleMeetingProposal;

export interface ActionRecord {
  id: string;
  kind: ActionKind;
  status: ActionStatus;
  proposal: ProposalData;
  final: ProposalData | null;
  reason: string | null;
  query: string | null;
  runId: string | null;
  origin: "agent" | "manual";
  model: string | null;
  sentVia?: "simulated" | "gmail" | null;
  sentAs?: string | null;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  gmailError?: string | null;
  bookedVia?: "simulated" | "google" | null;
  calendarEventId?: string | null;
  calendarHtmlLink?: string | null;
  calendarError?: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export async function getAction(id: string): Promise<ActionRecord | null> {
  const res = await fetch(`${AGENT}/actions/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as ActionRecord;
}

export async function listActions(opts?: {
  status?: ActionStatus;
  kind?: ActionKind;
  limit?: number;
}): Promise<{ count: number; actions: ActionRecord[] } | null> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.kind) params.set("kind", opts.kind);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const q = params.toString();
  const res = await fetch(`${AGENT}/actions${q ? "?" + q : ""}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as { count: number; actions: ActionRecord[] };
}

export async function approveAction(
  id: string,
  edits?: Partial<ProposalData>,
): Promise<ActionRecord> {
  const res = await fetch(`${AGENT}/actions/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(edits ? { edits } : {}),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`approve ${res.status}: ${detail}`);
  }
  return (await res.json()) as ActionRecord;
}

export async function rejectAction(
  id: string,
  reason?: string,
): Promise<ActionRecord> {
  const res = await fetch(`${AGENT}/actions/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(reason ? { reason } : {}),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`reject ${res.status}: ${detail}`);
  }
  return (await res.json()) as ActionRecord;
}

export interface Commitment {
  chunkId: string;
  title: string;
  source: SourceKind;
  excerpt: string | null;
  date: string | null;
  thread: string | null;
  direction: "incoming" | "outgoing" | "unknown";
}

export interface CommitmentList {
  summary?: string;
  direction: "incoming" | "outgoing" | "all";
  actor: string | null;
  count: number;
  commitments: Commitment[];
}

export async function listCommitments(opts?: {
  direction?: "incoming" | "outgoing" | "all";
  actor?: string;
  limit?: number;
}): Promise<CommitmentList | null> {
  const params = new URLSearchParams();
  if (opts?.direction) params.set("direction", opts.direction);
  if (opts?.actor) params.set("actor", opts.actor);
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  const q = params.toString();
  const res = await fetch(`${AGENT}/commitments${q ? "?" + q : ""}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as CommitmentList;
}

export interface CalendarEvent {
  id: string;
  title: string;
  when: string | null;
  location: string | null;
  attendees: string[];
  organizer: string | null;
  agendaExcerpt: string | null;
}

export interface CalendarEventList {
  summary?: string;
  from: string;
  to: string;
  count: number;
  events: CalendarEvent[];
}

export async function listCalendarEvents(opts?: {
  from?: string;
  to?: string;
  title_contains?: string;
}): Promise<CalendarEventList | null> {
  const params = new URLSearchParams();
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  if (opts?.title_contains) params.set("title_contains", opts.title_contains);
  const q = params.toString();
  const res = await fetch(`${AGENT}/calendar/events${q ? "?" + q : ""}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as CalendarEventList;
}

export interface BriefingRecord {
  id: string;
  eventId: string;
  eventTitle: string;
  eventWhen: string | null;
  eventLocation: string | null;
  attendees: string[];
  markdown: string;
  contextSummary: string | null;
  citations: Array<{
    chunkId: string;
    documentId: string;
    source: string;
    title: string;
    score: number;
    ordinal: number;
  }>;
  model: string | null;
  createdAt: string;
}

export async function listBriefings(): Promise<{
  count: number;
  briefings: BriefingRecord[];
} | null> {
  const res = await fetch(`${AGENT}/briefings`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as { count: number; briefings: BriefingRecord[] };
}

export async function getBriefing(id: string): Promise<BriefingRecord | null> {
  const res = await fetch(`${AGENT}/briefings/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as BriefingRecord;
}

// ─── Critic ─────────────────────────────────────────────────────────────

export type FindingSeverity = "high" | "medium" | "low";

export interface CritiqueFinding {
  severity: FindingSeverity;
  claim: string;
  issue: string;
  evidence: "supported" | "unsupported" | "contradicted" | "missing";
  citation?: string;
  suggestion?: string;
}

export interface CritiqueRecord {
  id: string;
  actionId: string;
  runId: string | null;
  query: string | null;
  verdict: "approve" | "revise" | "reject";
  summary: string;
  findings: CritiqueFinding[];
  voice: { score: number; notes: string };
  model: string | null;
  createdAt: string;
}

export async function getCritiqueForAction(actionId: string): Promise<CritiqueRecord | null> {
  const res = await fetch(`${AGENT}/actions/${actionId}/critique`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as CritiqueRecord;
}

// ─── Gmail OAuth ────────────────────────────────────────────────────────

export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  calendar?: boolean;
  email?: string;
}

export async function getGmailStatus(): Promise<GmailStatus> {
  try {
    const res = await fetch(`${AGENT}/auth/google/status`, { cache: "no-store" });
    if (!res.ok) return { configured: false, connected: false };
    return (await res.json()) as GmailStatus;
  } catch {
    return { configured: false, connected: false };
  }
}

export function gmailConnectUrl(): string {
  return `${AGENT}/auth/google/start`;
}

export async function disconnectGmail(): Promise<boolean> {
  const res = await fetch(`${AGENT}/auth/google/disconnect`, {
    method: "POST",
    cache: "no-store",
    headers: { ...(await authHeaders()) },
  });
  return res.ok;
}

// ─── Memory graph ────────────────────────────────────────────────────────

export type EntityKind = "person" | "project" | "topic";

export interface Entity {
  id: string;
  name: string;
  key: string;
  kind: EntityKind;
  role: string | null;
  mentions: number;
  firstSeen: string | null;
  lastSeen: string | null;
  chunkIds: string[];
  series: Array<{ date: string; count: number }>;
}

export interface Relation {
  id: string;
  from: string;
  to: string;
  kind: "owes" | "works_with" | "manages" | "discusses";
  evidence: string;
  chunkId: string | null;
  date: string | null;
}

export interface GraphResponse {
  stats: {
    entities: { person: number; project: number; topic: number };
    relations: number;
  };
  entities: {
    person: Entity[];
    project: Entity[];
    topic: Entity[];
  };
  relations: Relation[];
}

export async function getGraph(): Promise<GraphResponse | null> {
  try {
    const res = await fetch(`${AGENT}/graph`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as GraphResponse;
  } catch {
    return null;
  }
}
