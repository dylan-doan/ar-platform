"""Email + password sign-in for tenant admins.

Accounts are provisioned from the Zoustec console (temporary password,
forced change on first login) — customers manage their dashboard without
LINE. Email is globally unique so the login form needs no tenant selector.

Idempotent (IF NOT EXISTS) per project convention from 0002 onward.
"""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE members ADD COLUMN IF NOT EXISTS email VARCHAR(255)")
    op.execute("ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)")
    op.execute(
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_members_email ON members (email) WHERE email IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_members_email")
    op.execute("ALTER TABLE members DROP COLUMN IF EXISTS must_change_password")
    op.execute("ALTER TABLE members DROP COLUMN IF EXISTS password_hash")
    op.execute("ALTER TABLE members DROP COLUMN IF EXISTS email")
