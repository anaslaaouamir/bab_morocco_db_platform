"""add_assigned_to_to_prospects

Revision ID: f6a3b4c5d9e2
Revises: e5f2a3b4c9d1
Create Date: 2026-06-30 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a3b4c5d9e2'
down_revision: Union[str, None] = 'e5f2a3b4c9d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('prospects', sa.Column('assigned_to', sa.Uuid(), nullable=True))
    with op.batch_alter_table('prospects') as batch_op:
        batch_op.create_foreign_key(
            'fk_prospects_assigned_to_users',
            'users',
            ['assigned_to'],
            ['id'],
            ondelete='SET NULL',
        )


def downgrade() -> None:
    with op.batch_alter_table('prospects') as batch_op:
        batch_op.drop_constraint('fk_prospects_assigned_to_users', type_='foreignkey')
    op.drop_column('prospects', 'assigned_to')
