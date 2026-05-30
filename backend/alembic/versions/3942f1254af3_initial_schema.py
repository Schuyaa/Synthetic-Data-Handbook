"""
Revision ID: 3942f1254af3
Revises:
Create Date: 2026-04-15 08:04:40.415036
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "3942f1254af3"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ─── groups ───────────────────────────────────────
    op.create_table(
        "groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("course", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index(op.f("ix_groups_id"), "groups", ["id"], unique=False)

    # ─── users ────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("first_name", sa.String(), nullable=True),
        sa.Column("last_name", sa.String(), nullable=True),
        sa.Column("group_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    # ─── topics ───────────────────────────────────────
    op.create_table(
        "topics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("summary", sa.String(), nullable=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("estimated_minutes", sa.Integer(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["topics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_topics_slug"),
    )
    op.create_index(op.f("ix_topics_id"), "topics", ["id"], unique=False)
    op.create_index(op.f("ix_topics_slug"), "topics", ["slug"], unique=False)
    op.create_index(op.f("ix_topics_parent_id"), "topics", ["parent_id"], unique=False)

    # ─── user_progress ────────────────────────────────
    op.create_table(
        "user_progress",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "topic_id", name="uq_user_topic_progress"),
    )
    op.create_index(op.f("ix_user_progress_id"), "user_progress", ["id"], unique=False)
    op.create_index(op.f("ix_user_progress_user_id"), "user_progress", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_progress_topic_id"), "user_progress", ["topic_id"], unique=False)

    # ─── questions ────────────────────────────────────
    op.create_table(
        "questions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("chapter_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(), server_default="single", nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("reference_topic_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["chapter_id"], ["topics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reference_topic_id"], ["topics.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_questions_id"), "questions", ["id"], unique=False)
    op.create_index(op.f("ix_questions_chapter_id"), "questions", ["chapter_id"], unique=False)

    # ─── options ──────────────────────────────────────
    op.create_table(
        "options",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_options_id"), "options", ["id"], unique=False)
    op.create_index(op.f("ix_options_question_id"), "options", ["question_id"], unique=False)

    # ─── question_answers ─────────────────────────────
    op.create_table(
        "question_answers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("selected_option_ids", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("answered_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "question_id", name="uq_user_question_answer"),
    )
    op.create_index(op.f("ix_question_answers_id"), "question_answers", ["id"], unique=False)
    op.create_index(op.f("ix_question_answers_user_id"), "question_answers", ["user_id"], unique=False)
    op.create_index(op.f("ix_question_answers_question_id"), "question_answers", ["question_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_question_answers_question_id"), table_name="question_answers")
    op.drop_index(op.f("ix_question_answers_user_id"), table_name="question_answers")
    op.drop_index(op.f("ix_question_answers_id"), table_name="question_answers")
    op.drop_table("question_answers")

    op.drop_index(op.f("ix_options_question_id"), table_name="options")
    op.drop_index(op.f("ix_options_id"), table_name="options")
    op.drop_table("options")

    op.drop_index(op.f("ix_questions_chapter_id"), table_name="questions")
    op.drop_index(op.f("ix_questions_id"), table_name="questions")
    op.drop_table("questions")

    op.drop_index(op.f("ix_user_progress_topic_id"), table_name="user_progress")
    op.drop_index(op.f("ix_user_progress_user_id"), table_name="user_progress")
    op.drop_index(op.f("ix_user_progress_id"), table_name="user_progress")
    op.drop_table("user_progress")

    op.drop_index(op.f("ix_topics_parent_id"), table_name="topics")
    op.drop_index(op.f("ix_topics_slug"), table_name="topics")
    op.drop_index(op.f("ix_topics_id"), table_name="topics")
    op.drop_table("topics")

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_table("users")

    op.drop_index(op.f("ix_groups_id"), table_name="groups")
    op.drop_table("groups")
