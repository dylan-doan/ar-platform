"""Demo seed data (spec §4.10): two tenants with events/tasks/admins so the
demo runs immediately AND cross-tenant isolation is observable.

Idempotent: safe to run repeatedly. Runs on the owner connection (not the RLS
app role) but always sets explicit tenant_ids.

Dev logins (AUTH_DEV_MODE=true, id_token format `dev::{line_user_id}::{name}`):
  dev::admin-taipei::Taipei Admin   → tenant_admin of tenant "taipei"
  dev::admin-mall::Mall Admin       → tenant_admin of tenant "riverside-mall"
  dev::platform-boss::Boss          → platform admin (POST /api/auth/platform)
  dev::alice::Alice                 → auto-registered end user on first login
"""

import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models import Event, Member, PlatformAdmin, Task, Tenant

logger = structlog.get_logger()

# Taipei 101 area coordinates for the GPS demo tasks.
DEMO_TASKS_TAIPEI = [
    {
        "name": "Taipei 101 Plaza",
        "description": "Scan the QR at the plaza entrance, then meet the mascot in AR!",
        "verification_type": "qr",
        "qr_token": "demo-taipei-101-plaza",
        "ar_config": {"glbUrl": "/models/mascot.glb", "targetUrl": "/targets/demo.mind", "scale": 0.4},
        "sort_order": 1,
    },
    {
        "name": "Elephant Mountain Trailhead",
        "description": "Get to the trailhead — GPS check within 150 m.",
        "verification_type": "gps",
        "lat": 25.02755,
        "lng": 121.57062,
        "radius_m": 150,
        "ar_config": {"glbUrl": "/models/mascot.glb", "targetUrl": "/targets/demo.mind", "scale": 0.4},
        "sort_order": 2,
    },
    {
        "name": "Songshan Cultural Park",
        "description": "Scan the QR on site AND be there — hybrid check.",
        "verification_type": "hybrid",
        "qr_token": "demo-songshan-park",
        "lat": 25.04374,
        "lng": 121.56086,
        "radius_m": 200,
        "ar_config": {"glbUrl": "/models/mascot.glb", "targetUrl": "/targets/demo.mind", "scale": 0.4},
        "sort_order": 3,
    },
]

DEMO_TASKS_MALL = [
    {
        "name": "Food Court Check-in",
        "description": "Scan the QR at the food court info desk.",
        "verification_type": "qr",
        "qr_token": "demo-mall-food-court",
        "ar_config": {"glbUrl": "/models/mascot.glb", "targetUrl": "/targets/demo.mind", "scale": 0.4},
        "sort_order": 1,
    },
    {
        "name": "Atrium Stage",
        "description": "Visit the atrium stage — GPS check.",
        "verification_type": "gps",
        "lat": 25.0330,
        "lng": 121.5654,
        "radius_m": 100,
        "ar_config": {"glbUrl": "/models/mascot.glb", "targetUrl": "/targets/demo.mind", "scale": 0.4},
        "sort_order": 2,
    },
]

# Elephant Mountain trail — demonstrates the hiking event type.
DEMO_TASKS_HIKING = [
    {
        "name": "Trailhead Check-in",
        "description": "Start of the Xiangshan trail — GPS check within 120 m.",
        "verification_type": "gps",
        "lat": 25.02755,
        "lng": 121.57062,
        "radius_m": 120,
        "ar_config": {"glbUrl": "/models/mascot.glb", "targetUrl": "/targets/demo.mind", "scale": 0.4},
        "sort_order": 1,
    },
    {
        "name": "Six Giant Rocks Summit",
        "description": "The famous viewpoint — scan the QR on the signpost AND be there.",
        "verification_type": "hybrid",
        "qr_token": "demo-xiangshan-summit",
        "lat": 25.02371,
        "lng": 121.57543,
        "radius_m": 100,
        "ar_config": {"glbUrl": "/models/mascot.glb", "targetUrl": "/targets/demo.mind", "scale": 0.4},
        "sort_order": 2,
    },
]

# ---------------------------------------------------------------------------
# Type-specific event content (spec §3: config-driven — the event page renders
# these sections generically; adding a type adds config, not code).
# Section primitives: notice / info-list / places / text.
# ---------------------------------------------------------------------------

CITY_CONFIG = {
    "sections": [
        {
            "type": "places",
            "title": "Attraction Tour",
            "items": [
                {"name": "Taipei 101", "description": "The iconic 508 m tower — observation deck on 89F."},
                {"name": "Songshan Cultural Park", "description": "A 1937 tobacco factory reborn as a design & art hub."},
                {"name": "Elephant Mountain", "description": "The classic skyline photo spot at sunset."},
            ],
        },
        {
            "type": "text",
            "title": "Cultural Notes",
            "paragraphs": [
                "Taipei blends Japanese-era streetscapes, temple culture and a world-class food scene.",
                "Each checkpoint tells one chapter of the city's story — collect them all!",
            ],
        },
    ]
}

HIKING_CONFIG = {
    "sections": [
        {
            "type": "notice",
            "style": "warning",
            "title": "Safety Reminders",
            "items": [
                "Bring at least 1 L of water per person.",
                "Stone steps get slippery after rain — wear grippy shoes.",
                "Start your descent before 17:30 in winter.",
                "Emergency number: 119 (mountain rescue).",
            ],
        },
        {
            "type": "info-list",
            "title": "Route Info",
            "items": [
                {"label": "Distance", "value": "1.5 km one-way"},
                {"label": "Elevation gain", "value": "+183 m"},
                {"label": "Duration", "value": "≈ 50 min up"},
                {"label": "Difficulty", "value": "Moderate (stairs)"},
            ],
        },
    ]
}

SHOPPING_CONFIG = {
    "sections": [
        {
            "type": "places",
            "title": "Participating Stores",
            "items": [
                {"name": "Food Court (B1)", "description": "Spend NT$200+ in one receipt to qualify."},
                {"name": "Atrium Pop-up Stage", "description": "Weekend brand events 13:00–18:00."},
                {"name": "Cinema Lobby (4F)", "description": "Show any same-day ticket stub."},
            ],
        },
        {
            "type": "notice",
            "title": "Consumption Tasks",
            "items": [
                "Keep your receipts — staff validate purchases at the info desk.",
                "Stamps must be collected on the same day as purchase.",
            ],
        },
    ]
}


def _point(lat: float, lng: float) -> str:
    return f"SRID=4326;POINT({lng} {lat})"


async def seed() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.database_url)  # owner connection
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async with maker() as session:
        # Owner is subject to FORCE RLS too — flag the session as platform-level.
        await session.execute(
            text("SELECT set_config('app.is_platform_admin', 'true', true)")
        )

        async def get_or_create_tenant(
            slug: str, name: str, brand: dict, custom_domain: str | None = None
        ) -> Tenant:
            tenant = (
                await session.execute(select(Tenant).where(Tenant.slug == slug))
            ).scalar_one_or_none()
            if tenant is None:
                tenant = Tenant(
                    slug=slug, name=name, brand_config=brand, custom_domain=custom_domain
                )
                session.add(tenant)
                await session.flush()
            else:
                # Backfill demo branding on tenants created before Phase 2 —
                # only fills gaps, never overwrites admin-edited values.
                if not tenant.brand_config:
                    tenant.brand_config = brand
                if custom_domain and not tenant.custom_domain:
                    tenant.custom_domain = custom_domain
            return tenant

        # taipei.lvh.me resolves to 127.0.0.1 — lets the custom-domain flow be
        # tested locally without touching /etc/hosts.
        taipei = await get_or_create_tenant(
            "taipei",
            "Taipei City Tourism",
            {"theme_color": "#0ea5e9"},
            custom_domain="taipei.lvh.me",
        )
        mall = await get_or_create_tenant(
            "riverside-mall",
            "Riverside Mall",
            {"theme_color": "#f59e0b"},
        )

        async def get_or_create_admin(tenant: Tenant, line_user_id: str, name: str) -> None:
            member = (
                await session.execute(
                    select(Member).where(
                        Member.tenant_id == tenant.id,
                        Member.line_user_id == line_user_id,
                    )
                )
            ).scalar_one_or_none()
            if member is None:
                session.add(
                    Member(
                        tenant_id=tenant.id,
                        line_user_id=line_user_id,
                        display_name=name,
                        role="tenant_admin",
                    )
                )

        await get_or_create_admin(taipei, "admin-taipei", "Taipei Admin")
        await get_or_create_admin(mall, "admin-mall", "Mall Admin")

        boss = (
            await session.execute(
                select(PlatformAdmin).where(PlatformAdmin.line_user_id == "platform-boss")
            )
        ).scalar_one_or_none()
        if boss is None:
            session.add(PlatformAdmin(line_user_id="platform-boss", display_name="Boss"))

        # Zoustec console account (email + password) — upserted from env on
        # every start, so rotating the password = change env + redeploy.
        if settings.platform_admin_email and settings.platform_admin_password:
            from app.core.security import hash_password

            email = settings.platform_admin_email.strip().lower()
            acct = (
                await session.execute(
                    select(PlatformAdmin).where(PlatformAdmin.email == email)
                )
            ).scalar_one_or_none()
            if acct is None:
                session.add(
                    PlatformAdmin(
                        line_user_id=f"pw::{email}",
                        display_name="Zoustec Admin",
                        email=email,
                        password_hash=hash_password(settings.platform_admin_password),
                    )
                )
            else:
                acct.password_hash = hash_password(settings.platform_admin_password)

        async def get_or_create_event(
            tenant: Tenant,
            slug: str,
            name: str,
            event_type: str,
            threshold: int,
            tasks: list[dict],
            config: dict | None = None,
        ) -> None:
            event = (
                await session.execute(
                    select(Event).where(Event.tenant_id == tenant.id, Event.slug == slug)
                )
            ).scalar_one_or_none()
            if event is not None:
                # Keep demo content fresh: update config on re-seed.
                if config is not None and not event.config:
                    event.config = config
                return
            event = Event(
                tenant_id=tenant.id,
                slug=slug,
                name=name,
                event_type=event_type,
                description=f"Demo {event_type} stamp rally by {tenant.name}.",
                config=config or {},
                reward_threshold=threshold,
                reward_name="Limited Edition Badge",
                reward_description="Show this screen at the info desk to claim your badge.",
            )
            session.add(event)
            await session.flush()
            for spec in tasks:
                session.add(
                    Task(
                        tenant_id=tenant.id,
                        event_id=event.id,
                        name=spec["name"],
                        description=spec["description"],
                        verification_type=spec["verification_type"],
                        qr_token=spec.get("qr_token"),
                        location=_point(spec["lat"], spec["lng"]) if "lat" in spec else None,
                        radius_m=spec.get("radius_m"),
                        ar_config=spec["ar_config"],
                        sort_order=spec["sort_order"],
                    )
                )

        await get_or_create_event(
            taipei, "city-walk-2026", "Taipei City Walk 2026", "city", 3,
            DEMO_TASKS_TAIPEI, CITY_CONFIG,
        )
        await get_or_create_event(
            taipei, "xiangshan-hike", "Elephant Mountain Hike", "hiking", 2,
            DEMO_TASKS_HIKING, HIKING_CONFIG,
        )
        await get_or_create_event(
            mall, "summer-stamp-rally", "Summer Stamp Rally", "shopping", 2,
            DEMO_TASKS_MALL, SHOPPING_CONFIG,
        )

        await session.commit()
        logger.info("seed_complete", tenants=["taipei", "riverside-mall"])

    await engine.dispose()


if __name__ == "__main__":
    import asyncio

    asyncio.run(seed())
