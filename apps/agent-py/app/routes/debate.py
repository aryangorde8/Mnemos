"""/debate — port of apps/agent/src/routes/debate.ts.

Runs Primary + Devil's Advocate in parallel, multiplexes both event streams
onto one SSE connection (tagged by agent), then a Synthesizer produces consensus.
"""
from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agent.debate_prompts import DEVIL_SYSTEM, PRIMARY_SYSTEM, SYNTHESIZER_SYSTEM
from app.agent.react_loop import run_agent
from app.llm.genai_client import generate

router = APIRouter()

_SSE_HEADERS = {"Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"}


class DebateBody(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    maxTurns: int | None = Field(default=None, ge=1, le=12)


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"


@router.post("/debate")
async def debate(body: DebateBody) -> StreamingResponse:
    query = body.query
    max_turns = body.maxTurns or 12

    async def gen():
        started = int(time.time() * 1000)
        yield ": connected\n\n"
        queue: asyncio.Queue = asyncio.Queue()
        collected = {"primary": {"answer": "", "citations": []}, "devil": {"answer": "", "citations": []}}

        async def tee(label: str, system: str):
            try:
                async for ev in run_agent(query, max_turns=max_turns, system_prompt=system):
                    await queue.put((label, ev))
                    if ev["kind"] == "answer":
                        collected[label]["answer"] += ev["chunk"]
                    elif ev["kind"] == "citations":
                        collected[label]["citations"] = ev["citations"]
                    if ev["kind"] in ("done", "error"):
                        break
            except Exception as err:  # noqa: BLE001
                await queue.put((label, {"kind": "error", "message": str(err), "at": int(time.time() * 1000)}))
            finally:
                await queue.put((label, None))

        yield _sse("debate_start", {"query": query, "agents": ["primary", "devil"], "at": started})
        t1 = asyncio.create_task(tee("primary", PRIMARY_SYSTEM))
        t2 = asyncio.create_task(tee("devil", DEVIL_SYSTEM))

        done = 0
        while done < 2:
            label, ev = await queue.get()
            if ev is None:
                done += 1
                continue
            yield _sse(ev["kind"], {"agent": label, **ev})
        await asyncio.gather(t1, t2, return_exceptions=True)

        have_primary = bool(collected["primary"]["answer"].strip())
        have_devil = bool(collected["devil"]["answer"].strip())
        if not have_primary and not have_devil:
            yield _sse("synthesis_error", {"message": "neither agent produced an answer"})
        else:
            seen, merged = set(), []
            for c in collected["primary"]["citations"] + collected["devil"]["citations"]:
                if c["chunkId"] not in seen:
                    seen.add(c["chunkId"])
                    merged.append(c)
            yield _sse("synthesis_start", {"mergedCitations": len(merged), "at": int(time.time() * 1000)})
            try:
                cite_list = "\n".join(f"[{i+1}] ({c['source']}) \"{c['title']}\"" for i, c in enumerate(merged))
                prompt = (f"USER QUERY:\n{query}\n\nPRIMARY ANSWER:\n{collected['primary']['answer'] or '(no answer)'}\n\n"
                          f"DEVIL'S ADVOCATE ANSWER:\n{collected['devil']['answer'] or '(no answer)'}\n\n"
                          f"MERGED CITATION LIST (1-indexed):\n{cite_list}\n\nProduce the three-paragraph synthesis now.")
                r = await generate(prompt, system=SYNTHESIZER_SYSTEM, temperature=0.45, max_tokens=1800, thinking_budget=0)
                yield _sse("synthesis", {"text": r.text.strip(), "citations": merged, "model": r.model,
                                         "at": int(time.time() * 1000)})
            except Exception as err:  # noqa: BLE001
                yield _sse("synthesis_error", {"message": str(err), "at": int(time.time() * 1000)})

        yield _sse("debate_done", {"totalMs": int(time.time() * 1000) - started, "at": int(time.time() * 1000)})

    return StreamingResponse(gen(), media_type="text/event-stream", headers=_SSE_HEADERS)
