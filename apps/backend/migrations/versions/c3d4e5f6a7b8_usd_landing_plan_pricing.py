"""USD landing midpoint plan pricing

Revision ID: c3d4e5f6a7b8
Revises: b1c2d3e4f5a7
Create Date: 2026-11-09 16:00:00.000000

Locks self-serve list prices to polkaudit.xyz midpoints (USD):
  Pilot $1,000 / 3 months, Starter $149 / month, Pro $599 / month.
  Enterprise remains quote-only (price 0).
"""
from alembic import op
import sqlalchemy as sa


revision = "c3d4e5f6a7b8"
down_revision = "b1c2d3e4f5a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plans",
        sa.Column("price_usd_cents", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "plans",
        sa.Column(
            "billing_interval",
            sa.String(),
            nullable=False,
            server_default="month",
        ),
    )
    op.add_column(
        "plans",
        sa.Column("currency", sa.String(), nullable=False, server_default="USD"),
    )

    # Clear INR billable amounts — USD is the only checkout currency.
    op.execute("UPDATE plans SET price_inr_paise = 0")

    op.execute(
        """
        UPDATE plans SET
          name = 'Free',
          price_usd_cents = 0,
          billing_interval = 'month',
          currency = 'USD',
          export_limit_daily = 10,
          retention_blocks = 50000,
          is_active = true
        WHERE slug = 'free'
        """
    )
    op.execute(
        """
        UPDATE plans SET
          name = 'Pilot',
          price_usd_cents = 100000,
          billing_interval = 'once_3mo',
          currency = 'USD',
          export_limit_daily = 100,
          retention_blocks = 200000,
          is_active = true
        WHERE slug = 'pilot'
        """
    )
    op.execute(
        """
        UPDATE plans SET
          name = 'Pro',
          price_usd_cents = 59900,
          billing_interval = 'month',
          currency = 'USD',
          export_limit_daily = 1000,
          retention_blocks = 1000000,
          is_active = true
        WHERE slug = 'pro'
        """
    )

    op.execute(
        """
        INSERT INTO plans (slug, name, export_limit_daily, retention_blocks, is_active, price_inr_paise, price_usd_cents, billing_interval, currency)
        VALUES
          ('starter', 'Starter', 200, 300000, true, 0, 14900, 'month', 'USD'),
          ('enterprise', 'Enterprise', 10000, 5000000, true, 0, 0, 'custom', 'USD')
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          export_limit_daily = EXCLUDED.export_limit_daily,
          retention_blocks = EXCLUDED.retention_blocks,
          is_active = EXCLUDED.is_active,
          price_inr_paise = 0,
          price_usd_cents = EXCLUDED.price_usd_cents,
          billing_interval = EXCLUDED.billing_interval,
          currency = 'USD'
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM plans WHERE slug IN ('starter', 'enterprise')")
    op.drop_column("plans", "currency")
    op.drop_column("plans", "billing_interval")
    op.drop_column("plans", "price_usd_cents")
    # Restore previous INR seeds (best-effort)
    op.execute("UPDATE plans SET price_inr_paise = 0 WHERE slug = 'free'")
    op.execute("UPDATE plans SET price_inr_paise = 499900 WHERE slug = 'pilot'")
    op.execute("UPDATE plans SET price_inr_paise = 1499900 WHERE slug = 'pro'")
