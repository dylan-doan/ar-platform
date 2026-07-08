import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Timestamped, UUIDPk


class Member(Base, UUIDPk, Timestamped):
    """A platform member bound to one tenant (spec §3: per-tenant user data).

    The same LINE user joining two tenants' events becomes two member rows —
    tenant isolation applies to user data too. role: member | tenant_admin.
    """

    __tablename__ = "members"
    __table_args__ = (
        UniqueConstraint("tenant_id", "line_user_id", name="uq_members_tenant_line"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    line_user_id: Mapped[str] = mapped_column(String(64), index=True)
    display_name: Mapped[str] = mapped_column(String(255), default="")
    picture_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="member", server_default="member")


class PlatformAdmin(Base, UUIDPk, Timestamped):
    """Platform-level operator (master admin) — inherently cross-tenant, so this
    is one of the two tables without tenant_id (the other is tenants itself).

    Two sign-in paths: LINE OIDC (line_user_id) or email + password — the
    Zoustec console is an internal back office, forcing LINE there buys
    nothing. Password accounts get a surrogate line_user_id (`pw::{email}`)."""

    __tablename__ = "platform_admins"

    line_user_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(255), default="")
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
