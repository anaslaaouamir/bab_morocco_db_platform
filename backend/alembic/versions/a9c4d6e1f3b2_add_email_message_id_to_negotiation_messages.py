"""add email_message_id to negotiation_messages

Revision ID: a9c4d6e1f3b2
Revises: b2c3d4e5f6a7
Create Date: 2026-07-01

"""
from alembic import op
import sqlalchemy as sa

revision = 'a9c4d6e1f3b2'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('negotiation_messages', sa.Column('email_message_id', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('negotiation_messages', 'email_message_id')
