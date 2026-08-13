import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, LargeBinary, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPk

SITE_SOURCE_TYPES = ("generated", "user_upload")


class SiteVersion(Base, UUIDPk):
    """One immutable build of a customer's static website.

    The static-website model (docs/html_website_builder_deployment_platform.md):
    every generate or upload creates a NEW version — nothing is ever overwritten.
    `events.site_version_id` points at the version production serves; publish and
    rollback are the same operation (flip the pointer), which is atomic because
    it is a single column update.

    source_type:
      - "generated"   — rendered by the platform from the event's design JSON
      - "user_upload" — a zip the user edited externally, stored VERBATIM
                        (never parsed back into builder blocks — doc §26)
    """

    __tablename__ = "site_versions"
    __table_args__ = (
        UniqueConstraint("event_id", "version_number", name="uq_site_versions_event_number"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    version_number: Mapped[int] = mapped_column(Integer)
    source_type: Mapped[str] = mapped_column(String(16))
    # SHA-256 over the sorted (path, bytes) set — integrity/idempotency marker.
    source_hash: Mapped[str] = mapped_column(String(64))
    file_count: Mapped[int] = mapped_column(Integer)
    total_bytes: Mapped[int] = mapped_column(Integer)
    created_by: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class SiteFile(Base, UUIDPk):
    """One file of a site version, stored as bytes in Postgres.

    Same reasoning as MediaAsset: the hosting disk is ephemeral, Postgres is the
    one store that persists. Files are small static assets (HTML/CSS/JS/images);
    served at /sites/... . Move to object storage behind the same URLs if volume
    ever grows.
    """

    __tablename__ = "site_files"
    __table_args__ = (
        UniqueConstraint("version_id", "path", name="uq_site_files_version_path"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("site_versions.id", ondelete="CASCADE"), index=True
    )
    path: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str] = mapped_column(String(100))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    size: Mapped[int] = mapped_column(Integer)
