"""Platform (master) admin endpoints (spec §3): tenant management + event
overview. RBAC: platform_admin only; session is cross-tenant."""

import secrets
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.api.deps import AuthContext, platform_admin_context
from app.core.errors import ApiError
from app.core.security import hash_password
from app.models import Event, Member, Stamp, Tenant
from app.schemas import (
    EventOut,
    TenantAdminCreate,
    TenantAdminOut,
    TenantCreate,
    TenantLiffProvisionRequest,
    TenantOut,
    TenantUpdate,
)
from app.services import line_liff
from app.services.audit import record_audit

router = APIRouter(prefix="/api/platform", tags=["platform-admin"])


@router.get("/tenants", response_model=list[TenantOut])
async def list_tenants(
    ctx: AuthContext = Depends(platform_admin_context),
) -> list[TenantOut]:
    tenants = (
        (await ctx.session.execute(select(Tenant).order_by(Tenant.created_at)))
        .scalars()
        .all()
    )
    return [TenantOut.model_validate(t) for t in tenants]


@router.post("/tenants", response_model=TenantOut, status_code=201)
async def create_tenant(
    body: TenantCreate, ctx: AuthContext = Depends(platform_admin_context)
) -> TenantOut:
    exists = (
        await ctx.session.execute(select(Tenant.id).where(Tenant.slug == body.slug))
    ).scalar_one_or_none()
    if exists:
        raise ApiError(409, "slug_taken", "此代稱（slug）已有其他租戶使用。")

    tenant = Tenant(slug=body.slug, name=body.name, brand_config=body.brand_config)
    ctx.session.add(tenant)
    await ctx.session.flush()
    await record_audit(
        ctx.session,
        tenant_id=tenant.id,
        actor_type="platform_admin",
        actor_id=ctx.identity.subject_id,
        action="tenant.created",
        entity_type="tenant",
        entity_id=tenant.id,
        data={"slug": tenant.slug},
    )
    await ctx.session.commit()
    return TenantOut.model_validate(tenant)


@router.patch("/tenants/{tenant_id}", response_model=TenantOut)
async def update_tenant(
    tenant_id: uuid.UUID,
    body: TenantUpdate,
    ctx: AuthContext = Depends(platform_admin_context),
) -> TenantOut:
    """White-label controls: activate/deactivate, custom domain, LINE binding,
    and the platform-only "Powered by Zoustec" switch."""
    tenant = (
        await ctx.session.execute(select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    if tenant is None:
        raise ApiError(404, "tenant_not_found", "找不到此租戶。")

    changes = body.model_dump(exclude_unset=True)

    if changes.pop("clear_custom_domain", False):
        tenant.custom_domain = None
    if "custom_domain" in changes:
        domain = changes.pop("custom_domain")
        if domain:
            taken = (
                await ctx.session.execute(
                    select(Tenant.id).where(
                        Tenant.custom_domain == domain.lower(),
                        Tenant.id != tenant_id,
                    )
                )
            ).scalar_one_or_none()
            if taken:
                raise ApiError(409, "domain_taken", "此網域已綁定其他租戶。")
            tenant.custom_domain = domain.lower()

    if "hide_powered_by" in changes:
        brand = dict(tenant.brand_config or {})
        brand["hide_powered_by"] = changes.pop("hide_powered_by")
        tenant.brand_config = brand

    for key in ("name", "is_active", "line_liff_id", "line_channel_id", "plan", "mrr_ntd"):
        if key in changes:
            setattr(tenant, key, changes[key])

    await record_audit(
        ctx.session,
        tenant_id=tenant.id,
        actor_type="platform_admin",
        actor_id=ctx.identity.subject_id,
        action="tenant.updated",
        entity_type="tenant",
        entity_id=tenant.id,
        data={"fields": list(body.model_dump(exclude_unset=True))},
    )
    await ctx.session.commit()
    return TenantOut.model_validate(tenant)


@router.post("/tenants/{tenant_id}/liff", response_model=TenantOut)
async def provision_liff(
    tenant_id: uuid.UUID,
    body: TenantLiffProvisionRequest,
    ctx: AuthContext = Depends(platform_admin_context),
) -> TenantOut:
    """Spec item 5 (Automated LIFF App Management): create — or update the
    endpoint of — the tenant's LIFF app via the LIFF Server API. The channel
    itself is still created manually on the LINE console (no API for that),
    but from Channel ID + Secret onward the platform handles everything: the
    endpoint always points at the tenant's custom domain."""
    tenant = (
        await ctx.session.execute(select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    if tenant is None:
        raise ApiError(404, "tenant_not_found", "找不到此租戶。")

    if body.channel_id and body.channel_id.strip():
        tenant.line_channel_id = body.channel_id.strip()
    if body.channel_secret and body.channel_secret.strip():
        tenant.line_channel_secret = body.channel_secret.strip()

    if not tenant.line_channel_id or not tenant.line_channel_secret:
        raise ApiError(
            422, "channel_credentials_required",
            "需要 Channel ID 與 Channel Secret（在 LINE Login channel 的 Basic settings 分頁）。",
        )
    if not tenant.custom_domain:
        raise ApiError(
            422, "custom_domain_required",
            "請先為此客戶綁定自訂網域 — LIFF Endpoint 將指向該網域。",
        )

    endpoint = f"https://{tenant.custom_domain}/"
    token = await line_liff.issue_channel_token(
        tenant.line_channel_id, tenant.line_channel_secret
    )

    # LIFF IDs are prefixed with the channel ID — only update when the current
    # app belongs to this channel; a different channel (e.g. still on the
    # shared platform app) means create a new app.
    if tenant.line_liff_id and tenant.line_liff_id.split("-", 1)[0] == tenant.line_channel_id:
        await line_liff.update_liff_endpoint(token, tenant.line_liff_id, endpoint)
        action = "tenant.liff_endpoint_updated"
    else:
        tenant.line_liff_id = await line_liff.create_liff_app(
            token, endpoint, f"{tenant.name} AR"
        )
        action = "tenant.liff_created"

    await record_audit(
        ctx.session,
        tenant_id=tenant.id,
        actor_type="platform_admin",
        actor_id=ctx.identity.subject_id,
        action=action,
        entity_type="tenant",
        entity_id=tenant.id,
        data={"liff_id": tenant.line_liff_id, "endpoint": endpoint},
    )
    await ctx.session.commit()
    return TenantOut.model_validate(tenant)


# ------------------------------------------------------------- tenant admin accounts
# Zoustec provisions customer dashboard accounts from the console: email +
# generated temporary password (returned exactly once), forced change on
# first login. Customers never touch LINE for admin work.


def _generate_temp_password() -> str:
    return secrets.token_urlsafe(9)  # ~12 chars, URL-safe


async def _get_tenant(ctx: AuthContext, tenant_id: uuid.UUID) -> Tenant:
    tenant = (
        await ctx.session.execute(select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    if tenant is None:
        raise ApiError(404, "tenant_not_found", "找不到此租戶。")
    return tenant


@router.get("/tenants/{tenant_id}/admins", response_model=list[TenantAdminOut])
async def list_tenant_admins(
    tenant_id: uuid.UUID, ctx: AuthContext = Depends(platform_admin_context)
) -> list[TenantAdminOut]:
    await _get_tenant(ctx, tenant_id)
    admins = (
        (
            await ctx.session.execute(
                select(Member)
                .where(Member.tenant_id == tenant_id, Member.role == "tenant_admin")
                .order_by(Member.created_at)
            )
        )
        .scalars()
        .all()
    )
    return [TenantAdminOut.model_validate(m) for m in admins]


@router.post(
    "/tenants/{tenant_id}/admins", response_model=TenantAdminOut, status_code=201
)
async def create_tenant_admin(
    tenant_id: uuid.UUID,
    body: TenantAdminCreate,
    ctx: AuthContext = Depends(platform_admin_context),
) -> TenantAdminOut:
    tenant = await _get_tenant(ctx, tenant_id)
    email = body.email.strip().lower()

    # Email locates the account at login (no tenant field) → globally unique.
    taken = (
        await ctx.session.execute(select(Member.id).where(Member.email == email))
    ).scalar_one_or_none()
    if taken:
        raise ApiError(409, "email_taken", "此 Email 已被其他帳號使用。")

    temp_password = _generate_temp_password()
    member = Member(
        tenant_id=tenant.id,
        line_user_id=f"pw::{email}",
        display_name=body.display_name,
        role="tenant_admin",
        email=email,
        password_hash=hash_password(temp_password),
        must_change_password=True,
    )
    ctx.session.add(member)
    await ctx.session.flush()
    await record_audit(
        ctx.session,
        tenant_id=tenant.id,
        actor_type="platform_admin",
        actor_id=ctx.identity.subject_id,
        action="tenant_admin.created",
        entity_type="member",
        entity_id=member.id,
        data={"email": email},
    )
    await ctx.session.commit()

    out = TenantAdminOut.model_validate(member)
    out.temp_password = temp_password  # returned once, never stored
    return out


@router.post(
    "/tenants/{tenant_id}/admins/{member_id}/reset-password",
    response_model=TenantAdminOut,
)
async def reset_tenant_admin_password(
    tenant_id: uuid.UUID,
    member_id: uuid.UUID,
    ctx: AuthContext = Depends(platform_admin_context),
) -> TenantAdminOut:
    await _get_tenant(ctx, tenant_id)
    member = (
        await ctx.session.execute(
            select(Member).where(
                Member.id == member_id,
                Member.tenant_id == tenant_id,
                Member.role == "tenant_admin",
            )
        )
    ).scalar_one_or_none()
    if member is None:
        raise ApiError(404, "admin_not_found", "找不到此管理員帳號。")
    if member.email is None:
        raise ApiError(422, "not_password_account", "此帳號不是密碼登入帳號。")

    temp_password = _generate_temp_password()
    member.password_hash = hash_password(temp_password)
    member.must_change_password = True
    await record_audit(
        ctx.session,
        tenant_id=tenant_id,
        actor_type="platform_admin",
        actor_id=ctx.identity.subject_id,
        action="tenant_admin.password_reset",
        entity_type="member",
        entity_id=member.id,
        data={"email": member.email},
    )
    await ctx.session.commit()

    out = TenantAdminOut.model_validate(member)
    out.temp_password = temp_password
    return out


@router.get("/tenants/{tenant_id}/events", response_model=list[EventOut])
async def tenant_events(
    tenant_id: uuid.UUID, ctx: AuthContext = Depends(platform_admin_context)
) -> list[EventOut]:
    events = (
        (
            await ctx.session.execute(
                select(Event)
                .where(Event.tenant_id == tenant_id)
                .order_by(Event.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [EventOut.model_validate(e) for e in events]


@router.get("/overview")
async def overview(
    months: int = 6, ctx: AuthContext = Depends(platform_admin_context)
) -> dict:
    """Cross-tenant overview for the platform console (UI screen 05):
    per-tenant counts, platform totals, plan distribution + MRR, and a monthly
    activity series (stamps per month, last `months` months — activity proxy;
    no pageview tracking in v1)."""
    months = max(1, min(months, 24))

    rows = (
        await ctx.session.execute(
            select(
                Tenant.id,
                Tenant.slug,
                Tenant.name,
                Tenant.plan,
                Tenant.mrr_ntd,
                Tenant.is_active,
                func.count(func.distinct(Event.id)).label("events"),
                func.count(func.distinct(Member.id)).label("members"),
                func.count(func.distinct(Stamp.id)).label("stamps"),
            )
            .join(Event, Event.tenant_id == Tenant.id, isouter=True)
            .join(Member, Member.tenant_id == Tenant.id, isouter=True)
            .join(Stamp, Stamp.tenant_id == Tenant.id, isouter=True)
            .group_by(
                Tenant.id, Tenant.slug, Tenant.name, Tenant.plan,
                Tenant.mrr_ntd, Tenant.is_active,
            )
            .order_by(Tenant.slug)
        )
    ).all()

    active_events = (
        await ctx.session.execute(
            select(func.count()).select_from(Event).where(Event.is_active)
        )
    ).scalar_one()

    month = func.date_trunc("month", Stamp.completed_at).label("month")
    monthly_rows = (
        await ctx.session.execute(
            select(month, func.count().label("stamps"))
            .where(Stamp.completed_at >= func.now() - func.make_interval(0, months))
            .group_by(month)
            .order_by(month)
        )
    ).all()

    plans: dict[str, int] = {}
    for r in rows:
        plans[r.plan or "saas"] = plans.get(r.plan or "saas", 0) + 1

    return {
        "tenants": [
            {
                "tenant_id": str(r.id),
                "slug": r.slug,
                "name": r.name,
                "plan": r.plan or "saas",
                "mrr_ntd": r.mrr_ntd,
                "is_active": r.is_active,
                "events": r.events,
                "members": r.members,
                "stamps": r.stamps,
            }
            for r in rows
        ],
        "totals": {
            "tenants": len(rows),
            "active_events": active_events,
            "members": sum(r.members for r in rows),
            "stamps": sum(r.stamps for r in rows),
            "mrr_ntd": sum(r.mrr_ntd or 0 for r in rows),
        },
        "plans": plans,
        "monthly": [
            {"month": r.month.date().isoformat()[:7], "stamps": r.stamps}
            for r in monthly_rows
        ],
    }
