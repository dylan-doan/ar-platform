import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPk


class AuditLog(Base, UUIDPk):
    """Operation log & audit trail (spec §4.4): admin actions and task
    completions, with actor, tenant, timestamp."""

    __tablename__ = "audit_logs"

    # Nullable: platform-admin actions (e.g. creating a tenant) have no tenant scope.
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    actor_type: Mapped[str] = mapped_column(String(32))  # member | tenant_admin | platform_admin | system
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    action: Mapped[str] = mapped_column(String(64), index=True)  # e.g. task.completed, event.created
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    data: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), index=True)
