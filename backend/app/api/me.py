"""End-user endpoints (the LINE flow): browse my tenant's events, see progress,
complete tasks. All routes require a member session; data is double-scoped
(query layer + RLS)."""

import uuid

from fastapi import APIRouter, Depends
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, member_context
from app.core.errors import ApiError
from app.models import Event, RewardClaim, Stamp, Task
from app.schemas import (
    EventOut,
    ProgressOut,
    TaskCompleteRequest,
    TaskCompleteResponse,
    TaskLocation,
    TaskOut,
)
from app.services.tasks import complete_task

router = APIRouter(prefix="/api/me", tags=["end-user"])


async def _locations_for(
    session: AsyncSession, event_id: uuid.UUID, tenant_id: uuid.UUID
) -> dict[uuid.UUID, TaskLocation]:
    """lat/lng per task with a GPS checkpoint (extracted via PostGIS)."""
    rows = (
        await session.execute(
            select(
                Task.id,
                func.ST_Y(cast(Task.location, Geometry)).label("lat"),
                func.ST_X(cast(Task.location, Geometry)).label("lng"),
            ).where(
                Task.event_id == event_id,
                Task.tenant_id == tenant_id,
                Task.location.is_not(None),
            )
        )
    ).all()
    return {r.id: TaskLocation(lat=r.lat, lng=r.lng) for r in rows}


def _task_out(task: Task, loc: TaskLocation | None, completed: bool) -> TaskOut:
    return TaskOut(
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
        completed=completed,
    )


@router.get("/events", response_model=list[EventOut])
async def list_my_events(ctx: AuthContext = Depends(member_context)) -> list[EventOut]:
    events = (
        (
            await ctx.session.execute(
                select(Event)
                .where(Event.tenant_id == ctx.identity.tenant_id, Event.is_active)
                .order_by(Event.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [EventOut.model_validate(e) for e in events]


@router.get("/events/{event_id}", response_model=EventOut)
async def get_event(
    event_id: uuid.UUID, ctx: AuthContext = Depends(member_context)
) -> EventOut:
    event = (
        await ctx.session.execute(
            select(Event).where(
                Event.id == event_id,
                Event.tenant_id == ctx.identity.tenant_id,
                Event.is_active,
            )
        )
    ).scalar_one_or_none()
    if event is None:
        raise ApiError(404, "event_not_found", "Event not found.")
    return EventOut.model_validate(event)


@router.get("/events/{event_id}/tasks", response_model=list[TaskOut])
async def list_event_tasks(
    event_id: uuid.UUID, ctx: AuthContext = Depends(member_context)
) -> list[TaskOut]:
    tenant_id = ctx.identity.tenant_id
    assert tenant_id is not None

    tasks = (
        (
            await ctx.session.execute(
                select(Task)
                .where(
                    Task.event_id == event_id,
                    Task.tenant_id == tenant_id,
                    Task.is_active,
                )
                .order_by(Task.sort_order, Task.created_at)
            )
        )
        .scalars()
        .all()
    )

    completed_ids = set(
        (
            await ctx.session.execute(
                select(Stamp.task_id).where(
                    Stamp.event_id == event_id,
                    Stamp.member_id == ctx.identity.subject_id,
                )
            )
        )
        .scalars()
        .all()
    )
    locations = await _locations_for(ctx.session, event_id, tenant_id)

    return [
        _task_out(t, locations.get(t.id), t.id in completed_ids) for t in tasks
    ]


@router.get("/events/{event_id}/progress", response_model=ProgressOut)
async def my_progress(
    event_id: uuid.UUID, ctx: AuthContext = Depends(member_context)
) -> ProgressOut:
    tenant_id = ctx.identity.tenant_id
    member_id = ctx.identity.subject_id

    event = (
        await ctx.session.execute(
            select(Event).where(Event.id == event_id, Event.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if event is None:
        raise ApiError(404, "event_not_found", "Event not found.")

    completed_ids = (
        (
            await ctx.session.execute(
                select(Stamp.task_id).where(
                    Stamp.event_id == event_id, Stamp.member_id == member_id
                )
            )
        )
        .scalars()
        .all()
    )
    total_tasks = (
        await ctx.session.execute(
            select(func.count())
            .select_from(Task)
            .where(Task.event_id == event_id, Task.is_active)
        )
    ).scalar_one()
    reward_unlocked = (
        await ctx.session.execute(
            select(RewardClaim.id).where(
                RewardClaim.event_id == event_id, RewardClaim.member_id == member_id
            )
        )
    ).scalar_one_or_none() is not None

    return ProgressOut(
        event_id=event_id,
        stamps_collected=len(completed_ids),
        total_tasks=total_tasks,
        reward_threshold=event.reward_threshold,
        reward_unlocked=reward_unlocked,
        completed_task_ids=list(completed_ids),
    )


@router.get("/tasks/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: uuid.UUID, ctx: AuthContext = Depends(member_context)
) -> TaskOut:
    tenant_id = ctx.identity.tenant_id
    assert tenant_id is not None
    task = (
        await ctx.session.execute(
            select(Task).where(
                Task.id == task_id, Task.tenant_id == tenant_id, Task.is_active
            )
        )
    ).scalar_one_or_none()
    if task is None:
        raise ApiError(404, "task_not_found", "Task not found.")

    completed = (
        await ctx.session.execute(
            select(Stamp.id).where(
                Stamp.task_id == task_id, Stamp.member_id == ctx.identity.subject_id
            )
        )
    ).scalar_one_or_none() is not None

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

    return _task_out(task, loc, completed)


@router.post("/tasks/{task_id}/complete", response_model=TaskCompleteResponse)
async def complete(
    task_id: uuid.UUID,
    body: TaskCompleteRequest,
    ctx: AuthContext = Depends(member_context),
) -> TaskCompleteResponse:
    tenant_id = ctx.identity.tenant_id
    assert tenant_id is not None
    result = await complete_task(
        ctx.session,
        tenant_id=tenant_id,
        member_id=ctx.identity.subject_id,
        task_id=task_id,
        qr_code=body.qr_code,
        lat=body.lat,
        lng=body.lng,
    )
    return TaskCompleteResponse(
        already_completed=result.already_completed,
        stamps_collected=result.stamps_collected,
        reward_threshold=result.reward_threshold,
        reward_unlocked=result.reward_unlocked,
    )
