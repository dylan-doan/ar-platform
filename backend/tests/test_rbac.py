"""RBAC tests (spec §4.3): deny-by-default on every protected endpoint."""

from tests.conftest import bearer, login


async def test_no_token_is_401(client, demo):
    for path in ["/api/me/events", "/api/admin/events", "/api/platform/tenants"]:
        resp = await client.get(path)
        assert resp.status_code == 401, path


async def test_garbage_token_is_401(client, demo):
    resp = await client.get("/api/me/events", headers=bearer("not-a-jwt"))
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_token"


async def test_member_cannot_use_admin_api(client, demo):
    token = await login(client, "alpha", "alice")
    resp = await client.get("/api/admin/events", headers=bearer(token))
    assert resp.status_code == 403


async def test_member_cannot_use_platform_api(client, demo):
    token = await login(client, "alpha", "alice")
    resp = await client.get("/api/platform/tenants", headers=bearer(token))
    assert resp.status_code == 403


async def test_tenant_admin_cannot_use_platform_api(client, demo):
    token = await login(client, "alpha", "admin-a")
    resp = await client.get("/api/platform/tenants", headers=bearer(token))
    assert resp.status_code == 403


async def test_tenant_admin_can_use_admin_api(client, demo):
    token = await login(client, "alpha", "admin-a")
    resp = await client.get("/api/admin/events", headers=bearer(token))
    assert resp.status_code == 200
    assert [e["slug"] for e in resp.json()] == ["walk"]


async def test_random_line_user_is_not_platform_admin(client, demo):
    resp = await client.post(
        "/api/auth/platform", json={"id_token": "dev::random-person::Rando"}
    )
    assert resp.status_code == 403


async def test_platform_admin_login_and_overview(client, demo):
    resp = await client.post("/api/auth/platform", json={"id_token": "dev::boss::Boss"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    overview = await client.get("/api/platform/overview", headers=bearer(token))
    assert overview.status_code == 200
    slugs = {t["slug"] for t in overview.json()["tenants"]}
    assert slugs == {"alpha", "beta"}
