"""add_login_tracking_to_users

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-30 00:00:03.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('last_login_at', sa.DateTime(), nullable=True))
    op.add_column(
        'users',
        sa.Column('failed_login_attempts', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column('users', sa.Column('locked_until', sa.DateTime(), nullable=True))
    op.add_column(
        'users',
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.execute("UPDATE users SET updated_at = created_at")
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column('failed_login_attempts', server_default=None)
        batch_op.alter_column('updated_at', nullable=False)


def downgrade() -> None:
    op.drop_column('users', 'updated_at')
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_login_attempts')
    op.drop_column('users', 'last_login_at')
