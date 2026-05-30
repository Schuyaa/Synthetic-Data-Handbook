# app/routers/progress.py

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import User, Topic, UserProgress
from app.schemas import (
    ProgressUpsert, ProgressItem, FullProgressResponse,
)
from app.services.progress import build_full_progress
from app.utils import get_current_user


def _utcnow():
    return datetime.now(timezone.utc)


router = APIRouter(prefix="/progress", tags=["progress"])

STATUS_RANK = {"not_started": 0, "in_progress": 1, "done": 2}


@router.get("/me", response_model=List[ProgressItem])
def my_progress(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    # старое
    rows = db.query(UserProgress).filter(UserProgress.user_id == user.id).all()
    return [
        ProgressItem(topic_id=r.topic_id, status=r.status, updated_at=r.updated_at)
        for r in rows
    ]


@router.get("/me/full", response_model=FullProgressResponse)
def my_progress_full(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    return build_full_progress(db, user.id)


@router.put("/{topic_id}", response_model=ProgressItem)
def upsert_progress(
    topic_id: int,
    payload: ProgressUpsert,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    topic = db.query(Topic).filter(Topic.id == topic_id, Topic.is_published == True).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")

    row = (
        db.query(UserProgress)
        .filter(UserProgress.user_id == user.id, UserProgress.topic_id == topic_id)
        .first()
    )

    new_rank = STATUS_RANK.get(payload.status, 0)

    if not row:
        row = UserProgress(
            user_id=user.id,
            topic_id=topic_id,
            status=payload.status,
            updated_at=_utcnow()
        )
        db.add(row)
    else:
        old_rank = STATUS_RANK.get(row.status, 0)
        if new_rank > old_rank:
            row.status = payload.status
        # только для последнего
        row.updated_at = _utcnow()

    db.commit()
    db.refresh(row)
    return ProgressItem(topic_id=row.topic_id, status=row.status, updated_at=row.updated_at)
