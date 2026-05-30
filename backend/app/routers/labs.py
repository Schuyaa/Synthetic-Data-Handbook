# app/routers/labs.py

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.models import Topic, LabOption, LabSubmission, User
from app.schemas import (
    LabOptionCreate, LabOptionResponse,
    LabPublic, LabOptionPublic,
    LabSubmitRequest, LabCheckResponse,
    LabSubmissionResponse,
)
from app.services.labs import get_lab_or_404, submit_attempt
from app.utils import get_current_user, get_optional_user, require_roles


router = APIRouter(prefix="/labs", tags=["labs"])


# ═══════════════════════════════════════════════════════════════════
#  ADMIN endpoints
# ═══════════════════════════════════════════════════════════════════

@router.get("/{lab_id}/admin")
def get_lab_admin(
    lab_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(["admin", "teacher"])),
):
    lab = get_lab_or_404(db, lab_id)
    return {
        "id": lab.id,
        "options": [
            LabOptionResponse.model_validate(o)
            for o in sorted(lab.lab_options, key=lambda x: (x.order, x.id))
        ],
    }


@router.post("/{lab_id}/options", response_model=LabOptionResponse)
def create_option(
    lab_id: int,
    payload: LabOptionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(["admin", "teacher"])),
):
    lab = get_lab_or_404(db, lab_id)
    opt = LabOption(
        lab_id=lab.id,
        text=payload.text,
        is_correct=payload.is_correct,
        order=payload.order,
    )
    db.add(opt)
    db.commit()
    db.refresh(opt)
    return opt


@router.put("/{lab_id}/options/{opt_id}", response_model=LabOptionResponse)
def update_option(
    lab_id: int,
    opt_id: int,
    payload: LabOptionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(["admin", "teacher"])),
):
    opt = (
        db.query(LabOption)
        .filter(LabOption.id == opt_id, LabOption.lab_id == lab_id)
        .first()
    )
    if not opt:
        raise HTTPException(404, "Опция не найдена")
    opt.text = payload.text
    opt.is_correct = payload.is_correct
    opt.order = payload.order
    db.commit()
    db.refresh(opt)
    return opt


@router.delete("/{lab_id}/options/{opt_id}")
def delete_option(
    lab_id: int,
    opt_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(["admin", "teacher"])),
):
    opt = (
        db.query(LabOption)
        .filter(LabOption.id == opt_id, LabOption.lab_id == lab_id)
        .first()
    )
    if not opt:
        raise HTTPException(404, "Опция не найдена")
    db.delete(opt)
    db.commit()
    return {"message": "Опция удалена"}


# ═══════════════════════════════════════════════════════════════════
#  PUBLIC / STUDENT endpoints
# ═══════════════════════════════════════════════════════════════════

@router.get("/{lab_id}/public", response_model=LabPublic)
def get_lab_public(
    lab_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_optional_user),
):
    lab = get_lab_or_404(db, lab_id, require_published=True)
    is_authed = user is not None
    return LabPublic(
        id=lab.id,
        slug=lab.slug,
        title=lab.title,
        summary=lab.summary,
        content=lab.content or "",
        parent_id=lab.parent_id,
        is_published=lab.is_published,
        colab_url=lab.colab_url,
        check_mode=lab.check_mode,
        max_attempts=lab.max_attempts,
        options=[
            LabOptionPublic.model_validate(o)
            for o in sorted(lab.lab_options, key=lambda x: (x.order, x.id))
        ],
        starter_code=lab.starter_code if is_authed else None,
        test_code=lab.test_code if is_authed else None,
        required_packages=lab.required_packages if is_authed else None,
        timeout_seconds=lab.timeout_seconds if is_authed else None,
    )


@router.post("/{lab_id}/check", response_model=LabCheckResponse)
@limiter.limit("30/minute")
def check_answer_endpoint(
    request: Request,
    lab_id: int,
    payload: LabSubmitRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lab = get_lab_or_404(db, lab_id, require_published=True)
    is_correct, used, left, submitted_at, detail = submit_attempt(
        db, lab, user.id, payload.answer,
        client_verified_correct=payload.client_verified_correct,
    )
    return LabCheckResponse(
        is_correct=is_correct,
        attempts_used=used,
        attempts_left=left,
        submitted_at=submitted_at,
        detail=detail,
    )


@router.get("/{lab_id}/my-submissions", response_model=List[LabSubmissionResponse])
def get_my_submissions(
    lab_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lab = get_lab_or_404(db, lab_id, require_published=True)
    return (
        db.query(LabSubmission)
        .filter(LabSubmission.user_id == user.id, LabSubmission.lab_id == lab.id)
        .order_by(LabSubmission.submitted_at.desc())
        .all()
    )
