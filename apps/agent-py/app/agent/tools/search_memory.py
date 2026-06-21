"""Hybrid retrieval — port of apps/agent/src/agent/tools/search-memory.ts.

Pipeline (same order as the TS tool):
  1. $vectorSearch over chunks.embedding (semantic, cosine)
  2. $search over chunks.{text,title} (lexical BM25 via lucene.english)
  3. Reciprocal Rank Fusion merges the two ranked lists (k=60)
  4. Optional Gemini rerank over the top candidates
"""
from __future__ import annotations

import json
import time
from typing import Any

from app.config import settings
from app.db.mongo import chunks
from app.llm.genai_client import embed_query, generate


def _clamp_int(raw: Any, default: int, lo: int, hi: int) -> int:
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def _to_raw_hit(r: dict) -> dict:
    return {
        "_id": str(r.get("_id", "")),
        "documentId": str(r.get("documentId", "")),
        "source": r.get("source"),
        "title": str(r.get("title", "")),
        "text": r.get("text") if isinstance(r.get("text"), str) else "",
        "ordinal": int(r.get("ordinal", 0)),
        "metadata": r.get("metadata") or {},
        "score": float(r.get("score", 0)),
    }


async def _run_vector(query: str, limit: int, source: str | None) -> list[dict]:
    vector = await embed_query(query)
    vs: dict = {
        "index": settings.mongodb_vector_index,
        "path": "embedding",
        "queryVector": vector,
        "numCandidates": max(100, limit * 10),
        "limit": limit,
    }
    if source:
        vs["filter"] = {"source": source}
    pipeline = [
        {"$vectorSearch": vs},
        {"$project": {
            "_id": 1, "documentId": 1, "source": 1, "title": 1, "text": 1,
            "ordinal": 1, "metadata": 1, "score": {"$meta": "vectorSearchScore"},
        }},
    ]
    rows = await chunks().aggregate(pipeline).to_list(length=None)
    return [_to_raw_hit(r) for r in rows]


async def _run_text(query: str, limit: int, source: str | None) -> list[dict]:
    must: list[dict] = [
        {"text": {"query": query, "path": ["text", "title"],
                  "fuzzy": {"maxEdits": 1, "prefixLength": 2}}},
    ]
    if source:
        must.append({"equals": {"path": "source", "value": source}})
    pipeline = [
        {"$search": {"index": settings.mongodb_text_index, "compound": {"must": must}}},
        {"$limit": limit},
        {"$project": {
            "_id": 1, "documentId": 1, "source": 1, "title": 1, "text": 1,
            "ordinal": 1, "metadata": 1, "score": {"$meta": "searchScore"},
        }},
    ]
    try:
        rows = await chunks().aggregate(pipeline).to_list(length=None)
        return [_to_raw_hit(r) for r in rows]
    except Exception as err:  # noqa: BLE001
        # Atlas Search index may not be live yet — degrade to vector-only.
        if "index" in str(err).lower() or "search" in str(err).lower():
            return []
        raise


def _rrf_merge(lists: list[list[dict]], k: int) -> list[dict]:
    """Reciprocal Rank Fusion — Cormack et al, k=60 by convention."""
    by_id: dict[str, dict] = {}
    for li, lst in enumerate(lists):
        for rank, hit in enumerate(lst):
            hid = hit["_id"]
            contribution = 1.0 / (k + rank + 1)
            existing = by_id.get(hid)
            if existing:
                existing["fused"] += contribution
                if li == 0:
                    existing["fromVector"] = True
                else:
                    existing["fromText"] = True
            else:
                by_id[hid] = {**hit, "fused": contribution,
                              "fromVector": li == 0, "fromText": li == 1}
    arr = sorted(by_id.values(), key=lambda h: h["fused"], reverse=True)
    for h in arr:
        h["score"] = h["fused"]
    return arr


async def _rerank_with_gemini(query: str, candidates: list[dict]) -> list[dict] | None:
    if len(candidates) <= 1:
        return candidates
    numbered = "\n\n".join(
        f"[{i}] {c['title']} — {c['text'][:280]}" for i, c in enumerate(candidates)
    )
    prompt = (
        f'Query: "{query}"\n\n'
        f"Rerank these {len(candidates)} retrieved chunks by relevance to the query, best to worst.\n\n"
        "Output ONLY a JSON object — no preamble, no markdown. The first character must be '{'.\n\n"
        f'Schema: {{"order":[<index>,...]}}  — exactly {len(candidates)} integers in '
        f"[0,{len(candidates) - 1}], no duplicates.\n\nChunks:\n{numbered}"
    )
    try:
        r = await generate(
            prompt,
            system="You are a retrieval reranker. Your entire response is a single JSON object — never prose.",
            temperature=0,
            max_tokens=2048,
            response_mime_type="application/json",
            thinking_budget=0,
        )
        text = r.text.strip()
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            return None
        parsed = json.loads(text[start:end + 1])
        order = parsed.get("order")
        if not isinstance(order, list):
            return None
        order = [n for n in order if isinstance(n, int) and 0 <= n < len(candidates)]
        if not order:
            return None
        seen: set[int] = set()
        reordered: list[dict] = []
        for idx in order:
            if idx in seen:
                continue
            seen.add(idx)
            reordered.append(candidates[idx])
        for i in range(len(candidates)):
            if i not in seen:
                reordered.append(candidates[i])
        return reordered
    except Exception:  # noqa: BLE001
        return None


def _shape(query: str, hits: list[dict], phases: list[str], took_ms: int) -> dict:
    citations = [{
        "chunkId": r["_id"], "documentId": r["documentId"], "source": r["source"],
        "title": r["title"], "score": r["score"], "ordinal": r["ordinal"],
        "text": r["text"][:300],
    } for r in hits]
    data = {
        "query": query,
        "count": len(hits),
        "phases": phases,
        "tookMs": took_ms,
        "chunks": [{
            "chunkId": r["_id"], "title": r["title"], "source": r["source"],
            "score": r["score"], "ordinal": r["ordinal"], "text": r["text"],
            "metadata": r["metadata"],
            **({"fromVector": r["fromVector"]} if "fromVector" in r else {}),
            **({"fromText": r["fromText"]} if "fromText" in r else {}),
        } for r in hits],
    }
    return {"ok": True, "data": data, "citations": citations,
            "summary": f"hybrid · {' → '.join(phases)} · {took_ms}ms"}


async def search_memory(query: str, limit: int = 8, source: str | None = None,
                        rerank: bool = False) -> dict:
    query = (query or "").strip()
    if not query:
        return {"ok": False, "error": "missing query"}
    limit = _clamp_int(limit, 8, 1, 20)
    candidate_pool = max(20, limit * 3)
    try:
        t0 = time.monotonic()
        import asyncio
        vector_hits, text_hits = await asyncio.gather(
            _run_vector(query, candidate_pool, source),
            _run_text(query, candidate_pool, source),
        )
        merged = _rrf_merge([vector_hits, text_hits], 60)
        to_rerank = merged[: min(len(merged), limit * 2)] if rerank else merged[:limit]

        final = to_rerank
        reranked = False
        if rerank and len(to_rerank) > 1:
            reorder = await _rerank_with_gemini(query, to_rerank)
            if reorder and len(reorder) == len(to_rerank):
                final = reorder[:limit]
                reranked = True
            else:
                final = to_rerank[:limit]
        elif not rerank:
            final = to_rerank[:limit]

        took_ms = int((time.monotonic() - t0) * 1000)
        phases = [
            f"vector {len(vector_hits)}",
            f"bm25 {len(text_hits)}",
            f"rrf → {len(merged)}",
            f"rerank · gemini · top {len(final)}" if reranked else f"top {len(final)}",
        ]
        return _shape(query, final, phases, took_ms)
    except Exception as err:  # noqa: BLE001
        return {"ok": False, "error": str(err)}
