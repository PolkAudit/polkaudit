"""Seed platform admin user (invite-only console)

Revision ID: b1c2d3e4f5a7
Revises: a8b9c0d1e2f3
Create Date: 2026-11-09 15:50:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "b1c2d3e4f5a7"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None

# bcrypt hash only — rotate via console forgot/reset password anytime.
_ADMIN_EMAIL = "admin@polkaudit.xyz"
_ADMIN_HASH = (
    "$2b$12$xsqs2FbfdMGKKikrEIkMT.ISxsZHKlIHJ0FTS2l6aPyCiW1cVBS1q"
)


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO users (email, hashed_password, role, is_active, email_verified_at)
            VALUES (:email, :hash, 'admin', true, now())
            ON CONFLICT (email) DO UPDATE SET
              hashed_password = EXCLUDED.hashed_password,
              role = 'admin',
              is_active = true,
              email_verified_at = COALESCE(
                users.email_verified_at, EXCLUDED.email_verified_at
              )
            """
        ),
        {"email": _ADMIN_EMAIL, "hash": _ADMIN_HASH},
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO user_projects (user_id, project_id, role)
            SELECT u.id, p.id, 'admin'
            FROM users u
            CROSS JOIN projects p
            WHERE u.email = :email AND p.slug = 'polkadot-main'
            ON CONFLICT (user_id, project_id) DO NOTHING
            """
        ),
        {"email": _ADMIN_EMAIL},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "DELETE FROM user_projects WHERE user_id IN "
            "(SELECT id FROM users WHERE email = :email)"
        ),
        {"email": _ADMIN_EMAIL},
    )
    conn.execute(
        sa.text("DELETE FROM users WHERE email = :email"),
        {"email": _ADMIN_EMAIL},
    )
