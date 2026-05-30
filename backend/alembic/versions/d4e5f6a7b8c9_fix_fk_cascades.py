"""
Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_FOREIGN_KEYS = [
    ("users",            "users_group_id_fkey",                "group_id",           "groups",    "id", "SET NULL"),
    ("topics",           "topics_parent_id_fkey",              "parent_id",          "topics",    "id", "CASCADE"),
    ("user_progress",    "user_progress_user_id_fkey",         "user_id",            "users",     "id", "CASCADE"),
    ("user_progress",    "user_progress_topic_id_fkey",        "topic_id",           "topics",    "id", "CASCADE"),
    ("questions",        "questions_chapter_id_fkey",          "chapter_id",         "topics",    "id", "CASCADE"),
    ("questions",        "questions_reference_topic_id_fkey",  "reference_topic_id", "topics",    "id", "SET NULL"),
    ("options",          "options_question_id_fkey",           "question_id",        "questions", "id", "CASCADE"),
    ("question_answers", "question_answers_user_id_fkey",      "user_id",            "users",     "id", "CASCADE"),
    ("question_answers", "question_answers_question_id_fkey",  "question_id",        "questions", "id", "CASCADE"),
    ("lab_options",      "lab_options_lab_id_fkey",            "lab_id",             "topics",    "id", "CASCADE"),
    ("lab_submissions",  "lab_submissions_user_id_fkey",       "user_id",            "users",     "id", "CASCADE"),
    ("lab_submissions",  "lab_submissions_lab_id_fkey",        "lab_id",             "topics",    "id", "CASCADE"),
]


def upgrade() -> None:
    for table, cname, col, ref_table, ref_col, ondelete in _FOREIGN_KEYS:
        op.execute(
            f'ALTER TABLE IF EXISTS "{table}" '
            f'DROP CONSTRAINT IF EXISTS "{cname}"'
        )
        op.execute(
            f'ALTER TABLE IF EXISTS "{table}" '
            f'ADD CONSTRAINT "{cname}" '
            f'FOREIGN KEY ("{col}") REFERENCES "{ref_table}" ("{ref_col}") '
            f'ON DELETE {ondelete}'
        )


def downgrade() -> None:
    for table, cname, col, ref_table, ref_col, _ in _FOREIGN_KEYS:
        op.execute(
            f'ALTER TABLE IF EXISTS "{table}" '
            f'DROP CONSTRAINT IF EXISTS "{cname}"'
        )
        op.execute(
            f'ALTER TABLE IF EXISTS "{table}" '
            f'ADD CONSTRAINT "{cname}" '
            f'FOREIGN KEY ("{col}") REFERENCES "{ref_table}" ("{ref_col}")'
        )
