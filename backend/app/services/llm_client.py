"""LLM client via Cursor Agent SDK (replaces Groq).

WHY THE SCOPE IS NARROW
-----------------------
The LLM is permitted only three jobs: paraphrasing structured data into briefing
prose, and drafting the general self-care note. It must never emit a diagnosis,
drug name, dosage, or treatment recommendation.

WHY THE REDACTION GATE IS HERE
------------------------------
`_guarded_call` runs `redact()` on every outbound prompt before it leaves the
process. There is no code path that reaches Cursor without passing this gate.

DEGRADE BEHAVIOR
----------------
If CURSOR_API_KEY is unset or the call fails, methods return ok=False and
callers use local templates.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.services.cursor_client import prompt_text
from app.services.phi_redaction import RedactionResult, redact

logger = logging.getLogger(__name__)

_SELF_CARE_SYSTEM = (
    "You draft GENERAL self-care guidance for a patient awaiting a doctor. "
    "You MUST NOT name any medication, dosage, diagnosis, or treatment. "
    "Only general advice: rest, hydration, and clear signs that mean they should "
    "seek care sooner. Keep it to 3-4 short sentences. This draft is reviewed by "
    "a doctor before the patient ever sees it. Reply with only the patient-facing text."
)

_PARAPHRASE_SYSTEM = (
    "You convert structured intake data into a concise, neutral pre-visit briefing "
    "for a doctor. Summarize only what is given. Do NOT diagnose, do NOT suggest "
    "medications or treatments, do NOT infer severity. Plain clinical prose. "
    "Reply with only the briefing text."
)


@dataclass
class LLMOutcome:
    text: str | None
    redaction: RedactionResult | None
    ok: bool


def _guarded_call(
    system: str,
    user_content: str,
    correlation_id: str | None,
    redaction_sink=None,
) -> LLMOutcome:
    guarded = redact(user_content)
    if redaction_sink is not None:
        redaction_sink("cursor", guarded.redacted_categories, guarded.injection_flagged)
    logger.info(
        "llm_outbound",
        extra={
            "event": "llm_outbound",
            "provider": "cursor",
            "correlation_id": correlation_id,
            "redacted_categories": guarded.redacted_categories,
            "injection_flagged": guarded.injection_flagged,
        },
    )

    prompt = f"{system}\n\n---\n\n{guarded.text}"
    # Keep intake finalize snappy; Cursor local agents can be slow.
    text = prompt_text(prompt, timeout_s=12.0)
    if not text:
        return LLMOutcome(None, guarded, ok=False)
    return LLMOutcome(text, guarded, ok=True)


def paraphrase_briefing(
    structured_summary: dict, correlation_id: str | None = None, redaction_sink=None
) -> LLMOutcome:
    content = "Structured intake data:\n" + "\n".join(
        f"- {k}: {v}" for k, v in structured_summary.items()
    )
    return _guarded_call(_PARAPHRASE_SYSTEM, content, correlation_id, redaction_sink)


def draft_self_care_note(
    structured_summary: dict, correlation_id: str | None = None, redaction_sink=None
) -> LLMOutcome:
    content = (
        "Patient presentation (general, non-diagnostic):\n"
        + "\n".join(f"- {k}: {v}" for k, v in structured_summary.items())
    )
    return _guarded_call(_SELF_CARE_SYSTEM, content, correlation_id, redaction_sink)
