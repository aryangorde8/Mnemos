import { ObjectId } from "mongodb";
import { getCollections } from "../lib/mongo.js";
import { streamGenerate } from "../lib/vertex.js";
import { getBriefingContextTool } from "./tools/get-briefing-context.js";
import { saveBriefing } from "../lib/briefings.js";
import { config } from "../config.js";
import type { Citation } from "./types.js";

export type BriefingEvent =
  | { kind: "start"; eventId: string; at: number }
  | { kind: "event_loaded"; event: Record<string, unknown>; at: number }
  | {
      kind: "context_loaded";
      relatedCount: number;
      commitmentCount: number;
      at: number;
    }
  | { kind: "synthesizing"; at: number }
  | { kind: "chunk"; text: string; at: number }
  | {
      kind: "saved";
      briefingId: string;
      eventTitle: string;
      attendees: string[];
      eventWhen: string | null;
      eventLocation: string | null;
      citations: Citation[];
      at: number;
    }
  | { kind: "done"; totalMs: number; at: number }
  | { kind: "error"; message: string; at: number };

const SYSTEM = `You are Mnemos, drafting a meeting briefing for a senior PM named Alex Chen. Produce a tight, editorial 1-pager that Alex could read in 60 seconds and walk into the room prepared.

OUTPUT RULES
- Output STRICT markdown. No HTML, no emoji, no decorative dividers, no AI-stock filler.
- Use ## section headings only. No H1 (the page renders one for you). No deeper than H3.
- Lead with one short orienting sentence under the title — no heading.
- Sections IN THIS ORDER:
  ## Attendees
  Bullet list. One short clause each capturing role + what they currently care about.
  ## Open threads
  Bullet list. Each item: "thread name — one-line status, with date or commitment if cited."
  ## Outstanding commitments
  Bullet list of concrete promises (incoming and outgoing). Format: "owner → recipient: what, by when." If none, write "Nothing tracked for this meeting."
  ## Suggested talking points
  3–5 questions or focal points Alex can raise, written in Alex's voice (lowercase-leaning, terse).
- Cite specifics by quoting fragments from the supplied context, never invent.
- No headings beyond these four.
- Do NOT include the meeting title or time at the top — those are rendered separately.`;

interface BriefingOptions {
  eventTitle?: string;
  eventId?: string;
}

export async function* runBriefing(
  opts: BriefingOptions,
): AsyncGenerator<BriefingEvent, void, unknown> {
  const startedAt = Date.now();
  yield {
    kind: "start",
    eventId: opts.eventId ?? "",
    at: Date.now(),
  };

  let event: Record<string, unknown> | null = null;
  let relatedCount = 0;
  let commitmentCount = 0;
  let citations: Citation[] = [];
  let contextSummary: string | null = null;
  let attendees: string[] = [];
  let eventWhen: string | null = null;
  let eventLocation: string | null = null;
  let eventTitleResolved = "";
  let resolvedEventId: ObjectId | null = null;

  try {
    if (opts.eventId) {
      if (!ObjectId.isValid(opts.eventId)) throw new Error(`invalid event id: ${opts.eventId}`);
      const { documents } = await getCollections();
      const e = await documents.findOne({ _id: new ObjectId(opts.eventId), source: "calendar" });
      if (!e) throw new Error(`event ${opts.eventId} not found`);
      resolvedEventId = e._id ?? new ObjectId(opts.eventId);
      eventTitleResolved = e.title;
    } else if (opts.eventTitle) {
      eventTitleResolved = opts.eventTitle;
    } else {
      throw new Error("event_id or event_title required");
    }

    const ctxResult = await getBriefingContextTool.handler({
      event_title: eventTitleResolved,
      ...(opts.eventId ? { event_id: opts.eventId } : {}),
    });
    if (!ctxResult.ok || !ctxResult.data) {
      throw new Error(ctxResult.error ?? "failed to assemble context");
    }
    const data = ctxResult.data as {
      event: {
        id: string;
        title: string;
        when?: string | null;
        location?: string | null;
        attendees?: string[];
        agendaExcerpt?: string | null;
      };
      related: Array<{ title: string; source: string; score: number; text: string | null }>;
      commitmentLeads: Array<{ title: string; source: string; excerpt: string | null }>;
    };
    event = data.event as unknown as Record<string, unknown>;
    relatedCount = data.related.length;
    commitmentCount = data.commitmentLeads.length;
    citations = ctxResult.citations ?? [];
    contextSummary = ctxResult.summary ?? null;
    attendees = data.event.attendees ?? [];
    eventWhen = data.event.when ?? null;
    eventLocation = data.event.location ?? null;
    eventTitleResolved = data.event.title;
    resolvedEventId = new ObjectId(data.event.id);

    yield { kind: "event_loaded", event, at: Date.now() };
    yield {
      kind: "context_loaded",
      relatedCount,
      commitmentCount,
      at: Date.now(),
    };

    const userPrompt = buildUserPrompt(data);
    yield { kind: "synthesizing", at: Date.now() };

    let collected = "";
    for await (const chunk of streamGenerate({
      system: SYSTEM,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      temperature: 0.35,
      maxTokens: 1400,
    })) {
      if (chunk.text) {
        collected += chunk.text;
        yield { kind: "chunk", text: chunk.text, at: Date.now() };
      }
    }

    const markdown = collected.trim();
    let briefingId: string;
    try {
      briefingId = await saveBriefing({
        eventId: resolvedEventId,
        eventTitle: eventTitleResolved,
        eventWhen,
        eventLocation,
        attendees,
        markdown,
        contextSummary,
        citations,
        model: config.VERTEX_GEMINI_MODEL,
        createdAt: new Date(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { kind: "error", message: `save failed: ${msg}`, at: Date.now() };
      return;
    }

    yield {
      kind: "saved",
      briefingId,
      eventTitle: eventTitleResolved,
      attendees,
      eventWhen,
      eventLocation,
      citations,
      at: Date.now(),
    };
    yield {
      kind: "done",
      totalMs: Date.now() - startedAt,
      at: Date.now(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { kind: "error", message: msg, at: Date.now() };
  }
}

function buildUserPrompt(data: {
  event: {
    title: string;
    when?: string | null;
    location?: string | null;
    attendees?: string[];
    agendaExcerpt?: string | null;
  };
  related: Array<{ title: string; source: string; text: string | null }>;
  commitmentLeads: Array<{ title: string; source: string; excerpt: string | null }>;
}): string {
  const eventBlock = [
    `Event: ${data.event.title}`,
    data.event.when ? `When: ${data.event.when}` : "",
    data.event.location ? `Location: ${data.event.location}` : "",
    data.event.attendees && data.event.attendees.length > 0
      ? `Attendees: ${data.event.attendees.join(", ")}`
      : "",
    data.event.agendaExcerpt ? `Agenda excerpt:\n${data.event.agendaExcerpt}` : "",
  ]
    .filter((s) => s.length > 0)
    .join("\n");

  const related = data.related.length
    ? data.related
        .slice(0, 8)
        .map(
          (r, i) =>
            `R${i + 1} [${r.source}] ${r.title}:\n${(r.text ?? "").slice(0, 320)}`,
        )
        .join("\n\n")
    : "(no related chunks)";

  const commitments = data.commitmentLeads.length
    ? data.commitmentLeads
        .slice(0, 8)
        .map(
          (c, i) =>
            `C${i + 1} [${c.source}] ${c.title}:\n${(c.excerpt ?? "").slice(0, 300)}`,
        )
        .join("\n\n")
    : "(no commitment leads found)";

  return `Generate the briefing for the meeting below.

${eventBlock}

--- related context ---
${related}

--- commitment leads ---
${commitments}

Now produce the markdown briefing per the system instructions.`;
}
