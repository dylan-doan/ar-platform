"""White-label (Phase 2): custom domain + per-tenant LINE binding on tenants.

Revision ID: 0002

IF NOT EXISTS everywhere: revision 0001 creates the initial schema straight
from the CURRENT models (metadata.create_all), so on a fresh database these
columns already exist by the time 0002 runs. This revision only matters for
databases migrated before the columns were added to the model.
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255)")
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS line_liff_id VARCHAR(64)")
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS line_channel_id VARCHAR(64)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_tenants_custom_domain ON tenants (custom_domain)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_tenants_custom_domain")
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS line_channel_id")
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS line_liff_id")
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS custom_domain")
