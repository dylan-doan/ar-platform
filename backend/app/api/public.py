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
from app.services.site_payload import build_site_payload, resolve_tenant

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
        home_mode=brand.get("home_mode", "auto"),
        home_event_slug=brand.get("home_event_slug"),
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
        raise ApiError(404, "tenant_not_found", "查無此租戶。")
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
        raise ApiError(404, "domain_not_found", "此網域尚未綁定任何租戶。")
    return _branding(tenant)


@router.get("/site/{tenant_slug}")
@router.get("/site/{tenant_slug}/{event_slug}")
async def public_event_site(
    tenant_slug: str, event_slug: str | None = None, draft: str | None = None
) -> dict:
    """Un-keyed alias of GET /api/headless/site/{tenant}/{event}.

    Customer sites read the keyed headless endpoint so the platform-hosted and
    self-hosted paths cannot diverge. This alias delegates to the SAME builder
    (services/site_payload.py), so the response is byte-identical; it serves
    older exported bundles, bookmarks, and the platform frontend whenever
    PLATFORM_SERVICE_KEY is not configured.

    `draft` is the preview token minted by PUT /api/admin/events/{id}/design —
    it swaps in the unpublished design for this one render (wrong token = 404).
    """
    async with platform_admin_session() as session:
        tenant = await resolve_tenant(session, tenant_slug)
        return await build_site_payload(session, tenant, event_slug, draft_token=draft)


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
