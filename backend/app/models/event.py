import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamped, UUIDPk

EVENT_TYPES = ("city", "hiking", "shopping")


class Event(Base, UUIDPk, Timestamped):
    """A stamp-collecting event. Config-driven rendering of the three event
    types is Phase 2; Phase 1 stores the type + a free-form config blob."""

    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_events_tenant_slug"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    slug: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    event_type: Mapped[str] = mapped_column(String(32))  # city | hiking | shopping
    config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    starts_at: Mapped[datetime | None] = mapped_column(nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(nullable=True)

    # Reward: collecting `reward_threshold` stamps unlocks the reward.
    reward_threshold: Mapped[int] = mapped_column(Integer, default=1)
    reward_name: Mapped[str] = mapped_column(String(255), default="")
    reward_description: Mapped[str] = mapped_column(Text, default="")
