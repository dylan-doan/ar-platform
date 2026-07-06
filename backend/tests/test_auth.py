"""Auth & session-token tests: dev-mode OIDC path, member upsert, JWT integrity."""

from datetime import datetime, timedelta, timezone

from jose import jwt

from app.core.config import get_settings
from tests.conftest import bearer, login


async def test_login_creates_member_and_returns_session(client, demo):
    resp = await client.post(
        "/api/auth/line",
        json={"id_token": "dev::newbie::Newbie", "tenant_slug": "alpha"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == "member"
    assert body["display_name"] == "Newbie"
    assert body["tenant_id"] == str(demo["tenant_a"].id)

    # Session works immediately.
    events = await client.get("/api/me/events", headers=bearer(body["access_token"]))
    assert events.status_code == 200


async def test_login_is_idempotent_same_member(client, demo):
    r1 = await client.post(
        "/api/auth/line", json={"id_token": "dev::alice::Alice", "tenant_slug": "alpha"}
    )
    r2 = await client.post(
        "/api/auth/line", json={"id_token": "dev::alice::Alice2", "tenant_slug": "alpha"}
    )
    assert r1.json()["member_id"] == r2.json()["member_id"]
    assert r2.json()["display_name"] == "Alice2"  # profile refreshed


async def test_unknown_tenant_rejected(client, demo):
    resp = await client.post(
        "/api/auth/line", json={"id_token": "dev::alice::Alice", "tenant_slug": "nope"}
    )
    assert resp.status_code == 404


async def test_seeded_admin_gets_admin_role(client, demo):
    resp = await client.post(
        "/api/auth/line", json={"id_token": "dev::admin-a::Admin", "tenant_slug": "alpha"}
    )
    assert resp.json()["role"] == "tenant_admin"


async def test_expired_jwt_rejected(client, demo):
    settings = get_settings()
    claims = {
        "sub": "00000000-0000-0000-0000-000000000000",
        "tid": str(demo["tenant_a"].id),
        "role": "member",
        "iat": datetime.now(timezone.utc) - timedelta(hours=48),
        "exp": datetime.now(timezone.utc) - timedelta(hours=24),
    }
    token = jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    resp = await client.get("/api/me/events", headers=bearer(token))
    assert resp.status_code == 401


async def test_jwt_signed_with_wrong_secret_rejected(client, demo):
    claims = {
        "sub": "00000000-0000-0000-0000-000000000000",
        "tid": str(demo["tenant_a"].id),
        "role": "member",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    token = jwt.encode(claims, "attacker-secret", algorithm="HS256")
    resp = await client.get("/api/me/events", headers=bearer(token))
    assert resp.status_code == 401


async def test_role_escalation_in_token_is_useless_without_secret(client, demo):
    """A member cannot mint an admin token: signature check fails first."""
    token = await login(client, "alpha", "alice")
    # Tamper: re-sign with wrong secret claiming tenant_admin.
    payload = jwt.get_unverified_claims(token)
    payload["role"] = "tenant_admin"
    forged = jwt.encode(payload, "attacker-secret", algorithm="HS256")
    resp = await client.get("/api/admin/events", headers=bearer(forged))
    assert resp.status_code == 401
