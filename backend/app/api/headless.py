"""Headless read endpoints for customer event websites (spec §3 template export).

Auth: X-Export-Key — a read-only, revocable key. Tenant-wide keys (issued once
per customer from the Zoustec console at onboarding) read every event of their
tenant; event-scoped keys are pinned to one event. Either way the request runs
in a tenant-scoped session, so RLS confines it to that customer's rows — no
member data, no QR secrets.

These endpoints are the SINGLE data path for a customer's event website,
whether it is served by the platform app itself or by the exported Next.js
project on the customer's own server."""

import hashlib
import secrets
import uuid

from fastapi import APIRouter, Header
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select

from app.core.config import get_settings
from app.core.errors import ApiError
from app.db.session import anonymous_session, platform_admin_session, tenant_session
from app.models import Event, ExportKey, Task, Tenant
from app.schemas import (
    BrandingOut,
    EventOut,
    HeadlessEventOut,
    TaskLocation,
    TaskOut,
)
from app.services.site_payload import build_site_payload, resolve_tenant

router = APIRouter(prefix="/api/headless", tags=["headless"])


def hash_export_key(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode()).hexdigest()


def is_platform_service_key(presented: str | None) -> bool:
    """First-party credential used by the platform's own frontend.

    Lets a customer site we host take the SAME authenticated code path as the
    same site self-hosted by the customer, instead of a second un-keyed one.
    Compared in constant time; an unset setting never matches.
    """
    configured = get_settings().platform_service_key
    if not configured or not presented:
        return False
    return secrets.compare_digest(configured, presented)


async def resolve_export_key(x_export_key: str | None) -> ExportKey:
    """Authenticate an X-Export-Key header and return the live key row.

    export_keys is RLS-protected and the tenant is not known until the key row
    is found, so this one lookup runs with the platform-level GUC — safe because
    the 64-hex hash is unguessable, and every caller immediately scopes its real
    work to key.tenant_id via tenant_session.
    """
    if not x_export_key:
        raise ApiError(401, "export_key_required", "需要 X-Export-Key 標頭。")

    key_hash = hash_export_key(x_export_key)
    async with anonymous_session() as session:
        from sqlalchemy import text

        await session.execute(
            text("SELECT set_config('app.is_platform_admin', 'true', true)")
        )
        key = (
            await session.execute(
                select(ExportKey).where(ExportKey.key_hash == key_hash)
            )
        ).scalar_one_or_none()

    if key is None or key.revoked_at is not None:
        raise ApiError(401, "export_key_invalid", "匯出金鑰無效或已撤銷。")
    return key


@router.get("/site/{tenant_slug}")
@router.get("/site/{tenant_slug}/{event_slug}")
async def headless_site(
    tenant_slug: str,
    event_slug: str | None = None,
    x_export_key: str | None = Header(default=None),
) -> dict:
    """The EVENT WEBSITE payload — the SINGLE path both customer sites read.

    Used identically by the platform's own /e/{tenant}/{event} route and by the
    exported Next.js project running on the customer's server, so the two can
    never render different data. Content shape is documented in
    app/services/site_payload.py.

    A tenant-wide key (event_id NULL) may read any event of its own tenant; an
    event-scoped key is additionally pinned to that one event. The platform's own
    frontend presents PLATFORM_SERVICE_KEY, which reads any tenant — the URL slug
    selects one, and it is never handed to a customer.
    """
    if is_platform_service_key(x_export_key):
        async with platform_admin_session() as session:
            tenant = await resolve_tenant(session, tenant_slug)
            return await build_site_payload(session, tenant, event_slug)

    key = await resolve_export_key(x_export_key)

    async with tenant_session(key.tenant_id) as session:
        tenant = (
            await session.execute(select(Tenant).where(Tenant.id == key.tenant_id))
        ).scalar_one_or_none()
        # RLS already limits this session to the key's tenant; the slug in the
        # URL must agree, so a key cannot read a sibling tenant by guessing.
        if tenant is None or tenant.slug != tenant_slug or not tenant.is_active:
            raise ApiError(403, "export_key_scope", "匯出金鑰不適用於此租戶。")

        payload = await build_site_payload(session, tenant, event_slug)

        if key.event_id is not None:
            resolved = payload.get("event", {}).get("id")
            if payload["mode"] != "event" or resolved != str(key.event_id):
                raise ApiError(403, "export_key_scope", "匯出金鑰不適用於此活動。")

        return payload


@router.get("/events/{event_id}", response_model=HeadlessEventOut)
async def headless_event(
    event_id: uuid.UUID,
    x_export_key: str | None = Header(default=None),
) -> HeadlessEventOut:
    key = await resolve_export_key(x_export_key)
    # event_id NULL = tenant-wide key (console-issued): any event of the
    # tenant — the tenant_session below + RLS still hide other tenants.
    if key.event_id is not None and key.event_id != event_id:
        raise ApiError(403, "export_key_scope", "匯出金鑰不適用於此活動。")

    async with tenant_session(key.tenant_id) as session:
        event = (
            await session.execute(
                select(Event).where(
                    Event.id == event_id,
                    Event.tenant_id == key.tenant_id,
                    Event.is_active,
                )
            )
        ).scalar_one_or_none()
        if event is None:
            raise ApiError(404, "event_not_found", "找不到活動，或活動未啟用。")

        tenant = (
            await session.execute(select(Tenant).where(Tenant.id == key.tenant_id))
        ).scalar_one()

        tasks = (
            (
                await session.execute(
                    select(Task)
                    .where(Task.event_id == event_id, Task.is_active)
                    .order_by(Task.sort_order, Task.created_at)
                )
            )
            .scalars()
            .all()
        )
        loc_rows = (
            await session.execute(
                select(
                    Task.id,
                    func.ST_Y(cast(Task.location, Geometry)).label("lat"),
                    func.ST_X(cast(Task.location, Geometry)).label("lng"),
                ).where(Task.event_id == event_id, Task.location.is_not(None))
            )
        ).all()
        locations = {r.id: TaskLocation(lat=r.lat, lng=r.lng) for r in loc_rows}

        # Build the full payload INSIDE the session: tenant_session's cleanup
        # rolls back on exit, which expires ORM instances — touching them after
        # the `async with` raises DetachedInstanceError.
        brand = tenant.brand_config or {}
        return HeadlessEventOut(
            event=EventOut.model_validate(event),
            tasks=[
                TaskOut(
                    id=t.id,
                    event_id=t.event_id,
                    name=t.name,
                    description=t.description,
                    verification_type=t.verification_type,
                    location=locations.get(t.id),
                    radius_m=t.radius_m,
                    ar_config=t.ar_config,
                    sort_order=t.sort_order,
                    is_active=t.is_active,
                    completed=False,
                )
                for t in tasks
            ],
            branding=BrandingOut(
                tenant_slug=tenant.slug,
                tenant_name=tenant.name,
                logo_url=brand.get("logo_url"),
                theme_color=brand.get("theme_color"),
                show_powered_by=not brand.get("hide_powered_by", False),
                line_liff_id=tenant.line_liff_id,
            ),
            tenant_slug=tenant.slug,
        )
