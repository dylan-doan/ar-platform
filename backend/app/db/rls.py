"""Row-Level Security DDL (spec §4.2, §5.7).

Called from the Alembic migration. For each tenant-scoped table:

  - ENABLE + FORCE ROW LEVEL SECURITY (FORCE so even the table owner is subject
    to policies — defense in depth).
  - Policy: rows visible/writable only when the row's tenant_id matches the
    `app.tenant_id` GUC, OR the request is flagged platform-admin.

The runtime app role `zoustec_app` (non-owner, no BYPASSRLS) is created here and
granted table access; RLS applies to every query it runs.

Auth never needs an RLS exception: login resolves the tenant slug first (tenants
table is not tenant-scoped), then reads/creates the member inside a
tenant_session for that tenant. Policies stay strict.
"""

TENANT_TABLES = [
    "members",
    "events",
    "tasks",
    "stamps",
    "reward_claims",
    "audit_logs",
    "model3d_jobs",
    "export_keys",
]

APP_ROLE = "zoustec_app"


def rls_policy_sql(table: str) -> list[str]:
    """DDL statements enabling strict tenant RLS on `table`."""
    tenant_match = (
        "(tenant_id::text = current_setting('app.tenant_id', true) "
        "OR current_setting('app.is_platform_admin', true) = 'true')"
    )
    return [
        f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY",
        f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY",
        f"DROP POLICY IF EXISTS tenant_isolation ON {table}",
        f"CREATE POLICY tenant_isolation ON {table} "
        f"USING ({tenant_match}) WITH CHECK ({tenant_match})",
    ]


def create_app_role_sql(password: str) -> list[str]:
    return [
        # Idempotent role creation.
        f"""
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
            CREATE ROLE {APP_ROLE} LOGIN PASSWORD '{password}';
          END IF;
        END
        $$
        """,
        f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}",
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {APP_ROLE}",
        f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {APP_ROLE}",
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {APP_ROLE}",
    ]


def all_rls_sql(app_role_password: str) -> list[str]:
    statements: list[str] = []
    for table in TENANT_TABLES:
        statements.extend(rls_policy_sql(table))
    statements.extend(create_app_role_sql(app_role_password))
    # Non-tenant tables (tenants, platform_admins) stay plain-granted: reads are
    # needed pre-auth (slug resolution); writes are guarded by RBAC in the API.
    return statements
