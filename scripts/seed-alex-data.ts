/**
 * Generates 247 synthetic documents for fictional PM Alex Chen,
 * grouped into coherent narrative threads so people, dates, and
 * commitments stay consistent across sources.
 *
 *   npx tsx --env-file=.env.local scripts/seed-alex-data.ts          # generate JSON
 *   npx tsx --env-file=.env.local scripts/seed-alex-data.ts --load   # generate + post to /ingest
 *   npx tsx --env-file=.env.local scripts/seed-alex-data.ts --load-only --fixture path.json
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { GoogleAuth } from "google-auth-library";

interface DocSeed {
  source: "email" | "calendar" | "meeting_notes" | "shared_doc" | "slack" | "notes";
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

interface ThreadSpec {
  key: string;
  label: string;
  pitch: string;
  mix: Partial<Record<DocSeed["source"], number>>;
}

const WORLD = `
Alex Chen — senior PM at "Helio", a Series B B2B analytics startup (~80 people).
Reports to Priya Iyer (VP Product). Owns the "Lantern" analytics workspace and the Q3 roadmap.
Today is Friday, 16 May 2026. The 2-week window covers 04 May 2026 – 16 May 2026, with a
few future-dated calendar invites stretching to 22 May.

Recurring cast — use these people consistently, with these styles:
  • Priya Iyer (VP Product, Alex's manager) — terse, asks for tradeoffs in bullet form.
  • Sarah Okafor (Director of Eng, Lantern team) — collaborative, asks for written context.
  • Marcus Bell (Senior PM, adjacent team) — friendly but pushy, asks for coffee chats and 1:1s.
  • Ben Aoki (Design Lead, Lantern) — wry, sends Figma links.
  • Mei Tanaka (Staff Eng, Lantern) — precise, drops architecture diagrams.
  • Diego Salas (CS Lead, Acme Co. account) — earnest, forwards customer complaints.
  • Acme Co. — top-10 customer, $480k ARR, pushing back on Q3 pricing change.
  • Helena Park (Recruiter) — runs the hiring pipeline.
  • Jorge Vega (Founding Eng, on parental leave until 28 May).
  • Tomas Reinholz (Eng Lead, Platform team) — pedantic, cc's everyone.
  • Layla Hassan (Sales AE) — sends deal-desk asks.
  • Noor Abadi (Designer, Lantern) — quiet, drops async loom links.

Style rules:
  • Emails feel like real corporate email — natural subject lines, threading,
    occasional one-line replies and forwards.
  • Calendar invites have time, location ("Zoom" or "HQ — Ada Room"), and 1-line agenda.
  • Meeting notes are bulleted, with attendees, decisions, and action items.
  • Shared docs are longer-form (3–6 short paragraphs).
  • Slack messages are short, casual, sometimes thread-quoted.
  • Personal notes are first-person voice memos to self, terse.
  • Realistic concrete details: file names, ticket IDs (LAN-2031), dollar figures,
    customer names. Never generic.
  • NO emojis. NO sparkles. NO "Hope this finds you well." NO "I'll circle back."
  • Times are ISO 8601 in America/New_York (Helio is NYC HQ).
`.trim();

const THREADS: ThreadSpec[] = [
  {
    key: "q3-planning",
    label: "Q3 Planning + Eng Leads kickoff (Sarah, Priya, Mei)",
    pitch:
      "Alex is preparing a Q3 planning doc due to Sarah by Friday 22 May. Priya wants a tight set of 3 themes. A kickoff meeting 'Q3 Planning with Eng Leads' is scheduled Wed 21 May at 2pm. Tradeoffs around scoping Lantern vs. shipping the audit-log work.",
    mix: { email: 18, calendar: 6, meeting_notes: 4, shared_doc: 2, slack: 4, notes: 1 },
  },
  {
    key: "project-lantern",
    label: "Project Lantern — design review and engineering trade-offs",
    pitch:
      "Lantern is the new analytics workspace. Ben (design lead) just shared a v3 Figma. Mei flagged perf concerns on the query layer (LAN-2031, LAN-2044). Design review meeting was Wed 14 May. Open thread: do we cut the saved-view feature to make the 30 June launch.",
    mix: { email: 16, calendar: 5, meeting_notes: 5, shared_doc: 3, slack: 6, notes: 1 },
  },
  {
    key: "marcus-coffee",
    label: "Marcus Bell pinging for a 1:1 / coffee chat",
    pitch:
      "Marcus has been asking Alex for time three times in two weeks — first a coffee chat, then a 'quick brain pick' on roadmap. Alex keeps deferring. Marcus will ask again on Mon 19 May. Tone: friendly but persistent. Alex needs to politely decline and propose Thursday 22 May at 2pm.",
    mix: { email: 7, calendar: 2, slack: 4, notes: 1 },
  },
  {
    key: "sarah-q3-doc",
    label: "Sarah expecting Alex's Q3 product doc by Friday",
    pitch:
      "On 06 May Alex committed in writing to Sarah that the Q3 product doc would land by Fri 22 May EOD. Sarah followed up twice, friendly. Alex has a partial draft in a shared doc. This is the canonical 'commitment' the agent should surface in the ledger.",
    mix: { email: 10, calendar: 1, meeting_notes: 2, shared_doc: 2, slack: 3, notes: 1 },
  },
  {
    key: "acme-pricing",
    label: "Acme Co. pricing pushback — customer escalation",
    pitch:
      "Acme Co. ($480k ARR) is unhappy about a Q3 pricing change. Diego forwarded a complaint email from Acme's procurement on 09 May. Layla (Sales AE) wants a deal-desk exception. Priya wants a clear recommendation by Tue 19 May. Real customer names, dollar figures, contract dates.",
    mix: { email: 14, calendar: 3, meeting_notes: 3, shared_doc: 1, slack: 3, notes: 1 },
  },
  {
    key: "hiring-pm",
    label: "Hiring a junior PM — three candidates in flight",
    pitch:
      "Helena (recruiter) has three candidates in pipeline: Camila Reyes (strong), Anand Krishna (mixed signals), Yuki Sato (early). Onsite for Camila scheduled Mon 19 May. Debriefs follow. Alex owes Helena written feedback.",
    mix: { email: 10, calendar: 5, meeting_notes: 3, shared_doc: 1, slack: 2, notes: 1 },
  },
  {
    key: "audit-log",
    label: "Audit-log work — Platform team / Tomas",
    pitch:
      "Tomas (Platform) is pushing audit-log refactor (PLT-880). He cc's everyone. Alex thinks it should slip to Q4. A short tense thread, a meeting notes file showing decision deferred, a couple of slack pings.",
    mix: { email: 8, calendar: 2, meeting_notes: 3, shared_doc: 1, slack: 3, notes: 1 },
  },
  {
    key: "background",
    label: "Background noise — unrelated daily life",
    pitch:
      "A mix of unrelated everyday work: standup invites, an all-hands recording link, a benefits-enrollment reminder from HR, two notes Alex made to self, a few short slack threads about lunch, etc. These should NOT reference the main threads. Use minor named characters too (e.g. Jared from IT, Nina from HR).",
    mix: { email: 27, calendar: 26, meeting_notes: 12, shared_doc: 2, slack: 5, notes: 3 },
  },
];

const totalSpec = THREADS.reduce(
  (n, t) => n + Object.values(t.mix).reduce((a, b) => a + (b ?? 0), 0),
  0,
);
if (totalSpec !== 247) {
  console.warn(`thread spec totals ${totalSpec}, expected 247 — adjusting backgrounds`);
}

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.VERTEX_GEMINI_LOCATION ?? process.env.GOOGLE_CLOUD_LOCATION ?? "global";
const MODEL = process.env.VERTEX_GEMINI_MODEL ?? "gemini-3.1-pro-preview";
const FIXTURE_PATH = resolve(process.cwd(), "scripts/fixtures/alex-data.json");
const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8787";

const args = process.argv.slice(2);
const LOAD = args.includes("--load");
const LOAD_ONLY = args.includes("--load-only");
const fixtureFlag = args.indexOf("--fixture");
const fixturePath =
  fixtureFlag >= 0 && args[fixtureFlag + 1] ? resolve(args[fixtureFlag + 1]!) : FIXTURE_PATH;

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

async function generateThread(spec: ThreadSpec): Promise<DocSeed[]> {
  if (!PROJECT) throw new Error("GOOGLE_CLOUD_PROJECT is required for generation");
  const targets = Object.entries(spec.mix)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  const totalForThread = Object.values(spec.mix).reduce((a, b) => a + (b ?? 0), 0);
  const prompt = `
${WORLD}

Generate a coherent narrative thread.

Thread key: "${spec.key}"
Thread label: ${spec.label}
Thread pitch: ${spec.pitch}

Produce exactly ${totalForThread} documents distributed by source: ${targets}.
Spread the dates realistically across 04 May – 22 May 2026.
Each document must reference the same named people, projects, and commitments,
so a reader could reconstruct the storyline by reading them in chronological order.

Return ONLY valid JSON of shape:
{
  "documents": [
    {
      "source": "email" | "calendar" | "meeting_notes" | "shared_doc" | "slack" | "notes",
      "title": string,
      "body": string,
      "metadata": {
        "date": ISO-8601 string in 2026-05-XX format,
        "threadKey": "${spec.key}",
        "from"?: string,
        "to"?: string[],
        "cc"?: string[],
        "participants"?: string[],
        "eventTime"?: ISO string,
        "eventLocation"?: string,
        "ticket"?: string
      }
    }
  ]
}
No markdown fences. No prose outside the JSON.
`.trim();

  const host = LOCATION === "global" ? "aiplatform.googleapis.com" : `${LOCATION}-aiplatform.googleapis.com`;
  const url =
    `https://${host}/v1/projects/${PROJECT}/locations/${LOCATION}` +
    `/publishers/google/models/${MODEL}:generateContent`;
  const client = await auth.getClient();
  const access = await client.getAccessToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`vertex.generate ${res.status}: ${await res.text()}`);
  }
  type R = {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const data = (await res.json()) as R;
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  type Parsed = { documents?: DocSeed[] };
  const parsed = JSON.parse(text) as Parsed;
  if (!Array.isArray(parsed.documents)) {
    throw new Error(`thread ${spec.key}: missing documents array`);
  }
  return parsed.documents;
}

async function generateAll(): Promise<DocSeed[]> {
  const all: DocSeed[] = [];
  for (const spec of THREADS) {
    process.stdout.write(`  · thread ${spec.key} ... `);
    const docs = await generateThread(spec);
    process.stdout.write(`${docs.length} docs\n`);
    all.push(...docs);
  }
  return all;
}

async function loadIntoAgent(docs: DocSeed[]): Promise<void> {
  let ok = 0;
  let fail = 0;
  for (const [i, doc] of docs.entries()) {
    const res = await fetch(`${AGENT_URL}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    if (res.ok) {
      ok++;
    } else {
      fail++;
      console.warn(`  ! ${i} ${doc.title}: ${res.status} ${await res.text()}`);
    }
    if ((i + 1) % 20 === 0) {
      console.log(`  loaded ${i + 1} / ${docs.length}`);
    }
  }
  console.log(`load complete: ${ok} ok, ${fail} failed`);
}

async function main(): Promise<void> {
  let docs: DocSeed[];

  if (LOAD_ONLY) {
    console.log(`loading existing fixture from ${fixturePath}`);
    docs = JSON.parse(await readFile(fixturePath, "utf8")) as DocSeed[];
  } else {
    console.log("generating threads via Gemini ...");
    docs = await generateAll();
    await mkdir(dirname(fixturePath), { recursive: true });
    await writeFile(fixturePath, JSON.stringify(docs, null, 2));
    console.log(`wrote ${docs.length} docs → ${fixturePath}`);
  }

  if (LOAD || LOAD_ONLY) {
    console.log(`posting ${docs.length} docs to ${AGENT_URL}/ingest ...`);
    await loadIntoAgent(docs);

    // Build the memory graph and the commitments ledger from the freshly
    // ingested corpus so /memory and /commitments work immediately.
    await triggerExtraction("/graph/extract", "memory graph");
    await triggerExtraction("/commitments/extract", "commitments ledger");
  }
}

/**
 * Fire an SSE extraction endpoint (rebuild) and drain it to completion,
 * printing the final `done` line. Best-effort — a failure here doesn't fail
 * the seed.
 */
async function triggerExtraction(path: string, label: string): Promise<void> {
  try {
    console.log(`building ${label} via ${AGENT_URL}${path} ...`);
    const res = await fetch(`${AGENT_URL}${path}?rebuild=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rebuild: true }),
    });
    if (!res.ok || !res.body) {
      console.warn(`  ! ${label}: ${res.status} ${await res.text().catch(() => "")}`);
      return;
    }
    // Drain the stream; surface the last meaningful line.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let last = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split("\n")) {
        if (line.startsWith("data:")) last = line.slice(5).trim();
      }
    }
    console.log(`  ${label} done: ${last}`);
  } catch (err) {
    console.warn(`  ! ${label} skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
