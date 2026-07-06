import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamped, UUIDPk

JOB_STATUSES = ("pending", "processing", "succeeded", "failed")


class Model3DJob(Base, UUIDPk, Timestamped):
    """One image→3D generation job (spec §3 AI-3D).

    The provider column records which engine produced the model (mock / meshy /
    zoustec later) — the job flow never depends on a specific engine
    (Model3DProvider seam, spec §5.3).
    """

    __tablename__ = "model3d_jobs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    provider: Mapped[str] = mapped_column(String(32))
    provider_job_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_image_path: Mapped[str] = mapped_column(String(1024))
    # Browser-reachable URL of the produced GLB (spec: docs/glb-spec.md).
    result_glb_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    error: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # Post-generation adjustments applied at AR mount time:
    # {"scale": 0.4, "yOffset": 0, "colorTint": "#rrggbb" | null}
    params: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")


class ExportKey(Base, UUIDPk):
    """API key for a headless export bundle (spec §3 template export).

    Only the SHA-256 hash is stored; the plaintext key is shown exactly once at
    creation. Scoped to one event, read-only headless endpoints, revocable.
    """

    __tablename__ = "export_keys"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    key_prefix: Mapped[str] = mapped_column(String(12))  # shown in admin lists
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)
