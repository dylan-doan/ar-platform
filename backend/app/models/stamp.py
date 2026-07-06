import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPk


class Stamp(Base, UUIDPk):
    """One collected stamp = one completed task by one member. Idempotent per
    (task, member) via unique constraint."""

    __tablename__ = "stamps"
    __table_args__ = (
        UniqueConstraint("task_id", "member_id", name="uq_stamps_task_member"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), index=True
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"), index=True
    )
    method: Mapped[str] = mapped_column(String(16))  # qr | gps | hybrid
    completed_at: Mapped[datetime] = mapped_column(server_default=func.now())
    # Verification evidence (distance_m, etc.) for audit/debug.
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")


class RewardClaim(Base, UUIDPk):
    """Created automatically when a member reaches the event's reward threshold."""

    __tablename__ = "reward_claims"
    __table_args__ = (
        UniqueConstraint("event_id", "member_id", name="uq_reward_event_member"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"), index=True
    )
    unlocked_at: Mapped[datetime] = mapped_column(server_default=func.now())
