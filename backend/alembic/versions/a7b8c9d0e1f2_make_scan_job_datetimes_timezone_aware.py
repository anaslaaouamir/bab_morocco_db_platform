"""make_scan_job_datetimes_timezone_aware

Revision ID: a7b8c9d0e1f2
Revises: 5078b28fc281
Create Date: 2026-07-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = '5078b28fc281'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'scan_jobs', 'scheduled_at',
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
    )
    op.alter_column(
        'scan_jobs', 'created_at',
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
    )
    op.alter_column(
        'scan_jobs', 'completed_at',
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
    )


def downgrade() -> None:
    op.alter_column(
        'scan_jobs', 'completed_at',
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
    )
    op.alter_column(
        'scan_jobs', 'created_at',
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
    )
    op.alter_column(
        'scan_jobs', 'scheduled_at',
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
    )
