"""Re-embed every chunk's text with the active embedding model.

Needed when the embedding provider/model changes (e.g. moving to Bedrock Titan):
the stored document vectors must come from the same model as query vectors, or
vector search returns nothing useful. Reads each chunk's `text`, re-embeds it,
and writes back `embedding` in batches.

  apps/agent-py/.venv/bin/python apps/agent-py/scripts/reembed_chunks.py

Idempotent and resumable — safe to re-run. After it finishes, (re)create the
Atlas vector index at the new dimension via setup_mongo_index.py.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # apps/agent-py

from app.config import embed_provider, embedding_dims, settings  # noqa: E402
from app.db.mongo import collection  # noqa: E402
from app.llm.genai_client import embed  # noqa: E402

BATCH = 16


async def main() -> None:
    if embed_provider() == "missing":
        print("no embedding provider configured", file=sys.stderr)
        sys.exit(1)
    chunks = collection("chunks")
    total = await chunks.count_documents({})
    print(f"re-embedding {total} chunks via {embed_provider()} "
          f"({settings.bedrock_embed_model if embed_provider() == 'bedrock' else settings.vertex_embedding_model}, "
          f"{embedding_dims()}d)")

    done = 0
    batch: list[dict] = []

    async def flush(rows: list[dict]) -> None:
        nonlocal done
        vectors = await embed([r["text"] or "" for r in rows])
        for r, v in zip(rows, vectors):
            await chunks.update_one({"_id": r["_id"]}, {"$set": {"embedding": v}})
        done += len(rows)
        print(f"  {done}/{total}", end="\r", flush=True)

    cursor = chunks.find({}, projection={"_id": 1, "text": 1})
    async for doc in cursor:
        batch.append(doc)
        if len(batch) >= BATCH:
            await flush(batch)
            batch = []
    if batch:
        await flush(batch)

    print(f"\ndone — re-embedded {done} chunks. Now (re)create the vector index:")
    print("  apps/agent-py/.venv/bin/python apps/agent-py/scripts/setup_mongo_index.py")


if __name__ == "__main__":
    asyncio.run(main())
