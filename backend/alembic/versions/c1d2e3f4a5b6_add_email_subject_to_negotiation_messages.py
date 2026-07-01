"""add email_subject to negotiation_messages

Revision ID: c1d2e3f4a5b6
Revises: a9c4d6e1f3b2
Create Date: 2026-07-01

"""
from alembic import op
import sqlalchemy as sa

revision = 'c1d2e3f4a5b6'
down_revision = 'a9c4d6e1f3b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('negotiation_messages', sa.Column('email_subject', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('negotiation_messages', 'email_subject')
