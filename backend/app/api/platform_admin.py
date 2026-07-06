"""Platform (master) admin endpoints (spec §3): tenant management + event
overview. RBAC: platform_admin only; session is cross-tenant."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.api.deps import AuthContext, platform_admin_context
from app.core.errors import ApiError
from app.models import Event, Member, Stamp, Tenant
from app.schemas import EventOut, TenantCreate, TenantOut, TenantUpdate
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
        raise ApiError(409, "slug_taken", "A tenant with this slug already exists.")

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
        raise ApiError(404, "tenant_not_found", "Tenant not found.")

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
                raise ApiError(409, "domain_taken", "This domain is bound to another tenant.")
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
