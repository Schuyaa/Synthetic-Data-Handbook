# app/services/groups.py

from typing import List

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Group, User, Topic, UserProgress, Question, QuestionAnswer
from app.schemas import GroupProgressResponse, GroupUserProgress


def compute_group_progress(db: Session, group_id: int) -> GroupProgressResponse:
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g:
        raise HTTPException(404, "Группа не найдена")

    total_topics = (
        db.query(Topic)
        .filter(Topic.kind.in_(["lesson", "lab"]), Topic.is_published == True)
        .count()
    )
    total_questions = (
        db.query(Question)
        .join(Topic, Topic.id == Question.chapter_id)
        .filter(Topic.is_published == True)
        .count()
    )
    total = total_topics + total_questions

    users = (
        db.query(User)
        .filter(User.group_id == group_id)
        .order_by(User.last_name.nullslast(), User.username)
        .all()
    )

    user_ids = [u.id for u in users]
    done_topics_map: dict[int, int] = {}
    done_questions_map: dict[int, int] = {}

    if user_ids and total_topics > 0:
        rows = (
            db.query(UserProgress.user_id, func.count(UserProgress.id))
            .join(Topic, Topic.id == UserProgress.topic_id)
            .filter(
                UserProgress.user_id.in_(user_ids),
                UserProgress.status == "done",
                Topic.kind.in_(["lesson", "lab"]),
                Topic.is_published == True,
            )
            .group_by(UserProgress.user_id)
            .all()
        )
        done_topics_map = {uid: cnt for uid, cnt in rows}

    if user_ids and total_questions > 0:
        rows = (
            db.query(QuestionAnswer.user_id, func.count(QuestionAnswer.id))
            .join(Question, Question.id == QuestionAnswer.question_id)
            .join(Topic, Topic.id == Question.chapter_id)
            .filter(
                QuestionAnswer.user_id.in_(user_ids),
                QuestionAnswer.is_correct == True,
                Topic.is_published == True,
            )
            .group_by(QuestionAnswer.user_id)
            .all()
        )
        done_questions_map = {uid: cnt for uid, cnt in rows}

    user_rows: List[GroupUserProgress] = []
    for u in users:
        done = done_topics_map.get(u.id, 0) + done_questions_map.get(u.id, 0)
        pct = int(round((done / total) * 100)) if total > 0 else 0
        full_name = " ".join(filter(None, [u.last_name, u.first_name])) or None
        user_rows.append(GroupUserProgress(
            user_id=u.id,
            username=u.username,
            full_name=full_name,
            done=done,
            total=total,
            pct=pct,
        ))

    avg_pct = int(round(sum(r.pct for r in user_rows) / len(user_rows))) if user_rows else 0

    return GroupProgressResponse(
        group_id=group_id,
        users_count=len(user_rows),
        avg_pct=avg_pct,
        users=user_rows,
    )
