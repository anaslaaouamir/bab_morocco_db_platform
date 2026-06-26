"""create_contracts_table

Revision ID: c5d2f1a8b3e7
Revises: b7d3e0f5a921
Create Date: 2026-06-26 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c5d2f1a8b3e7'
down_revision: Union[str, None] = 'b7d3e0f5a921'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'contracts',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('prospect_id', sa.Uuid(), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('partner_name', sa.String(length=255), nullable=False),
        sa.Column('partner_type', sa.String(length=50), nullable=False),
        sa.Column('partner_email', sa.String(length=255), nullable=True),
        sa.Column('country', sa.String(length=100), nullable=False),
        sa.Column('language', sa.String(length=5), nullable=False),
        sa.Column('commission', sa.Float(), nullable=False),
        sa.Column('estimated_annual_value', sa.Float(), nullable=True),
        sa.Column('clauses_json', sa.Text(), nullable=True),
        sa.Column('pdf_bytes', sa.LargeBinary(), nullable=True),
        sa.Column('human_review_required', sa.Boolean(), nullable=False),
        sa.Column('human_review_reason', sa.String(length=255), nullable=True),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('signed_at', sa.DateTime(), nullable=True),
        sa.Column('declined_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['prospect_id'], ['prospects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('prospect_id'),
    )


def downgrade() -> None:
    op.drop_table('contracts')
