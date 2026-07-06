"""widen reseaux_sociaux to text

Revision ID: b7c8d9e0f1a2
Revises: a2b4c6d8e0f1
Create Date: 2026-07-06

reseaux_sociaux now stores "label|url" pairs (real profile links, not just
platform names), which can exceed the original String(255) cap.
"""
from alembic import op
import sqlalchemy as sa

revision = "b7c8d9e0f1a2"
down_revision = "a2b4c6d8e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("prospects") as batch_op:
        batch_op.alter_column(
            "reseaux_sociaux",
            existing_type=sa.String(255),
            type_=sa.Text(),
            existing_nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("prospects") as batch_op:
        batch_op.alter_column(
            "reseaux_sociaux",
            existing_type=sa.Text(),
            type_=sa.String(255),
            existing_nullable=True,
        )
