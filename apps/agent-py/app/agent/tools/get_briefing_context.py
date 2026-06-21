"""get_briefing_context — port of apps/agent/src/agent/tools/get-briefing-context.ts."""
from __future__ import annotations

from app.agent.types import ToolDef
from app.config import settings
from app.db.mongo import chunks, documents
from app.llm.genai_client import embed_query

_DECL = {
    "name": "get_briefing_context",
    "description": (
        "Compose context for a 1-pager briefing on a calendar event: attendees, open threads with them, "
        "outstanding commitments, and recent artifacts referenced. Use the event title or id."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "event_title": {"type": "string", "description": "Title of the calendar event (substring match)."},
            "event_id": {"type": "string", "description": "Optional Mongo _id of the calendar event document."},
        },
    },
}

_COMMIT_RX = r"(owe|owed|will deliver|by Friday|by Mon|by Tue|by Wed|by Thu|by EOD|by next|committed|promised)"


async def _handler(args: dict, ctx: dict | None = None) -> dict:
    try:
        event_title = args["event_title"].strip() if isinstance(args.get("event_title"), str) else ""
        if not event_title and not args.get("event_id"):
            return {"ok": False, "error": "either event_title or event_id is required"}

        event = await documents().find_one({"source": "calendar", "title": {"$regex": event_title, "$options": "i"}}) if event_title else None
        if not event:
            return {"ok": False, "error": f'no calendar event matching "{event_title}"'}

        md = event.get("metadata") or {}
        attendees = md.get("attendees") or []
        thread_id = md.get("threadId")

        vector = await embed_query(f"{event['title']}\n\n{event.get('body') or ''}")
        related = await chunks().aggregate([
            {"$vectorSearch": {"index": settings.mongodb_vector_index, "path": "embedding",
                               "queryVector": vector, "numCandidates": 200, "limit": 8}},
            {"$project": {"_id": 1, "documentId": 1, "source": 1, "title": 1, "text": 1, "ordinal": 1,
                          "score": {"$meta": "vectorSearchScore"}, "metadata": 1}},
        ]).to_list(length=None)

        commit_flt = ({"metadata.threadId": thread_id} if thread_id
                      else {"text": {"$regex": _COMMIT_RX, "$options": "i"}})
        commit_chunks = await chunks().find(
            commit_flt, projection={"_id": 1, "title": 1, "source": 1, "text": 1, "metadata": 1}, limit=12
        ).to_list(length=None)

        citations = [{
            "chunkId": str(r["_id"]), "documentId": str(r.get("documentId", "")), "source": r.get("source"),
            "title": str(r.get("title", "")), "score": float(r.get("score", 0)), "ordinal": int(r.get("ordinal", 0)),
        } for r in related]

        return {"ok": True, "data": {
            "event": {
                "id": str(event["_id"]), "title": event["title"],
                "when": md.get("eventTime") or md.get("date"), "location": md.get("eventLocation"),
                "organizer": md.get("organizer"), "attendees": attendees,
                "agendaExcerpt": (event.get("body") or "")[:360] if isinstance(event.get("body"), str) else None,
            },
            "related": [{"chunkId": str(r["_id"]), "title": r.get("title"), "source": r.get("source"),
                         "score": r.get("score"), "text": (r.get("text") or "")[:280]} for r in related],
            "commitmentLeads": [{"chunkId": str(c["_id"]), "title": c.get("title"), "source": c.get("source"),
                                 "excerpt": (c.get("text") or "")[:280]} for c in commit_chunks],
        }, "citations": citations,
            "summary": f'briefing pulled for "{event["title"]}" — {len(related)} related, {len(commit_chunks)} commitment leads'}
    except Exception as err:  # noqa: BLE001
        return {"ok": False, "error": str(err)}


tool = ToolDef(declaration=_DECL, handler=_handler)
