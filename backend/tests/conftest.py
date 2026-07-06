"""Test harness.

Runs against the throwaway db-test container (docker compose --profile test up -d db-test).
Environment is pointed at the test DB BEFORE the app modules read settings.
Schema comes from the real Alembic migration (so RLS/PostGIS DDL is what's tested).
"""

import os

# Must happen before importing anything from app.*
os.environ["DATABASE_URL"] = (
    "postgresql+asyncpg://zoustec:zoustec_test_password@localhost:5434/zoustec_test"
)
os.environ["APP_DATABASE_URL"] = (
    "postgresql+asyncpg://zoustec_app:zoustec_app_password@localhost:5434/zoustec_test"
)
os.environ["AUTH_DEV_MODE"] = "true"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["RUN_MIGRATIONS_ON_START"] = "false"
os.environ["SEED_ON_START"] = "false"

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.db.migrate import run_migrations
from app.db.session import reset_engine
from app.models import Event, Member, PlatformAdmin, Task, Tenant

get_settings.cache_clear()

TENANT_TABLES = ["audit_logs", "stamps", "reward_claims", "tasks", "events", "members"]


@pytest_asyncio.fixture(scope="session", autouse=True, loop_scope="session")
async def _database():
    """Migrate the test DB once per session; wipe rows between tests via `db`."""
    await run_migrations()
    yield
    await reset_engine()


@pytest_asyncio.fixture
async def owner_session():
    """Owner-connection session flagged platform-level (bypasses RLS policies)
    for direct fixture setup/inspection."""
    engine = create_async_engine(get_settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await session.execute(
            text("SELECT set_config('app.is_platform_admin', 'true', true)")
        )
        yield session
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables(owner_session):
    """Truncate all data before each test; dispose the app engine afterwards so
    the next test (new event loop under pytest-asyncio) gets fresh connections."""
    for table in TENANT_TABLES + ["platform_admins", "tenants"]:
        await owner_session.execute(text(f"TRUNCATE {table} CASCADE"))
    await owner_session.commit()
    # Re-flag after commit (set_config with is_local=true resets on commit).
    await owner_session.execute(
        text("SELECT set_config('app.is_platform_admin', 'true', true)")
    )
    yield
    await reset_engine()


@pytest_asyncio.fixture
async def client():
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# ------------------------------------------------------------------ fixtures: demo world


@pytest_asyncio.fixture
async def demo(owner_session):
    """Two tenants, each with an event + tasks; admins and a platform admin.

    tenant A (alpha): event with qr + gps + hybrid tasks, threshold 2
    tenant B (beta):  event with one qr task, threshold 1
    """
    s = owner_session

    a = Tenant(slug="alpha", name="Alpha City")
    b = Tenant(slug="beta", name="Beta Mall")
    s.add_all([a, b])
    await s.flush()

    s.add_all(
        [
            Member(tenant_id=a.id, line_user_id="admin-a", display_name="Admin A", role="tenant_admin"),
            Member(tenant_id=b.id, line_user_id="admin-b", display_name="Admin B", role="tenant_admin"),
            PlatformAdmin(line_user_id="boss", display_name="Boss"),
        ]
    )

    event_a = Event(
        tenant_id=a.id, slug="walk", name="Alpha Walk", event_type="city",
        reward_threshold=2, reward_name="Badge",
    )
    event_b = Event(
        tenant_id=b.id, slug="rally", name="Beta Rally", event_type="shopping",
        reward_threshold=1, reward_name="Coupon",
    )
    s.add_all([event_a, event_b])
    await s.flush()

    # Taipei 101: 25.0330, 121.5654
    task_qr = Task(
        tenant_id=a.id, event_id=event_a.id, name="QR Spot",
        verification_type="qr", qr_token="secret-a", sort_order=1,
    )
    task_gps = Task(
        tenant_id=a.id, event_id=event_a.id, name="GPS Spot",
        verification_type="gps",
        location="SRID=4326;POINT(121.5654 25.0330)", radius_m=100, sort_order=2,
    )
    task_hybrid = Task(
        tenant_id=a.id, event_id=event_a.id, name="Hybrid Spot",
        verification_type="hybrid", qr_token="secret-h",
        location="SRID=4326;POINT(121.5654 25.0330)", radius_m=100, sort_order=3,
    )
    task_b = Task(
        tenant_id=b.id, event_id=event_b.id, name="B QR",
        verification_type="qr", qr_token="secret-b", sort_order=1,
    )
    s.add_all([task_qr, task_gps, task_hybrid, task_b])
    await s.commit()

    return {
        "tenant_a": a, "tenant_b": b,
        "event_a": event_a, "event_b": event_b,
        "task_qr": task_qr, "task_gps": task_gps,
        "task_hybrid": task_hybrid, "task_b": task_b,
    }


async def login(client, tenant_slug: str, line_user_id: str, name: str = "User") -> str:
    resp = await client.post(
        "/api/auth/line",
        json={"id_token": f"dev::{line_user_id}::{name}", "tenant_slug": tenant_slug},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
