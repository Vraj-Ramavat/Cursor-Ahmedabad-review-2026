"""Meal recommendation endpoints — Eatvisor 15-day plan + persistence."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.auth import get_current_patient
from app.core.database import get_db
from app.models import IntakeSession, Patient
from app.services.meal_engine import recommend_meals
from app.services.youtube_service import search_videos

router = APIRouter(prefix="/api/meals", tags=["meals"])


def _profile(patient: Patient, complaint: str | None = None) -> dict:
    return {
        "age": patient.age,
        "gender": patient.gender,
        "weight_kg": patient.weight_kg,
        "height_cm": patient.height_cm,
        "diet_type": patient.diet_type,
        "conditions": patient.conditions or [],
        "allergies": patient.allergies or [],
        "goal": patient.goal,
        "activity_level": patient.activity_level,
        "dislikes": patient.dislikes or [],
        "current_complaint": complaint,
    }


@router.get("/current")
def current_plan(patient: Patient = Depends(get_current_patient)):
    """Return the last saved 15-day plan (does not regenerate)."""
    plan = patient.meal_plan
    if not plan:
        raise HTTPException(status_code=404, detail="no meal plan yet — generate one")
    return plan


@router.get("/plan")
def meal_plan(
    days: int = Query(15, ge=1, le=15),
    session_id: str | None = None,
    include_videos: bool = True,
    persist: bool = True,
    patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    complaint = None
    if session_id:
        session = db.get(IntakeSession, session_id)
        if session and session.patient_id == patient.id:
            complaint = session.chief_complaint

    plan = recommend_meals(
        _profile(patient, complaint),
        days=days,
        include_videos=include_videos,
    )
    plan["created_at"] = datetime.now(timezone.utc).isoformat()
    plan["status"] = "active"
    plan["days_remaining"] = days
    if persist:
        patient.meal_plan = plan
        db.commit()
    return plan


@router.delete("/current")
def clear_plan(
    patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    patient.meal_plan = None
    db.commit()
    return {"ok": True}


@router.get("/videos")
def meal_videos(q: str = Query("healthy indian recipes", min_length=2)):
    return {"query": q, "videos": search_videos(q, max_results=5)}
