"""Patient accounts: register / login / profile / visit history.

Phone-number based accounts so the same patient persists across visits and the
doctor sees history instead of anonymous intakes. Auth is a demo-grade bearer
token stored on the Patient row (documented for replacement with JWT/ABHA auth
in production — see ARCHITECTURE.md). Every profile read is audit-logged.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Briefing, IntakeSession, Patient, QueueEntry
from app.services import audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    name: str
    phone: str
    age: int | None = None
    gender: str | None = None
    abha_id: str | None = None


class LoginRequest(BaseModel):
    phone: str


class HealthProfileRequest(BaseModel):
    weight_kg: float | None = None
    height_cm: float | None = None
    diet_type: str | None = None
    conditions: list[str] | None = None
    allergies: list[str] | None = None
    goal: str | None = None
    activity_level: str | None = None
    dislikes: list[str] | None = None


class AccountOut(BaseModel):
    patient_id: str
    token: str
    name: str
    phone: str | None
    age: int | None
    gender: str | None
    abha_id: str | None
    weight_kg: float | None
    height_cm: float | None
    diet_type: str | None
    conditions: list
    allergies: list
    goal: str | None = None
    activity_level: str | None = None
    dislikes: list = []


class VisitSummaryOut(BaseModel):
    session_id: str
    chief_complaint: str | None
    severity: str
    completed: bool
    started_at: str


def get_current_patient(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> Patient:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="missing token")
    patient = db.query(Patient).filter(Patient.auth_token == token).first()
    if patient is None:
        raise HTTPException(status_code=401, detail="invalid token")
    return patient


def _to_account(p: Patient) -> AccountOut:
    return AccountOut(
        patient_id=p.id, token=p.auth_token, name=p.name, phone=p.phone,
        age=p.age, gender=p.gender, abha_id=p.abha_id,
        weight_kg=p.weight_kg, height_cm=p.height_cm, diet_type=p.diet_type,
        conditions=p.conditions or [], allergies=p.allergies or [],
        goal=getattr(p, "goal", None),
        activity_level=getattr(p, "activity_level", None),
        dislikes=getattr(p, "dislikes", None) or [],
    )


@router.post("/register", response_model=AccountOut)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(Patient).filter(Patient.phone == req.phone).first()
    if existing:
        # Same phone = same account; treat as login and refresh basic details.
        existing.name = req.name or existing.name
        existing.age = req.age or existing.age
        existing.gender = req.gender or existing.gender
        db.commit()
        return _to_account(existing)

    patient = Patient(
        name=req.name, phone=req.phone, age=req.age,
        gender=req.gender, abha_id=req.abha_id,
    )
    db.add(patient)
    db.commit()
    return _to_account(patient)


@router.post("/login", response_model=AccountOut)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.phone == req.phone).first()
    if patient is None:
        raise HTTPException(status_code=404, detail="no account with this phone — register first")
    return _to_account(patient)


@router.get("/me", response_model=AccountOut)
def me(patient: Patient = Depends(get_current_patient), db: Session = Depends(get_db)):
    audit.log_phi_access(
        db, actor_id=patient.id, actor_role="patient", patient_id=patient.id,
        field_accessed="profile", endpoint="/api/auth/me",
    )
    return _to_account(patient)


@router.put("/me/health-profile", response_model=AccountOut)
def update_health_profile(
    req: HealthProfileRequest,
    patient: Patient = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    if req.weight_kg is not None:
        patient.weight_kg = req.weight_kg
    if req.height_cm is not None:
        patient.height_cm = req.height_cm
    if req.diet_type is not None:
        patient.diet_type = req.diet_type
    if req.conditions is not None:
        patient.conditions = req.conditions
    if req.allergies is not None:
        patient.allergies = req.allergies
    if req.goal is not None:
        patient.goal = req.goal
    if req.activity_level is not None:
        patient.activity_level = req.activity_level
    if req.dislikes is not None:
        patient.dislikes = req.dislikes
    db.commit()
    return _to_account(patient)


@router.get("/me/visits", response_model=list[VisitSummaryOut])
def my_visits(patient: Patient = Depends(get_current_patient), db: Session = Depends(get_db)):
    sessions = (
        db.query(IntakeSession)
        .filter(IntakeSession.patient_id == patient.id)
        .order_by(IntakeSession.created_at.desc())
        .all()
    )
    out = []
    for s in sessions:
        entry = db.query(QueueEntry).filter(QueueEntry.session_id == s.id).first()
        briefing = db.query(Briefing).filter(Briefing.session_id == s.id).first()
        severity = (
            entry.severity.value if entry
            else briefing.severity.value if briefing
            else "green"
        )
        out.append(
            VisitSummaryOut(
                session_id=s.id,
                chief_complaint=s.chief_complaint,
                severity=severity,
                completed=s.completed,
                started_at=s.created_at.isoformat(),
            )
        )
    return out
