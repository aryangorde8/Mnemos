/**
 * Extracts Alex Chen's writing voice from the ingested corpus and writes a
 * compact voice fixture used by the draft_email tool. The fixture is plain
 * markdown so it's easy to eyeball and edit by hand.
 *
 *   npx tsx --env-file=.env.local scripts/extract-voice.ts
 *
 * Output: scripts/fixtures/alex-voice.md
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { GoogleAuth } from "google-auth-library";

const URI = process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB ?? "mnemos";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
const MODEL = process.env.VERTEX_GEMINI_MODEL ?? "gemini-3-pro";

if (!URI) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}
if (!PROJECT) {
  console.error("GOOGLE_CLOUD_PROJECT is required");
  process.exit(1);
}

const ALEX_EMAIL = "alex.chen@northwind.dev";
const SAMPLE_SIZE = 24;

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

async function getToken(): Promise<string> {
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  if (!t.token) throw new Error("failed to acquire access token");
  return t.token;
}

const ENDPOINT =
  `https://${LOCATION}-aiplatform.googleapis.com/v1` +
  `/projects/${PROJECT}/locations/${LOCATION}` +
  `/publishers/google/models/${MODEL}:generateContent`;

interface SentEmail {
  title: string;
  body: string;
  to: string[];
  date: string | null;
}

async function pickSentEmails(): Promise<SentEmail[]> {
  const client = new MongoClient(URI!, { appName: "mnemos-voice" });
  await client.connect();
  try {
    const col = client.db(DB).collection("documents");
    const filter: Record<string, unknown> = {
      source: "email",
      $or: [
        { "metadata.from": { $regex: ALEX_EMAIL, $options: "i" } },
        { "metadata.from": { $regex: "alex chen", $options: "i" } },
        { "metadata.direction": "from_alex" },
      ],
    };
    const docs = await col.find(filter, { limit: SAMPLE_SIZE * 3 }).toArray();
    const sample = docs.slice(0, SAMPLE_SIZE);
    return sample.map((d) => ({
      title: typeof d.title === "string" ? d.title : "",
      body: typeof d.body === "string" ? d.body : "",
      to: Array.isArray(d.metadata?.["to"])
        ? (d.metadata!["to"] as string[])
        : [],
      date: typeof d.metadata?.["date"] === "string"
        ? (d.metadata!["date"] as string)
        : null,
    }));
  } finally {
    await client.close();
  }
}

async function summarizeVoice(samples: SentEmail[]): Promise<string> {
  if (samples.length === 0) {
    return "No outbound emails were found in the corpus. The default voice cue will be used.";
  }
  const corpus = samples
    .map((s, i) => `--- email ${i + 1} ---\nSubject: ${s.title}\nTo: ${s.to.join(", ")}\nDate: ${s.date ?? ""}\n\n${s.body}`)
    .join("\n\n");

  const prompt = `You are analyzing the writing voice of a senior PM named Alex Chen, drawn from ${samples.length} of his outbound emails.

Read the samples below carefully. Then produce a short, USEFUL style guide that another LLM can follow to draft new emails that sound like Alex. Be CONCRETE — quote real phrasings, name real tics, list openings and sign-offs he actually uses. Avoid generic advice.

Return markdown with these sections:
## Voice fingerprint
3–6 bullets capturing the distinctive flavor (sentence rhythm, register, formality).

## Openings he uses
3–6 short example openings, verbatim where possible.

## Closings & sign-offs
2–4 examples, verbatim.

## Phrases he favors
8–14 short phrases (≤6 words each) lifted from the samples. One per line, with leading "- ".

## Phrases he avoids
4–8 patterns that would feel WRONG coming from him.

## Length & shape
1–2 sentences on email length and paragraph rhythm.

Samples:
${corpus}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1500,
    },
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`vertex ${res.status}: ${detail}`);
  }
  type Resp = {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const data = (await res.json()) as Resp;
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? ""
  );
}

async function main(): Promise<void> {
  console.log(`[voice] sampling outbound emails (target=${SAMPLE_SIZE})…`);
  const samples = await pickSentEmails();
  console.log(`[voice] got ${samples.length} samples`);
  console.log(`[voice] summarizing via ${MODEL}…`);
  const md = await summarizeVoice(samples);

  const here = dirname(fileURLToPath(import.meta.url));
  const out = resolve(here, "fixtures", "alex-voice.md");
  await mkdir(dirname(out), { recursive: true });
  const header = `<!-- generated by scripts/extract-voice.ts on ${new Date().toISOString()} -->
<!-- sampled ${samples.length} outbound emails from ${ALEX_EMAIL} -->\n\n`;
  await writeFile(out, header + md.trim() + "\n", "utf8");
  console.log(`[voice] wrote → ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
