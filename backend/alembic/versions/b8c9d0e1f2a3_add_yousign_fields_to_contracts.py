"""add yousign fields to contracts

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-21

"""
from alembic import op
import sqlalchemy as sa

revision = 'b8c9d0e1f2a3'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('contracts', sa.Column('yousign_signature_request_id', sa.String(length=255), nullable=True))
    op.add_column('contracts', sa.Column('yousign_document_id', sa.String(length=255), nullable=True))
    op.add_column('contracts', sa.Column('yousign_signer_bab_id', sa.String(length=255), nullable=True))
    op.add_column('contracts', sa.Column('yousign_signer_partner_id', sa.String(length=255), nullable=True))
    op.add_column('contracts', sa.Column('yousign_signer_bab_done', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('contracts', sa.Column('signed_pdf_bytes', sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column('contracts', 'signed_pdf_bytes')
    op.drop_column('contracts', 'yousign_signer_bab_done')
    op.drop_column('contracts', 'yousign_signer_partner_id')
    op.drop_column('contracts', 'yousign_signer_bab_id')
    op.drop_column('contracts', 'yousign_document_id')
    op.drop_column('contracts', 'yousign_signature_request_id')
