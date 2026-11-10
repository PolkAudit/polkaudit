"""Add asset-aware metadata columns to treasury_spends

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-11-10

Local/P0-3 only — do not apply to shared/production without authorization.
Backfills native DOT assumptions only when source/event metadata is absent.
"""

from alembic import op
import sqlalchemy as sa


revision = "h8i9j0k1l2m3"
down_revision = "g7h8i9j0k1l2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("treasury_spends", sa.Column("source_chain", sa.String(), nullable=True))
    op.add_column("treasury_spends", sa.Column("asset_id", sa.String(), nullable=True))
    op.add_column("treasury_spends", sa.Column("asset_symbol", sa.String(), nullable=True))
    op.add_column("treasury_spends", sa.Column("decimals", sa.Integer(), nullable=True))
    op.add_column("treasury_spends", sa.Column("amount_display", sa.String(), nullable=True))
    op.add_column("treasury_spends", sa.Column("display_status", sa.String(), nullable=True))

    # Legacy rows without metadata: mark unresolved (do NOT assume DOT)
    op.execute(
        """
        UPDATE treasury_spends
        SET
          source_chain = COALESCE(source_chain, 'unknown'),
          asset_id = COALESCE(asset_id, 'unknown'),
          display_status = COALESCE(display_status, 'unresolved')
        WHERE display_status IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("treasury_spends", "display_status")
    op.drop_column("treasury_spends", "amount_display")
    op.drop_column("treasury_spends", "decimals")
    op.drop_column("treasury_spends", "asset_symbol")
    op.drop_column("treasury_spends", "asset_id")
    op.drop_column("treasury_spends", "source_chain")
