"""Cursor Agent SDK client — replaces Groq/Gemini for text + vision OCR.

Auth: CURSOR_API_KEY (+ optional CURSOR_API_KEY_2 for failover).
Uses local Agent.prompt / Agent.create with image attachments for prescriptions.
"""

from __future__ import annotations

import base64
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

_KEY_LOCK = threading.Lock()
_KEY_INDEX = 0


def cursor_keys() -> list[str]:
    keys = []
    for k in (settings.cursor_api_key, settings.cursor_api_key_2):
        k = (k or "").strip()
        if k and k not in keys:
            keys.append(k)
    return keys


def _next_key() -> str | None:
    global _KEY_INDEX
    keys = cursor_keys()
    if not keys:
        return None
    with _KEY_LOCK:
        key = keys[_KEY_INDEX % len(keys)]
        _KEY_INDEX += 1
        return key


def _workspace() -> str:
    # Local agent needs a cwd; use backend root (deterministic, small).
    return str(Path(__file__).resolve().parents[2])


def prompt_text(prompt: str, *, timeout_s: float = 45.0) -> str | None:
    """One-shot text generation via Cursor Agent.prompt with key rotation."""
    keys = cursor_keys()
    if not keys:
        logger.info("Cursor unavailable: no CURSOR_API_KEY")
        return None

    last_err = None
    for _ in range(len(keys)):
        key = _next_key()
        if not key:
            break
        try:
            from cursor_sdk import Agent, AgentOptions, LocalAgentOptions

            def _run() -> str:
                result = Agent.prompt(
                    prompt,
                    AgentOptions(
                        api_key=key,
                        model=settings.cursor_model or "composer-2.5",
                        local=LocalAgentOptions(cwd=_workspace()),
                    ),
                )
                if getattr(result, "status", None) == "error":
                    raise RuntimeError(f"cursor run error: {getattr(result, 'result', '')}")
                text = (getattr(result, "result", None) or "").strip()
                if not text:
                    raise RuntimeError("empty cursor result")
                return text

            with ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(_run).result(timeout=timeout_s)
        except FuturesTimeout:
            last_err = "timeout"
            logger.warning("Cursor prompt timed out; rotating key")
        except Exception as exc:
            last_err = exc
            logger.warning("Cursor prompt failed; rotating key: %s", exc)
    logger.warning("Cursor prompt failed all keys: %s", last_err)
    return None


def prompt_with_image(
    prompt: str,
    image_bytes: bytes,
    mime_type: str = "image/jpeg",
    *,
    timeout_s: float = 90.0,
) -> str | None:
    """Vision-style extraction: send image + text prompt to Cursor agent."""
    keys = cursor_keys()
    if not keys or not image_bytes:
        return None

    mime = (mime_type or "image/jpeg").split(";")[0].strip() or "image/jpeg"
    b64 = base64.b64encode(image_bytes).decode("ascii")

    last_err = None
    for _ in range(len(keys)):
        key = _next_key()
        if not key:
            break
        try:
            from cursor_sdk import Agent, LocalAgentOptions

            def _run() -> str:
                with Agent.create(
                    model=settings.cursor_model or "composer-2.5",
                    api_key=key,
                    local=LocalAgentOptions(cwd=_workspace()),
                ) as agent:
                    run = agent.send(
                        {
                            "text": prompt,
                            "images": [{"data": b64, "mime_type": mime}],
                        }
                    )
                    text = (run.text() or "").strip()
                    if not text:
                        raise RuntimeError("empty cursor vision result")
                    return text

            with ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(_run).result(timeout=timeout_s)
        except FuturesTimeout:
            last_err = "timeout"
            logger.warning("Cursor vision timed out; rotating key")
        except Exception as exc:
            last_err = exc
            logger.warning("Cursor vision failed; rotating key: %s", exc)
    logger.warning("Cursor vision failed all keys: %s", last_err)
    return None
