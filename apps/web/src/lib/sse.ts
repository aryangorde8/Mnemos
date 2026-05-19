const AGENT_URL =
  process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8787";

export interface AgentEventEnvelope {
  event: string;
  data: unknown;
}

export interface AskOptions {
  query: string;
  maxTurns?: number;
  signal?: AbortSignal;
  onEvent: (envelope: AgentEventEnvelope) => void;
}

async function streamSSE(
  url: string,
  body: unknown,
  signal: AbortSignal | undefined,
  onEvent: (envelope: AgentEventEnvelope) => void,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`sse ${res.status}: ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      processBlock(block);
    }
  }

  if (buffer.trim().length > 0) processBlock(buffer);

  function processBlock(block: string): void {
    const lines = block.split("\n");
    let dataStr = "";
    let eventName = currentEvent;
    for (const raw of lines) {
      if (!raw || raw.startsWith(":")) continue;
      const idx = raw.indexOf(":");
      const field = idx >= 0 ? raw.slice(0, idx) : raw;
      const value = idx >= 0 ? raw.slice(idx + 1).trimStart() : "";
      if (field === "event") eventName = value;
      else if (field === "data") dataStr += dataStr ? "\n" + value : value;
    }
    currentEvent = eventName;
    if (!dataStr) return;
    let parsed: unknown = dataStr;
    try { parsed = JSON.parse(dataStr); } catch { /* keep as string */ }
    onEvent({ event: eventName, data: parsed });
  }
}

export async function streamAsk({
  query,
  maxTurns,
  signal,
  onEvent,
}: AskOptions): Promise<void> {
  return streamSSE(
    `${AGENT_URL}/agent/ask`,
    { query, ...(maxTurns ? { maxTurns } : {}) },
    signal,
    onEvent,
  );
}

export interface BriefingStreamOptions {
  eventId?: string;
  eventTitle?: string;
  signal?: AbortSignal;
  onEvent: (envelope: AgentEventEnvelope) => void;
}

export async function streamBriefing({
  eventId,
  eventTitle,
  signal,
  onEvent,
}: BriefingStreamOptions): Promise<void> {
  return streamSSE(
    `${AGENT_URL}/briefings/generate`,
    {
      ...(eventId ? { event_id: eventId } : {}),
      ...(eventTitle ? { event_title: eventTitle } : {}),
    },
    signal,
    onEvent,
  );
}

export interface DebateOptions {
  query: string;
  signal?: AbortSignal;
  onEvent: (envelope: AgentEventEnvelope) => void;
}

export async function streamDebate({ query, signal, onEvent }: DebateOptions): Promise<void> {
  return streamSSE(`${AGENT_URL}/debate`, { query }, signal, onEvent);
}
