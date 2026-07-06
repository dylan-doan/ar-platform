"""Task verification + stamp engine (spec §3).

Verification methods:
  qr     — submitted code must equal the task's qr_token
  gps    — submitted position must be within task.radius_m of task.location,
           checked with PostGIS ST_DWithin on geography (spec §5.8)
  hybrid — both checks must pass

Completing a task inserts a Stamp (idempotent per member+task), writes an audit
entry, and unlocks the event reward when the member's stamp count reaches the
event threshold — all in one transaction.
"""

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models import Event, RewardClaim, Stamp, Task
from app.services.audit import record_audit


@dataclass
class CompletionResult:
    already_completed: bool
    stamps_collected: int
    reward_threshold: int
    reward_unlocked: bool


async def _check_gps(
    session: AsyncSession, task: Task, lat: float, lng: float
) -> dict[str, Any]:
    """PostGIS radius check. Returns evidence (distance) for the audit trail."""
    if task.location is None or task.radius_m is None:
        raise ApiError(409, "task_misconfigured", "Task has no GPS checkpoint configured.")

    row = (
        await session.execute(
            text(
                """
                SELECT
                  ST_DWithin(location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, radius_m) AS within,
                  ST_Distance(location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS distance_m
                FROM tasks WHERE id = :task_id
                """
            ),
            {"lng": lng, "lat": lat, "task_id": str(task.id)},
        )
    ).one()

    if not row.within:
        raise ApiError(
            422,
            "gps_out_of_range",
            "You are not at the checkpoint yet.",
            details={"distance_m": round(row.distance_m, 1), "radius_m": task.radius_m},
        )
    return {"distance_m": round(row.distance_m, 1)}


def _check_qr(task: Task, qr_code: str | None) -> None:
    if not task.qr_token:
        raise ApiError(409, "task_misconfigured", "Task has no QR code configured.")
    if not qr_code or qr_code != task.qr_token:
        raise ApiError(422, "qr_invalid", "QR code is not valid for this task.")


async def complete_task(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    member_id: uuid.UUID,
    task_id: uuid.UUID,
    qr_code: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
) -> CompletionResult:
    task = (
        await session.execute(
            select(Task).where(Task.id == task_id, Task.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if task is None or not task.is_active:
        raise ApiError(404, "task_not_found", "Task not found.")

    event = (
        await session.execute(
            select(Event).where(Event.id == task.event_id, Event.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if event is None or not event.is_active:
        raise ApiError(404, "event_not_found", "Event not found or inactive.")

    # --- verify -------------------------------------------------------------
    evidence: dict[str, Any] = {}
    if task.verification_type in ("qr", "hybrid"):
        _check_qr(task, qr_code)
        evidence["qr"] = "ok"
    if task.verification_type in ("gps", "hybrid"):
        if lat is None or lng is None:
            raise ApiError(422, "gps_required", "This task requires your GPS position.")
        evidence.update(await _check_gps(session, task, lat, lng))

    # --- stamp (idempotent) ---------------------------------------------------
    inserted = (
        await session.execute(
            pg_insert(Stamp)
            .values(
                tenant_id=tenant_id,
                event_id=event.id,
                task_id=task.id,
                member_id=member_id,
                method=task.verification_type,
                meta=evidence,
            )
            .on_conflict_do_nothing(constraint="uq_stamps_task_member")
            .returning(Stamp.id)
        )
    ).scalar_one_or_none()
    already_completed = inserted is None

    stamps_collected = (
        await session.execute(
            select(func.count())
            .select_from(Stamp)
            .where(Stamp.event_id == event.id, Stamp.member_id == member_id)
        )
    ).scalar_one()

    # --- reward unlock ---------------------------------------------------------
    reward_unlocked = False
    if stamps_collected >= event.reward_threshold:
        claim = (
            await session.execute(
                pg_insert(RewardClaim)
                .values(tenant_id=tenant_id, event_id=event.id, member_id=member_id)
                .on_conflict_do_nothing(constraint="uq_reward_event_member")
                .returning(RewardClaim.id)
            )
        ).scalar_one_or_none()
        reward_unlocked = True
        if claim is not None:
            await record_audit(
                session,
                tenant_id=tenant_id,
                actor_type="member",
                actor_id=member_id,
                action="reward.unlocked",
                entity_type="event",
                entity_id=event.id,
                data={"stamps": stamps_collected, "threshold": event.reward_threshold},
            )

    if not already_completed:
        await record_audit(
            session,
            tenant_id=tenant_id,
            actor_type="member",
            actor_id=member_id,
            action="task.completed",
            entity_type="task",
            entity_id=task.id,
            data={"method": task.verification_type, **evidence},
        )

    await session.commit()

    return CompletionResult(
        already_completed=already_completed,
        stamps_collected=stamps_collected,
        reward_threshold=event.reward_threshold,
        reward_unlocked=reward_unlocked,
    )
