import uuid

from geoalchemy2 import Geography
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamped, UUIDPk

VERIFICATION_TYPES = ("qr", "gps", "hybrid")


class Task(Base, UUIDPk, Timestamped):
    """A checkpoint/task within an event.

    Verification (spec §3):
      qr     — client presents the task's QR code value
      gps    — client position must be within radius_m of `location` (PostGIS)
      hybrid — both (recommended)

    `location` is geography(Point,4326); distance checks use ST_DWithin
    (spec §5.8: never hand-rolled haversine).
    """

    __tablename__ = "tasks"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    verification_type: Mapped[str] = mapped_column(String(16))  # qr | gps | hybrid

    # QR: the secret the printed QR encodes. Compared server-side.
    qr_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # GPS: checkpoint position + acceptance radius in meters.
    location = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=True)
    radius_m: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # AR content shown on completion flow (consumed via the ARProvider seam).
    # {"glbUrl": "...", "targetUrl": "...", "scale": 0.4}
    ar_config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")

    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
