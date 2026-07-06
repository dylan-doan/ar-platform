"""Headless endpoints for exported bundles (spec §3 template export).

Auth: X-Export-Key — a per-event, read-only, revocable key created by the
tenant admin. Resolves to a tenant-scoped session; only the bound event's
public data is served (no member data, no QR secrets)."""

import hashlib
import uuid

from fastapi import APIRouter, Header
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select

from app.core.errors import ApiError
from app.db.session import anonymous_session, tenant_session
from app.models import Event, ExportKey, Task, Tenant
from app.schemas import (
    BrandingOut,
    EventOut,
    HeadlessEventOut,
    TaskLocation,
    TaskOut,
)

router = APIRouter(prefix="/api/headless", tags=["headless"])


def hash_export_key(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode()).hexdigest()


@router.get("/events/{event_id}", response_model=HeadlessEventOut)
async def headless_event(
    event_id: uuid.UUID,
    x_export_key: str | None = Header(default=None),
) -> HeadlessEventOut:
    if not x_export_key:
        raise ApiError(401, "export_key_required", "X-Export-Key header is required.")

    # Resolve the key first. export_keys is RLS-protected and the tenant is not
    # known until the key row is found, so this one lookup runs with the
    # platform-level GUC — safe because the 64-hex hash is unguessable and the
    # event binding is enforced immediately after.
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
        raise ApiError(401, "export_key_invalid", "Export key is invalid or revoked.")
    if key.event_id != event_id:
        raise ApiError(403, "export_key_scope", "Export key is not valid for this event.")

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
            raise ApiError(404, "event_not_found", "Event not found or inactive.")

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
