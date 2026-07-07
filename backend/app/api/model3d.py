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
from app.schemas import Model3DAdjustRequest, Model3DJobOut
from app.services.audit import record_audit
from app.services.model3d import run_model3d_job

router = APIRouter(prefix="/api/admin/model3d", tags=["model3d"])

ALLOWED_IMAGE_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024


@router.post("/jobs", response_model=Model3DJobOut, status_code=201)
async def create_job(
    image: UploadFile,
    background: BackgroundTasks,
    name: str = "",
    ctx: AuthContext = Depends(tenant_admin_context),
) -> Model3DJobOut:
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise ApiError(422, "unsupported_image", "Upload a PNG, JPEG or WebP image.")
    data = await image.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise ApiError(422, "image_too_large", "Image must be ≤ 10 MB.")
    if not data:
        raise ApiError(422, "image_empty", "Uploaded file is empty.")

    settings = get_settings()
    tenant_id = ctx.identity.tenant_id
    assert tenant_id is not None

    # Store the source image under media/{tenant}/src-{uuid}.ext
    tenant_dir = os.path.join(settings.media_dir, str(tenant_id))
    os.makedirs(tenant_dir, exist_ok=True)
    ext = ALLOWED_IMAGE_TYPES[image.content_type]
    image_path = os.path.join(tenant_dir, f"src-{uuid.uuid4()}{ext}")
    with open(image_path, "wb") as f:
        f.write(data)

    job = Model3DJob(
        tenant_id=tenant_id,
        name=name or (image.filename or "untitled"),
        status="pending",
        provider=get_model3d_provider().name,
        source_image_path=image_path,
        params={"scale": 0.4},
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
        raise ApiError(404, "job_not_found", "3D job not found.")
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
        raise ApiError(422, "target_empty", "Uploaded target is empty.")
    if len(data) > MAX_TARGET_BYTES:
        raise ApiError(422, "target_too_large", "Target must be ≤ 5 MB.")

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
    await ctx.session.delete(job)
    await ctx.session.commit()
