"""AI-3D job lifecycle: submit to the configured Model3DProvider and poll to
completion in a background task (PoC-scale per spec §2; a Celery/RQ worker
slots in here unchanged if load grows — the provider seam is untouched)."""

import asyncio
import uuid

import structlog
from sqlalchemy import select

from app.db.session import tenant_session
from app.models import Model3DJob
from app.providers.model3d import get_model3d_provider

logger = structlog.get_logger()

POLL_INTERVAL_S = 3.0
MAX_POLLS = 200  # ~10 min ceiling — generation beyond that marks the job failed


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
            submit = await provider.submit(job.source_image_path, str(job.id))
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

        async with tenant_session(tenant_id) as session:
            job = (
                await session.execute(
                    select(Model3DJob).where(Model3DJob.id == job_id)
                )
            ).scalar_one()
            if result.status == "succeeded":
                job.status = "succeeded"
                job.result_glb_url = result.glb_url
            else:
                job.status = "failed"
                job.error = (result.error or "generation failed")[:1000]
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
