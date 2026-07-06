"""Async database sessions with tenant scoping.

Two isolation layers (spec §4.2 — both required):

1. Query layer — every service filters by tenant_id explicitly.
2. PostgreSQL RLS — policies compare tenant_id to the `app.tenant_id` GUC that
   we SET LOCAL at the start of each request transaction. The runtime app role
   (`zoustec_app`) is a non-owner, so RLS applies to it; if a query ever forgets
   the tenant filter, RLS still hides other tenants' rows.

Platform-admin requests set `app.is_platform_admin = 'true'` instead, which the
policies honor for cross-tenant reads (tenant management, event overview).
"""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

_engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine():
    global _engine, _sessionmaker
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.effective_app_database_url, pool_pre_ping=True
        )
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    return _sessionmaker


async def reset_engine() -> None:
    """Dispose the engine (tests / reconfiguration)."""
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None


@asynccontextmanager
async def _guc_session(setup_sql: str, params: dict | None = None) -> AsyncIterator[AsyncSession]:
    """Session PINNED to a single pooled connection with an RLS GUC set.

    The GUC is a connection-level setting. A plain Session releases its
    connection back to the pool on every commit, so a handler that commits
    mid-request and then keeps reading may continue on a DIFFERENT connection
    where the GUC is absent — RLS then hides every row (latent bug: surfaced
    as NoResultFound when serializing a task right after commit). Binding the
    session to one connection makes "GUC survives commits" actually true.
    The GUC is cleared before the connection returns to the pool.
    """
    engine = get_engine()
    async with engine.connect() as conn:
        await conn.execute(text(setup_sql), params or {})
        await conn.commit()  # end the setup txn so the session starts clean
        session = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield session
        finally:
            try:
                await session.close()
                await conn.rollback()  # end any open transaction first
                await conn.execute(
                    text(
                        "SELECT set_config('app.tenant_id', '', false),"
                        " set_config('app.is_platform_admin', '', false)"
                    )
                )
                await conn.commit()
            except Exception:
                # If clearing fails the connection is likely broken; invalidate
                # it so the pool discards it rather than reusing a scoped one.
                await conn.invalidate()


@asynccontextmanager
async def tenant_session(tenant_id: uuid.UUID) -> AsyncIterator[AsyncSession]:
    """Session scoped to one tenant via the RLS GUC (pinned connection)."""
    async with _guc_session(
        "SELECT set_config('app.tenant_id', :tid, false)", {"tid": str(tenant_id)}
    ) as session:
        yield session


@asynccontextmanager
async def platform_admin_session() -> AsyncIterator[AsyncSession]:
    """Cross-tenant session for platform admins (RLS policies allow it)."""
    async with _guc_session(
        "SELECT set_config('app.is_platform_admin', 'true', false)"
    ) as session:
        yield session


@asynccontextmanager
async def anonymous_session() -> AsyncIterator[AsyncSession]:
    """Unscoped session for pre-auth lookups that are not tenant data
    (resolving a tenant slug, matching a platform admin)."""
    async with get_sessionmaker()() as session:
        yield session
