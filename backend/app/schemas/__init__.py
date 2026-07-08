import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------- auth

class LineLoginRequest(BaseModel):
    id_token: str = Field(min_length=1, max_length=4096)
    tenant_slug: str = Field(min_length=1, max_length=64)


class PlatformLoginRequest(BaseModel):
    id_token: str = Field(min_length=1, max_length=4096)


class PlatformPasswordLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=255)


class TenantPasswordLoginRequest(BaseModel):
    """Tenant-admin dashboard sign-in — accounts are provisioned from the
    Zoustec console; email is globally unique so no tenant field is needed."""

    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=255)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=8, max_length=255)


class SessionResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in_minutes: int
    role: str
    member_id: uuid.UUID
    tenant_id: uuid.UUID | None
    display_name: str
    # Set on password accounts still holding their provisioning password —
    # the frontend forces a password change before entering the dashboard.
    must_change_password: bool = False


# ---------------------------------------------------------------- tenants

class TenantCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=1, max_length=255)
    brand_config: dict = Field(default_factory=dict)


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    is_active: bool
    brand_config: dict
    custom_domain: str | None = None
    line_liff_id: str | None = None
    line_channel_id: str | None = None
    plan: str = "saas"
    mrr_ntd: int | None = None
    created_at: datetime


class TenantAdminCreate(BaseModel):
    """Console-provisioned customer admin account. The server generates a
    temporary password (returned once) and forces a change on first login."""

    email: str = Field(min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    display_name: str = Field(min_length=1, max_length=255)


class TenantAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str | None = None
    display_name: str
    role: str
    must_change_password: bool = False
    created_at: datetime
    # Only present right after create / reset-password — never stored.
    temp_password: str | None = None


class TenantLiffProvisionRequest(BaseModel):
    """Spec item 5 — auto create/update the LIFF app via the LIFF Server API.
    Empty fields = use the credentials already stored on the tenant."""

    channel_id: str | None = Field(default=None, max_length=64)
    channel_secret: str | None = Field(default=None, max_length=128)


class TenantUpdate(BaseModel):
    """Platform-admin tenant management (white-label controls included)."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    is_active: bool | None = None
    custom_domain: str | None = Field(
        default=None,
        max_length=255,
        # hostname only — no scheme/path
        pattern=r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$",
    )
    clear_custom_domain: bool = False
    line_liff_id: str | None = Field(default=None, max_length=64)
    line_channel_id: str | None = Field(default=None, max_length=64)
    # Only the platform admin may hide the "Powered by Zoustec" mark (spec §3).
    hide_powered_by: bool | None = None
    # Business model (spec §XI) — managed manually in v1 (no billing engine).
    plan: Literal["saas", "white_label", "one_time"] | None = None
    mrr_ntd: int | None = Field(default=None, ge=0)


# ---------------------------------------------------------------- branding (white-label)

HEX_COLOR = r"^#[0-9a-fA-F]{6}$"


class BrandingUpdate(BaseModel):
    """Tenant-admin editable branding (logo, theme, custom domain).

    v1: customers declare their domain themselves (self-service). Production
    should add an ownership-verification step (DNS TXT record) before
    activating it."""

    logo_url: str | None = Field(default=None, max_length=1024)
    theme_color: str | None = Field(default=None, pattern=HEX_COLOR)
    custom_domain: str | None = Field(
        default=None,
        max_length=255,
        pattern=r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$",
    )
    clear_custom_domain: bool = False
    # What the custom-domain root shows when the tenant has multiple events
    # (PRD §6.2 tenant resolver): auto = go straight in with 1 event, show the
    # overview page with more; list = always the overview page; event = pin
    # home_event_slug.
    home_mode: Literal["auto", "list", "event"] | None = None
    home_event_slug: str | None = Field(default=None, min_length=2, max_length=64, pattern=r"^[a-z0-9-]+$")
    # Overview-page (TenantLanding) content — customer-authored; empty = the
    # defaults (title = organization name, tagline = the platform's standard
    # greeting).
    landing_title: str | None = Field(default=None, max_length=255)
    landing_tagline: str | None = Field(default=None, max_length=500)
    landing_hero: str | None = Field(default=None, max_length=1024)


class BrandingOut(BaseModel):
    """Public branding payload — served pre-login so the login page is already
    white-labeled. Never includes secrets."""

    tenant_slug: str
    tenant_name: str
    logo_url: str | None = None
    theme_color: str | None = None
    show_powered_by: bool = True
    line_liff_id: str | None = None
    custom_domain: str | None = None
    home_mode: str = "auto"
    home_event_slug: str | None = None
    landing_title: str | None = None
    landing_tagline: str | None = None
    landing_hero: str | None = None


# ---------------------------------------------------------------- events

EventType = Literal["city", "hiking", "shopping"]


class PublicEventOut(BaseModel):
    """Portal listing entry (spec §X — public event portal). Cross-tenant,
    pre-auth, only non-sensitive fields."""

    event_id: uuid.UUID
    slug: str
    name: str
    description: str
    event_type: str
    tenant_slug: str
    tenant_name: str
    theme_color: str | None = None
    hero_image: str | None = None
    task_count: int
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class EventCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    event_type: EventType
    config: dict = Field(default_factory=dict)
    is_active: bool = True
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    reward_threshold: int = Field(default=1, ge=1, le=1000)
    reward_name: str = ""
    reward_description: str = ""


class EventUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    config: dict | None = None
    is_active: bool | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    reward_threshold: int | None = Field(default=None, ge=1, le=1000)
    reward_name: str | None = None
    reward_description: str | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    description: str
    event_type: str
    config: dict
    is_active: bool
    starts_at: datetime | None
    ends_at: datetime | None
    reward_threshold: int
    reward_name: str
    reward_description: str
    created_at: datetime


# ---------------------------------------------------------------- tasks

VerificationType = Literal["qr", "gps", "hybrid"]


class TaskLocation(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class TaskCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    verification_type: VerificationType
    location: TaskLocation | None = None
    radius_m: int | None = Field(default=None, ge=5, le=100_000)
    ar_config: dict = Field(default_factory=dict)
    sort_order: int = 0
    is_active: bool = True


class TaskUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    verification_type: VerificationType | None = None
    location: TaskLocation | None = None
    radius_m: int | None = Field(default=None, ge=5, le=100_000)
    ar_config: dict | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class TaskOut(BaseModel):
    """End-user view — deliberately excludes qr_token (the QR secret)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    description: str
    verification_type: str
    location: TaskLocation | None = None
    radius_m: int | None
    ar_config: dict
    sort_order: int
    is_active: bool
    completed: bool = False  # filled per-member on end-user endpoints


class TaskAdminOut(TaskOut):
    """Tenant-admin view — includes the QR secret so admins can print QR codes."""

    qr_token: str | None = None


class TaskCompleteRequest(BaseModel):
    qr_code: str | None = Field(default=None, max_length=64)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class TaskCompleteResponse(BaseModel):
    already_completed: bool
    stamps_collected: int
    reward_threshold: int
    reward_unlocked: bool


# ---------------------------------------------------------------- progress / stats

class ProgressOut(BaseModel):
    event_id: uuid.UUID
    stamps_collected: int
    total_tasks: int
    reward_threshold: int
    reward_unlocked: bool
    completed_task_ids: list[uuid.UUID]


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    line_user_id: str
    display_name: str
    role: str
    created_at: datetime
    # Filled by the admin members listing (spec §IX: participant progress).
    stamps: int = 0
    rewards: int = 0


class TaskStat(BaseModel):
    task_id: uuid.UUID
    task_name: str
    completions: int


# ---------------------------------------------------------------- AI-3D (Model3DProvider seam)

class Model3DJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    status: Literal["pending", "processing", "succeeded", "failed"]
    provider: str
    result_glb_url: str | None
    error: str | None
    params: dict
    created_at: datetime


class Model3DAdjustRequest(BaseModel):
    """Basic post-generation adjustments (spec §3): applied at AR mount time."""

    scale: float | None = Field(default=None, gt=0, le=10)
    y_offset: float | None = Field(default=None, ge=-10, le=10)
    color_tint: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    name: str | None = Field(default=None, max_length=255)


# ---------------------------------------------------------------- template export (headless)

class ExportKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    key_prefix: str
    created_at: datetime
    revoked_at: datetime | None


class ExportKeyCreated(ExportKeyOut):
    """Returned exactly once at creation — the plaintext key is never stored."""

    key: str


class HeadlessEventOut(BaseModel):
    """Read-only event payload for exported bundles (no secrets, no member data)."""

    event: EventOut
    tasks: list[TaskOut]
    branding: BrandingOut
    tenant_slug: str


class EventStatsOut(BaseModel):
    event_id: uuid.UUID
    participants: int
    total_stamps: int
    rewards_unlocked: int
    completions_by_task: list[TaskStat]
    generated_at: datetime
