"""Phase 3: model3d_jobs (AI-3D pipeline) + export_keys (headless export).

Revision ID: 0003

Tables are created from the live models when the DB is fresh (revision 0001
does metadata.create_all), so everything here is IF NOT EXISTS / idempotent —
this revision upgrades databases created before Phase 3.
"""

from alembic import op

from app.db.rls import rls_policy_sql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

NEW_TABLES = ["model3d_jobs", "export_keys"]


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS model3d_jobs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL DEFAULT '',
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            provider VARCHAR(32) NOT NULL,
            provider_job_id VARCHAR(128),
            source_image_path VARCHAR(1024) NOT NULL,
            result_glb_url VARCHAR(1024),
            error VARCHAR(1024),
            params JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_model3d_jobs_tenant_id ON model3d_jobs (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_model3d_jobs_status ON model3d_jobs (status)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS export_keys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            key_prefix VARCHAR(12) NOT NULL,
            key_hash VARCHAR(64) NOT NULL UNIQUE,
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            revoked_at TIMESTAMP
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_export_keys_tenant_id ON export_keys (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_export_keys_event_id ON export_keys (event_id)")

    # Same strict tenant RLS as every other tenant table.
    for table in NEW_TABLES:
        for statement in rls_policy_sql(table):
            op.execute(statement)
    # The app role gets access via ALTER DEFAULT PRIVILEGES from 0001 only for
    # tables created by the owner afterwards — grant explicitly to be safe.
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON model3d_jobs, export_keys TO zoustec_app")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS export_keys")
    op.execute("DROP TABLE IF EXISTS model3d_jobs")
