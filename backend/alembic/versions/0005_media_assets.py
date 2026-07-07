"""Media stored in-DB — uploads must survive redeploys (spec §VII).

Free-tier hosting disks are ephemeral: every redeploy/spin-up resets the
container filesystem, wiping uploaded hero images, logos and .mind targets
while their URLs stay referenced from event configs. Store the bytes in
Postgres instead; served at /media/db/{id}.

Idempotent (IF NOT EXISTS) per project convention from 0002 onward.
"""

from alembic import op

from app.db.rls import APP_ROLE, rls_policy_sql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS media_assets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            content_type VARCHAR(100) NOT NULL,
            data BYTEA NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_media_assets_tenant_id ON media_assets (tenant_id)"
    )
    # Same strict tenant RLS as every tenant-scoped table (spec §4.2).
    for stmt in rls_policy_sql("media_assets"):
        op.execute(stmt)
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON media_assets TO {APP_ROLE}")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS media_assets")
