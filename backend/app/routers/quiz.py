# app/routers/quiz.py

import json
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from pydantic import BaseModel


def _utcnow():
    return datetime.now(timezone.utc)

from app.database import get_db
from app.limiter import limiter
from app.models import Question, Option, Topic, User, QuestionAnswer
from app.schemas import (
    QuestionCreate, QuestionUpdate, QuestionResponse, QuestionPublic,
    OptionCreate, OptionResponse,
    QuizResultItem,
    QuestionAnswerResponse,
)
from app.utils import get_current_user, require_roles

router = APIRouter(prefix="/quiz", tags=["quiz"])


def _validate_options(options, kind: str, *, context: str = "Вопрос"):
    if not options or len(options) < 2:
        raise HTTPException(400, f"{context}: должно быть минимум 2 варианта ответа")
    if any(not (o.text or "").strip() for o in options):
        raise HTTPException(400, f"{context}: текст варианта не может быть пустым")
    correct_count = sum(1 for o in options if o.is_correct)
    if kind == "single":
        if correct_count != 1:
            raise HTTPException(400, f"{context}: для одиночного выбора должен быть ровно один правильный вариант")
    elif kind == "multiple":
        if correct_count < 1:
            raise HTTPException(400, f"{context}: должен быть отмечен хотя бы один правильный вариант")
    else:
        raise HTTPException(400, f"{context}: неизвестный тип вопроса '{kind}'")


# ──────────────── Public ────────────────


@router.get("/counts")
def get_question_counts(db: Session = Depends(get_db)):
    rows = (
        db.query(Question.chapter_id, func.count(Question.id))
        .join(Topic, Topic.id == Question.chapter_id)
        .filter(Topic.is_published == True)
        .group_by(Question.chapter_id)
        .all()
    )
    return {int(cid): int(cnt) for cid, cnt in rows}


@router.get("/chapter/{chapter_id}", response_model=List[QuestionPublic])
def get_questions_for_chapter(chapter_id: int, db: Session = Depends(get_db)):
    chapter = db.query(Topic).filter(Topic.id == chapter_id, Topic.is_published == True).first()
    if not chapter:
        raise HTTPException(404, "Глава не найдена")
    questions = (
        db.query(Question)
        .filter(Question.chapter_id == chapter_id)
        .options(joinedload(Question.options))
        .order_by(Question.order, Question.id)
        .all()
    )
    return questions


@router.get("/chapter/{chapter_id}/exists")
def check_questions_exist(chapter_id: int, db: Session = Depends(get_db)):
    count = db.query(Question).filter(Question.chapter_id == chapter_id).count()
    return {"exists": count > 0, "count": count}


# ──────────────── Per-question check + save ────────────────

class _SingleQuestionCheck(BaseModel):
    selected_option_ids: List[int] = []


@router.post("/question/{question_id}/check", response_model=QuizResultItem)
@limiter.limit("60/minute")
def check_single_question(
    request: Request,
    question_id: int,
    body: _SingleQuestionCheck,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        db.query(Question)
        .filter(Question.id == question_id)
        .options(joinedload(Question.options), joinedload(Question.reference_topic))
        .first()
    )
    if not q:
        raise HTTPException(404, "Вопрос не найден")

    chapter = db.query(Topic).filter(Topic.id == q.chapter_id).first()
    if not chapter or not chapter.is_published:
        raise HTTPException(404, "Вопрос недоступен")

    correct_ids = sorted(o.id for o in q.options if o.is_correct)
    selected_ids = sorted(set(body.selected_option_ids or []))
    is_correct = bool(correct_ids) and selected_ids == correct_ids

    # Upsert QuestionAnswer
    existing = (
        db.query(QuestionAnswer)
        .filter(QuestionAnswer.user_id == current_user.id, QuestionAnswer.question_id == question_id)
        .first()
    )
    if existing:
        existing.selected_option_ids = json.dumps(selected_ids)
        existing.is_correct = is_correct
        existing.answered_at = _utcnow()
    else:
        db.add(QuestionAnswer(
            user_id=current_user.id,
            question_id=question_id,
            selected_option_ids=json.dumps(selected_ids),
            is_correct=is_correct,
        ))
    db.commit()

    ref_slug = ref_title = None
    if not is_correct and q.reference_topic:
        ref_slug = q.reference_topic.slug
        ref_title = q.reference_topic.title

    return QuizResultItem(
        question_id=q.id,
        is_correct=is_correct,
        correct_option_ids=correct_ids,
        reference_slug=ref_slug,
        reference_title=ref_title,
        chapter_slug=chapter.slug,
    )


# ──────────────── Saved answers per chapter ────────────────

@router.get("/chapter/{chapter_id}/my-answers", response_model=List[QuestionAnswerResponse])
def get_my_answers(
    chapter_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получить сохранённые ответы текущего пользователя по вопросам главы."""
    question_ids = (
        db.query(Question.id)
        .filter(Question.chapter_id == chapter_id)
        .subquery()
    )
    rows = (
        db.query(QuestionAnswer)
        .filter(
            QuestionAnswer.user_id == current_user.id,
            QuestionAnswer.question_id.in_(question_ids),
        )
        .all()
    )
    return [
        QuestionAnswerResponse(
            question_id=r.question_id,
            selected_option_ids=json.loads(r.selected_option_ids or "[]"),
            is_correct=r.is_correct,
            answered_at=r.answered_at,
        )
        for r in rows
    ]


# ──────────────── Admin CRUD ────────────────

@router.get("/admin/all", response_model=List[QuestionResponse])
def admin_get_all_questions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "teacher"])),
):
    """Все вопросы всех глав — для дерева в админке."""
    return (
        db.query(Question)
        .options(joinedload(Question.options))
        .order_by(Question.chapter_id, Question.order, Question.id)
        .all()
    )


@router.get("/admin/chapter/{chapter_id}", response_model=List[QuestionResponse])
def admin_get_questions(
    chapter_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "teacher"])),
):
    return (
        db.query(Question)
        .filter(Question.chapter_id == chapter_id)
        .options(joinedload(Question.options))
        .order_by(Question.order, Question.id)
        .all()
    )


@router.post("/admin/chapter/{chapter_id}/questions", response_model=QuestionResponse)
def create_question(
    chapter_id: int,
    body: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "teacher"])),
):
    chapter = db.query(Topic).filter(Topic.id == chapter_id).first()
    if not chapter:
        raise HTTPException(404, "Глава не найдена")

    if not (body.text or "").strip():
        raise HTTPException(400, "Текст вопроса не может быть пустым")
    if body.kind not in ("single", "multiple"):
        raise HTTPException(400, "kind должен быть 'single' или 'multiple'")
    _validate_options(body.options, body.kind, context="Вопрос")

    q = Question(
        chapter_id=chapter_id,
        text=body.text,
        kind=body.kind,
        order=body.order,
        reference_topic_id=body.reference_topic_id,
    )
    db.add(q)
    db.flush()

    for opt in body.options:
        db.add(Option(
            question_id=q.id,
            text=opt.text,
            is_correct=opt.is_correct,
            order=opt.order,
        ))

    db.commit()
    db.refresh(q)
    return db.query(Question).options(joinedload(Question.options)).filter(Question.id == q.id).first()


@router.put("/admin/questions/{question_id}", response_model=QuestionResponse)
def update_question(
    question_id: int,
    body: QuestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "teacher"])),
):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Вопрос не найден")

    if body.text is not None:
        q.text = body.text
    if body.order is not None:
        q.order = body.order
    if body.reference_topic_id is not None:
        q.reference_topic_id = body.reference_topic_id or None
    if body.kind is not None:
        if body.kind not in ("single", "multiple"):
            raise HTTPException(400, "kind должен быть 'single' или 'multiple'")
        # При переключении на single — допустимо только если ровно один правильный
        if body.kind == "single":
            correct_ids = [o.id for o in q.options if o.is_correct]
            if len(correct_ids) > 1:
                raise HTTPException(
                    400,
                    "Нельзя переключить на одиночный выбор: отмечено больше одного правильного варианта",
                )
            if len(correct_ids) == 0:
                raise HTTPException(
                    400,
                    "Нельзя переключить на одиночный выбор: не отмечен ни один правильный вариант",
                )
        q.kind = body.kind

    db.commit()
    return db.query(Question).options(joinedload(Question.options)).filter(Question.id == q.id).first()


@router.delete("/admin/questions/{question_id}")
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "teacher"])),
):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Вопрос не найден")
    db.delete(q)
    db.commit()
    return {"ok": True}


# ── Options CRUD ──

@router.post("/admin/questions/{question_id}/options", response_model=OptionResponse)
def add_option(
    question_id: int,
    body: OptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "teacher"])),
):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Вопрос не найден")
    opt = Option(question_id=question_id, text=body.text, is_correct=body.is_correct, order=body.order)
    db.add(opt)
    db.commit()
    db.refresh(opt)
    return opt


@router.put("/admin/options/{option_id}", response_model=OptionResponse)
def update_option(
    option_id: int,
    body: OptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "teacher"])),
):
    opt = db.query(Option).filter(Option.id == option_id).first()
    if not opt:
        raise HTTPException(404, "Вариант не найден")
    if not (body.text or "").strip():
        raise HTTPException(400, "Текст варианта не может быть пустым")
    # Если снимаем флаг is_correct — убедимся, что у вопроса останется хотя бы один правильный
    if opt.is_correct and not body.is_correct:
        other_correct = (
            db.query(Option)
            .filter(Option.question_id == opt.question_id, Option.id != opt.id, Option.is_correct == True)
            .count()
        )
        if other_correct == 0:
            raise HTTPException(400, "У вопроса должен оставаться хотя бы один правильный вариант")
    # Для single-choice: при выставлении is_correct снимаем флаг с остальных
    q = db.query(Question).filter(Question.id == opt.question_id).first()
    if body.is_correct and not opt.is_correct and q and q.kind == "single":
        db.query(Option).filter(
            Option.question_id == opt.question_id, Option.id != opt.id
        ).update({Option.is_correct: False})
    opt.text = body.text
    opt.is_correct = body.is_correct
    opt.order = body.order
    db.commit()
    db.refresh(opt)
    return opt


@router.delete("/admin/options/{option_id}")
def delete_option(
    option_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "teacher"])),
):
    opt = db.query(Option).filter(Option.id == option_id).first()
    if not opt:
        raise HTTPException(404, "Вариант не найден")
    siblings = db.query(Option).filter(Option.question_id == opt.question_id).count()
    if siblings <= 2:
        raise HTTPException(400, "У вопроса должно оставаться минимум 2 варианта")
    if opt.is_correct:
        other_correct = (
            db.query(Option)
            .filter(Option.question_id == opt.question_id, Option.id != opt.id, Option.is_correct == True)
            .count()
        )
        if other_correct == 0:
            raise HTTPException(400, "Нельзя удалить единственный правильный вариант")
    db.delete(opt)
    db.commit()
    return {"ok": True}
