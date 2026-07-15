"""search_memory ToolDef — wraps the hybrid retrieval function."""
from __future__ import annotations

from app.agent.tools.search_memory import search_memory
from app.agent.types import ToolDef

_DECL = {
    "name": "search_memory",
    "description": (
        "Hybrid retrieval across Alex's professional memory (emails, calendar, meeting notes, "
        "shared docs, slack, personal jots). Runs $vectorSearch (semantic) and $search (BM25) in "
        "parallel, merges via Reciprocal Rank Fusion, and optionally reranks the top candidates with "
        "an LLM pass for harder queries. Returns ranked chunks with citations."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "query": {"type": "string", "description": "Focused question or phrase to match against memory."},
            "limit": {"type": "integer", "description": "Max chunks to return. Default 8, max 20."},
            "source": {
                "type": "string",
                "enum": ["email", "calendar", "meeting_notes", "shared_doc", "slack", "notes"],
                "description": "Optional filter to one source kind.",
            },
            "rerank": {"type": "boolean", "description": "Set true to apply an LLM rerank pass over the top candidates."},
        },
        "required": ["query"],
    },
}


async def _handler(args: dict, ctx: dict | None = None) -> dict:
    return await search_memory(
        query=str(args.get("query", "")),
        limit=args.get("limit", 8),
        source=args.get("source") if isinstance(args.get("source"), str) else None,
        rerank=args.get("rerank") is True,
    )


tool = ToolDef(declaration=_DECL, handler=_handler)
