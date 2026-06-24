"""create_negotiation_messages_table

Revision ID: b7d3e0f5a921
Revises: a4f1c8e92b37
Create Date: 2026-06-24 18:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d3e0f5a921'
down_revision: Union[str, None] = 'a4f1c8e92b37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('negotiation_messages',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('prospect_id', sa.Uuid(), nullable=False),
    sa.Column('direction', sa.String(length=10), nullable=False),
    sa.Column('corps', sa.Text(), nullable=False),
    sa.Column('date_message', sa.DateTime(), nullable=False),
    sa.Column('analyse_intent', sa.String(length=50), nullable=True),
    sa.Column('analyse_objection', sa.String(length=50), nullable=True),
    sa.Column('taux_demande', sa.Float(), nullable=True),
    sa.Column('requires_human', sa.Boolean(), nullable=False),
    sa.Column('scenarios_json', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['prospect_id'], ['prospects.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('negotiation_messages')
