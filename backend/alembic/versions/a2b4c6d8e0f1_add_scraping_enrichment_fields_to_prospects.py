"""add scraping enrichment fields to prospects

Revision ID: a2b4c6d8e0f1
Revises: d3e4f5a6b7c8
Create Date: 2026-07-03

"""
from alembic import op
import sqlalchemy as sa

revision = 'a2b4c6d8e0f1'
down_revision = 'd3e4f5a6b7c8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('prospects', sa.Column('note_google', sa.Float(), nullable=True))
    op.add_column('prospects', sa.Column('nb_avis_google', sa.Integer(), nullable=True))
    op.add_column('prospects', sa.Column('telephone', sa.String(length=50), nullable=True))
    op.add_column('prospects', sa.Column('business_status', sa.String(length=30), nullable=True))
    op.add_column('prospects', sa.Column('https_actif', sa.Boolean(), nullable=True))
    op.add_column('prospects', sa.Column('cta_reservation_present', sa.Boolean(), nullable=True))
    op.add_column('prospects', sa.Column('formulaire_contact_present', sa.Boolean(), nullable=True))
    op.add_column('prospects', sa.Column('reseaux_sociaux', sa.String(length=255), nullable=True))
    op.add_column('prospects', sa.Column('langues_disponibles', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('prospects', 'langues_disponibles')
    op.drop_column('prospects', 'reseaux_sociaux')
    op.drop_column('prospects', 'formulaire_contact_present')
    op.drop_column('prospects', 'cta_reservation_present')
    op.drop_column('prospects', 'https_actif')
    op.drop_column('prospects', 'business_status')
    op.drop_column('prospects', 'telephone')
    op.drop_column('prospects', 'nb_avis_google')
    op.drop_column('prospects', 'note_google')
