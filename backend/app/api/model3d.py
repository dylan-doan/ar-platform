"""AI-3D admin endpoints (spec §3): upload a 2D image → generate a 3D model
(via the Model3DProvider seam) → basic adjustments → usable in WebAR.

RBAC: tenant admin. Every job carries tenant_id (RLS-scoped like everything else).
"""

import os
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile

from sqlalchemy import select

from app.api.deps import AuthContext, tenant_admin_context
from app.core.config import get_settings
from app.core.errors import ApiError
from app.models import MediaAsset, Model3DJob
from app.providers.model3d import get_model3d_provider
from app.schemas import Model3DAdjustRequest, Model3DJobOut, Model3DRetextureRequest
from app.services.audit import record_audit
from app.services.model3d import run_model3d_job, run_retexture_job, run_rigging_job

router = APIRouter(prefix="/api/admin/model3d", tags=["model3d"])

ALLOWED_IMAGE_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024


@router.post("/jobs", response_model=Model3DJobOut, status_code=201)
async def create_job(
    image: UploadFile,
    background: BackgroundTasks,
    name: str = "",
    prompt: str = "",
    ctx: AuthContext = Depends(tenant_admin_context),
) -> Model3DJobOut:
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise ApiError(422, "unsupported_image", "請上傳 PNG、JPEG 或 WebP 圖片。")
    data = await image.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise ApiError(422, "image_too_large", "圖片大小須 ≤ 10 MB。")
    if not data:
        raise ApiError(422, "image_empty", "上傳的檔案是空的。")

    settings = get_settings()
    tenant_id = ctx.identity.tenant_id
    assert tenant_id is not None

    # Durable copy in the DB: the source image doubles as the PRINTED AR
    # target (view/download/re-compile later) — it must survive the ephemeral
    # container disk, like every upload since migration 0005.
    src_asset = MediaAsset(
        tenant_id=tenant_id, content_type=image.content_type, data=data
    )
    ctx.session.add(src_asset)
    await ctx.session.flush()

    # Scratch copy on disk — the provider seam takes a local file path.
    tenant_dir = os.path.join(settings.media_dir, str(tenant_id))
    os.makedirs(tenant_dir, exist_ok=True)
    ext = ALLOWED_IMAGE_TYPES[image.content_type]
    image_path = os.path.join(tenant_dir, f"src-{uuid.uuid4()}{ext}")
    with open(image_path, "wb") as f:
        f.write(data)

    params = {"scale": 0.4, "sourceImageUrl": f"/media/db/{src_asset.id}"}
    if prompt.strip():
        # Optional user hint forwarded to the engine (e.g. Meshy texture_prompt).
        params["prompt"] = prompt.strip()[:600]
    job = Model3DJob(
        tenant_id=tenant_id,
        name=name or (image.filename or "untitled"),
        status="pending",
        provider=get_model3d_provider().name,
        source_image_path=image_path,
        params=params,
    )
    ctx.session.add(job)
    await ctx.session.flush()
    await record_audit(
        ctx.session,
        tenant_id=tenant_id,
        actor_type="tenant_admin",
        actor_id=ctx.identity.subject_id,
        action="model3d.job_created",
        entity_type="model3d_job",
        entity_id=job.id,
        data={"provider": job.provider, "name": job.name},
    )
    await ctx.session.commit()

    background.add_task(run_model3d_job, tenant_id, job.id)
    return Model3DJobOut.model_validate(job)


@router.get("/jobs", response_model=list[Model3DJobOut])
async def list_jobs(ctx: AuthContext = Depends(tenant_admin_context)) -> list[Model3DJobOut]:
    jobs = (
        (
            await ctx.session.execute(
                select(Model3DJob)
                .where(Model3DJob.tenant_id == ctx.identity.tenant_id)
                .order_by(Model3DJob.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [Model3DJobOut.model_validate(j) for j in jobs]


async def _get_job(ctx: AuthContext, job_id: uuid.UUID) -> Model3DJob:
    job = (
        await ctx.session.execute(
            select(Model3DJob).where(
                Model3DJob.id == job_id, Model3DJob.tenant_id == ctx.identity.tenant_id
            )
        )
    ).scalar_one_or_none()
    if job is None:
        raise ApiError(404, "job_not_found", "找不到 3D 生成工作。")
    return job


MAX_TARGET_BYTES = 5 * 1024 * 1024


@router.post("/jobs/{job_id}/target", response_model=Model3DJobOut)
async def upload_target(
    job_id: uuid.UUID,
    target: UploadFile,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> Model3DJobOut:
    """Attach a compiled MindAR image target (.mind) to a job.

    AR Studio compiles the uploaded 2D artwork in the browser, so the SAME
    image that generated the 3D model doubles as the printed AR target —
    one upload gives both halves of the AR experience."""
    job = await _get_job(ctx, job_id)
    data = await target.read()
    if not data:
        raise ApiError(422, "target_empty", "上傳的目標檔是空的。")
    if len(data) > MAX_TARGET_BYTES:
        raise ApiError(422, "target_too_large", "目標檔大小須 ≤ 5 MB。")

    # In-DB storage: the AR camera loads this URL at every task mount, long
    # after any given container's ephemeral disk has been reset.
    asset = MediaAsset(
        tenant_id=ctx.identity.tenant_id,
        content_type="application/octet-stream",
        data=data,
    )
    ctx.session.add(asset)
    await ctx.session.flush()

    job.params = {
        **(job.params or {}),
        "targetUrl": f"/media/db/{asset.id}",
    }
    await record_audit(
        ctx.session,
        tenant_id=ctx.identity.tenant_id,
        actor_type="tenant_admin",
        actor_id=ctx.identity.subject_id,
        action="model3d.target_attached",
        entity_type="model3d_job",
        entity_id=job.id,
        data={"bytes": len(data)},
    )
    await ctx.session.commit()
    return Model3DJobOut.model_validate(job)


@router.get("/jobs/{job_id}", response_model=Model3DJobOut)
async def get_job(
    job_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> Model3DJobOut:
    return Model3DJobOut.model_validate(await _get_job(ctx, job_id))


@router.post("/jobs/{job_id}/animate", response_model=Model3DJobOut)
async def animate_job(
    job_id: uuid.UUID,
    background: BackgroundTasks,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> Model3DJobOut:
    """Auto-rig the generated model and produce preset walk/run animations
    (engine capability — Meshy today, the official engine later). The animated
    GLBs are persisted in-DB; the studio then picks a variant per job."""
    job = await _get_job(ctx, job_id)
    provider = get_model3d_provider()
    if not provider.supports_rigging:
        raise ApiError(422, "rigging_unsupported", "示範引擎不支援動作生成 — 需使用正式 3D 引擎（如 Meshy）。")
    if job.status != "succeeded" or not job.provider_job_id:
        raise ApiError(422, "job_not_ready", "3D 模型生成完成後才能生成動作。")
    if ((job.params or {}).get("rig") or {}).get("status") == "processing":
        raise ApiError(409, "rigging_in_progress", "動作生成進行中，請稍候。")

    job.params = {**(job.params or {}), "rig": {"status": "processing"}}
    await record_audit(
        ctx.session,
        tenant_id=ctx.identity.tenant_id,
        actor_type="tenant_admin",
        actor_id=ctx.identity.subject_id,
        action="model3d.rigging_started",
        entity_type="model3d_job",
        entity_id=job.id,
        data={},
    )
    await ctx.session.commit()

    background.add_task(run_rigging_job, ctx.identity.tenant_id, job.id)
    return Model3DJobOut.model_validate(job)


@router.post("/jobs/{job_id}/retexture", response_model=Model3DJobOut)
async def retexture_job(
    job_id: uuid.UUID,
    body: Model3DRetextureRequest,
    background: BackgroundTasks,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> Model3DJobOut:
    """Re-texture the model from a per-model text description (engine
    capability — Meshy today). The new GLB replaces the served model; stale
    rig variants are dropped and can be regenerated."""
    job = await _get_job(ctx, job_id)
    provider = get_model3d_provider()
    if not provider.supports_retexture:
        raise ApiError(422, "retexture_unsupported", "示範引擎不支援材質重生 — 需使用正式 3D 引擎（如 Meshy）。")
    if job.status != "succeeded" or not job.provider_job_id:
        raise ApiError(422, "job_not_ready", "3D 模型生成完成後才能重生材質。")
    params = job.params or {}
    if (params.get("retexture") or {}).get("status") == "processing":
        raise ApiError(409, "retexture_in_progress", "材質重生進行中，請稍候。")
    if (params.get("rig") or {}).get("status") == "processing":
        raise ApiError(409, "rigging_in_progress", "動作生成進行中，請稍候。")

    job.params = {**params, "retexture": {"status": "processing"}}
    await record_audit(
        ctx.session,
        tenant_id=ctx.identity.tenant_id,
        actor_type="tenant_admin",
        actor_id=ctx.identity.subject_id,
        action="model3d.retexture_started",
        entity_type="model3d_job",
        entity_id=job.id,
        data={"prompt": body.prompt[:100]},
    )
    await ctx.session.commit()

    background.add_task(run_retexture_job, ctx.identity.tenant_id, job.id, body.prompt)
    return Model3DJobOut.model_validate(job)


@router.patch("/jobs/{job_id}", response_model=Model3DJobOut)
async def adjust_job(
    job_id: uuid.UUID,
    body: Model3DAdjustRequest,
    ctx: AuthContext = Depends(tenant_admin_context),
) -> Model3DJobOut:
    """Basic adjustments (scale / y-offset / color tint) — stored on the job and
    applied by the AR layer at mount time."""
    job = await _get_job(ctx, job_id)
    changes = body.model_dump(exclude_unset=True)

    if "name" in changes:
        job.name = changes.pop("name")

    params = dict(job.params or {})
    if "variant" in changes:
        # Switch the served GLB between static / walk / run (post-rigging).
        variant = changes.pop("variant")
        url = (params.get("variants") or {}).get(variant)
        if not url:
            raise ApiError(422, "variant_unavailable", "此動作尚未生成 — 請先執行「生成動作」。")
        job.result_glb_url = url
        params["activeVariant"] = variant
    key_map = {"scale": "scale", "y_offset": "yOffset", "color_tint": "colorTint"}
    for field, param in key_map.items():
        if field in changes:
            params[param] = changes[field]
    job.params = params

    await record_audit(
        ctx.session,
        tenant_id=ctx.identity.tenant_id,
        actor_type="tenant_admin",
        actor_id=ctx.identity.subject_id,
        action="model3d.job_adjusted",
        entity_type="model3d_job",
        entity_id=job.id,
        data={"params": params},
    )
    await ctx.session.commit()
    return Model3DJobOut.model_validate(job)


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_job(
    job_id: uuid.UUID, ctx: AuthContext = Depends(tenant_admin_context)
) -> None:
    job = await _get_job(ctx, job_id)
    # Remove stored files (best-effort; DB row is the source of truth).
    for path in (job.source_image_path,):
        try:
            if path and os.path.isfile(path):
                os.remove(path)
        except OSError:
            pass
    # In-DB media owned by this job (source image + compiled target).
    params = job.params or {}
    for url in (params.get("sourceImageUrl"), params.get("targetUrl")):
        if not url or not url.startswith("/media/db/"):
            continue
        try:
            asset_id = uuid.UUID(url.rsplit("/", 1)[-1])
        except ValueError:
            continue
        asset = (
            await ctx.session.execute(
                select(MediaAsset).where(
                    MediaAsset.id == asset_id,
                    MediaAsset.tenant_id == ctx.identity.tenant_id,
                )
            )
        ).scalar_one_or_none()
        if asset is not None:
            await ctx.session.delete(asset)
    await ctx.session.delete(job)
    await ctx.session.commit()
