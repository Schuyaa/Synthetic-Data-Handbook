# app/services/labs.py

import json
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Topic, LabOption, LabSubmission, UserProgress


def _utcnow():
    return datetime.now(timezone.utc)


def get_lab_or_404(db: Session, lab_id: int, *, require_published: bool = False) -> Topic:
    q = db.query(Topic).filter(Topic.id == lab_id, Topic.kind == "lab")
    if require_published:
        q = q.filter(Topic.is_published == True)
    lab = q.first()
    if not lab:
        raise HTTPException(404, "Лаба не найдена")
    return lab


def _normalize_text(s: str) -> str:
    return (s or "").strip().lower()


def _parse_choice_ids(s: str) -> List[int]:
    """JSON-массив id выбранных опций. Битый JSON → []."""
    try:
        data = json.loads(s)
        if not isinstance(data, list):
            return []
        return [int(x) for x in data]
    except (ValueError, TypeError):
        return []


def check_answer(
    lab: Topic,
    options: List[LabOption],
    answer: str,
    client_verified_correct: Optional[bool] = None,
) -> bool:
    """Чистая, без БД — легко тестируется.

    client_verified_correct используется ТОЛЬКО для python_code (v1).
    Для всех остальных режимов поле игнорируется — это намеренно, чтобы
    злонамеренный фронт не мог обойти text_exact/numeric/choice проверку
    через подложный флаг."""
    mode = lab.check_mode

    if mode == "text_exact":
        if lab.expected_answer is None:
            return False
        return _normalize_text(answer) == _normalize_text(lab.expected_answer)

    if mode == "numeric":
        if lab.expected_answer is None:
            return False
        try:
            submitted = float((answer or "").strip().replace(",", "."))
            expected = float(lab.expected_answer)
        except (ValueError, TypeError):
            return False
        tol = lab.numeric_tolerance if lab.numeric_tolerance is not None else 0.0
        return abs(submitted - expected) <= tol

    if mode in ("single_choice", "multiple_choice"):
        submitted_ids = set(_parse_choice_ids(answer))
        correct_ids = {o.id for o in options if o.is_correct}
        if not correct_ids:
            return False
        if mode == "single_choice":
            return len(submitted_ids) == 1 and submitted_ids == correct_ids
        return submitted_ids == correct_ids

    if mode == "python_code":
        # v1: доверяем клиенту. Pyodide крутится в браузере, сервер не выполняет
        # Python — не может проверить сам. В v2 здесь будет вызов sandbox-сервиса
        # (Docker), флаг с фронта станет рудиментарным/контрольным.
        return bool(client_verified_correct)

    return False


def count_attempts(db: Session, user_id: int, lab_id: int) -> int:
    return (
        db.query(LabSubmission)
        .filter(LabSubmission.user_id == user_id, LabSubmission.lab_id == lab_id)
        .count()
    )


def submit_attempt(
    db: Session,
    lab: Topic,
    user_id: int,
    answer: str,
    client_verified_correct: Optional[bool] = None,
) -> Tuple[bool, int, "int | None", "datetime | None", "str | None"]:
    """→ (is_correct, attempts_used, attempts_left, submitted_at, detail).
    При лимите попыток: не сохраняем, detail = причина. Иначе сохраняем
    попытку; при is_correct апсёртим UserProgress.done.

    client_verified_correct: используется только при check_mode == "python_code"
    (см. check_answer — для других режимов игнорируется).

    Атомарность max_attempts:
      Между count_attempts() и insert'ом submission'а есть гонка — два
      параллельных запроса могли бы оба прочитать used=N и оба вставить,
      получив N+2 при max_attempts=N+1.
      Решение: SELECT ... FOR UPDATE на строку лабы блокирует параллельные
      submit'ы той же лабы до commit. PostgreSQL держит row-level lock в
      пределах транзакции — все остальные параллельные submits ждут.
    """
    # Lock the lab row — гарантирует атомарность count → check → insert.
    # noqa: F841 — переменная не нужна, нужен сам эффект блокировки.
    _locked = (
        db.query(Topic)
        .filter(Topic.id == lab.id)
        .with_for_update()
        .first()
    )

    used = count_attempts(db, user_id, lab.id)
    if lab.max_attempts is not None and used >= lab.max_attempts:
        return False, used, 0, _utcnow(), "Превышен лимит попыток"

    is_correct = check_answer(lab, lab.lab_options, answer, client_verified_correct)

    sub = LabSubmission(
        user_id=user_id,
        lab_id=lab.id,
        submitted_answer=answer or "",
        is_correct=is_correct,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    if is_correct:
        progress = (
            db.query(UserProgress)
            .filter(UserProgress.user_id == user_id, UserProgress.topic_id == lab.id)
            .first()
        )
        if progress:
            if progress.status != "done":
                progress.status = "done"
                progress.updated_at = _utcnow()
        else:
            progress = UserProgress(
                user_id=user_id,
                topic_id=lab.id,
                status="done",
                updated_at=_utcnow(),
            )
            db.add(progress)
        db.commit()

    new_used = used + 1
    attempts_left = (
        max(0, lab.max_attempts - new_used) if lab.max_attempts is not None else None
    )
    return is_correct, new_used, attempts_left, sub.submitted_at, None
