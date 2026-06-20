import { DEMO_USER_ID, getAccessToken, getTokens, isGmailConfigured } from "./gmail.js";

/**
 * Google Calendar integration — rides on the same Google OAuth flow as Gmail
 * (the calendar.events scope is requested at connect time). When the user
 * hasn't connected, or the granted scope doesn't include calendar, callers
 * fall back to the Mongo-backed simulation so demos still work offline.
 */

const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export function isCalendarConfigured(): boolean {
  return isGmailConfigured();
}

/** True only if we have a usable token whose scope includes calendar access. */
export async function isCalendarConnected(userId: string = DEMO_USER_ID): Promise<boolean> {
  if (!isGmailConfigured()) return false;
  const rec = await getTokens(userId);
  if (!rec) return false;
  if (!/calendar/.test(rec.scope)) return false;
  const token = await getAccessToken(userId);
  return !!token;
}

export interface CalendarEvent {
  id: string;
  title: string;
  when: string | null; // ISO start
  end: string | null; // ISO end
  location: string | null;
  attendees: string[];
  organizer: string | null;
  htmlLink: string | null;
}

interface RawGEvent {
  id?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  organizer?: { email?: string };
  attendees?: Array<{ email?: string }>;
}

async function authedFetch(userId: string, path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken(userId);
  if (!token) throw new Error("calendar not connected — open /auth/google/start to authorize");
  return fetch(`${CAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function normalize(e: RawGEvent): CalendarEvent {
  const start = e.start?.dateTime ?? e.start?.date ?? null;
  const end = e.end?.dateTime ?? e.end?.date ?? null;
  return {
    id: e.id ?? "",
    title: e.summary ?? "(untitled)",
    when: start,
    end,
    location: e.location ?? null,
    attendees: (e.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
    organizer: e.organizer?.email ?? null,
    htmlLink: e.htmlLink ?? null,
  };
}

export async function listCalendarEvents(
  opts: { timeMin: string; timeMax: string; q?: string; maxResults?: number },
  userId: string = DEMO_USER_ID,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: opts.timeMin,
    timeMax: opts.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(opts.maxResults ?? 50),
  });
  if (opts.q) params.set("q", opts.q);
  const res = await authedFetch(userId, `/calendars/primary/events?${params.toString()}`);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`calendar.list ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { items?: RawGEvent[] };
  return (data.items ?? []).map(normalize);
}

export interface InsertEventInput {
  summary: string;
  startIso: string;
  endIso: string;
  attendees?: string[];
  location?: string | null;
  description?: string | null;
}

export async function insertCalendarEvent(
  input: InsertEventInput,
  userId: string = DEMO_USER_ID,
): Promise<{ id: string; htmlLink: string | null }> {
  const body = {
    summary: input.summary,
    ...(input.location ? { location: input.location } : {}),
    ...(input.description ? { description: input.description } : {}),
    start: { dateTime: input.startIso },
    end: { dateTime: input.endIso },
    ...(input.attendees && input.attendees.length > 0
      ? { attendees: input.attendees.map((email) => ({ email })) }
      : {}),
  };
  const res = await authedFetch(userId, `/calendars/primary/events?sendUpdates=all`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`calendar.insert ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { id?: string; htmlLink?: string };
  return { id: data.id ?? "", htmlLink: data.htmlLink ?? null };
}

/** Busy intervals from the free/busy endpoint, used for conflict detection. */
export async function getBusyIntervals(
  timeMin: string,
  timeMax: string,
  userId: string = DEMO_USER_ID,
): Promise<Array<{ start: string; end: string }>> {
  const res = await authedFetch(userId, `/freeBusy`, {
    method: "POST",
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: "primary" }] }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`calendar.freebusy ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as {
    calendars?: { primary?: { busy?: Array<{ start: string; end: string }> } };
  };
  return data.calendars?.primary?.busy ?? [];
}
