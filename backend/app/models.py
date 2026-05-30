# app/models.py

from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Boolean, Text, Float, JSON,
    ForeignKey, DateTime, Index, UniqueConstraint, text
)
from sqlalchemy.orm import relationship

from app.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    # Учебный курс (год обучения): 1..4, опционально — используется для группировки в админке, отдельно сами курсы никак не редактируются, это сугубо группировка групп.
    course = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=_utcnow, server_default=text("now()"), nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)

    role = Column(String, default="student")  # student | teacher | admin

    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True)

    group = relationship("Group")

    @property
    def group_name(self):
        return self.group.name if self.group else None


class Topic(Base):
    __tablename__ = "topics"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_topics_slug"),
    )

    id = Column(Integer, primary_key=True, index=True)

    # /learn/<slug>
    slug = Column(String, nullable=False, index=True)

    title = Column(String, nullable=False)
    summary = Column(String, nullable=True)

    # section | subtopic | lesson | lab
    kind = Column(String, default="lesson", nullable=False)

    parent_id = Column(
        Integer,
        ForeignKey("topics.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    order = Column(Integer, default=0, nullable=False)

    estimated_minutes = Column(Integer, nullable=True)

    content = Column(Text, nullable=False, default="")
    is_published = Column(Boolean, default=False, nullable=False)

    parent = relationship("Topic", remote_side=[id], backref="children")

    colab_url = Column(String, nullable=True)
    check_mode = Column(String, nullable=True)
    expected_answer = Column(String, nullable=True)
    numeric_tolerance = Column(Float, nullable=True)
    max_attempts = Column(Integer, nullable=True)  # NULL = безлимит

    starter_code = Column(Text, nullable=True)        # шаблон для редактора
    test_code = Column(Text, nullable=True)           # assert-тесты, пишет сам преподаватель, так что я ответсвтенности не несу xd
    required_packages = Column(JSON, nullable=True)   # ["numpy", "pandas"] для micropip
    timeout_seconds = Column(Integer, nullable=True)  # лимит выполнения (по умолчанию 5 на клиенте)

    lab_options = relationship(
        "LabOption",
        back_populates="lab",
        cascade="all, delete-orphan",
        order_by="LabOption.order",
    )


class UserProgress(Base):
    __tablename__ = "user_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "topic_id", name="uq_user_topic_progress"),
        Index("ix_user_progress_user_status", "user_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    topic_id = Column(
        Integer,
        ForeignKey("topics.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # not_started | in_progress | done
    status = Column(String, default="not_started", nullable=False)

    updated_at = Column(DateTime, default=_utcnow, nullable=False)

    user = relationship("User")
    topic = relationship("Topic")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    chapter_id = Column(Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(Text, nullable=False)
    # single | multiple
    kind = Column(String, default="single", nullable=False, server_default="single")
    order = Column(Integer, default=0, nullable=False)
    reference_topic_id = Column(Integer, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True)

    chapter = relationship("Topic", foreign_keys=[chapter_id])
    reference_topic = relationship("Topic", foreign_keys=[reference_topic_id])
    options = relationship("Option", back_populates="question", cascade="all, delete-orphan", order_by="Option.order")


class Option(Base):
    __tablename__ = "options"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    text = Column(String, nullable=False)
    is_correct = Column(Boolean, default=False, nullable=False)
    order = Column(Integer, default=0, nullable=False)

    question = relationship("Question", back_populates="options")


class QuestionAnswer(Base):
    """Сохранённый ответ пользователя на вопрос (upsert при повторном ответе)."""
    __tablename__ = "question_answers"
    __table_args__ = (
        UniqueConstraint("user_id", "question_id", name="uq_user_question_answer"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)

    selected_option_ids = Column(Text, nullable=False, default="[]")
    is_correct = Column(Boolean, nullable=False)

    answered_at = Column(DateTime, default=_utcnow, nullable=False)

    user = relationship("User")
    question = relationship("Question")


# ── Labs ──
# Лаба = Topic(kind="lab") + опции в lab_options + история попыток в lab_submissions.


class LabOption(Base):
    """Вариант ответа для choice-режимов."""
    __tablename__ = "lab_options"

    id = Column(Integer, primary_key=True, index=True)
    lab_id = Column(
        Integer,
        ForeignKey("topics.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    text = Column(String, nullable=False)
    is_correct = Column(Boolean, default=False, nullable=False)
    order = Column(Integer, default=0, nullable=False)

    lab = relationship("Topic", back_populates="lab_options")


class LabSubmission(Base):
    __tablename__ = "lab_submissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    lab_id = Column(
        Integer,
        ForeignKey("topics.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    submitted_answer = Column(Text, nullable=False, default="")
    is_correct = Column(Boolean, nullable=False)

    submitted_at = Column(DateTime, default=_utcnow, nullable=False)

    user = relationship("User")
    lab = relationship("Topic")