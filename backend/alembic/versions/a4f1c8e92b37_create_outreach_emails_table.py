"""create_outreach_emails_table

Revision ID: a4f1c8e92b37
Revises: 3f9f89c17064
Create Date: 2026-06-24 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4f1c8e92b37'
down_revision: Union[str, None] = '3f9f89c17064'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('outreach_emails',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('prospect_id', sa.Uuid(), nullable=False),
    sa.Column('sequence_step', sa.String(length=10), nullable=False),
    sa.Column('variant', sa.String(length=1), nullable=False),
    sa.Column('langue', sa.String(length=5), nullable=False),
    sa.Column('sujet', sa.String(length=500), nullable=False),
    sa.Column('corps', sa.Text(), nullable=False),
    sa.Column('statut', sa.String(length=20), nullable=False),
    sa.Column('date_envoi_prevu', sa.Date(), nullable=False),
    sa.Column('date_envoi_reel', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['prospect_id'], ['prospects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('outreach_emails')
