"""Tenant-admin endpoints (spec §3): event management, task configuration,
user data, real-time statistics, report export. RBAC: tenant_admin only."""

import csv
import io
import os
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, UploadFile
from geoalchemy2 import Geometry
from sqlalchemy import cast, delete, func, select
from starlette.responses import Response, StreamingResponse

from app.api.deps import AuthContext, tenant_admin_context
from app.core.config import get_settings
from app.api.headless import hash_export_key
from app.core.errors import ApiError
from app.models import Event, ExportKey, Member, RewardClaim, Stamp, Task, Tenant
from app.schemas import (
    BrandingOut,
    BrandingUpdate,
    EventCreate,
    EventOut,
    EventStatsOut,
    EventUpdate,
    ExportKeyCreated,
    ExportKeyOut,
    MemberOut,
    TaskAdminOut,
    TaskCreate,
    TaskLocation,
    TaskStat,
    TaskUpdate,
)
from app.services.audit import record_audit
from app.services.export_bundle import build_bundle_zip

router = APIRouter(prefix="/api/admin", tags=["tenant-admin"])


def _point(loc: TaskLocation) -> str:
    return f"SRID=4326;POINT({loc.lng} {loc.lat})"


async def _audit_admin(ctx: AuthContext, action: str, entity_type: str, entity_id: uuid.UUID, data: dict) -> None:
    await record_audit(
        ctx.session,
        tenant_id=ctx.identity.tenant_id,
        actor_type="tenant_admin",
        actor_id=ctx.identity.subject_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        data=data,
    )


# ------------------------------------------------------------------ media upload (spec §VII "tải lên hình ảnh")

ALLOWED_IMAGE_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024


@router.post("/media", status_code=201)
async def upload_media(
    image: UploadFile, ctx: AuthContext = Depends(tenant_admin_context)
) -> dict:
    """Tenant-scoped image upload (event hero, logo). Returns a /media URL."""
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise ApiError(422, "unsupported_image", "Upload a PNG, JPEG or WebP image.")
    data = await image.read()
    if not data:
        raise ApiError(422, "image_empty", "Uploaded file is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        raise ApiError(422, "image_too_large", "Image must be ≤ 10 MB.")

    settings = get_settings()
    tenant_dir = os.path.join(settings.media_dir, str(ctx.identity.tenant_id))
    os.makedirs(tenant_dir, exist_ok=True)
    ext = ALLOWED_IMAGE_TYPES[image.content_type]
    filename = f"img-{uuid.uuid4()}{ext}"
    with open(os.path.join(tenant_dir, filename), "wb") as f:
        f.write(data)
    return {"url": f"/media/{ctx.identity.tenant_id}/{filename}"}


# ------------------------------------------------------------------ tenant overview (UI screen 01)

@router.get("/overview")
async def tenant_overview(
    days: int = 14, ctx: AuthContext = Depends(tenant_admin_context)
) -> dict:
    """Tenant-wide dashboard aggregates: KPIs, daily participation series,
    verification-method distribution, and a per-event summary — everything the
    admin dashboard's overview screen renders in one round-trip.

    `days` bounds the daily series (14 / 30 / 90 in the UI)."""
    days = max(1, min(days, 90))
    tid = ctx.identity.tenant_id

    participants = (
        await ctx.session.execute(
            select(func.count(func.distinct(Stamp.member_id))).where(Stamp.tenant_id == tid)
        )
    ).scalar_one()
    total_stamps = (
        await ctx.session.execute(
            select(func.count()).select_from(Stamp).where(Stamp.tenant_id == tid)
        )
    ).scalar_one()
    rewards_unlocked = (
        await ctx.session.execute(
            select(func.count()).select_from(RewardClaim).where(RewardClaim.tenant_id == tid)
        )
    ).scalar_one()
    active_tasks = (
        await ctx.session.execute(
            select(func.count())
            .select_from(Task)
            .join(Event, Event.id == Task.event_id)
            .where(Task.tenant_id == tid, Event.is_active)
        )
    ).scalar_one()

    # Daily participation: distinct members + stamps per day, last `days` days.
    day = func.date_trunc("day", Stamp.completed_at).label("day")
    daily_rows = (
        await ctx.session.execute(
            select(
                day,
                func.count(func.distinct(Stamp.member_id)).label("participants"),
                func.count().label("stamps"),
            )
            .where(
                Stamp.tenant_id == tid,
                Stamp.completed_at >= func.now() - func.make_interval(0, 0, 0, days),
            )
            .group_by(day)
            .order_by(day)
        )
    ).all()

    # Completions by verification method (donut chart: QR+AR / GPS+AR / hybrid).
    method_rows = (
        await ctx.session.execute(
            select(Stamp.method, func.count())
            .where(Stamp.tenant_id == tid)
            .group_by(Stamp.method)
        )
    ).all()

    # Per-event summary for the events table.
    event_rows = (
        await ctx.session.execute(
            select(
                Event.id,
                Event.slug,
                Event.name,
                Event.event_type,
                Event.is_active,
                func.count(func.distinct(Task.id)).label("tasks"),
                func.count(func.distinct(Stamp.member_id)).label("participants"),
            )
            .join(Task, Task.event_id == Event.id, isouter=True)
            .join(Stamp, Stamp.event_id == Event.id, isouter=True)
            .where(Event.tenant_id == tid)
            .group_by(Event.id, Event.slug, Event.name, Event.event_type, Event.is_active)
            .order_by(Event.created_at.desc())
        )
    ).all()

    completion_rate = (rewards_unlocked / participants) if participants else 0.0
    return {
        "kpis": {
            "participants": participants,
            "total_stamps": total_stamps,
            "rewards_unlocked": rewards_unlocked,
            "active_tasks": active_tasks,
            "completion_rate": round(completion_rate, 4),
        },
        "daily": [
            {
                "date": r.day.date().isoformat(),
                "participants": r.participants,
                "stamps": r.stamps,
            }
            for r in daily_rows
        ],
        "methods": [
            {"method": r[0], "completions": r[1]} for r in method_rows
        ],
        "events": [
            {
                "event_id": str(r.id),
                "slug": r.slug,
                "name": r.name,
                "event_type": r.event_type,
                "is_active": r.is_active,
                "tasks": r.tasks,
                "participants": r.participants,
            }
            for r in event_rows
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ------------------------------------------------------------------ events

@router.get("/events", response_model=list[EventOut])
async def list_events(ctx: AuthContext = Depends(tenant_admin_context)) -> list[EventOut]:
    events = (
        (
            await ctx.session.execute(
                select(Event)
                .where(Event.tenant_id == ctx.identity.tenant_id)
                .order_by(Event.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [EventOut.model_validate(e) for e in events]


@router.post("/events", response_model=EventOut, status_code=201)
async def create_event(
    body: EventCreate, ctx: AuthContext = Depends(tenant_admin_context)
) -> EventOut:
    exists = (
        await ctx.session.execute(
            select(Event.id).where(
                Event.tenant_id == ctx.identity.tenant_id, Event.slug == body.slug
            )
        )
    ).scalar_one_or_none()
    if exists:
        raise ApiError(409, "slug_taken", "An event with this slug already exists.")

    event = Event(tenant_id=ctx.identity.tenant_id, **body.model_dump())
    ctx.session.add(event)
    await ctx.session.flush()
    await _audit_admin(ctx, "event.created", "event", event.id, {"slug": event.slug})
    await ctx.session.commit()
    return EventOut.model_validate(event)


async def _get_event(ctx: AuthContext, event_id: uuid.UUID) -> Event:
    event = (
        await ctx.session.execute(
            select(Event).where(
                Event.id == event_id, Event.tenant_id == ctx.identity.tenant_id
            )
        )
    ).scalar_one_or_none()
    if event is None:
        raise ApiError(404, "event_not_found", "Event not found.")
    return event


@router.get("/events/{event_id}", response_model=EventOut)
async def get_event(
    event_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> EventOut:
    return EventOut.model_validate(await _get_event(ctx, event_id))


@router.patch("/events/{event_id}", response_model=EventOut)
async def update_event(
    event_id: uuid.UUID,
    body: EventUpdate,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> EventOut:
    event = await _get_event(ctx, event_id)
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(event, key, value)
    await _audit_admin(ctx, "event.updated", "event", event.id, {"fields": list(changes)})
    await ctx.session.commit()
    return EventOut.model_validate(event)


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(
    event_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> None:
    event = await _get_event(ctx, event_id)
    await ctx.session.delete(event)
    await _audit_admin(ctx, "event.deleted", "event", event_id, {"slug": event.slug})
    await ctx.session.commit()


# ------------------------------------------------------------------ tasks

async def _task_admin_out(ctx: AuthContext, task: Task) -> TaskAdminOut:
    loc = None
    if task.location is not None:
        row = (
            await ctx.session.execute(
                select(
                    func.ST_Y(cast(Task.location, Geometry)).label("lat"),
                    func.ST_X(cast(Task.location, Geometry)).label("lng"),
                ).where(Task.id == task.id)
            )
        ).one()
        loc = TaskLocation(lat=row.lat, lng=row.lng)
    return TaskAdminOut(
        id=task.id,
        event_id=task.event_id,
        name=task.name,
        description=task.description,
        verification_type=task.verification_type,
        location=loc,
        radius_m=task.radius_m,
        ar_config=task.ar_config,
        sort_order=task.sort_order,
        is_active=task.is_active,
        qr_token=task.qr_token,
    )


@router.get("/events/{event_id}/tasks", response_model=list[TaskAdminOut])
async def list_tasks(
    event_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> list[TaskAdminOut]:
    await _get_event(ctx, event_id)
    tasks = (
        (
            await ctx.session.execute(
                select(Task)
                .where(Task.event_id == event_id, Task.tenant_id == ctx.identity.tenant_id)
                .order_by(Task.sort_order, Task.created_at)
            )
        )
        .scalars()
        .all()
    )
    return [await _task_admin_out(ctx, t) for t in tasks]


def _validate_task_config(verification_type: str, has_location: bool, radius_m: int | None) -> None:
    if verification_type in ("gps", "hybrid") and (not has_location or radius_m is None):
        raise ApiError(
            422, "task_invalid", "GPS/hybrid tasks need a location and radius_m."
        )


@router.post("/events/{event_id}/tasks", response_model=TaskAdminOut, status_code=201)
async def create_task(
    event_id: uuid.UUID,
    body: TaskCreate,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> TaskAdminOut:
    await _get_event(ctx, event_id)
    _validate_task_config(body.verification_type, body.location is not None, body.radius_m)

    task = Task(
        tenant_id=ctx.identity.tenant_id,
        event_id=event_id,
        name=body.name,
        description=body.description,
        verification_type=body.verification_type,
        location=_point(body.location) if body.location else None,
        radius_m=body.radius_m,
        ar_config=body.ar_config,
        sort_order=body.sort_order,
        is_active=body.is_active,
        # QR secret is server-generated; the admin prints it as a QR code.
        qr_token=secrets.token_urlsafe(24)
        if body.verification_type in ("qr", "hybrid")
        else None,
    )
    ctx.session.add(task)
    await ctx.session.flush()
    await _audit_admin(ctx, "task.created", "task", task.id, {"name": task.name})
    await ctx.session.commit()
    return await _task_admin_out(ctx, task)


async def _get_task(ctx: AuthContext, task_id: uuid.UUID) -> Task:
    task = (
        await ctx.session.execute(
            select(Task).where(
                Task.id == task_id, Task.tenant_id == ctx.identity.tenant_id
            )
        )
    ).scalar_one_or_none()
    if task is None:
        raise ApiError(404, "task_not_found", "Task not found.")
    return task


@router.patch("/tasks/{task_id}", response_model=TaskAdminOut)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> TaskAdminOut:
    task = await _get_task(ctx, task_id)
    changes = body.model_dump(exclude_unset=True)

    if "location" in changes:
        loc = changes.pop("location")
        task.location = _point(TaskLocation(**loc)) if loc else None
    for key, value in changes.items():
        setattr(task, key, value)

    new_type = task.verification_type
    if new_type in ("qr", "hybrid") and not task.qr_token:
        task.qr_token = secrets.token_urlsafe(24)
    _validate_task_config(new_type, task.location is not None, task.radius_m)

    await _audit_admin(ctx, "task.updated", "task", task.id, {"fields": list(changes)})
    await ctx.session.commit()
    return await _task_admin_out(ctx, task)


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> None:
    task = await _get_task(ctx, task_id)
    await ctx.session.delete(task)
    await _audit_admin(ctx, "task.deleted", "task", task_id, {"name": task.name})
    await ctx.session.commit()


# ------------------------------------------------------------------ branding (white-label)

@router.get("/branding", response_model=BrandingOut)
async def get_branding(ctx: AuthContext = Depends(tenant_admin_context)) -> BrandingOut:
    tenant = (
        await ctx.session.execute(
            select(Tenant).where(Tenant.id == ctx.identity.tenant_id)
        )
    ).scalar_one()
    brand = tenant.brand_config or {}
    return BrandingOut(
        tenant_slug=tenant.slug,
        tenant_name=tenant.name,
        logo_url=brand.get("logo_url"),
        theme_color=brand.get("theme_color"),
        show_powered_by=not brand.get("hide_powered_by", False),
        line_liff_id=tenant.line_liff_id,
    )


@router.patch("/branding", response_model=BrandingOut)
async def update_branding(
    body: BrandingUpdate, ctx: AuthContext = Depends(tenant_admin_context)
) -> BrandingOut:
    """Tenant admin edits logo + theme color. `hide_powered_by`, custom domain
    and LINE binding are platform-admin-only (see /api/platform/tenants)."""
    tenant = (
        await ctx.session.execute(
            select(Tenant).where(Tenant.id == ctx.identity.tenant_id)
        )
    ).scalar_one()

    changes = body.model_dump(exclude_unset=True)

    # Custom domain (spec §VIII) — self-service v1; uniqueness enforced.
    if changes.pop("clear_custom_domain", False):
        tenant.custom_domain = None
    if "custom_domain" in changes:
        domain = changes.pop("custom_domain")
        if domain:
            taken = (
                await ctx.session.execute(
                    select(Tenant.id).where(
                        Tenant.custom_domain == domain.lower(),
                        Tenant.id != tenant.id,
                    )
                )
            ).scalar_one_or_none()
            if taken:
                raise ApiError(409, "domain_taken", "This domain is bound to another tenant.")
            tenant.custom_domain = domain.lower()

    brand = dict(tenant.brand_config or {})
    brand.update(changes)
    tenant.brand_config = brand

    await _audit_admin(ctx, "branding.updated", "tenant", tenant.id, {"fields": list(body.model_dump(exclude_unset=True))})
    await ctx.session.commit()

    return BrandingOut(
        tenant_slug=tenant.slug,
        tenant_name=tenant.name,
        logo_url=brand.get("logo_url"),
        theme_color=brand.get("theme_color"),
        show_powered_by=not brand.get("hide_powered_by", False),
        line_liff_id=tenant.line_liff_id,
        custom_domain=tenant.custom_domain,
    )


# ------------------------------------------------------------------ users

@router.get("/members", response_model=list[MemberOut])
async def list_members(
    ctx: AuthContext = Depends(tenant_admin_context),
) -> list[MemberOut]:
    """Participant data (spec §IX "user data" / LINE module §II.4): member rows
    plus per-member stamp + reward counts so the dashboard shows progress."""
    rows = (
        await ctx.session.execute(
            select(
                Member,
                func.count(func.distinct(Stamp.id)).label("stamps"),
                func.count(func.distinct(RewardClaim.id)).label("rewards"),
            )
            .join(Stamp, Stamp.member_id == Member.id, isouter=True)
            .join(RewardClaim, RewardClaim.member_id == Member.id, isouter=True)
            .where(Member.tenant_id == ctx.identity.tenant_id)
            .group_by(Member.id)
            .order_by(Member.created_at.desc())
        )
    ).all()
    out = []
    for m, stamps, rewards in rows:
        item = MemberOut.model_validate(m)
        item.stamps = stamps
        item.rewards = rewards
        out.append(item)
    return out


# ------------------------------------------------------------------ stats (real-time via polling)

@router.get("/events/{event_id}/stats", response_model=EventStatsOut)
async def event_stats(
    event_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> EventStatsOut:
    await _get_event(ctx, event_id)

    participants = (
        await ctx.session.execute(
            select(func.count(func.distinct(Stamp.member_id))).where(
                Stamp.event_id == event_id
            )
        )
    ).scalar_one()
    total_stamps = (
        await ctx.session.execute(
            select(func.count()).select_from(Stamp).where(Stamp.event_id == event_id)
        )
    ).scalar_one()
    rewards = (
        await ctx.session.execute(
            select(func.count())
            .select_from(RewardClaim)
            .where(RewardClaim.event_id == event_id)
        )
    ).scalar_one()
    by_task = (
        await ctx.session.execute(
            select(Task.id, Task.name, func.count(Stamp.id))
            .join(Stamp, Stamp.task_id == Task.id, isouter=True)
            .where(Task.event_id == event_id)
            .group_by(Task.id, Task.name)
            .order_by(Task.sort_order)
        )
    ).all()

    return EventStatsOut(
        event_id=event_id,
        participants=participants,
        total_stamps=total_stamps,
        rewards_unlocked=rewards,
        completions_by_task=[
            TaskStat(task_id=r[0], task_name=r[1], completions=r[2]) for r in by_task
        ],
        generated_at=datetime.now(timezone.utc),
    )


# ------------------------------------------------------------------ headless template export (spec §3)

@router.get("/events/{event_id}/export-keys", response_model=list[ExportKeyOut])
async def list_export_keys(
    event_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> list[ExportKeyOut]:
    await _get_event(ctx, event_id)
    keys = (
        (
            await ctx.session.execute(
                select(ExportKey)
                .where(
                    ExportKey.event_id == event_id,
                    ExportKey.tenant_id == ctx.identity.tenant_id,
                )
                .order_by(ExportKey.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [ExportKeyOut.model_validate(k) for k in keys]


@router.post("/export-keys/{key_id}/revoke", response_model=ExportKeyOut)
async def revoke_export_key(
    key_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> ExportKeyOut:
    key = (
        await ctx.session.execute(
            select(ExportKey).where(
                ExportKey.id == key_id, ExportKey.tenant_id == ctx.identity.tenant_id
            )
        )
    ).scalar_one_or_none()
    if key is None:
        raise ApiError(404, "key_not_found", "Export key not found.")
    if key.revoked_at is None:
        # Column is a naive TIMESTAMP (like every created_at in the schema).
        key.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await _audit_admin(ctx, "export_key.revoked", "export_key", key.id, {"prefix": key.key_prefix})
        await ctx.session.commit()
    return ExportKeyOut.model_validate(key)


@router.post("/events/{event_id}/export-bundle")
async def export_bundle(
    event_id: uuid.UUID,
    request: Request,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> Response:
    """One step: mint a new scoped export key and return the headless bundle
    (zip) with the key baked into config.js. The key is otherwise never shown;
    revoke it any time via the export-keys endpoints."""
    event = await _get_event(ctx, event_id)
    tenant = (
        await ctx.session.execute(
            select(Tenant).where(Tenant.id == ctx.identity.tenant_id)
        )
    ).scalar_one()

    plaintext = f"zsk_{secrets.token_urlsafe(32)}"
    key = ExportKey(
        tenant_id=ctx.identity.tenant_id,
        event_id=event_id,
        key_prefix=plaintext[:12],
        key_hash=hash_export_key(plaintext),
    )
    ctx.session.add(key)
    await ctx.session.flush()
    await _audit_admin(
        ctx, "export_bundle.created", "export_key", key.id, {"prefix": key.key_prefix}
    )
    await ctx.session.commit()

    # The public API base = the origin the admin is browsing from (the frontend
    # proxies /api/* to us, so that origin serves the API too). Behind the Next
    # proxy request.base_url is the internal hostname — prefer the browser's
    # Origin header; ?api_base= overrides for production domains.
    origin = request.headers.get("origin") or ""
    api_base = (
        request.query_params.get("api_base")
        or origin
        or str(request.base_url).rstrip("/")
    )
    zip_bytes = build_bundle_zip(
        api_base=api_base,
        event_id=str(event_id),
        event_name=event.name,
        tenant_slug=tenant.slug,
        export_key=plaintext,
    )
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{tenant.slug}-{event.slug}-headless.zip"'
        },
    )


# ------------------------------------------------------------------ export

@router.get("/events/{event_id}/export.csv")
async def export_event_csv(
    event_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> StreamingResponse:
    """Report export (spec §3): one row per stamp with member + task info."""
    await _get_event(ctx, event_id)

    rows = (
        await ctx.session.execute(
            select(
                Stamp.completed_at,
                Member.display_name,
                Member.line_user_id,
                Task.name.label("task_name"),
                Stamp.method,
            )
            .join(Member, Member.id == Stamp.member_id)
            .join(Task, Task.id == Stamp.task_id)
            .where(Stamp.event_id == event_id)
            .order_by(Stamp.completed_at)
        )
    ).all()

    await _audit_admin(ctx, "report.exported", "event", event_id, {"rows": len(rows)})
    await ctx.session.commit()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["completed_at", "member_name", "line_user_id", "task", "method"])
    for r in rows:
        writer.writerow([r.completed_at.isoformat(), r.display_name, r.line_user_id, r.task_name, r.method])
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="event-{event_id}-stamps.csv"'},
    )
