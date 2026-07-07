import uuid

from sqlalchemy import ForeignKey, LargeBinary, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamped, UUIDPk


class MediaAsset(Base, UUIDPk, Timestamped):
    """Uploaded media (event hero, logo, compiled .mind AR targets) stored as
    bytes IN the database.

    Free-tier hosting gives the app an ephemeral filesystem — every redeploy or
    spin-down/up starts from the container image, so files written to media_dir
    silently vanish while their URLs stay referenced from event configs.
    Postgres is the one store that persists, and at PoC scale (≤10 MB images,
    ≤5 MB targets) bytea is fine. Served at /media/db/{id}; move to object
    storage (R2/S3) behind the same URLs if volume ever grows.
    """

    __tablename__ = "media_assets"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    content_type: Mapped[str] = mapped_column(String(100))
    data: Mapped[bytes] = mapped_column(LargeBinary)
