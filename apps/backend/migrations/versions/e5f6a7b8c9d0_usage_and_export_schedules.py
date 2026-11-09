"""Usage counters + export schedules

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-11-09 17:10:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "usage_counters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("period", sa.String(length=7), nullable=False),
        sa.Column("api_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("export_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_usage_counters_project_id", "usage_counters", ["project_id"])
    op.create_unique_constraint(
        "uq_usage_project_period", "usage_counters", ["project_id", "period"]
    )

    op.create_table(
        "export_schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False, server_default="weekly-exports"),
        sa.Column("export_type", sa.String(), nullable=False, server_default="proposals"),
        sa.Column("cadence", sa.String(), nullable=False, server_default="weekly"),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_export_schedules_project_id", "export_schedules", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_export_schedules_project_id", table_name="export_schedules")
    op.drop_table("export_schedules")
    op.drop_constraint("uq_usage_project_period", "usage_counters", type_="unique")
    op.drop_index("ix_usage_counters_project_id", table_name="usage_counters")
    op.drop_table("usage_counters")
