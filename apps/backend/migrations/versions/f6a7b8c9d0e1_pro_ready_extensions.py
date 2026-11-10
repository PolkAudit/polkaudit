"""Pro-ready: schedule runner fields, API key scopes, invoices

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-11-10 10:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "export_schedules",
        sa.Column("notify_email", sa.String(), nullable=True),
    )
    op.add_column(
        "export_schedules",
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "export_schedules",
        sa.Column("last_status", sa.String(), nullable=True),
    )
    op.add_column(
        "export_schedules",
        sa.Column("last_error", sa.String(), nullable=True),
    )

    op.add_column(
        "api_keys",
        sa.Column(
            "scopes",
            sa.String(),
            nullable=False,
            server_default="read,export,alerts",
        ),
    )

    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("payment_event_id", sa.Integer(), sa.ForeignKey("payment_events.id"), nullable=True),
        sa.Column("invoice_number", sa.String(), nullable=False),
        sa.Column("plan_slug", sa.String(), nullable=True),
        sa.Column("amount_usd_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(), nullable=False, server_default="USD"),
        sa.Column("status", sa.String(), nullable=False, server_default="paid"),
        sa.Column("pdf_path", sa.String(), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_invoices_project_id", "invoices", ["project_id"])
    op.create_index("ix_invoices_invoice_number", "invoices", ["invoice_number"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_invoices_invoice_number", table_name="invoices")
    op.drop_index("ix_invoices_project_id", table_name="invoices")
    op.drop_table("invoices")
    op.drop_column("api_keys", "scopes")
    op.drop_column("export_schedules", "last_error")
    op.drop_column("export_schedules", "last_status")
    op.drop_column("export_schedules", "last_run_at")
    op.drop_column("export_schedules", "notify_email")
