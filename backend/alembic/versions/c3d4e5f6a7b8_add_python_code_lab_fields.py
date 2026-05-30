"""
Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-09 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("topics", sa.Column("starter_code", sa.Text(), nullable=True))
    op.add_column("topics", sa.Column("test_code", sa.Text(), nullable=True))
    op.add_column("topics", sa.Column("required_packages", sa.JSON(), nullable=True))
    op.add_column("topics", sa.Column("timeout_seconds", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("topics", "timeout_seconds")
    op.drop_column("topics", "required_packages")
    op.drop_column("topics", "test_code")
    op.drop_column("topics", "starter_code")
