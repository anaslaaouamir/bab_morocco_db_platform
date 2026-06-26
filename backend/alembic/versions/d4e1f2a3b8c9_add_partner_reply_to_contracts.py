"""add partner_reply to contracts

Revision ID: d4e1f2a3b8c9
Revises: c5d2f1a8b3e7
Create Date: 2026-06-26

"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e1f2a3b8c9'
down_revision = 'c5d2f1a8b3e7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('contracts', sa.Column('partner_reply', sa.Text(), nullable=True))
    op.add_column('contracts', sa.Column('partner_replied_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('contracts', 'partner_replied_at')
    op.drop_column('contracts', 'partner_reply')
