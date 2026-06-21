"""Batched embedding — port of apps/agent/src/ingest/embedder.ts."""
from __future__ import annotations

from app.llm.genai_client import embed

BATCH = 5


async def embed_batch(texts: list[str]) -> list[list[float]]:
    out: list[list[float]] = []
    for i in range(0, len(texts), BATCH):
        out.extend(await embed(texts[i:i + BATCH]))
    return out
