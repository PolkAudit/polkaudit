"""SaaS auth tokens, email verify, payment events

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-11-09 14:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a8b9c0d1e2f3'
down_revision = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        'auth_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('purpose', sa.String(), nullable=False),
        sa.Column('token_hash', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_auth_tokens_token_hash', 'auth_tokens', ['token_hash'])
    op.create_index('ix_auth_tokens_user_id', 'auth_tokens', ['user_id'])

    op.add_column('plans', sa.Column('price_inr_paise', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('subscriptions', sa.Column('razorpay_payment_link_id', sa.String(), nullable=True))

    op.create_table(
        'payment_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('provider', sa.String(), nullable=False, server_default='razorpay'),
        sa.Column('event_id', sa.String(), nullable=True),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_payment_events_event_id', 'payment_events', ['event_id'])

    op.execute("UPDATE plans SET price_inr_paise = 0 WHERE slug = 'free'")
    op.execute("UPDATE plans SET price_inr_paise = 499900 WHERE slug = 'pilot'")  # ₹4,999
    op.execute("UPDATE plans SET price_inr_paise = 1499900 WHERE slug = 'pro'")  # ₹14,999


def downgrade() -> None:
    op.drop_index('ix_payment_events_event_id', table_name='payment_events')
    op.drop_table('payment_events')
    op.drop_column('subscriptions', 'razorpay_payment_link_id')
    op.drop_column('plans', 'price_inr_paise')
    op.drop_index('ix_auth_tokens_user_id', table_name='auth_tokens')
    op.drop_index('ix_auth_tokens_token_hash', table_name='auth_tokens')
    op.drop_table('auth_tokens')
    op.drop_column('users', 'email_verified_at')
