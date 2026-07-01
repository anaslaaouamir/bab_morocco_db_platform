"""add partner_reply_pdf to contracts

Revision ID: d3e4f5a6b7c8
Revises: c1d2e3f4a5b6
Create Date: 2026-07-01

"""
from alembic import op
import sqlalchemy as sa

revision = 'd3e4f5a6b7c8'
down_revision = 'c1d2e3f4a5b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('contracts', sa.Column('partner_reply_pdf', sa.LargeBinary(), nullable=True))
    op.add_column('contracts', sa.Column('partner_reply_pdf_filename', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('contracts', 'partner_reply_pdf_filename')
    op.drop_column('contracts', 'partner_reply_pdf')
