"""Auth endpoints — LINE OIDC → platform session JWT (spec §5.6).

POST /api/auth/line      end user / tenant admin login (tenant-scoped)
POST /api/auth/platform  platform admin login (cross-tenant)
"""

from fastapi import APIRouter
from sqlalchemy import select

from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.security import (
    ROLE_PLATFORM_ADMIN,
    TokenIdentity,
    create_session_token,
)
from app.db.session import anonymous_session, tenant_session
from app.models import Member, PlatformAdmin, Tenant
from app.schemas import LineLoginRequest, PlatformLoginRequest, SessionResponse
from app.services.audit import record_audit
from app.services.line_oidc import verify_line_id_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/line", response_model=SessionResponse)
async def login_with_line(body: LineLoginRequest) -> SessionResponse:
    line = await verify_line_id_token(body.id_token)

    # Resolve tenant first (tenants table is the tenancy root, not RLS-scoped).
    async with anonymous_session() as session:
        tenant = (
            await session.execute(
                select(Tenant).where(Tenant.slug == body.tenant_slug, Tenant.is_active)
            )
        ).scalar_one_or_none()
    if tenant is None:
        raise ApiError(404, "tenant_not_found", "Unknown tenant.")

    # Find-or-create the member inside the tenant's RLS scope.
    async with tenant_session(tenant.id) as session:
        member = (
            await session.execute(
                select(Member).where(
                    Member.tenant_id == tenant.id,
                    Member.line_user_id == line.line_user_id,
                )
            )
        ).scalar_one_or_none()

        if member is None:
            member = Member(
                tenant_id=tenant.id,
                line_user_id=line.line_user_id,
                display_name=line.display_name,
                picture_url=line.picture_url,
            )
            session.add(member)
            await session.flush()
            await record_audit(
                session,
                tenant_id=tenant.id,
                actor_type="member",
                actor_id=member.id,
                action="member.registered",
                entity_type="member",
                entity_id=member.id,
                data={"display_name": line.display_name},
            )
        else:
            # Keep profile fresh on each login.
            member.display_name = line.display_name or member.display_name
            member.picture_url = line.picture_url or member.picture_url

        await session.commit()

        identity = TokenIdentity(
            subject_id=member.id, tenant_id=tenant.id, role=member.role
        )
        return SessionResponse(
            access_token=create_session_token(identity),
            expires_in_minutes=get_settings().jwt_expires_minutes,
            role=member.role,
            member_id=member.id,
            tenant_id=tenant.id,
            display_name=member.display_name,
        )


@router.post("/platform", response_model=SessionResponse)
async def login_platform_admin(body: PlatformLoginRequest) -> SessionResponse:
    line = await verify_line_id_token(body.id_token)

    async with anonymous_session() as session:
        admin = (
            await session.execute(
                select(PlatformAdmin).where(
                    PlatformAdmin.line_user_id == line.line_user_id
                )
            )
        ).scalar_one_or_none()

    if admin is None:
        # Deny-by-default: being a LINE user grants nothing at platform level.
        raise ApiError(403, "forbidden", "Not a platform admin.")

    identity = TokenIdentity(
        subject_id=admin.id, tenant_id=None, role=ROLE_PLATFORM_ADMIN
    )
    return SessionResponse(
        access_token=create_session_token(identity),
        expires_in_minutes=get_settings().jwt_expires_minutes,
        role=ROLE_PLATFORM_ADMIN,
        member_id=admin.id,
        tenant_id=None,
        display_name=admin.display_name,
    )
