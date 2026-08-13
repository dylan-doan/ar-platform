"""Static-website versions (docs/html_website_builder_deployment_platform.md).

`site_versions` — one immutable build of a customer's static site per row
(generate or upload always creates a NEW version; nothing is overwritten).
`site_files` — the version's files as bytes (ephemeral-disk hosting, same
reasoning as media_assets). `events.site_version_id` — the version production
serves at /sites/{tenant}/{event}; publish and rollback both just repoint it.

Idempotent (IF NOT EXISTS) per project convention.
"""

from alembic import op

from app.db.rls import APP_ROLE, rls_policy_sql

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS site_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            version_number INTEGER NOT NULL,
            source_type VARCHAR(16) NOT NULL,
            source_hash VARCHAR(64) NOT NULL,
            file_count INTEGER NOT NULL,
            total_bytes INTEGER NOT NULL,
            created_by VARCHAR(64) NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_site_versions_event_number UNIQUE (event_id, version_number)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_site_versions_tenant_id ON site_versions (tenant_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_site_versions_event_id ON site_versions (event_id)"
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS site_files (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            version_id UUID NOT NULL REFERENCES site_versions(id) ON DELETE CASCADE,
            path VARCHAR(512) NOT NULL,
            content_type VARCHAR(100) NOT NULL,
            data BYTEA NOT NULL,
            size INTEGER NOT NULL,
            CONSTRAINT uq_site_files_version_path UNIQUE (version_id, path)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_site_files_tenant_id ON site_files (tenant_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_site_files_version_id ON site_files (version_id)"
    )
    op.execute(
        "ALTER TABLE events ADD COLUMN IF NOT EXISTS site_version_id UUID "
        "REFERENCES site_versions(id) ON DELETE SET NULL"
    )
    # Same strict tenant RLS as every tenant-scoped table (spec §4.2).
    for table in ("site_versions", "site_files"):
        for stmt in rls_policy_sql(table):
            op.execute(stmt)
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")


def downgrade() -> None:
    op.execute("ALTER TABLE events DROP COLUMN IF EXISTS site_version_id")
    op.execute("DROP TABLE IF EXISTS site_files")
    op.execute("DROP TABLE IF EXISTS site_versions")
