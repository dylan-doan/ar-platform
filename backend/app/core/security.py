"""Platform session JWT (spec §5.6).

Token flow:
  1. Frontend obtains a LINE ID token via the LIFF SDK.
  2. Frontend POSTs it to /api/auth/line together with the tenant slug.
  3. Backend verifies the ID token against LINE (OIDC) — services/line_oidc.py.
  4. Backend upserts the member and issues THIS platform JWT.
  5. All subsequent API calls send `Authorization: Bearer <platform JWT>`.

Session lifetime: settings.jwt_expires_minutes (default 24h).
Claims: sub=member id (or platform admin id), tid=tenant id (None for platform
admins), role, exp/iat.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.core.config import get_settings
from app.core.errors import ApiError

ROLE_MEMBER = "member"
ROLE_TENANT_ADMIN = "tenant_admin"
ROLE_PLATFORM_ADMIN = "platform_admin"


@dataclass(frozen=True)
class TokenIdentity:
    subject_id: uuid.UUID
    tenant_id: uuid.UUID | None
    role: str


def create_session_token(identity: TokenIdentity) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(identity.subject_id),
        "tid": str(identity.tenant_id) if identity.tenant_id else None,
        "role": identity.role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expires_minutes),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_session_token(token: str) -> TokenIdentity:
    settings = get_settings()
    try:
        claims = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError as exc:
        raise ApiError(401, "invalid_token", "Session token is invalid or expired.") from exc

    role = claims.get("role")
    if role not in (ROLE_MEMBER, ROLE_TENANT_ADMIN, ROLE_PLATFORM_ADMIN):
        raise ApiError(401, "invalid_token", "Session token has an unknown role.")

    try:
        subject_id = uuid.UUID(claims["sub"])
        tenant_id = uuid.UUID(claims["tid"]) if claims.get("tid") else None
    except (KeyError, ValueError) as exc:
        raise ApiError(401, "invalid_token", "Session token is malformed.") from exc

    return TokenIdentity(subject_id=subject_id, tenant_id=tenant_id, role=role)
