"""draft_email — port of apps/agent/src/agent/tools/draft-email.ts."""
from __future__ import annotations

import time
from pathlib import Path

from app.agent.types import ToolDef
from app.lib.actions import record_action
from app.llm.genai_client import generate

_DEFAULT_VOICE = (
    'Alex Chen\'s voice: warm but direct; lowercase-leaning openings; uses em-dashes; signs "a." '
    '(single letter + period); avoids exclamation marks; asks at most one clarifying question; never '
    'uses "Hope this finds you well," "circle back," or AI-stock phrases. Sentences are short. '
    "Specifics over generalities."
)
# apps/agent-py/app/agent/tools/draft_email.py -> parents[5] == repo root
_VOICE_FILE = Path(__file__).resolve().parents[5] / "scripts" / "fixtures" / "alex-voice.md"

_cache: dict = {"voice": None, "at": 0.0}


def _load_voice() -> str:
    now = time.time()
    if _cache["voice"] and now - _cache["at"] < 60:
        return _cache["voice"]
    try:
        md = _VOICE_FILE.read_text(encoding="utf-8").strip()
        _cache["voice"] = f"{_DEFAULT_VOICE}\n\n--- learned voice (from sampled outbound emails) ---\n{md}"
    except Exception:  # noqa: BLE001
        _cache["voice"] = _DEFAULT_VOICE
    _cache["at"] = now
    return _cache["voice"]


_DECL = {
    "name": "draft_email",
    "description": (
        "Compose a draft email in Alex's voice. The draft is NOT sent — it is returned for the user to "
        "approve, edit, or reject. Pass concrete context (e.g. retrieved chunks, key facts) so the draft "
        "is grounded."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "to": {"type": "array", "items": {"type": "string"}, "description": "Recipient email addresses."},
            "subject": {"type": "string", "description": "Subject line."},
            "intent": {"type": "string", "description": "One-sentence description of what the email should accomplish."},
            "context": {"type": "string", "description": "Relevant facts retrieved from memory that ground the draft."},
            "cc": {"type": "array", "items": {"type": "string"}, "description": "Optional cc recipients."},
        },
        "required": ["to", "subject", "intent"],
    },
}


async def _handler(args: dict, ctx: dict | None = None) -> dict:
    to = args.get("to") if isinstance(args.get("to"), list) else []
    cc = args.get("cc") if isinstance(args.get("cc"), list) else []
    subject = str(args.get("subject", "")).strip()
    intent = str(args.get("intent", "")).strip()
    context = str(args.get("context", "")).strip()
    if not to or not subject or not intent:
        return {"ok": False, "error": "to, subject, intent are required"}

    try:
        voice = _load_voice()
        prompt = f"""Write the BODY ONLY of an email Alex Chen would send.

Recipients: {', '.join(to)}
{('Cc: ' + ', '.join(cc) + chr(10)) if cc else ''}Subject: {subject}

Intent: {intent}

Grounding context (do not invent beyond this):
{context or '(none provided — keep the body terse and concrete; do not invent details)'}

{voice}

Rules:
- 3–7 short paragraphs maximum.
- No emoji. No "Hope this finds you well." No "circle back."
- End with "a." on its own line as the sign-off — nothing more.
- Do NOT include the subject line in the body.
- Do NOT include "To:" / "From:" headers."""

        # thinking_budget=0: a Gemini-only hint (ignored on Bedrock). On Gemini 3 Pro thinking
        # tokens are deducted from max_output_tokens, so leaving it on starved the body to empty.
        # The agent already reasoned in the ReAct loop; this call just writes the text.
        result = await generate(prompt, temperature=0.55, max_tokens=1024, thinking_budget=0)
        body = result.text.strip()
        if not body:  # never store an empty draft — surface a clear error to the loop instead
            return {"ok": False, "error": "draft generation returned an empty body; retry with more context"}
        proposal = {"to": to, "cc": cc, "subject": subject, "body": body, "intent": intent}

        action_id = None
        try:
            action_id = await record_action(
                kind="draft_email", proposal=proposal,
                query=(ctx or {}).get("query"), run_id=(ctx or {}).get("runId"),
                model=result.model, context=context or None,
            )
        except Exception:  # noqa: BLE001
            pass

        return {"ok": True, "data": {
            "actionId": action_id, "to": to, "cc": cc, "subject": subject, "body": body,
            "model": result.model, "intent": intent, "requiresApproval": True,
        }, "summary": f'drafted reply to {", ".join(to)}: "{subject}"{" · awaiting approval" if action_id else ""}'}
    except Exception as err:  # noqa: BLE001
        return {"ok": False, "error": str(err)}


tool = ToolDef(declaration=_DECL, handler=_handler)
