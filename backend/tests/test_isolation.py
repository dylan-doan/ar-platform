"""Cross-tenant isolation tests (spec §4.2 — explicitly required).

Two layers are proven:
  1. API layer: a member/admin of tenant A cannot read or mutate tenant B data.
  2. RLS layer: even a raw query WITHOUT any tenant WHERE-clause, run on the
     restricted app role with tenant A's GUC, cannot see tenant B rows.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from tests.conftest import bearer, login


async def test_member_cannot_read_other_tenants_event(client, demo):
    token_b = await login(client, "beta", "bob")
    resp = await client.get(f"/api/me/events/{demo['event_a'].id}", headers=bearer(token_b))
    assert resp.status_code == 404  # not even a 403 — invisible


async def test_member_cannot_complete_other_tenants_task(client, demo):
    token_b = await login(client, "beta", "bob")
    resp = await client.post(
        f"/api/me/tasks/{demo['task_qr'].id}/complete",
        headers=bearer(token_b),
        json={"qr_code": "secret-a"},  # even with the correct QR secret
    )
    assert resp.status_code == 404


async def test_admin_cannot_read_other_tenants_stats(client, demo):
    token_admin_b = await login(client, "beta", "admin-b")
    resp = await client.get(
        f"/api/admin/events/{demo['event_a'].id}/stats", headers=bearer(token_admin_b)
    )
    assert resp.status_code == 404


async def test_admin_cannot_modify_other_tenants_event(client, demo):
    token_admin_b = await login(client, "beta", "admin-b")
    resp = await client.patch(
        f"/api/admin/events/{demo['event_a'].id}",
        headers=bearer(token_admin_b),
        json={"name": "Hacked"},
    )
    assert resp.status_code == 404


async def test_rls_blocks_unfiltered_query_on_app_role(demo):
    """The core RLS proof: connect as the restricted app role, set tenant A's
    GUC, then SELECT with NO tenant filter — tenant B rows must be invisible."""
    settings = get_settings()
    engine = create_async_engine(settings.app_database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async with maker() as session:
        await session.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(demo["tenant_a"].id)},
        )
        # Deliberately unfiltered — simulates a forgotten WHERE tenant_id.
        events = (await session.execute(text("SELECT slug FROM events"))).scalars().all()
        tasks = (await session.execute(text("SELECT name FROM tasks"))).scalars().all()

    await engine.dispose()

    assert events == ["walk"]           # only tenant A's event
    assert "B QR" not in tasks          # tenant B's task is invisible
    assert set(tasks) == {"QR Spot", "GPS Spot", "Hybrid Spot"}


async def test_rls_blocks_insert_for_other_tenant(demo):
    """WITH CHECK: the app role cannot INSERT rows tagged with another tenant."""
    settings = get_settings()
    engine = create_async_engine(settings.app_database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async with maker() as session:
        await session.execute(
            text("SELECT set_config('app.tenant_id', :tid, true)"),
            {"tid": str(demo["tenant_a"].id)},
        )
        import pytest
        from sqlalchemy.exc import ProgrammingError, DBAPIError

        with pytest.raises((ProgrammingError, DBAPIError)):
            await session.execute(
                text(
                    "INSERT INTO events (tenant_id, slug, name, event_type, reward_threshold) "
                    "VALUES (:tid, 'evil', 'Evil', 'city', 1)"
                ),
                {"tid": str(demo["tenant_b"].id)},  # forging tenant B's id
            )

    await engine.dispose()


async def test_members_are_isolated_per_tenant(client, demo):
    """Same LINE user in two tenants = two distinct member identities."""
    token_a = await login(client, "alpha", "carol")
    token_b = await login(client, "beta", "carol")

    import base64
    import json

    def claims(tok: str) -> dict:
        payload = tok.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))

    assert claims(token_a)["sub"] != claims(token_b)["sub"]
    assert claims(token_a)["tid"] != claims(token_b)["tid"]
