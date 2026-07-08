"""Email + password sign-in for platform admins (Zoustec console).

The console is Zoustec's internal back office — LINE login stays available
but a classic account is the primary path. Account material seeded from
PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD env (see db/seed.py).

Idempotent (IF NOT EXISTS) per project convention from 0002 onward.
"""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS email VARCHAR(255)")
    op.execute(
        "ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_platform_admins_email ON platform_admins (email)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_platform_admins_email")
    op.execute("ALTER TABLE platform_admins DROP COLUMN IF EXISTS password_hash")
    op.execute("ALTER TABLE platform_admins DROP COLUMN IF EXISTS email")
