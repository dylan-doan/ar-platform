"""Application settings — all secrets/config via environment (spec §4.1)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- database ---------------------------------------------------------
    # Owner/migration connection (also used by Alembic + seed).
    database_url: str = (
        "postgresql+asyncpg://zoustec:zoustec_dev_password@localhost:5433/zoustec"
    )
    # Runtime app connection. Uses the non-owner `zoustec_app` role so PostgreSQL
    # Row-Level Security actually applies (owners bypass RLS). Falls back to
    # database_url if unset (dev convenience; RLS then relies on query-layer scoping).
    app_database_url: str = ""

    # --- auth / JWT ---------------------------------------------------------
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    # Session lifetime (spec §5.6: define token flow + session lifetime explicitly).
    jwt_expires_minutes: int = 60 * 24  # 24h — an event visit fits in a day

    # LINE OIDC. Phase 1 uses a single platform LINE channel; per-tenant channel
    # binding is Phase 2 (white-label).
    line_channel_id: str = ""
    line_verify_url: str = "https://api.line.me/oauth2/v2.1/verify"

    # Dev mode: accept "dev::{line_user_id}::{display_name}" as an id_token so the
    # whole flow runs without a real LINE channel. NEVER enable in production.
    auth_dev_mode: bool = False

    # --- CORS (spec §5.5) ---------------------------------------------------
    cors_origins: str = "http://localhost:3000"

    # --- media / AI-3D --------------------------------------------------------
    # Uploaded source images + downloaded GLBs live here; served at /media.
    media_dir: str = "media"
    # Engine behind the Model3DProvider seam: "mock" (default) or "meshy".
    model3d_provider: str = "mock"

    # --- ops ----------------------------------------------------------------
    run_migrations_on_start: bool = False
    seed_on_start: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def effective_app_database_url(self) -> str:
        return self.app_database_url or self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
