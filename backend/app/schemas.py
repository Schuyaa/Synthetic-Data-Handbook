# app/schemas.py

import re
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Literal


PYTHON_CODE_MAX_LEN = 20_000  # 20 КБ ~ 500 строк кода — для упражнений с головой
MAX_PACKAGES = 10              # больше пакетов в одной задаче — повод задуматься
_PACKAGE_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,49}$")


def _validate_python_packages(packages):
    """Валидатор имени пакетов для micropip/loadPackage.

    Разрешён alphanumeric + _ . - (стандарт PyPI). Длина ≤50 символов.
    Защита от URL-injection (например, если имя попадёт в URL для CDN-lookup)
    и от случайных опечаток вроде "numpy/pandas" (slash в имени).
    """
    if packages is None:
        return None
    if len(packages) > MAX_PACKAGES:
        raise ValueError(f"Слишком много пакетов (>{MAX_PACKAGES})")
    for pkg in packages:
        if not isinstance(pkg, str) or not _PACKAGE_NAME_RE.match(pkg):
            raise ValueError(f"Недопустимое имя пакета: {pkg!r}")
    return packages


# =========================
# USER
# =========================

class UserLogin(BaseModel):
    login: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    first_name: Optional[str]
    last_name: Optional[str]
    group_id: Optional[int]
    group_name: Optional[str] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str


class RoleUpdate(BaseModel):
    role: Literal["student", "teacher", "admin"]


class UserGroupUpdate(BaseModel):
    group_id: Optional[int] = None


class AdminUserCreate(BaseModel):
    """Создание пользователя администратором/преподавателем из админки."""
    username: str
    email: EmailStr
    password: str
    role: Literal["student", "teacher", "admin"] = "student"
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    group_id: Optional[int] = None


class AdminUserUpdate(BaseModel):
    """Обновление полей пользователя из админки (username/email/ФИО/пароль).
    Пустая строка или None для password → пароль не меняется."""
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    password: Optional[str] = None


# =========================
# GROUP
# =========================

class GroupCreate(BaseModel):
    name: str
    course: Optional[int] = None  # 1..4 или null


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    course: Optional[int] = None  # 1..4 или null; отсутствие поля = не менять


class GroupResponse(BaseModel):
    id: int
    name: str
    course: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GroupUserProgress(BaseModel):
    user_id: int
    username: str
    full_name: Optional[str] = None
    done: int
    total: int
    pct: int


class GroupProgressResponse(BaseModel):
    group_id: int
    users_count: int
    avg_pct: int
    users: List[GroupUserProgress]


# =========================
# TOPIC
# =========================

TopicKind = Literal["section", "subtopic", "lesson", "lab"]
LabCheckMode = Literal["single_choice", "multiple_choice", "text_exact", "numeric", "python_code"]


class TopicCreate(BaseModel):
    slug: str = Field(..., min_length=1)
    title: str
    content: str = ""
    summary: Optional[str] = None
    kind: TopicKind = "lesson"
    parent_id: Optional[int] = None
    order: int = 0
    estimated_minutes: Optional[int] = None
    is_published: bool = False
    # Lab-only поля. Заполнять только при kind == "lab", иначе игнор.
    colab_url: Optional[str] = None
    check_mode: Optional[LabCheckMode] = None
    expected_answer: Optional[str] = None
    numeric_tolerance: Optional[float] = None
    max_attempts: Optional[int] = None
    # python_code-only поля (заполнять только при check_mode == "python_code")
    starter_code: Optional[str] = Field(None, max_length=PYTHON_CODE_MAX_LEN)
    test_code: Optional[str] = Field(None, max_length=PYTHON_CODE_MAX_LEN)
    required_packages: Optional[List[str]] = None
    timeout_seconds: Optional[int] = Field(None, ge=1, le=300)

    _validate_packages = field_validator("required_packages")(
        lambda cls, v: _validate_python_packages(v)
    )


class TopicUpdate(BaseModel):
    slug: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    summary: Optional[str] = None
    kind: Optional[TopicKind] = None
    parent_id: Optional[int] = None
    order: Optional[int] = None
    estimated_minutes: Optional[int] = None
    is_published: Optional[bool] = None
    # Lab-only. None в PATCH-стиле = «не менять», поэтому если хочешь
    # обнулить numeric_tolerance — пришли 0.0; для строк — пустую строку.
    colab_url: Optional[str] = None
    check_mode: Optional[LabCheckMode] = None
    expected_answer: Optional[str] = None
    numeric_tolerance: Optional[float] = None
    max_attempts: Optional[int] = None
    # python_code-only. Та же PATCH-семантика: None = не менять, [] = очистить пакеты.
    starter_code: Optional[str] = Field(None, max_length=PYTHON_CODE_MAX_LEN)
    test_code: Optional[str] = Field(None, max_length=PYTHON_CODE_MAX_LEN)
    required_packages: Optional[List[str]] = None
    timeout_seconds: Optional[int] = Field(None, ge=1, le=300)

    _validate_packages = field_validator("required_packages")(
        lambda cls, v: _validate_python_packages(v)
    )


class TopicResponse(BaseModel):
    id: int
    slug: str
    title: str
    summary: Optional[str]
    kind: TopicKind
    parent_id: Optional[int]
    order: int
    estimated_minutes: Optional[int]
    content: str
    is_published: bool
    # Lab-only — для обычных топиков остаются None
    colab_url: Optional[str] = None
    check_mode: Optional[LabCheckMode] = None
    expected_answer: Optional[str] = None
    numeric_tolerance: Optional[float] = None
    max_attempts: Optional[int] = None
    # python_code-only — для обычных топиков и не-python_code лаб остаются None
    starter_code: Optional[str] = None
    test_code: Optional[str] = None
    required_packages: Optional[List[str]] = None
    timeout_seconds: Optional[int] = None

    class Config:
        from_attributes = True


class TopicTreeNode(BaseModel):
    id: int
    slug: str
    title: str
    kind: TopicKind
    parent_id: Optional[int] = None
    order: int
    estimated_minutes: Optional[int]
    is_published: bool
    # check_mode нужен фронту чтобы отличать «Практическое задание»
    # (python_code) от «Лабораторной работы» (text/numeric/choice) при
    # рендере дерева. Для не-lab топиков остаётся None.
    check_mode: Optional[LabCheckMode] = None
    children: List["TopicTreeNode"] = []

    class Config:
        from_attributes = True


SearchTarget = Literal["theme", "chapter", "lesson"]

class SearchResult(BaseModel):
    id: int
    target: SearchTarget
    slug: str
    title: str
    chapter_slug: Optional[str] = None
    theme_slug: Optional[str] = None
    snippet: Optional[str] = None
    rank: float = 0.0

class SearchResponse(BaseModel):
    q: str
    results: List[SearchResult]

TopicTreeNode.model_rebuild()


# =========================
# PROGRESS
# =========================

ProgressStatus = Literal["not_started", "in_progress", "done"]

class ProgressUpsert(BaseModel):
    status: ProgressStatus

class ProgressItem(BaseModel):
    topic_id: int
    status: ProgressStatus
    updated_at: datetime

    class Config:
        from_attributes = True


class QuestionProgressItem(BaseModel):
    """Производный статус прогресса по вопросу.

    not_started → нет QuestionAnswer
    in_progress → QuestionAnswer есть, is_correct=False
    done        → QuestionAnswer есть, is_correct=True
    """
    question_id: int
    chapter_id: int
    chapter_slug: Optional[str] = None      # для прямой навигации с UserPage
    chapter_title: Optional[str] = None
    question_text: Optional[str] = None     
    status: ProgressStatus
    updated_at: Optional[datetime] = None  # answered_at (None если ещё не отвечали)


class FullProgressResponse(BaseModel):
    topics: List[ProgressItem]
    questions: List[QuestionProgressItem]


# =========================
# QUIZ (вопросы к главам)
# =========================

class OptionCreate(BaseModel):
    text: str
    is_correct: bool = False
    order: int = 0

class OptionResponse(BaseModel):
    id: int
    text: str
    is_correct: bool
    order: int
    class Config:
        from_attributes = True

class OptionPublic(BaseModel):
    id: int
    text: str
    order: int
    class Config:
        from_attributes = True

class QuestionCreate(BaseModel):
    text: str
    kind: str = "single"  # single | multiple
    order: int = 0
    reference_topic_id: Optional[int] = None
    options: List[OptionCreate] = []

class QuestionUpdate(BaseModel):
    text: Optional[str] = None
    kind: Optional[str] = None
    order: Optional[int] = None
    reference_topic_id: Optional[int] = None

class QuestionResponse(BaseModel):
    id: int
    chapter_id: int
    text: str
    kind: str
    order: int
    reference_topic_id: Optional[int]
    options: List[OptionResponse] = []
    class Config:
        from_attributes = True

class QuestionPublic(BaseModel):
    id: int
    text: str
    kind: str
    order: int
    options: List[OptionPublic] = []
    class Config:
        from_attributes = True

class QuizResultItem(BaseModel):
    question_id: int
    is_correct: bool
    correct_option_ids: List[int] = []
    reference_slug: Optional[str] = None
    reference_title: Optional[str] = None
    chapter_slug: Optional[str] = None


# =========================
# QUESTION ANSWERS (сохранённые ответы)
# =========================

class QuestionAnswerResponse(BaseModel):
    question_id: int
    selected_option_ids: List[int] = []
    is_correct: bool
    answered_at: datetime

    class Config:
        from_attributes = True


# =========================
# LABS (практические задания) НА БУДУЩЕЕ - ЛАБА как-то грубовато, стоит переименовать в Лабораторная работа или чёт такое
# =========================
#
# Лаба — это Topic с kind="lab". Метаданные (colab_url, check_mode и т.д.)
# приходят через Topic*-схемы выше. Здесь только то, что специфично:
# опции (для choice-режимов) и попытки студента.

class LabOptionCreate(BaseModel):
    """Создание/обновление опции (админ/преподаватель)."""
    text: str
    is_correct: bool = False
    order: int = 0


class LabOptionResponse(BaseModel):
    """Полная опция, видна админу/преподавателю — с флагом is_correct."""
    id: int
    text: str
    is_correct: bool
    order: int

    class Config:
        from_attributes = True


class LabOptionPublic(BaseModel):
    """Опция для студента — БЕЗ is_correct, иначе ответ в DevTools видно."""
    id: int
    text: str
    order: int

    class Config:
        from_attributes = True


class LabPublic(BaseModel):
    id: int
    slug: str
    title: str
    summary: Optional[str]
    content: str
    parent_id: Optional[int]
    is_published: bool
    colab_url: Optional[str]
    check_mode: Optional[LabCheckMode]
    max_attempts: Optional[int]
    options: List[LabOptionPublic] = []
    # python_code-поля (None для не-python_code лаб)
    starter_code: Optional[str] = None
    test_code: Optional[str] = None              # ⚠ v1-only, уйдёт в v2
    required_packages: Optional[List[str]] = None
    timeout_seconds: Optional[int] = None


class LabSubmitRequest(BaseModel):
    answer: str = Field(..., max_length=20_000)
    client_verified_correct: Optional[bool] = None


class LabCheckResponse(BaseModel):
    is_correct: bool
    attempts_used: int
    attempts_left: Optional[int] = None
    submitted_at: datetime
    # detail для UI: например, "Превышен лимит попыток"
    detail: Optional[str] = None


class LabSubmissionResponse(BaseModel):
    id: int
    submitted_answer: str
    is_correct: bool
    submitted_at: datetime

    class Config:
        from_attributes = True
