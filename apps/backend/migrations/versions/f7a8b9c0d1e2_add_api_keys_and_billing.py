"""Add api_keys, plans, and subscriptions tables

Revision ID: f7a8b9c0d1e2
Revises: 29912f84cb01
Create Date: 2026-11-09 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f7a8b9c0d1e2'
down_revision = '674ce6f89558'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'api_keys',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('name', sa.String(), nullable=False, server_default='default'),
        sa.Column('key_prefix', sa.String(length=12), nullable=False),
        sa.Column('key_hash', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_api_keys_key_prefix', 'api_keys', ['key_prefix'])
    op.create_index('ix_api_keys_project_id', 'api_keys', ['project_id'])

    op.create_table(
        'plans',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('slug', sa.String(), nullable=False, unique=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('export_limit_daily', sa.Integer(), nullable=False, server_default='50'),
        sa.Column('retention_blocks', sa.Integer(), nullable=False, server_default='100000'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
    )

    op.create_table(
        'subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('plan_id', sa.Integer(), sa.ForeignKey('plans.id'), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='active'),
        sa.Column('billing_note', sa.String(), nullable=True),
        sa.Column('starts_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_subscriptions_project_id', 'subscriptions', ['project_id'])

    # Seed starter plans
    op.execute(
        """
        INSERT INTO plans (slug, name, export_limit_daily, retention_blocks, is_active)
        VALUES
          ('free', 'Free', 10, 50000, true),
          ('pilot', 'Pilot', 100, 200000, true),
          ('pro', 'Pro', 1000, 1000000, true)
        """
    )


def downgrade() -> None:
    op.drop_table('subscriptions')
    op.drop_table('plans')
    op.drop_index('ix_api_keys_project_id', table_name='api_keys')
    op.drop_index('ix_api_keys_key_prefix', table_name='api_keys')
    op.drop_table('api_keys')
