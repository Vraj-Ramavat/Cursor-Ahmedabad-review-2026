"""Voice intake: browser STT/TTS on the dashboard; Whisper/TTS APIs removed.

Cursor API keys do not provide speech-to-text or text-to-speech endpoints.
The doctor dashboard uses Chrome Web Speech + female browser TTS (nurseVoice.js).
These endpoints remain as soft stubs so older clients degrade cleanly.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.schemas import VoiceTranscribeResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/voice", tags=["voice"])


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=800)
    voice: str = "browser-female"


@router.post("/transcribe", response_model=VoiceTranscribeResponse)
async def transcribe(file: UploadFile = File(...)):
    # Cursor has no STT. Client should use Web Speech API (already wired).
    _ = await file.read()
    logger.info("voice STT stub: use browser SpeechRecognition on dashboard")
    return VoiceTranscribeResponse(text=None, status="pending — retry")


@router.post("/speak")
async def speak(req: SpeakRequest):
    # Cursor has no TTS. Client uses speechSynthesis female voice.
    _ = req.text
    return Response(
        content=b"",
        status_code=503,
        headers={"X-Voice-Status": "use-browser-tts"},
    )
