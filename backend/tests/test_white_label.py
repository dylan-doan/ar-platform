"""Phase 2 white-label tests: public branding, domain resolution, tenant-admin
branding edits, platform-admin tenant management, and the RBAC boundaries
between them."""

from tests.conftest import bearer, login


async def test_public_branding_needs_no_auth(client, demo):
    resp = await client.get("/api/public/tenants/alpha/branding")
    assert resp.status_code == 200
    body = resp.json()
    assert body["tenant_slug"] == "alpha"
    assert body["tenant_name"] == "Alpha City"
    assert body["show_powered_by"] is True  # default: mark visible


async def test_public_branding_unknown_tenant_404(client, demo):
    resp = await client.get("/api/public/tenants/nope/branding")
    assert resp.status_code == 404


async def test_tenant_admin_updates_logo_and_theme(client, demo):
    token = await login(client, "alpha", "admin-a")
    resp = await client.patch(
        "/api/admin/branding",
        headers=bearer(token),
        json={"logo_url": "https://cdn.example.com/logo.png", "theme_color": "#ff5500"},
    )
    assert resp.status_code == 200
    assert resp.json()["theme_color"] == "#ff5500"

    # Publicly visible immediately (login page theming).
    public = await client.get("/api/public/tenants/alpha/branding")
    assert public.json()["logo_url"] == "https://cdn.example.com/logo.png"


async def test_branding_rejects_bad_color(client, demo):
    token = await login(client, "alpha", "admin-a")
    resp = await client.patch(
        "/api/admin/branding", headers=bearer(token), json={"theme_color": "red"}
    )
    assert resp.status_code == 422


async def test_member_cannot_edit_branding(client, demo):
    token = await login(client, "alpha", "alice")
    resp = await client.patch(
        "/api/admin/branding", headers=bearer(token), json={"theme_color": "#112233"}
    )
    assert resp.status_code == 403


async def test_tenant_admin_cannot_hide_powered_by(client, demo):
    """hide_powered_by is not part of BrandingUpdate — a tenant admin sending it
    must not change the flag (platform-only control, spec §3)."""
    token = await login(client, "alpha", "admin-a")
    resp = await client.patch(
        "/api/admin/branding",
        headers=bearer(token),
        json={"hide_powered_by": True, "theme_color": "#112233"},
    )
    assert resp.status_code == 200  # unknown field ignored by schema
    public = await client.get("/api/public/tenants/alpha/branding")
    assert public.json()["show_powered_by"] is True


async def test_platform_admin_full_tenant_management(client, demo):
    resp = await client.post("/api/auth/platform", json={"id_token": "dev::boss::Boss"})
    token = resp.json()["access_token"]
    tenant_id = str(demo["tenant_a"].id)

    updated = await client.patch(
        f"/api/platform/tenants/{tenant_id}",
        headers=bearer(token),
        json={
            "custom_domain": "walk.alpha-city.example",
            "line_liff_id": "1234567890-abcdefgh",
            "hide_powered_by": True,
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["custom_domain"] == "walk.alpha-city.example"
    assert body["line_liff_id"] == "1234567890-abcdefgh"

    # Domain now resolves publicly (frontend middleware path).
    resolved = await client.get("/api/public/domains/walk.alpha-city.example")
    assert resolved.status_code == 200
    assert resolved.json()["tenant_slug"] == "alpha"
    assert resolved.json()["show_powered_by"] is False  # platform hid the mark


async def test_domain_uniqueness_across_tenants(client, demo):
    resp = await client.post("/api/auth/platform", json={"id_token": "dev::boss::Boss"})
    token = resp.json()["access_token"]

    first = await client.patch(
        f"/api/platform/tenants/{demo['tenant_a'].id}",
        headers=bearer(token),
        json={"custom_domain": "shared.example.com"},
    )
    assert first.status_code == 200

    second = await client.patch(
        f"/api/platform/tenants/{demo['tenant_b'].id}",
        headers=bearer(token),
        json={"custom_domain": "shared.example.com"},
    )
    assert second.status_code == 409


async def test_invalid_domain_rejected(client, demo):
    resp = await client.post("/api/auth/platform", json={"id_token": "dev::boss::Boss"})
    token = resp.json()["access_token"]
    bad = await client.patch(
        f"/api/platform/tenants/{demo['tenant_a'].id}",
        headers=bearer(token),
        json={"custom_domain": "https://not-a-hostname/path"},
    )
    assert bad.status_code == 422


async def test_deactivated_tenant_disappears_from_public(client, demo):
    resp = await client.post("/api/auth/platform", json={"id_token": "dev::boss::Boss"})
    token = resp.json()["access_token"]

    await client.patch(
        f"/api/platform/tenants/{demo['tenant_a'].id}",
        headers=bearer(token),
        json={"is_active": False},
    )
    public = await client.get("/api/public/tenants/alpha/branding")
    assert public.status_code == 404

    # And login is refused for the deactivated tenant.
    login_resp = await client.post(
        "/api/auth/line", json={"id_token": "dev::alice::Alice", "tenant_slug": "alpha"}
    )
    assert login_resp.status_code == 404


async def test_tenant_admin_cannot_use_platform_tenant_patch(client, demo):
    token = await login(client, "alpha", "admin-a")
    resp = await client.patch(
        f"/api/platform/tenants/{demo['tenant_a'].id}",
        headers=bearer(token),
        json={"custom_domain": "sneaky.example.com"},
    )
    assert resp.status_code == 403


async def test_event_config_roundtrip_for_all_types(client, demo):
    """Config-driven rendering: type-specific content lives in event.config and
    round-trips through the admin API unchanged."""
    token = await login(client, "alpha", "admin-a")

    for event_type, config in [
        ("hiking", {"sections": [{"type": "notice", "style": "warning", "title": "Safety", "items": ["Water!"]}]}),
        ("city", {"sections": [{"type": "places", "title": "Attractions", "items": [{"name": "101"}]}]}),
        ("shopping", {"sections": [{"type": "info-list", "title": "Stores", "items": [{"label": "B1", "value": "Food"}]}]}),
    ]:
        created = await client.post(
            "/api/admin/events",
            headers=bearer(token),
            json={
                "slug": f"cfg-{event_type}",
                "name": f"Config {event_type}",
                "event_type": event_type,
                "config": config,
            },
        )
        assert created.status_code == 201, created.text
        assert created.json()["config"] == config

        fetched = await client.get(
            f"/api/admin/events/{created.json()['id']}", headers=bearer(token)
        )
        assert fetched.json()["config"] == config
