const TARGET_CHARS = 720;
const HARD_MAX = 1100;
const OVERLAP_CHARS = 140;

export interface Chunk {
  text: string;
  ordinal: number;
}

export function chunk(text: string): Chunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  let buffer = "";
  let ordinal = 0;

  const flush = () => {
    const t = buffer.trim();
    if (!t) return;
    chunks.push({ text: t, ordinal: ordinal++ });
    buffer = OVERLAP_CHARS > 0 ? tailOverlap(t, OVERLAP_CHARS) : "";
  };

  for (const para of paragraphs) {
    if (para.length > HARD_MAX) {
      if (buffer) flush();
      for (const piece of splitSentence(para, TARGET_CHARS, HARD_MAX)) {
        buffer = (buffer ? buffer + "\n\n" : "") + piece;
        if (buffer.length >= TARGET_CHARS) flush();
      }
      continue;
    }
    const next = buffer ? buffer + "\n\n" + para : para;
    if (next.length > HARD_MAX) {
      flush();
      buffer = buffer ? buffer + para : para;
    } else {
      buffer = next;
    }
    if (buffer.length >= TARGET_CHARS) flush();
  }
  if (buffer.trim()) flush();
  return chunks;
}

function tailOverlap(text: string, n: number): string {
  if (text.length <= n) return text;
  const slice = text.slice(text.length - n);
  const breakAt = slice.search(/[.!?]\s|\n/);
  return breakAt >= 0 ? slice.slice(breakAt + 1).trim() : slice.trim();
}

function splitSentence(para: string, target: number, hardMax: number): string[] {
  const sentences = para.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/g);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    const candidate = buf ? buf + " " + s : s;
    if (candidate.length > hardMax) {
      if (buf) out.push(buf);
      if (s.length > hardMax) {
        for (let i = 0; i < s.length; i += target) {
          out.push(s.slice(i, i + target));
        }
        buf = "";
      } else {
        buf = s;
      }
    } else {
      buf = candidate;
    }
    if (buf.length >= target) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}
