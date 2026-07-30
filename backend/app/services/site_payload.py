"""The EVENT WEBSITE payload (spec §VII "auto-generated event website").

ONE builder, so the customer site renders identically whether it runs as a
route inside the platform app (app/e/{tenant}/{event}) or as the exported
Next.js project on the customer's own server. Both call the same key-authed
headless endpoint, which calls this module — a divergence in shape is
impossible by construction.

Contains no secrets: public task fields only (no QR tokens), tenant branding,
and the designer's content config. Safe for an unauthenticated reader; the key
gates *which tenant* you may read, not the sensitivity of the fields.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models import Event, Task, Tenant


def site_branding(tenant: Tenant) -> dict:
    """Branding block shared by the event page and the tenant landing page."""
    brand = tenant.brand_config or {}
    return {
        "tenant_slug": tenant.slug,
        "tenant_name": tenant.name,
        "logo_url": brand.get("logo_url"),
        "theme_color": brand.get("theme_color"),
        "show_powered_by": not brand.get("hide_powered_by", False),
        "landing_title": brand.get("landing_title"),
        "landing_tagline": brand.get("landing_tagline"),
        "landing_hero": brand.get("landing_hero"),
        # White-label plan: CTA/QR opens the tenant's own LIFF app when bound.
        "line_liff_id": tenant.line_liff_id,
    }


async def resolve_tenant(session: AsyncSession, tenant_slug: str) -> Tenant:
    tenant = (
        await session.execute(
            select(Tenant).where(Tenant.slug == tenant_slug, Tenant.is_active)
        )
    ).scalar_one_or_none()
    if tenant is None:
        raise ApiError(404, "tenant_not_found", "查無此租戶。")
    return tenant


async def build_site_payload(
    session: AsyncSession, tenant: Tenant, event_slug: str | None = None
) -> dict:
    """Everything the public event website renders, in one round-trip.

    Without an event_slug (a customer domain root lands here — PRD §6.2 tenant
    resolver) the tenant's homepage rule decides what to show: the admin-pinned
    event (brand_config.home_mode="event"), else a branded landing listing every
    active event (home_mode="list", or "auto" with several), else the
    single/newest active event.

    Returns either {"mode": "landing", ...} or {"mode": "event", ...}.
    """
    brand = tenant.brand_config or {}
    event = None

    if event_slug:
        event = (
            (
                await session.execute(
                    select(Event)
                    .where(
                        Event.tenant_id == tenant.id,
                        Event.is_active,
                        Event.slug == event_slug,
                    )
                    .limit(1)
                )
            )
            .scalars()
            .first()
        )
        if event is None:
            raise ApiError(404, "event_not_found", "此租戶目前沒有進行中的活動。")
    else:
        mode = brand.get("home_mode") or "auto"
        if mode == "event" and brand.get("home_event_slug"):
            # Pinned event; if it was deactivated/deleted fall through to auto.
            event = (
                (
                    await session.execute(
                        select(Event)
                        .where(
                            Event.tenant_id == tenant.id,
                            Event.is_active,
                            Event.slug == brand["home_event_slug"],
                        )
                        .limit(1)
                    )
                )
                .scalars()
                .first()
            )
        if event is None:
            actives = (
                (
                    await session.execute(
                        select(Event)
                        .where(Event.tenant_id == tenant.id, Event.is_active)
                        .order_by(Event.created_at.desc())
                    )
                )
                .scalars()
                .all()
            )
            if not actives:
                raise ApiError(404, "event_not_found", "此租戶目前沒有進行中的活動。")
            if mode == "list" or (mode == "auto" and len(actives) > 1):
                counts = dict(
                    (
                        await session.execute(
                            select(Task.event_id, func.count(Task.id))
                            .where(
                                Task.event_id.in_([e.id for e in actives]),
                                Task.is_active,
                            )
                            .group_by(Task.event_id)
                        )
                    ).all()
                )
                return {
                    "mode": "landing",
                    "branding": site_branding(tenant),
                    "events": [
                        {
                            "slug": e.slug,
                            "name": e.name,
                            "description": e.description,
                            "event_type": e.event_type,
                            "hero_image": (e.config or {}).get("heroImage"),
                            "task_count": counts.get(e.id, 0),
                            "reward_name": e.reward_name,
                        }
                        for e in actives
                    ],
                }
            event = actives[0]

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

    return {
        "mode": "event",
        "branding": site_branding(tenant),
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
            {
                "name": t.name,
                "verification_type": t.verification_type,
                "radius_m": t.radius_m,
            }
            for t in tasks
        ],
        "other_events": [{"slug": r.slug, "name": r.name} for r in siblings],
    }
