import { GoogleAuth } from "google-auth-library";
import { config, isVertexConfigured } from "../config.js";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

async function token(): Promise<string> {
  const client = await auth.getClient();
  const access = await client.getAccessToken();
  if (!access.token) throw new Error("vertex: failed to acquire access token");
  return access.token;
}

function endpoint(
  model: string,
  verb: "generateContent" | "streamGenerateContent" | "predict",
): string {
  return (
    `https://${config.GOOGLE_CLOUD_LOCATION}-aiplatform.googleapis.com/v1` +
    `/projects/${config.GOOGLE_CLOUD_PROJECT}/locations/${config.GOOGLE_CLOUD_LOCATION}` +
    `/publishers/google/models/${model}:${verb}`
  );
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ContentPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface Content {
  role: "user" | "model";
  parts: ContentPart[];
}

export interface StreamChunk {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  finishReason?: string;
}

export interface StreamOptions {
  system?: string;
  contents: Content[];
  tools?: FunctionDeclaration[];
  temperature?: number;
  maxTokens?: number;
}

export async function* streamGenerate(
  opts: StreamOptions,
): AsyncGenerator<StreamChunk, void, unknown> {
  if (!isVertexConfigured()) {
    throw new Error("vertex: GOOGLE_CLOUD_PROJECT not configured");
  }
  const url =
    endpoint(config.VERTEX_GEMINI_MODEL, "streamGenerateContent") + "?alt=sse";
  const body = {
    contents: opts.contents,
    ...(opts.system
      ? { systemInstruction: { parts: [{ text: opts.system }] } }
      : {}),
    ...(opts.tools && opts.tools.length > 0
      ? {
          tools: [{ functionDeclarations: opts.tools }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        }
      : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxTokens ?? 2048,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text();
    throw new Error(`vertex.streamGenerate ${res.status}: ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        const parsed = JSON.parse(payload) as {
          candidates?: Array<{
            content?: { parts?: ContentPart[] };
            finishReason?: string;
          }>;
        };
        const cand = parsed.candidates?.[0];
        if (!cand) continue;
        for (const part of cand.content?.parts ?? []) {
          if (part.text !== undefined) {
            yield { text: part.text };
          } else if (part.functionCall) {
            yield {
              functionCall: {
                name: part.functionCall.name,
                args: part.functionCall.args ?? {},
              },
            };
          }
        }
        if (cand.finishReason) yield { finishReason: cand.finishReason };
      } catch {
        // partial chunk; continue
      }
    }
  }
}

export interface GenerateOptions {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  responseMimeType?: "text/plain" | "application/json";
}

export interface GenerateResult {
  text: string;
  model: string;
  finishReason?: string;
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  if (!isVertexConfigured()) {
    throw new Error("vertex: GOOGLE_CLOUD_PROJECT not configured");
  }
  const url = endpoint(config.VERTEX_GEMINI_MODEL, "generateContent");
  const body = {
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    ...(opts.system
      ? { systemInstruction: { parts: [{ text: opts.system }] } }
      : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxTokens ?? 2048,
      ...(opts.responseMimeType
        ? { responseMimeType: opts.responseMimeType }
        : {}),
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`vertex.generate ${res.status}: ${detail}`);
  }
  type GenerateResponse = {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };
  const data = (await res.json()) as GenerateResponse;
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";
  return {
    text,
    model: config.VERTEX_GEMINI_MODEL,
    ...(data.candidates?.[0]?.finishReason
      ? { finishReason: data.candidates[0].finishReason }
      : {}),
  };
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (!isVertexConfigured()) {
    throw new Error("vertex: GOOGLE_CLOUD_PROJECT not configured");
  }
  if (texts.length === 0) return [];
  const url = endpoint(config.VERTEX_EMBEDDING_MODEL, "predict");
  const body = {
    instances: texts.map((t) => ({ content: t, task_type: "RETRIEVAL_DOCUMENT" })),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`vertex.embed ${res.status}: ${detail}`);
  }
  type EmbedResponse = {
    predictions?: Array<{ embeddings?: { values?: number[] } }>;
  };
  const data = (await res.json()) as EmbedResponse;
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    const values = data.predictions?.[i]?.embeddings?.values;
    if (!values) {
      throw new Error(`vertex.embed: missing embedding at index ${i}`);
    }
    vectors.push(values);
  }
  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  const url = endpoint(config.VERTEX_EMBEDDING_MODEL, "predict");
  const body = {
    instances: [{ content: text, task_type: "RETRIEVAL_QUERY" }],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`vertex.embedQuery ${res.status}: ${detail}`);
  }
  type EmbedResponse = {
    predictions?: Array<{ embeddings?: { values?: number[] } }>;
  };
  const data = (await res.json()) as EmbedResponse;
  const values = data.predictions?.[0]?.embeddings?.values;
  if (!values) throw new Error("vertex.embedQuery: missing embedding");
  return values;
}
