"""Tenant-admin endpoints (spec §3): event management, task configuration,
user data, real-time statistics, report export. RBAC: tenant_admin only."""

import csv
import io
import re
import secrets
import uuid
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, Request, UploadFile
from geoalchemy2 import Geometry
from sqlalchemy import cast, delete, func, select
from starlette.responses import Response, StreamingResponse

from app.api.deps import AuthContext, tenant_admin_context
from app.core.config import get_settings
from app.api.headless import hash_export_key
from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.errors import ApiError
from app.models import (
    Event,
    ExportKey,
    MediaAsset,
    Member,
    RewardClaim,
    SiteFile,
    SiteVersion,
    Stamp,
    Task,
    Tenant,
)
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
from app.services.site_design import (
    apply_design,
    check_media_ownership,
    validate_design,
)
from app.services.site_static import (
    MAX_SITE_ZIP,
    SiteContext,
    build_manifest,
    create_site_version,
    load_design_media,
    render_site,
    validate_site_upload,
    version_out,
)

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


# ------------------------------------------------------------------ media upload (spec §VII "image upload")

ALLOWED_IMAGE_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024


@router.post("/media", status_code=201)
async def upload_media(
    image: UploadFile, ctx: AuthContext = Depends(tenant_admin_context)
) -> dict:
    """Tenant-scoped image upload (event hero, logo). Returns a /media/db URL.

    Bytes go into Postgres, not the filesystem — the hosting disk is ephemeral
    (redeploys/spin-ups reset it), and uploads must outlive both."""
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise ApiError(422, "unsupported_image", "請上傳 PNG、JPEG 或 WebP 圖片。")
    data = await image.read()
    if not data:
        raise ApiError(422, "image_empty", "上傳的檔案是空的。")
    if len(data) > MAX_IMAGE_BYTES:
        raise ApiError(422, "image_too_large", "圖片大小須 ≤ 10 MB。")

    asset = MediaAsset(
        tenant_id=ctx.identity.tenant_id,
        content_type=image.content_type,
        data=data,
    )
    ctx.session.add(asset)
    await ctx.session.flush()
    url = f"/media/db/{asset.id}"
    await ctx.session.commit()
    return {"url": url}


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

    # Completion rate = share of task attempts actually finished, NOT the
    # reward-unlock rate (which reads as 0% whenever a threshold exceeds an
    # event's task count — a player can finish every task and still unlock
    # nothing). Denominator: for each event, the players who joined it times
    # its task count (both DISTINCT above, so unaffected by the Task×Stamp
    # join fan-out); numerator: stamps actually collected.
    possible_completions = sum(r.participants * r.tasks for r in event_rows)
    completion_rate = (total_stamps / possible_completions) if possible_completions else 0.0
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
        raise ApiError(409, "slug_taken", "此代稱（slug）已有其他活動使用。")

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
        raise ApiError(404, "event_not_found", "找不到活動。")
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
    new_slug = changes.get("slug")
    if new_slug and new_slug != event.slug:
        taken = (
            await ctx.session.execute(
                select(Event.id).where(
                    Event.tenant_id == ctx.identity.tenant_id,
                    Event.slug == new_slug,
                    Event.id != event_id,
                )
            )
        ).scalar_one_or_none()
        if taken:
            raise ApiError(409, "slug_taken", "此代稱（slug）已有其他活動使用。")
    # The designer saves its layout through this generic PATCH; hold its
    # config to the same block whitelist as the design upload endpoint so a
    # direct API caller cannot smuggle unknown block types past the client.
    new_config = changes.get("config")
    if isinstance(new_config, dict) and isinstance(new_config.get("puck"), dict):
        validate_design(new_config)
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


# ------------------------------------------------ design JSON round-trip
# The download → edit locally → upload back loop for a customer's site
# design. The design is DATA only ({puck, pages, header, footer}); an upload
# lands as an UNPUBLISHED draft with a preview token, and the live site
# changes only on explicit publish — a bad upload can never take a site down.


async def _tenant_slug(ctx: AuthContext) -> str:
    return (
        await ctx.session.execute(
            select(Tenant.slug).where(Tenant.id == ctx.identity.tenant_id)
        )
    ).scalar_one()


def _draft_summary(event: Event, tenant_slug: str) -> dict | None:
    draft = event.design_draft or {}
    if not draft.get("design"):
        return None
    return {
        "updated_at": draft.get("updated_at"),
        "preview_path": f"/e/{tenant_slug}/{event.slug}?draft={draft.get('token')}",
    }


@router.get("/events/{event_id}/design")
async def get_design(
    event_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> dict:
    """The event's current design in the SAME shape the designer's 匯出設計
    JSON produces, so tooling can round-trip without going through the UI."""
    event = await _get_event(ctx, event_id)
    cfg = event.config or {}
    return {
        "zoustec_design": 1,
        "puck": cfg.get("puck"),
        "pages": cfg.get("pages") or [],
        "header": cfg.get("header"),
        "footer": cfg.get("footer"),
        "draft": _draft_summary(event, await _tenant_slug(ctx)),
    }


@router.put("/events/{event_id}/design")
async def put_design(
    event_id: uuid.UUID,
    body: dict = Body(...),
    ctx: AuthContext = Depends(tenant_admin_context),
) -> dict:
    """Upload an edited design as a draft. Accepts a designer JSON export or a
    data/site.json snapshot; validates block types and media ownership, strips
    event-owned fields, and answers with a tokenized preview URL. Nothing is
    published until POST .../design/publish."""
    event = await _get_event(ctx, event_id)
    return await _save_design_draft(ctx, event, body)


async def _save_design_draft(ctx: AuthContext, event: Event, raw_design: dict) -> dict:
    """Validate + store an uploaded design as the event's draft; shared by the
    JSON and HTML upload paths so both land in the identical pipeline."""
    design = validate_design(raw_design)
    await check_media_ownership(ctx.session, design)
    token = secrets.token_urlsafe(16)
    event.design_draft = {
        "design": design,
        "token": token,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await _audit_admin(ctx, "event.design_draft", "event", event.id, {"slug": event.slug})
    await ctx.session.commit()
    tenant_slug = await _tenant_slug(ctx)
    return {
        "status": "draft",
        "preview_path": f"/e/{tenant_slug}/{event.slug}?draft={token}",
        "preview_token": token,
    }


@router.post("/events/{event_id}/design/publish")
async def publish_design(
    event_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> dict:
    """Promote the draft to the live site (config), then clear it."""
    event = await _get_event(ctx, event_id)
    draft = event.design_draft or {}
    if not draft.get("design"):
        raise ApiError(409, "no_draft", "目前沒有待發佈的設計草稿。")
    event.config = apply_design(event.config or {}, event, draft["design"])
    event.design_draft = None
    await _audit_admin(ctx, "event.design_published", "event", event.id, {"slug": event.slug})
    await ctx.session.commit()
    return {"status": "published"}


@router.delete("/events/{event_id}/design", status_code=204)
async def discard_design_draft(
    event_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> None:
    event = await _get_event(ctx, event_id)
    event.design_draft = None
    await ctx.session.commit()


# --------------------------------------------- static website versions
# The static-website model (docs/html_website_builder_deployment_platform.md):
# the platform GENERATES a plain static site (HTML/CSS/JS/assets) from the
# design, the user downloads it, edits it with any tool, uploads it back —
# and the upload is stored VERBATIM as a new immutable version (never parsed
# back into builder blocks, doc §26). Publish/rollback repoint
# events.site_version_id; production serves /sites/{tenant}/{event}/.


def _request_origin(request: Request) -> str:
    """Caller's browser origin (the admin UI proxies /api, /media and /sites),
    used as the absolute API base baked into js/site-config.js so the site
    works from file://, self-hosting, and custom domains alike."""
    origin = request.headers.get("origin") or ""
    if not origin and request.headers.get("referer"):
        m = re.match(r"(https?://[^/]+)", request.headers["referer"])
        origin = m.group(1) if m else ""
    return origin or str(request.base_url).rstrip("/")


async def _get_site_version(ctx: AuthContext, event: Event, version_id: uuid.UUID) -> SiteVersion:
    version = (
        await ctx.session.execute(
            select(SiteVersion).where(
                SiteVersion.id == version_id,
                SiteVersion.event_id == event.id,
                SiteVersion.tenant_id == ctx.identity.tenant_id,
            )
        )
    ).scalar_one_or_none()
    if version is None:
        raise ApiError(404, "site_version_not_found", "找不到此網站版本。")
    return version


@router.post("/events/{event_id}/site/generate")
async def generate_site_version(
    event_id: uuid.UUID,
    request: Request,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> dict:
    """Render the event's published design into a static website and store it
    as the next version (source_type="generated"). Nothing goes live until the
    version is published — preview first via the returned preview_path."""
    event = await _get_event(ctx, event_id)
    tenant = (
        await ctx.session.execute(
            select(Tenant).where(Tenant.id == ctx.identity.tenant_id)
        )
    ).scalar_one()
    task_names = (
        await ctx.session.execute(
            select(Task.name)
            .where(Task.event_id == event.id, Task.is_active)
            .order_by(Task.sort_order)
        )
    ).scalars().all()
    _, site_key = await _tenant_site_key(ctx)

    cfg = event.config or {}
    media = await load_design_media(ctx.session, cfg, cfg.get("heroImage") or "")
    site_ctx = SiteContext(
        tenant_slug=tenant.slug,
        event_slug=event.slug,
        event_name=event.name,
        description=event.description or "",
        hero_image=cfg.get("heroImage") or "",
        tenant_name=tenant.name,
        brand_color=(tenant.brand_config or {}).get("theme_color"),
        reward_name=event.reward_name or "",
        reward_threshold=event.reward_threshold or 1,
        tasks=list(task_names),
        api_base=_request_origin(request),
        site_key=site_key,
        liff_id=tenant.line_liff_id,
        media=media,
    )
    files = render_site(cfg, site_ctx)
    version = await create_site_version(
        ctx.session,
        tenant_id=ctx.identity.tenant_id,
        event_id=event.id,
        source_type="generated",
        files=files,
        created_by=str(ctx.identity.subject_id),
    )
    await _audit_admin(
        ctx, "site.generated", "site_version", version.id,
        {"version": version.version_number, "files": version.file_count},
    )
    await ctx.session.commit()
    return {"status": "generated", **version_out(version, event.site_version_id)}


@router.get("/events/{event_id}/site/versions")
async def list_site_versions(
    event_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> dict:
    event = await _get_event(ctx, event_id)
    versions = (
        (
            await ctx.session.execute(
                select(SiteVersion)
                .where(SiteVersion.event_id == event.id)
                .order_by(SiteVersion.version_number.desc())
            )
        )
        .scalars()
        .all()
    )
    return {
        "current_version_id": str(event.site_version_id) if event.site_version_id else None,
        "site_path": f"/sites/{await _tenant_slug(ctx)}/{event.slug}/",
        "versions": [version_out(v, event.site_version_id) for v in versions],
    }


@router.get("/events/{event_id}/site/versions/{version_id}/download")
async def download_site_version(
    event_id: uuid.UUID,
    version_id: uuid.UUID,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> Response:
    """website.zip of one version — index.html, css/, js/, assets/ plus
    .website/manifest.json (identifies the project on re-upload, doc §8)."""
    event = await _get_event(ctx, event_id)
    version = await _get_site_version(ctx, event, version_id)
    tenant_slug = await _tenant_slug(ctx)
    files = (
        (
            await ctx.session.execute(
                select(SiteFile).where(SiteFile.version_id == version.id)
            )
        )
        .scalars()
        .all()
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.writestr(f.path, f.data)
        zf.writestr(
            ".website/manifest.json",
            build_manifest(
                tenant_slug=tenant_slug,
                event_id=event.id,
                version_id=version.id,
                version_number=version.version_number,
            ),
        )
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={
            "content-disposition": (
                f'attachment; filename="{tenant_slug}-{event.slug}-website-v{version.version_number}.zip"'
            )
        },
    )


@router.post("/events/{event_id}/site/upload")
async def upload_site_version(
    event_id: uuid.UUID,
    file: UploadFile,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> dict:
    """Upload an edited website zip → next version, stored VERBATIM.

    Validation is the doc §11 checklist (traversal / zip bomb / static-only
    extensions / index.html present); the manifest, when still present, must
    belong to THIS event. The files themselves are never rewritten or parsed —
    what is uploaded is exactly what production will serve after publish."""
    event = await _get_event(ctx, event_id)
    data = await file.read()
    if len(data) > MAX_SITE_ZIP:
        raise ApiError(422, "site_invalid", "ZIP 檔案過大（上限 20MB）。")
    files, manifest = validate_site_upload(data)
    if manifest is not None:
        project_id = str(manifest.get("project_id") or "")
        if project_id and project_id != str(event.id):
            raise ApiError(
                422, "site_wrong_project",
                "這個網站壓縮檔屬於另一個活動（manifest 的 project_id 不符）。",
            )
    version = await create_site_version(
        ctx.session,
        tenant_id=ctx.identity.tenant_id,
        event_id=event.id,
        source_type="user_upload",
        files=files,
        created_by=str(ctx.identity.subject_id),
    )
    await _audit_admin(
        ctx, "site.uploaded", "site_version", version.id,
        {"version": version.version_number, "files": version.file_count},
    )
    await ctx.session.commit()
    return {"status": "uploaded", **version_out(version, event.site_version_id)}


@router.post("/events/{event_id}/site/versions/{version_id}/publish")
async def publish_site_version(
    event_id: uuid.UUID,
    version_id: uuid.UUID,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> dict:
    """Point production at this version (atomic). Publishing an older version
    IS the rollback (doc §13) — versions are immutable, nothing is rebuilt."""
    event = await _get_event(ctx, event_id)
    version = await _get_site_version(ctx, event, version_id)
    event.site_version_id = version.id
    await _audit_admin(
        ctx, "site.published", "site_version", version.id,
        {"version": version.version_number, "source_type": version.source_type},
    )
    await ctx.session.commit()
    return {
        "status": "published",
        "site_path": f"/sites/{await _tenant_slug(ctx)}/{event.slug}/",
        **version_out(version, event.site_version_id),
    }


@router.post("/events/{event_id}/site/unpublish")
async def unpublish_site(
    event_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> dict:
    """Take the static site offline (versions are kept; /e/... SSR remains)."""
    event = await _get_event(ctx, event_id)
    event.site_version_id = None
    await _audit_admin(ctx, "site.unpublished", "event", event.id, {"slug": event.slug})
    await ctx.session.commit()
    return {"status": "unpublished"}


@router.delete("/events/{event_id}/site/versions/{version_id}", status_code=204)
async def delete_site_version(
    event_id: uuid.UUID,
    version_id: uuid.UUID,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> None:
    event = await _get_event(ctx, event_id)
    version = await _get_site_version(ctx, event, version_id)
    if event.site_version_id == version.id:
        raise ApiError(409, "site_version_in_use", "此版本正在線上使用中，請先發佈其他版本。")
    await ctx.session.delete(version)
    await _audit_admin(
        ctx, "site.version_deleted", "site_version", version_id,
        {"version": version.version_number},
    )
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
            422, "task_invalid", "GPS／hybrid 任務需要設定座標與 radius_m。"
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
        raise ApiError(404, "task_not_found", "找不到任務。")
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
        custom_domain=tenant.custom_domain,
        home_mode=brand.get("home_mode", "auto"),
        home_event_slug=brand.get("home_event_slug"),
        landing_title=brand.get("landing_title"),
        landing_tagline=brand.get("landing_tagline"),
        landing_hero=brand.get("landing_hero"),
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
                raise ApiError(409, "domain_taken", "此網域已綁定其他租戶。")
            tenant.custom_domain = domain.lower()

    # Homepage rule (PRD §6.2): pinning the domain root to an event requires
    # that event to exist and be active in this tenant (session is RLS-scoped).
    if changes.get("home_mode") == "event" or changes.get("home_event_slug"):
        slug = changes.get("home_event_slug") or (tenant.brand_config or {}).get("home_event_slug")
        known = slug and (
            await ctx.session.execute(
                select(Event.id).where(Event.slug == slug, Event.is_active)
            )
        ).scalar_one_or_none()
        if not known:
            raise ApiError(422, "event_not_found", "home_event_slug 必須是此租戶進行中的活動。")

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
        home_mode=brand.get("home_mode", "auto"),
        home_event_slug=brand.get("home_event_slug"),
        landing_title=brand.get("landing_title"),
        landing_tagline=brand.get("landing_tagline"),
        landing_hero=brand.get("landing_hero"),
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

async def _tenant_site_key(ctx: AuthContext) -> tuple[ExportKey, str]:
    """This tenant's ONE tenant-wide key (the Site Key baked into exports and
    generated static sites). Returns the existing active key decrypted so every
    export ships the same key the customer already deployed; mints one only if
    none exists or the stored copy predates encryption (previous keys are then
    revoked, exactly like a console rotation). Flushes, does not commit."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    existing = (
        (
            await ctx.session.execute(
                select(ExportKey)
                .where(
                    ExportKey.tenant_id == ctx.identity.tenant_id,
                    ExportKey.event_id.is_(None),
                    ExportKey.revoked_at.is_(None),
                )
                .order_by(ExportKey.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    for key in existing:
        recovered = decrypt_secret(key.key_cipher or "")
        if recovered is not None:
            return key, recovered

    # None recoverable — rotate so the export ships a key that actually works.
    for key in existing:
        key.revoked_at = now
    plaintext = f"zsk_{secrets.token_urlsafe(32)}"
    key = ExportKey(
        tenant_id=ctx.identity.tenant_id,
        event_id=None,
        key_prefix=plaintext[:12],
        key_hash=hash_export_key(plaintext),
        key_cipher=encrypt_secret(plaintext),
    )
    ctx.session.add(key)
    await ctx.session.flush()
    await _audit_admin(
        ctx, "tenant_api_key.created", "export_key", key.id, {"prefix": key.key_prefix}
    )
    return key, plaintext


@router.post("/tenant-api-key", response_model=ExportKeyCreated)
async def get_or_create_tenant_api_key(
    ctx: AuthContext = Depends(tenant_admin_context),
) -> ExportKeyCreated:
    """This tenant's ONE API key, for baking into a project export.

    Scoped to the caller's own tenant — a tenant admin can only ever reach their
    own key.
    """
    key, plaintext = await _tenant_site_key(ctx)
    await ctx.session.commit()
    out = ExportKeyOut.model_validate(key)
    return ExportKeyCreated(**out.model_dump(), key=plaintext)


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


@router.post("/events/{event_id}/export-keys", response_model=ExportKeyCreated)
async def create_export_key(
    event_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> ExportKeyCreated:
    """Mint a scoped headless key and return the plaintext EXACTLY ONCE —
    used by the Next.js project export (the frontend bakes it into .env)."""
    await _get_event(ctx, event_id)
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
        ctx, "export_key.created", "export_key", key.id, {"prefix": key.key_prefix}
    )
    await ctx.session.commit()
    out = ExportKeyOut.model_validate(key)
    return ExportKeyCreated(**out.model_dump(), key=plaintext)


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
        raise ApiError(404, "key_not_found", "找不到匯出金鑰。")
    if key.revoked_at is None:
        # Column is a naive TIMESTAMP (like every created_at in the schema).
        key.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await _audit_admin(ctx, "export_key.revoked", "export_key", key.id, {"prefix": key.key_prefix})
        await ctx.session.commit()
    return ExportKeyOut.model_validate(key)


# Template export is served by the FRONTEND (POST /api/export-nextjs): the zip
# is a real Next.js project built from the platform's own renderers, which only
# the frontend has on disk. The vanilla-JS microsite this endpoint used to build
# was a separate, drifting implementation of the same site and is gone.


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
