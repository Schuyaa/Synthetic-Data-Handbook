"""
Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-25 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ─── topics: новые колонки под лабы ──────────────────────────
    op.add_column("topics", sa.Column("colab_url", sa.String(), nullable=True))
    op.add_column("topics", sa.Column("check_mode", sa.String(), nullable=True))
    op.add_column("topics", sa.Column("expected_answer", sa.String(), nullable=True))
    op.add_column("topics", sa.Column("numeric_tolerance", sa.Float(), nullable=True))
    op.add_column("topics", sa.Column("max_attempts", sa.Integer(), nullable=True))

    # ─── lab_options ─────────────────────────────────────────────
    op.create_table(
        "lab_options",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lab_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(["lab_id"], ["topics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lab_options_id", "lab_options", ["id"])
    op.create_index("ix_lab_options_lab_id", "lab_options", ["lab_id"])

    # ─── lab_submissions ─────────────────────────────────────────
    op.create_table(
        "lab_submissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("lab_id", sa.Integer(), nullable=False),
        sa.Column("submitted_answer", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lab_id"], ["topics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lab_submissions_id", "lab_submissions", ["id"])
    op.create_index("ix_lab_submissions_user_id", "lab_submissions", ["user_id"])
    op.create_index("ix_lab_submissions_lab_id", "lab_submissions", ["lab_id"])
    # Для счёта попыток конкретного юзера по конкретной лабе одним index-scan'ом
    op.create_index(
        "ix_lab_submissions_user_lab",
        "lab_submissions",
        ["user_id", "lab_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_lab_submissions_user_lab", table_name="lab_submissions")
    op.drop_index("ix_lab_submissions_lab_id", table_name="lab_submissions")
    op.drop_index("ix_lab_submissions_user_id", table_name="lab_submissions")
    op.drop_index("ix_lab_submissions_id", table_name="lab_submissions")
    op.drop_table("lab_submissions")

    op.drop_index("ix_lab_options_lab_id", table_name="lab_options")
    op.drop_index("ix_lab_options_id", table_name="lab_options")
    op.drop_table("lab_options")

    op.drop_column("topics", "max_attempts")
    op.drop_column("topics", "numeric_tolerance")
    op.drop_column("topics", "expected_answer")
    op.drop_column("topics", "check_mode")
    op.drop_column("topics", "colab_url")
