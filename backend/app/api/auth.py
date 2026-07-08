"""Auth endpoints — LINE OIDC for players, email + password for back offices.

POST /api/auth/line              end user (player) login via LINE (tenant-scoped)
POST /api/auth/tenant/password   tenant admin login — console-provisioned account
POST /api/auth/tenant/change-password  first-login (or routine) password change
POST /api/auth/platform          platform admin login via LINE (cross-tenant)
POST /api/auth/platform/password Zoustec console login
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import AuthContext, tenant_admin_context
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.security import (
    ROLE_PLATFORM_ADMIN,
    TokenIdentity,
    create_session_token,
    hash_password,
    verify_password,
)
from app.db.session import anonymous_session, platform_admin_session, tenant_session
from app.models import Member, PlatformAdmin, Tenant
from app.schemas import (
    ChangePasswordRequest,
    LineLoginRequest,
    PlatformLoginRequest,
    PlatformPasswordLoginRequest,
    SessionResponse,
    TenantPasswordLoginRequest,
)
from app.services.audit import record_audit
from app.services.line_oidc import verify_line_id_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _tenant_channel_id(tenant: Tenant) -> str | None:
    """Tenant's own LINE channel (white-label plan). A LIFF ID is always
    `{channelId}-{suffix}`, so the channel can be derived when only the LIFF
    ID was entered in the console."""
    if tenant.line_channel_id:
        return tenant.line_channel_id
    if tenant.line_liff_id and "-" in tenant.line_liff_id:
        return tenant.line_liff_id.split("-", 1)[0]
    return None


@router.post("/line", response_model=SessionResponse)
async def login_with_line(body: LineLoginRequest) -> SessionResponse:
    # Resolve tenant first (tenants table is the tenancy root, not RLS-scoped):
    # the token audience depends on WHICH LIFF app opened the experience.
    async with anonymous_session() as session:
        tenant = (
            await session.execute(
                select(Tenant).where(Tenant.slug == body.tenant_slug, Tenant.is_active)
            )
        ).scalar_one_or_none()
    if tenant is None:
        raise ApiError(404, "tenant_not_found", "查無此租戶。")

    # Members arrive via the tenant's LIFF app when one is bound; tenant ADMINS
    # sign in to the dashboard via the platform's shared LIFF. Accept either:
    # try the tenant channel first, fall back to the platform channel.
    tenant_channel = _tenant_channel_id(tenant)
    try:
        line = await verify_line_id_token(body.id_token, tenant_channel)
    except ApiError as exc:
        if tenant_channel is None or exc.status_code != 401:
            raise
        line = await verify_line_id_token(body.id_token)

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


@router.post("/tenant/password", response_model=SessionResponse)
async def login_tenant_password(body: TenantPasswordLoginRequest) -> SessionResponse:
    """Customer dashboard sign-in — email + password. Accounts are provisioned
    by Zoustec from the platform console (temp password, forced change on
    first login); customers never need LINE for admin work. Email is globally
    unique, so the account row itself locates the tenant."""
    email = body.email.strip().lower()
    # Cross-tenant lookup by design: the login form has no tenant field.
    async with platform_admin_session() as session:
        row = (
            await session.execute(
                select(Member, Tenant)
                .join(Tenant, Tenant.id == Member.tenant_id)
                .where(Member.email == email)
            )
        ).one_or_none()

    # One generic error for every failure mode — no account probing.
    denied = ApiError(401, "invalid_credentials", "Email 或密碼不正確。")
    if row is None:
        raise denied
    member, tenant = row
    if (
        member.role != "tenant_admin"
        or not tenant.is_active
        or not verify_password(body.password, member.password_hash)
    ):
        raise denied

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
        must_change_password=member.must_change_password,
    )


@router.post("/tenant/change-password", response_model=SessionResponse)
async def change_tenant_password(
    body: ChangePasswordRequest,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> SessionResponse:
    """Password change for the signed-in tenant admin — used by the forced
    first-login flow and available any time after. Returns a fresh session so
    the client state (must_change_password) updates in one round-trip."""
    member = (
        await ctx.session.execute(
            select(Member).where(Member.id == ctx.identity.subject_id)
        )
    ).scalar_one_or_none()
    if member is None or member.password_hash is None:
        raise ApiError(403, "forbidden", "此帳號不是密碼登入帳號。")
    if not verify_password(body.current_password, member.password_hash):
        raise ApiError(401, "invalid_credentials", "目前密碼不正確。")

    member.password_hash = hash_password(body.new_password)
    member.must_change_password = False
    await record_audit(
        ctx.session,
        tenant_id=ctx.identity.tenant_id,
        actor_type="tenant_admin",
        actor_id=member.id,
        action="member.password_changed",
        entity_type="member",
        entity_id=member.id,
        data={},
    )
    await ctx.session.commit()

    identity = TokenIdentity(
        subject_id=member.id, tenant_id=ctx.identity.tenant_id, role=member.role
    )
    return SessionResponse(
        access_token=create_session_token(identity),
        expires_in_minutes=get_settings().jwt_expires_minutes,
        role=member.role,
        member_id=member.id,
        tenant_id=ctx.identity.tenant_id,
        display_name=member.display_name,
        must_change_password=False,
    )


@router.post("/platform/password", response_model=SessionResponse)
async def login_platform_password(body: PlatformPasswordLoginRequest) -> SessionResponse:
    """Zoustec console sign-in — email + password (no LINE round-trip; the
    console is the platform's internal back office)."""
    async with anonymous_session() as session:
        admin = (
            await session.execute(
                select(PlatformAdmin).where(
                    PlatformAdmin.email == body.email.strip().lower()
                )
            )
        ).scalar_one_or_none()

    # Same generic error for unknown email / wrong password — no user probing.
    if admin is None or not verify_password(body.password, admin.password_hash):
        raise ApiError(401, "invalid_credentials", "Email 或密碼不正確。")

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
        raise ApiError(403, "forbidden", "此帳號不是平台管理員。")

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
