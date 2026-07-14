"""add_provider_to_api_usage_logs

Revision ID: 5078b28fc281
Revises: b4c6d8e0f2a4
Create Date: 2026-07-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '5078b28fc281'
down_revision: Union[str, None] = 'b4c6d8e0f2a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'api_usage_logs',
        sa.Column('provider', sa.String(20), nullable=False, server_default='claude'),
    )


def downgrade() -> None:
    op.drop_column('api_usage_logs', 'provider')
