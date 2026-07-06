"""Request dependencies: authentication + RBAC (spec §4.3 — deny-by-default).

Every protected router uses one of these dependencies; endpoints without an
auth dependency simply have no access to tenant data (sessions are only handed
out here, already scoped to the caller's tenant).
"""

import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.security import (
    ROLE_PLATFORM_ADMIN,
    ROLE_TENANT_ADMIN,
    TokenIdentity,
    decode_session_token,
)
from app.db.session import platform_admin_session, tenant_session


@dataclass
class AuthContext:
    identity: TokenIdentity
    session: AsyncSession


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, "unauthorized", "Missing bearer token.")
    return authorization.removeprefix("Bearer ").strip()


async def get_identity(
    authorization: str | None = Header(default=None),
) -> TokenIdentity:
    return decode_session_token(_bearer_token(authorization))


async def member_context(
    identity: TokenIdentity = Depends(get_identity),
) -> AsyncIterator[AuthContext]:
    """Any authenticated member of a tenant (end user or tenant admin)."""
    if identity.tenant_id is None:
        raise ApiError(403, "forbidden", "A tenant-scoped session is required.")
    async with tenant_session(identity.tenant_id) as session:
        yield AuthContext(identity=identity, session=session)


async def tenant_admin_context(
    identity: TokenIdentity = Depends(get_identity),
) -> AsyncIterator[AuthContext]:
    """Tenant admin only."""
    if identity.tenant_id is None or identity.role != ROLE_TENANT_ADMIN:
        raise ApiError(403, "forbidden", "Tenant admin role required.")
    async with tenant_session(identity.tenant_id) as session:
        yield AuthContext(identity=identity, session=session)


async def platform_admin_context(
    identity: TokenIdentity = Depends(get_identity),
) -> AsyncIterator[AuthContext]:
    """Platform (master) admin only — cross-tenant session."""
    if identity.role != ROLE_PLATFORM_ADMIN:
        raise ApiError(403, "forbidden", "Platform admin role required.")
    async with platform_admin_session() as session:
        yield AuthContext(identity=identity, session=session)


def require_same_tenant(ctx: AuthContext, tenant_id: uuid.UUID) -> None:
    """Extra query-layer guard for handlers that receive an explicit tenant id."""
    if ctx.identity.tenant_id != tenant_id:
        raise ApiError(403, "forbidden", "Cross-tenant access denied.")
