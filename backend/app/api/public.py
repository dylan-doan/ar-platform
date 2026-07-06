"""Public (pre-auth) endpoints — white-label support.

The frontend needs branding BEFORE login (the login page itself is themed),
and the middleware needs to resolve a custom domain to a tenant. Both are
read-only, non-sensitive, and rate-limitable at the proxy layer.
"""

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.errors import ApiError
from app.db.session import anonymous_session, platform_admin_session
from app.models import Event, Task, Tenant
from app.schemas import BrandingOut, PublicEventOut

router = APIRouter(prefix="/api/public", tags=["public"])


def _branding(tenant: Tenant) -> BrandingOut:
    brand = tenant.brand_config or {}
    return BrandingOut(
        tenant_slug=tenant.slug,
        tenant_name=tenant.name,
        logo_url=brand.get("logo_url"),
        theme_color=brand.get("theme_color"),
        show_powered_by=not brand.get("hide_powered_by", False),
        line_liff_id=tenant.line_liff_id,
        custom_domain=tenant.custom_domain,
    )


@router.get("/tenants/{slug}/branding", response_model=BrandingOut)
async def tenant_branding(slug: str) -> BrandingOut:
    async with anonymous_session() as session:
        tenant = (
            await session.execute(
                select(Tenant).where(Tenant.slug == slug, Tenant.is_active)
            )
        ).scalar_one_or_none()
    if tenant is None:
        raise ApiError(404, "tenant_not_found", "Unknown tenant.")
    return _branding(tenant)


@router.get("/domains/{domain}", response_model=BrandingOut)
async def resolve_domain(domain: str) -> BrandingOut:
    """Custom-domain → tenant resolution (used by the frontend middleware).
    Returns the same branding payload so one round-trip serves both needs."""
    async with anonymous_session() as session:
        tenant = (
            await session.execute(
                select(Tenant).where(
                    Tenant.custom_domain == domain.lower(), Tenant.is_active
                )
            )
        ).scalar_one_or_none()
    if tenant is None:
        raise ApiError(404, "domain_not_found", "No tenant is bound to this domain.")
    return _branding(tenant)


@router.get("/site/{tenant_slug}")
@router.get("/site/{tenant_slug}/{event_slug}")
async def public_event_site(tenant_slug: str, event_slug: str | None = None) -> dict:
    """The EVENT WEBSITE payload (spec §VII "tự động tạo website sự kiện"):
    everything the public event page renders in one round-trip — event fields
    + content sections + public task list (no secrets) + tenant branding.
    Without an event_slug, serves the tenant's newest active event (custom
    domains land here)."""
    async with platform_admin_session() as session:
        tenant = (
            await session.execute(
                select(Tenant).where(Tenant.slug == tenant_slug, Tenant.is_active)
            )
        ).scalar_one_or_none()
        if tenant is None:
            raise ApiError(404, "tenant_not_found", "Unknown tenant.")

        q = select(Event).where(Event.tenant_id == tenant.id, Event.is_active)
        q = q.where(Event.slug == event_slug) if event_slug else q.order_by(Event.created_at.desc())
        event = (await session.execute(q.limit(1))).scalars().first()
        if event is None:
            raise ApiError(404, "event_not_found", "No active event for this tenant.")

        tasks = (
            await session.execute(
                select(Task.name, Task.verification_type, Task.radius_m, Task.sort_order)
                .where(Task.event_id == event.id, Task.is_active)
                .order_by(Task.sort_order)
            )
        ).all()

        siblings = (
            await session.execute(
                select(Event.slug, Event.name)
                .where(Event.tenant_id == tenant.id, Event.is_active, Event.id != event.id)
                .order_by(Event.created_at.desc())
            )
        ).all()

    brand = tenant.brand_config or {}
    return {
        "branding": {
            "tenant_slug": tenant.slug,
            "tenant_name": tenant.name,
            "logo_url": brand.get("logo_url"),
            "theme_color": brand.get("theme_color"),
            "show_powered_by": not brand.get("hide_powered_by", False),
        },
        "event": {
            "id": str(event.id),
            "slug": event.slug,
            "name": event.name,
            "description": event.description,
            "event_type": event.event_type,
            "config": event.config or {},
            "reward_threshold": event.reward_threshold,
            "reward_name": event.reward_name,
        },
        "tasks": [
            {"name": t.name, "verification_type": t.verification_type, "radius_m": t.radius_m}
            for t in tasks
        ],
        "other_events": [{"slug": r.slug, "name": r.name} for r in siblings],
    }


@router.get("/events", response_model=list[PublicEventOut])
async def list_public_events(event_type: str | None = None) -> list[PublicEventOut]:
    """Portal listing (spec §X): all active events across tenants.

    Pre-auth and cross-tenant by design — the portal is the platform's public
    shopfront. Uses the platform-admin RLS scope server-side (read-only), and
    exposes only non-sensitive fields (no tokens, no member data)."""
    async with platform_admin_session() as session:
        q = (
            select(
                Event.id,
                Event.slug,
                Event.name,
                Event.description,
                Event.event_type,
                Event.starts_at,
                Event.ends_at,
                Event.config,
                Tenant.slug.label("tenant_slug"),
                Tenant.name.label("tenant_name"),
                Tenant.brand_config,
                func.count(Task.id).label("task_count"),
            )
            .join(Tenant, Tenant.id == Event.tenant_id)
            .join(Task, Task.event_id == Event.id, isouter=True)
            .where(Event.is_active, Tenant.is_active)
            .group_by(
                Event.id, Event.slug, Event.name, Event.description,
                Event.event_type, Event.starts_at, Event.ends_at,
                Event.config, Tenant.slug, Tenant.name, Tenant.brand_config,
            )
            .order_by(Event.starts_at.desc().nullslast(), Event.slug)
        )
        if event_type in ("city", "hiking", "shopping"):
            q = q.where(Event.event_type == event_type)
        rows = (await session.execute(q)).all()

    return [
        PublicEventOut(
            event_id=r.id,
            slug=r.slug,
            name=r.name,
            description=r.description,
            event_type=r.event_type,
            tenant_slug=r.tenant_slug,
            tenant_name=r.tenant_name,
            theme_color=(r.brand_config or {}).get("theme_color"),
            hero_image=(r.config or {}).get("heroImage"),
            task_count=r.task_count,
            starts_at=r.starts_at,
            ends_at=r.ends_at,
        )
        for r in rows
    ]
