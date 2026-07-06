"""add scheduled_at to scan_jobs

Revision ID: e1f2a3b4c5d6
Revises: b7c8d9e0f1a2
Create Date: 2026-07-06

Part of SCHEDULED_SCAN_CALENDAR_PLAN.md Phase A — lets a scan job be parked
with a future run time (statut="scheduled") instead of always starting
immediately.
"""
from alembic import op
import sqlalchemy as sa

revision = "e1f2a3b4c5d6"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("scan_jobs") as batch_op:
        batch_op.add_column(sa.Column("scheduled_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("scan_jobs") as batch_op:
        batch_op.drop_column("scheduled_at")
