"""
Revision ID: a1b2c3d4e5f6
Revises: 3942f1254af3
Create Date: 2026-04-21 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "3942f1254af3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_user_progress_user_status",
        "user_progress",
        ["user_id", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_user_progress_user_status", table_name="user_progress")
