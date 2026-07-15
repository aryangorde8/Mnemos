"""Generate + load synthetic corpus for Alex Chen — port of scripts/seed-alex-data.ts.

Reuses the Python backend's genai client, ingestion, and extraction directly
(no running server required).

  python apps/agent-py/scripts/seed_alex_data.py             # generate JSON fixture
  python apps/agent-py/scripts/seed_alex_data.py --load      # generate + ingest + build graph/ledger
  python apps/agent-py/scripts/seed_alex_data.py --load-only # load existing fixture
"""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # apps/agent-py

from app.agent.extract_commitments import run_commitment_extraction  # noqa: E402
from app.agent.extract_graph import run_graph_extraction  # noqa: E402
from app.config import active_model_label, is_llm_configured  # noqa: E402
from app.db.mongo import chunks, documents  # noqa: E402
from app.ingest.chunker import chunk as chunk_text  # noqa: E402
from app.ingest.embedder import embed_batch  # noqa: E402
from app.llm.genai_client import generate  # noqa: E402

_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_PATH = _ROOT / "scripts" / "fixtures" / "alex-data.json"

WORLD = """Alex Chen — senior PM at "Helio", a Series B B2B analytics startup (~80 people).
Reports to Priya Iyer (VP Product). Owns the "Lantern" analytics workspace and the Q3 roadmap.
Today is Friday, 16 May 2026. The 2-week window covers 04 May 2026 – 16 May 2026, with a
few future-dated calendar invites stretching to 22 May.

Recurring cast — use these people consistently, with these styles:
  • Priya Iyer (VP Product, Alex's manager) — terse, asks for tradeoffs in bullet form.
  • Sarah Okafor (Director of Eng, Lantern team) — collaborative, asks for written context.
  • Marcus Bell (Senior PM, adjacent team) — friendly but pushy, asks for coffee chats and 1:1s.
  • Ben Aoki (Design Lead, Lantern) — wry, sends Figma links.
  • Mei Tanaka (Staff Eng, Lantern) — precise, drops architecture diagrams.
  • Diego Salas (CS Lead, Acme Co. account) — earnest, forwards customer complaints.
  • Acme Co. — top-10 customer, $480k ARR, pushing back on Q3 pricing change.
  • Helena Park (Recruiter) — runs the hiring pipeline.
  • Jorge Vega (Founding Eng, on parental leave until 28 May).
  • Tomas Reinholz (Eng Lead, Platform team) — pedantic, cc's everyone.
  • Layla Hassan (Sales AE) — sends deal-desk asks.
  • Noor Abadi (Designer, Lantern) — quiet, drops async loom links.

Style rules:
  • Emails feel like real corporate email — natural subject lines, threading,
    occasional one-line replies and forwards.
  • Calendar invites have time, location ("Zoom" or "HQ — Ada Room"), and 1-line agenda.
  • Meeting notes are bulleted, with attendees, decisions, and action items.
  • Shared docs are longer-form (3–6 short paragraphs).
  • Slack messages are short, casual, sometimes thread-quoted.
  • Personal notes are first-person voice memos to self, terse.
  • Realistic concrete details: file names, ticket IDs (LAN-2031), dollar figures,
    customer names. Never generic.
  • NO emojis. NO sparkles. NO "Hope this finds you well." NO "I'll circle back."
  • Times are ISO 8601 in America/New_York (Helio is NYC HQ)."""

THREADS = [
    {"key": "q3-planning", "label": "Q3 Planning + Eng Leads kickoff (Sarah, Priya, Mei)",
     "pitch": "Alex is preparing a Q3 planning doc due to Sarah by Friday 22 May. Priya wants a tight set of 3 themes. A kickoff meeting 'Q3 Planning with Eng Leads' is scheduled Wed 21 May at 2pm. Tradeoffs around scoping Lantern vs. shipping the audit-log work.",
     "mix": {"email": 18, "calendar": 6, "meeting_notes": 4, "shared_doc": 2, "slack": 4, "notes": 1}},
    {"key": "project-lantern", "label": "Project Lantern — design review and engineering trade-offs",
     "pitch": "Lantern is the new analytics workspace. Ben (design lead) just shared a v3 Figma. Mei flagged perf concerns on the query layer (LAN-2031, LAN-2044). Design review meeting was Wed 14 May. Open thread: do we cut the saved-view feature to make the 30 June launch.",
     "mix": {"email": 16, "calendar": 5, "meeting_notes": 5, "shared_doc": 3, "slack": 6, "notes": 1}},
    {"key": "marcus-coffee", "label": "Marcus Bell pinging for a 1:1 / coffee chat",
     "pitch": "Marcus has been asking Alex for time three times in two weeks — first a coffee chat, then a 'quick brain pick' on roadmap. Alex keeps deferring. Marcus will ask again on Mon 19 May. Tone: friendly but persistent. Alex needs to politely decline and propose Thursday 22 May at 2pm.",
     "mix": {"email": 7, "calendar": 2, "slack": 4, "notes": 1}},
    {"key": "sarah-q3-doc", "label": "Sarah expecting Alex's Q3 product doc by Friday",
     "pitch": "On 06 May Alex committed in writing to Sarah that the Q3 product doc would land by Fri 22 May EOD. Sarah followed up twice, friendly. Alex has a partial draft in a shared doc. This is the canonical 'commitment' the agent should surface in the ledger.",
     "mix": {"email": 10, "calendar": 1, "meeting_notes": 2, "shared_doc": 2, "slack": 3, "notes": 1}},
    {"key": "acme-pricing", "label": "Acme Co. pricing pushback — customer escalation",
     "pitch": "Acme Co. ($480k ARR) is unhappy about a Q3 pricing change. Diego forwarded a complaint email from Acme's procurement on 09 May. Layla (Sales AE) wants a deal-desk exception. Priya wants a clear recommendation by Tue 19 May. Real customer names, dollar figures, contract dates.",
     "mix": {"email": 14, "calendar": 3, "meeting_notes": 3, "shared_doc": 1, "slack": 3, "notes": 1}},
    {"key": "hiring-pm", "label": "Hiring a junior PM — three candidates in flight",
     "pitch": "Helena (recruiter) has three candidates in pipeline: Camila Reyes (strong), Anand Krishna (mixed signals), Yuki Sato (early). Onsite for Camila scheduled Mon 19 May. Debriefs follow. Alex owes Helena written feedback.",
     "mix": {"email": 10, "calendar": 5, "meeting_notes": 3, "shared_doc": 1, "slack": 2, "notes": 1}},
    {"key": "audit-log", "label": "Audit-log work — Platform team / Tomas",
     "pitch": "Tomas (Platform) is pushing audit-log refactor (PLT-880). He cc's everyone. Alex thinks it should slip to Q4. A short tense thread, a meeting notes file showing decision deferred, a couple of slack pings.",
     "mix": {"email": 8, "calendar": 2, "meeting_notes": 3, "shared_doc": 1, "slack": 3, "notes": 1}},
    {"key": "background", "label": "Background noise — unrelated daily life",
     "pitch": "A mix of unrelated everyday work: standup invites, an all-hands recording link, a benefits-enrollment reminder from HR, two notes Alex made to self, a few short slack threads about lunch, etc. These should NOT reference the main threads. Use minor named characters too (e.g. Jared from IT, Nina from HR).",
     "mix": {"email": 27, "calendar": 26, "meeting_notes": 12, "shared_doc": 2, "slack": 5, "notes": 3}},
]


async def generate_thread(spec: dict) -> list[dict]:
    if not is_llm_configured():
        raise RuntimeError("no LLM provider configured — set LLM_PROVIDER + credentials "
                           "(Bedrock/Gemini/Vertex)")
    targets = ", ".join(f"{k}: {v}" for k, v in spec["mix"].items())
    total = sum(spec["mix"].values())
    prompt = f"""{WORLD}

Generate a coherent narrative thread.

Thread key: "{spec['key']}"
Thread label: {spec['label']}
Thread pitch: {spec['pitch']}

Produce exactly {total} documents distributed by source: {targets}.
Spread the dates realistically across 04 May – 22 May 2026.
Each document must reference the same named people, projects, and commitments,
so a reader could reconstruct the storyline by reading them in chronological order.

Return ONLY valid JSON of shape:
{{
  "documents": [
    {{
      "source": "email" | "calendar" | "meeting_notes" | "shared_doc" | "slack" | "notes",
      "title": string,
      "body": string,
      "metadata": {{
        "date": ISO-8601 string in 2026-05-XX format,
        "threadKey": "{spec['key']}",
        "from"?: string, "to"?: string[], "cc"?: string[], "participants"?: string[],
        "eventTime"?: ISO string, "eventLocation"?: string, "ticket"?: string
      }}
    }}
  ]
}}
No markdown fences. No prose outside the JSON."""
    r = await generate(prompt, temperature=0.85, max_tokens=16384, response_mime_type="application/json")
    parsed = json.loads(r.text)
    docs = parsed.get("documents")
    if not isinstance(docs, list):
        raise RuntimeError(f"thread {spec['key']}: missing documents array")
    return docs


async def generate_all() -> list[dict]:
    out: list[dict] = []
    for spec in THREADS:
        print(f"  · thread {spec['key']} ... ", end="", flush=True)
        docs = await generate_thread(spec)
        print(f"{len(docs)} docs")
        out.extend(docs)
    return out


async def ingest_docs(docs: list[dict]) -> None:
    ok = fail = 0
    for i, doc in enumerate(docs):
        try:
            pieces = chunk_text(doc["body"])
            if not pieces:
                fail += 1
                continue
            ins = await documents().insert_one({
                "source": doc["source"], "title": doc["title"], "body": doc["body"],
                "metadata": doc.get("metadata") or {}, "createdAt": datetime.now(timezone.utc)})
            vectors = await embed_batch([p["text"] for p in pieces])
            await chunks().insert_many([{
                "documentId": ins.inserted_id, "source": doc["source"], "title": doc["title"],
                "text": p["text"], "ordinal": p["ordinal"], "embedding": vectors[j],
                "metadata": doc.get("metadata") or {}, "createdAt": datetime.now(timezone.utc)}
                for j, p in enumerate(pieces)])
            ok += 1
        except Exception as err:  # noqa: BLE001
            fail += 1
            print(f"  ! {i} {doc.get('title')}: {err}")
        if (i + 1) % 20 == 0:
            print(f"  loaded {i + 1} / {len(docs)}")
    print(f"load complete: {ok} ok, {fail} failed")


async def _drain(gen, label: str) -> None:
    print(f"building {label} ...")
    last = {}
    async for ev in gen:
        if ev.get("kind") in ("done", "error"):
            last = ev
    print(f"  {label} done: {json.dumps(last)}")


async def main() -> None:
    args = sys.argv[1:]
    load = "--load" in args
    load_only = "--load-only" in args
    fixture = FIXTURE_PATH
    if "--fixture" in args:
        idx = args.index("--fixture")
        if idx + 1 < len(args):
            fixture = Path(args[idx + 1]).resolve()

    if load_only:
        print(f"loading existing fixture from {fixture}")
        docs = json.loads(fixture.read_text(encoding="utf-8"))
    else:
        print(f"generating threads via {active_model_label()} ...")
        docs = await generate_all()
        fixture.parent.mkdir(parents=True, exist_ok=True)
        fixture.write_text(json.dumps(docs, indent=2), encoding="utf-8")
        print(f"wrote {len(docs)} docs → {fixture}")

    if load or load_only:
        print(f"ingesting {len(docs)} docs ...")
        await ingest_docs(docs)
        await _drain(run_graph_extraction(rebuild=True), "memory graph")
        await _drain(run_commitment_extraction(rebuild=True), "commitments ledger")


if __name__ == "__main__":
    asyncio.run(main())
