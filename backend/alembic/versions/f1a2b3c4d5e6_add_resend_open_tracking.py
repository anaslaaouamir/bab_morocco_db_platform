"""add resend_email_id and opened_at to negotiation_messages and contracts

Revision ID: f1a2b3c4d5e6
Revises: e1f2a3b4c5d6
Create Date: 2026-07-07

"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('negotiation_messages', sa.Column('resend_email_id', sa.String(length=255), nullable=True))
    op.add_column('negotiation_messages', sa.Column('opened_at', sa.DateTime(), nullable=True))
    op.add_column('contracts', sa.Column('resend_email_id', sa.String(length=255), nullable=True))
    op.add_column('contracts', sa.Column('opened_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('contracts', 'opened_at')
    op.drop_column('contracts', 'resend_email_id')
    op.drop_column('negotiation_messages', 'opened_at')
    op.drop_column('negotiation_messages', 'resend_email_id')
