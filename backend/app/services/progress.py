# app/services/progress.py

from typing import List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Topic, UserProgress,
    Question, QuestionAnswer, LabSubmission,
)
from app.schemas import (
    ProgressItem, QuestionProgressItem, FullProgressResponse,
)


def build_full_progress(db: Session, user_id: int) -> FullProgressResponse:
    topic_rows = (
        db.query(UserProgress)
        .filter(UserProgress.user_id == user_id)
        .all()
    )
    topics_by_id = {r.topic_id: r for r in topic_rows}

    topic_items: List[ProgressItem] = [
        ProgressItem(topic_id=r.topic_id, status=r.status, updated_at=r.updated_at)
        for r in topic_rows
    ]

    # Лабы с попытками без done в UserProgress → synthetic in_progress
    lab_attempt_rows = (
        db.query(
            LabSubmission.lab_id,
            func.max(LabSubmission.submitted_at).label("last_at"),
        )
        .filter(LabSubmission.user_id == user_id)
        .group_by(LabSubmission.lab_id)
        .all()
    )
    for lab_id, last_at in lab_attempt_rows:
        if lab_id in topics_by_id:
            continue
        topic_items.append(ProgressItem(
            topic_id=lab_id, status="in_progress", updated_at=last_at,
        ))

    qa_rows = (
        db.query(QuestionAnswer, Question, Topic)
        .join(Question, Question.id == QuestionAnswer.question_id)
        .join(Topic, Topic.id == Question.chapter_id)
        .filter(QuestionAnswer.user_id == user_id)
        .all()
    )
    question_items: List[QuestionProgressItem] = [
        QuestionProgressItem(
            question_id=qa.question_id,
            chapter_id=q.chapter_id,
            chapter_slug=chap.slug,
            chapter_title=chap.title,
            question_text=(q.text or "")[:120],
            status="done" if qa.is_correct else "in_progress",
            updated_at=qa.answered_at,
        )
        for qa, q, chap in qa_rows
    ]

    return FullProgressResponse(topics=topic_items, questions=question_items)
