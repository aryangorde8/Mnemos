"""critique_draft — port of apps/agent/src/agent/tools/critique-draft.ts."""
from __future__ import annotations

import json

from app.agent.types import ToolDef
from app.lib.actions import get_action
from app.lib.critique import save_critique
from app.llm.genai_client import generate

CRITIC_SYSTEM = """You are the Critic — an adversarial reviewer for drafts authored by another agent for Alex Chen, a senior PM.

Your only job: catch problems before the user sees the draft. You are NOT writing the email. You are auditing it.

Look for, in this order:
  1. UNSUPPORTED CLAIMS — anything stated as fact that isn't in the cited context. This is the highest-severity issue.
  2. HALLUCINATED PEOPLE / DATES / TICKET IDS / DOLLAR FIGURES — anything specific that didn't come from the context.
  3. VOICE MISMATCH — Alex's voice is lowercase-leaning, terse, em-dash heavy, signs "a.", never uses "circle back" / "touch base" / "hope this finds you well" / "I wanted to reach out".
  4. STRUCTURAL ISSUES — missing the ask, buried the lead, weak open, wrong tone for the relationship.
  5. SAFETY — anything that would be embarrassing to send (commits to deadlines Alex hasn't agreed to, makes promises on behalf of others, leaks confidential figures to the wrong recipient).

Output STRICT JSON in this exact shape — no markdown fences, no prose outside the JSON:

{
  "verdict": "approve" | "revise" | "reject",
  "summary": "one sentence overall read",
  "findings": [
    {
      "severity": "high" | "medium" | "low",
      "claim": "the exact phrase from the draft you're objecting to (quoted, max 120 chars)",
      "issue": "what's wrong with it",
      "evidence": "supported" | "unsupported" | "contradicted" | "missing",
      "citation": "title of the chunk that informs the verdict, or null",
      "suggestion": "concrete revision Alex could paste in, or null"
    }
  ],
  "voice": { "score": 0-10, "notes": "one-sentence read on voice fidelity" }
}

Rules on verdicts:
- "approve" = no high-severity findings; safe to send
- "revise" = one or more medium/high findings the user should see before sending
- "reject" = a safety or factuality issue serious enough that sending would be a mistake

If the draft is genuinely fine, output { "verdict": "approve", "summary": "...", "findings": [], "voice": {...} }.
Do NOT fabricate findings to look thorough. Be honest. Brevity beats padding."""

_DECL = {
    "name": "critique_draft",
    "description": (
        "Run the adversarial Critic agent against a drafted email. Required after every draft_email call — "
        "the Critic checks for unsupported claims, hallucinated specifics, voice mismatches, and safety "
        "issues. Returns structured findings the user sees alongside the draft."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {"action_id": {"type": "string", "description": "The actionId returned by draft_email."}},
        "required": ["action_id"],
    },
}


def _norm_verdict(v):
    return v if v in ("approve", "revise", "reject") else "revise"


def _norm_severity(s):
    return s if s in ("high", "medium", "low") else "medium"


def _norm_evidence(e):
    return e if e in ("supported", "unsupported", "contradicted", "missing") else "missing"


def _clamp_num(raw, lo, hi, default):
    try:
        return max(lo, min(hi, float(raw)))
    except (TypeError, ValueError):
        return default


async def _handler(args: dict, ctx: dict | None = None) -> dict:
    action_id = str(args.get("action_id", "")).strip()
    if not action_id:
        return {"ok": False, "error": "action_id is required"}
    action = await get_action(action_id)
    if not action:
        return {"ok": False, "error": f"action {action_id} not found"}
    if action["kind"] != "draft_email":
        return {"ok": False, "error": f"critique_draft only supports draft_email, got {action['kind']}"}

    draft = action["proposal"]
    context = action.get("context") or "(no grounding context recorded — treat all specifics as unsupported)"
    cc = draft.get("cc") or []
    prompt = f"""DRAFT under review:

To: {', '.join(draft['to'])}
{('Cc: ' + ', '.join(cc) + chr(10)) if cc else ''}Subject: {draft['subject']}

Intent (stated by the primary agent): {draft.get('intent', '')}

---
Body:

{draft['body']}

---
GROUNDING CONTEXT the primary agent claims to have used (this is your source of truth — anything in the draft not derivable from this is unsupported):

{context}

---

Now audit. Return JSON only."""

    try:
        result = await generate(prompt, system=CRITIC_SYSTEM, temperature=0.2, max_tokens=1200,
                                response_mime_type="application/json")
        try:
            parsed = json.loads(result.text)
        except json.JSONDecodeError:
            return {"ok": False, "error": "critic returned invalid JSON"}

        verdict = _norm_verdict(parsed.get("verdict"))
        findings = []
        for f in (parsed.get("findings") or []):
            fd = {
                "severity": _norm_severity(f.get("severity")),
                "claim": (f.get("claim") or "")[:200] if isinstance(f.get("claim"), str) else "",
                "issue": f.get("issue") if isinstance(f.get("issue"), str) else "",
                "evidence": _norm_evidence(f.get("evidence")),
            }
            if isinstance(f.get("citation"), str) and f["citation"]:
                fd["citation"] = f["citation"]
            if isinstance(f.get("suggestion"), str) and f["suggestion"]:
                fd["suggestion"] = f["suggestion"]
            findings.append(fd)
        voice = {"score": _clamp_num((parsed.get("voice") or {}).get("score"), 0, 10, 7),
                 "notes": (parsed.get("voice") or {}).get("notes") if isinstance((parsed.get("voice") or {}).get("notes"), str) else ""}
        summary = parsed.get("summary") if isinstance(parsed.get("summary"), str) else ""

        critique_id = None
        try:
            rec = {"actionId": action_id, "verdict": verdict, "summary": summary,
                   "findings": findings, "voice": voice}
            if (ctx or {}).get("runId"):
                rec["runId"] = ctx["runId"]
            if (ctx or {}).get("query"):
                rec["query"] = ctx["query"]
            if result.model:
                rec["model"] = result.model
            critique_id = await save_critique(rec)
        except Exception:  # noqa: BLE001
            pass

        high = sum(1 for f in findings if f["severity"] == "high")
        med = sum(1 for f in findings if f["severity"] == "medium")
        low = sum(1 for f in findings if f["severity"] == "low")
        return {"ok": True, "data": {
            "critiqueId": critique_id, "actionId": action_id, "verdict": verdict, "summary": summary,
            "findings": findings, "voice": voice, "counts": {"high": high, "med": med, "low": low},
        }, "summary": f"critic · {verdict} · {high}H / {med}M / {low}L · voice {voice['score']}/10"}
    except Exception as err:  # noqa: BLE001
        return {"ok": False, "error": str(err)}


tool = ToolDef(declaration=_DECL, handler=_handler)
