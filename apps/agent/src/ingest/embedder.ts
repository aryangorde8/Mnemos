import { embed } from "../lib/vertex.js";

const BATCH = 5;

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const vectors = await embed(slice);
    out.push(...vectors);
  }
  return out;
}
