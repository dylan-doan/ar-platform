"""AI-3D job lifecycle: submit to the configured Model3DProvider and poll to
completion in a background task (PoC-scale per spec §2; a Celery/RQ worker
slots in here unchanged if load grows — the provider seam is untouched)."""

import asyncio
import uuid

import httpx
import structlog
from sqlalchemy import select

from app.db.session import tenant_session
from app.models import MediaAsset, Model3DJob
from app.providers.model3d import get_model3d_provider

logger = structlog.get_logger()

POLL_INTERVAL_S = 3.0
MAX_POLLS = 200  # ~10 min ceiling — generation beyond that marks the job failed


async def _download_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


async def run_model3d_job(tenant_id: uuid.UUID, job_id: uuid.UUID) -> None:
    """Background task: drive one job to a terminal state. Owns its own DB
    sessions (the request session is gone by the time this runs)."""
    provider = get_model3d_provider()

    async with tenant_session(tenant_id) as session:
        job = (
            await session.execute(
                select(Model3DJob).where(
                    Model3DJob.id == job_id, Model3DJob.tenant_id == tenant_id
                )
            )
        ).scalar_one_or_none()
        if job is None:
            logger.warning("model3d_job_missing", job_id=str(job_id))
            return

        try:
            submit = await provider.submit(
                job.source_image_path, str(job.id), (job.params or {}).get("prompt") or ""
            )
            job.status = "processing"
            job.provider_job_id = submit.provider_job_id
            await session.commit()
        except Exception as exc:
            job.status = "failed"
            job.error = f"submit failed: {exc}"[:1000]
            await session.commit()
            logger.warning("model3d_submit_failed", job_id=str(job_id), error=str(exc))
            return

        provider_job_id = job.provider_job_id

    # Poll outside any open transaction; write results in short sessions.
    for _ in range(MAX_POLLS):
        await asyncio.sleep(POLL_INTERVAL_S)
        try:
            result = await provider.poll(provider_job_id)
        except Exception as exc:  # transient provider errors: keep polling
            logger.info("model3d_poll_error", job_id=str(job_id), error=str(exc))
            continue

        if result.status == "processing":
            continue

        # Provider-hosted URLs are time-limited AND the container disk is
        # ephemeral — persist remote GLBs into in-DB media before recording.
        glb_url, download_error = result.glb_url, None
        if result.status == "succeeded" and glb_url and glb_url.startswith("http"):
            try:
                data = await _download_bytes(glb_url)
            except Exception as exc:
                download_error = f"engine GLB download failed: {exc}"[:1000]
            else:
                async with tenant_session(tenant_id) as session:
                    asset = MediaAsset(
                        tenant_id=tenant_id, content_type="model/gltf-binary", data=data
                    )
                    session.add(asset)
                    await session.flush()
                    glb_url = f"/media/db/{asset.id}"
                    await session.commit()

        async with tenant_session(tenant_id) as session:
            job = (
                await session.execute(
                    select(Model3DJob).where(Model3DJob.id == job_id)
                )
            ).scalar_one()
            if result.status == "succeeded" and not download_error:
                job.status = "succeeded"
                job.result_glb_url = glb_url
            else:
                job.status = "failed"
                job.error = download_error or (result.error or "generation failed")[:1000]
            await session.commit()
        logger.info("model3d_job_done", job_id=str(job_id), status=result.status)
        return

    async with tenant_session(tenant_id) as session:
        job = (
            await session.execute(select(Model3DJob).where(Model3DJob.id == job_id))
        ).scalar_one()
        job.status = "failed"
        job.error = "timed out waiting for the 3D engine"
        await session.commit()


async def _merge_params(tenant_id: uuid.UUID, job_id: uuid.UUID, patch: dict) -> None:
    """Merge keys into job.params — the JSONB column needs a fresh dict for
    SQLAlchemy change detection."""
    async with tenant_session(tenant_id) as session:
        job = (
            await session.execute(select(Model3DJob).where(Model3DJob.id == job_id))
        ).scalar_one_or_none()
        if job is None:
            return
        job.params = {**(job.params or {}), **patch}
        await session.commit()


async def _set_rig_state(tenant_id: uuid.UUID, job_id: uuid.UUID, rig: dict, extra: dict | None = None) -> None:
    await _merge_params(tenant_id, job_id, {"rig": rig, **(extra or {})})


async def run_rigging_job(tenant_id: uuid.UUID, job_id: uuid.UUID) -> None:
    """Background task: auto-rig a finished model and persist the animated
    GLB variants (walk/run) into in-DB media — provider URLs expire, the AR
    camera must be able to load them forever."""
    provider = get_model3d_provider()

    async with tenant_session(tenant_id) as session:
        job = (
            await session.execute(
                select(Model3DJob).where(
                    Model3DJob.id == job_id, Model3DJob.tenant_id == tenant_id
                )
            )
        ).scalar_one_or_none()
        if job is None or not job.provider_job_id:
            return
        static_url = job.result_glb_url
        input_task_id = job.provider_job_id

    try:
        submit = await provider.submit_rigging(input_task_id)
    except Exception as exc:
        await _set_rig_state(
            tenant_id, job_id, {"status": "failed", "error": f"submit failed: {exc}"[:500]}
        )
        logger.warning("rigging_submit_failed", job_id=str(job_id), error=str(exc))
        return
    await _set_rig_state(
        tenant_id, job_id, {"status": "processing", "taskId": submit.provider_job_id}
    )

    for _ in range(MAX_POLLS):
        await asyncio.sleep(POLL_INTERVAL_S)
        try:
            result = await provider.poll_rigging(submit.provider_job_id)
        except Exception as exc:  # transient provider errors: keep polling
            logger.info("rigging_poll_error", job_id=str(job_id), error=str(exc))
            continue
        if result.status == "processing":
            continue

        if result.status != "succeeded":
            await _set_rig_state(
                tenant_id, job_id,
                {"status": "failed", "error": (result.error or "rigging failed")[:500]},
            )
            logger.info("rigging_job_failed", job_id=str(job_id), error=result.error)
            return

        # Persist each animated variant into DB media.
        variants: dict[str, str] = {}
        if static_url:
            variants["static"] = static_url
        async with tenant_session(tenant_id) as session:
            for key, url in (("walk", result.walk_glb_url), ("run", result.run_glb_url)):
                if not url:
                    continue
                try:
                    data = await _download_bytes(url)
                except Exception as exc:
                    logger.warning("rigging_download_failed", job_id=str(job_id), variant=key, error=str(exc))
                    continue
                asset = MediaAsset(
                    tenant_id=tenant_id, content_type="model/gltf-binary", data=data
                )
                session.add(asset)
                await session.flush()
                variants[key] = f"/media/db/{asset.id}"
            await session.commit()

        if len(variants) <= (1 if static_url else 0):
            await _set_rig_state(
                tenant_id, job_id, {"status": "failed", "error": "no animated GLB stored"}
            )
            return
        await _set_rig_state(
            tenant_id, job_id, {"status": "succeeded"}, extra={"variants": variants}
        )
        logger.info("rigging_job_done", job_id=str(job_id), variants=list(variants))
        return

    await _set_rig_state(
        tenant_id, job_id, {"status": "failed", "error": "timed out waiting for rigging"}
    )


async def run_retexture_job(tenant_id: uuid.UUID, job_id: uuid.UUID, prompt: str) -> None:
    """Background task: re-texture a finished model from a text style prompt.
    On success the job serves the new GLB (persisted in-DB) and future rigging
    applies to the retextured model; stale rig variants are dropped."""
    provider = get_model3d_provider()

    async with tenant_session(tenant_id) as session:
        job = (
            await session.execute(
                select(Model3DJob).where(
                    Model3DJob.id == job_id, Model3DJob.tenant_id == tenant_id
                )
            )
        ).scalar_one_or_none()
        if job is None or not job.provider_job_id:
            return
        input_task_id = job.provider_job_id

    try:
        submit = await provider.submit_retexture(input_task_id, prompt)
    except Exception as exc:
        await _merge_params(
            tenant_id, job_id,
            {"retexture": {"status": "failed", "error": f"submit failed: {exc}"[:500]}},
        )
        logger.warning("retexture_submit_failed", job_id=str(job_id), error=str(exc))
        return
    await _merge_params(
        tenant_id, job_id,
        {"retexture": {"status": "processing", "taskId": submit.provider_job_id}},
    )

    for _ in range(MAX_POLLS):
        await asyncio.sleep(POLL_INTERVAL_S)
        try:
            result = await provider.poll_retexture(submit.provider_job_id)
        except Exception as exc:  # transient provider errors: keep polling
            logger.info("retexture_poll_error", job_id=str(job_id), error=str(exc))
            continue
        if result.status == "processing":
            continue

        if result.status != "succeeded" or not result.glb_url:
            await _merge_params(
                tenant_id, job_id,
                {"retexture": {"status": "failed", "error": (result.error or "retexture failed")[:500]}},
            )
            return

        try:
            data = await _download_bytes(result.glb_url)
        except Exception as exc:
            await _merge_params(
                tenant_id, job_id,
                {"retexture": {"status": "failed", "error": f"GLB download failed: {exc}"[:500]}},
            )
            return

        async with tenant_session(tenant_id) as session:
            job = (
                await session.execute(select(Model3DJob).where(Model3DJob.id == job_id))
            ).scalar_one_or_none()
            if job is None:
                return
            asset = MediaAsset(
                tenant_id=tenant_id, content_type="model/gltf-binary", data=data
            )
            session.add(asset)
            await session.flush()
            params = {**(job.params or {})}
            # Old rig/variants textured the previous look — drop them; the
            # studio offers re-rigging on the new model.
            for stale in ("rig", "variants", "activeVariant"):
                params.pop(stale, None)
            params["prompt"] = prompt.strip()[:600]
            params["retexture"] = {"status": "succeeded"}
            job.params = params
            job.result_glb_url = f"/media/db/{asset.id}"
            # Rigging chains off the LATEST provider task (retextured model).
            job.provider_job_id = submit.provider_job_id
            await session.commit()
        logger.info("retexture_job_done", job_id=str(job_id))
        return

    await _merge_params(
        tenant_id, job_id,
        {"retexture": {"status": "failed", "error": "timed out waiting for retexture"}},
    )
