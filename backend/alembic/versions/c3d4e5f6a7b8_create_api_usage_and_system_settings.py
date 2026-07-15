"""create api_usage_logs and system_settings tables

Revision ID: c3d4e5f6a7b8
Revises: b4c6d8e0f2a4
Create Date: 2026-07-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b4c6d8e0f2a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'api_usage_logs',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.Column('generator', sa.String(30), nullable=False),
        sa.Column('model', sa.String(50), nullable=False),
        sa.Column('input_tokens', sa.Integer(), nullable=False),
        sa.Column('output_tokens', sa.Integer(), nullable=False),
        sa.Column('total_tokens', sa.Integer(), nullable=False),
        sa.Column('prospect_id', sa.Uuid(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
    )
    op.create_index('ix_api_usage_logs_timestamp', 'api_usage_logs', ['timestamp'])

    op.create_table(
        'system_settings',
        sa.Column('key', sa.String(100), primary_key=True),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('system_settings')
    op.drop_index('ix_api_usage_logs_timestamp', table_name='api_usage_logs')
    op.drop_table('api_usage_logs')
