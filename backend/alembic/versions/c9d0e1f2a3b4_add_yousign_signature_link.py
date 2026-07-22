"""add yousign_signature_link to contracts

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contracts", sa.Column("yousign_signature_link", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("contracts", "yousign_signature_link")
