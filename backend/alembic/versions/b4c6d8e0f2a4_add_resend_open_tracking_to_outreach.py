"""add resend_email_id and opened_at to outreach_emails

Revision ID: b4c6d8e0f2a4
Revises: f1a2b3c4d5e6
Create Date: 2026-07-07

"""
from alembic import op
import sqlalchemy as sa

revision = 'b4c6d8e0f2a4'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('outreach_emails', sa.Column('resend_email_id', sa.String(length=255), nullable=True))
    op.add_column('outreach_emails', sa.Column('opened_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('outreach_emails', 'opened_at')
    op.drop_column('outreach_emails', 'resend_email_id')
