from sqlalchemy import Boolean, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamped, UUIDPk


class Tenant(Base, UUIDPk, Timestamped):
    """A client organization (city, mall, shopping district).

    The tenants table itself is the tenancy root — it has no tenant_id and is
    only writable by platform admins.

    White-label (Phase 2):
      - brand_config JSONB: {"logo_url", "theme_color", "hide_powered_by"} —
        logo/theme editable by the tenant admin; hide_powered_by only by the
        platform admin (spec §3: "Powered by Zoustec" stays controllable).
      - custom_domain: the web-channel domain this tenant is served on
        (resolved by frontend middleware; SSL via the fronting proxy — see
        docs/white-label.md).
      - line_liff_id / line_channel_id: per-tenant LINE binding. The LINE
        channel is deliberately decoupled from custom_domain (spec §5.9: one
        LIFF app points at a single endpoint URL).
    """

    __tablename__ = "tenants"

    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    brand_config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    custom_domain: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, index=True
    )
    line_liff_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    line_channel_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Business model (spec §XI): saas | white_label | one_time. MRR (NT$) is
    # managed manually by the platform admin in v1 — no billing engine.
    plan: Mapped[str] = mapped_column(String(32), default="saas", server_default="saas")
    mrr_ntd: Mapped[int | None] = mapped_column(Integer, nullable=True)
