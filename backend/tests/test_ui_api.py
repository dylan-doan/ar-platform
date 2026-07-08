"""Endpoints added for the new UI (nextjs-zoustec screens 01/05/06):

- GET /api/admin/overview      — tenant dashboard aggregates (screen 01)
- GET /api/platform/overview   — extended totals/plans/monthly (screen 05)
- PATCH /api/platform/tenants  — plan + mrr_ntd fields (screen 05)
- GET /api/public/events       — cross-tenant portal listing (screen 06)
"""

import pytest

from tests.conftest import bearer, login

pytestmark = pytest.mark.asyncio


async def _complete_qr(client, token: str, task_id, code: str) -> None:
    resp = await client.post(
        f"/api/me/tasks/{task_id}/complete",
        headers=bearer(token),
        json={"qr_code": code},
    )
    assert resp.status_code == 200, resp.text


# ------------------------------------------------------------------ admin overview (screen 01)


async def test_admin_overview_shape_and_counts(client, demo):
    # One member completes the QR task → 1 participant, 1 stamp.
    user = await login(client, "alpha", "user-1", "User One")
    await _complete_qr(client, user, demo["task_qr"].id, "secret-a")

    admin = await login(client, "alpha", "admin-a")
    resp = await client.get("/api/admin/overview", headers=bearer(admin))
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["kpis"]["participants"] == 1
    assert body["kpis"]["total_stamps"] == 1
    assert body["kpis"]["active_tasks"] == 3  # alpha's event has 3 tasks
    assert body["daily"], "today's completion must appear in the daily series"
    assert body["daily"][-1]["stamps"] == 1
    assert {"method": "qr", "completions": 1} in body["methods"]
    events = {e["slug"]: e for e in body["events"]}
    assert events["walk"]["participants"] == 1
    assert events["walk"]["tasks"] == 3


async def test_admin_overview_is_tenant_scoped(client, demo):
    # Activity in tenant A must not leak into tenant B's overview.
    user = await login(client, "alpha", "user-1", "User One")
    await _complete_qr(client, user, demo["task_qr"].id, "secret-a")

    admin_b = await login(client, "beta", "admin-b")
    resp = await client.get("/api/admin/overview", headers=bearer(admin_b))
    assert resp.status_code == 200
    body = resp.json()
    assert body["kpis"]["participants"] == 0
    assert body["kpis"]["total_stamps"] == 0
    assert [e["slug"] for e in body["events"]] == ["rally"]


async def test_admin_overview_requires_admin(client, demo):
    user = await login(client, "alpha", "user-1", "User One")
    resp = await client.get("/api/admin/overview", headers=bearer(user))
    assert resp.status_code == 403


# ------------------------------------------------------------------ platform overview + plan/mrr (screen 05)


async def test_platform_tenant_plan_and_mrr_patch(client, demo):
    boss = await login_platform(client)
    tid = str(demo["tenant_a"].id)

    resp = await client.patch(
        f"/api/platform/tenants/{tid}",
        headers=bearer(boss),
        json={"plan": "white_label", "mrr_ntd": 32000},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["plan"] == "white_label"
    assert body["mrr_ntd"] == 32000

    bad = await client.patch(
        f"/api/platform/tenants/{tid}",
        headers=bearer(boss),
        json={"plan": "gold"},
    )
    assert bad.status_code == 422


async def test_platform_overview_totals_plans_monthly(client, demo):
    user = await login(client, "alpha", "user-1", "User One")
    await _complete_qr(client, user, demo["task_qr"].id, "secret-a")

    boss = await login_platform(client)
    await client.patch(
        f"/api/platform/tenants/{demo['tenant_a'].id}",
        headers=bearer(boss),
        json={"plan": "white_label", "mrr_ntd": 32000},
    )

    resp = await client.get("/api/platform/overview", headers=bearer(boss))
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["totals"]["tenants"] == 2
    assert body["totals"]["stamps"] == 1
    assert body["totals"]["mrr_ntd"] == 32000
    assert body["plans"] == {"white_label": 1, "saas": 1}
    assert body["monthly"] and body["monthly"][-1]["stamps"] == 1
    by_slug = {t["slug"]: t for t in body["tenants"]}
    assert by_slug["alpha"]["plan"] == "white_label"
    assert by_slug["beta"]["plan"] == "saas"


# ------------------------------------------------------------------ public portal listing (screen 06)


async def test_public_events_lists_active_cross_tenant(client, demo):
    resp = await client.get("/api/public/events")
    assert resp.status_code == 200, resp.text
    events = resp.json()
    slugs = {e["slug"] for e in events}
    assert slugs == {"walk", "rally"}  # both tenants, no auth needed
    walk = next(e for e in events if e["slug"] == "walk")
    assert walk["tenant_slug"] == "alpha"
    assert walk["task_count"] == 3
    # Only public fields — never tokens or member data.
    assert "qr_token" not in walk

    filtered = await client.get("/api/public/events?event_type=shopping")
    assert [e["slug"] for e in filtered.json()] == ["rally"]


async def test_public_events_hides_inactive(client, demo, owner_session):
    demo["event_b"].is_active = False
    owner_session.add(demo["event_b"])
    await owner_session.commit()

    resp = await client.get("/api/public/events")
    assert [e["slug"] for e in resp.json()] == ["walk"]


# ------------------------------------------------------------------ helpers


async def login_platform(client) -> str:
    resp = await client.post(
        "/api/auth/platform", json={"id_token": "dev::boss::Boss"}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


# ------------------------------------------------------------------ task GPS serialize-after-commit (builder task settings)


async def test_admin_create_and_patch_gps_task(client, demo):
    """Regression: handlers serialize the task AFTER commit; with a session
    that hops pooled connections the RLS GUC vanished and the re-read found
    no row (500 NoResultFound). Pinned-connection sessions must keep this
    working for both create-with-location and patch-adding-location."""
    admin = await login(client, "alpha", "admin-a")

    created = await client.post(
        f"/api/admin/events/{demo['event_a'].id}/tasks",
        headers=bearer(admin),
        json={
            "name": "GPS Spot 2",
            "verification_type": "gps",
            "location": {"lat": 18.6766, "lng": 105.6853},
            "radius_m": 120,
            "sort_order": 9,
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["location"] == {"lat": 18.6766, "lng": 105.6853}
    assert body["radius_m"] == 120

    # PATCH that ADDS a location to a QR task (the exact path that 500'd).
    patched = await client.patch(
        f"/api/admin/tasks/{demo['task_qr'].id}",
        headers=bearer(admin),
        json={
            "verification_type": "hybrid",
            "location": {"lat": 18.68, "lng": 105.69},
            "radius_m": 150,
        },
    )
    assert patched.status_code == 200, patched.text
    pbody = patched.json()
    assert pbody["verification_type"] == "hybrid"
    assert pbody["location"] == {"lat": 18.68, "lng": 105.69}
    assert pbody["qr_token"], "hybrid keeps its QR secret"


# ------------------------------------------------------------------ public event website (spec §VII)


async def test_public_event_site_payload(client, demo):
    resp = await client.get("/api/public/site/alpha/walk")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["event"]["name"] == "Alpha Walk"
    assert body["branding"]["tenant_slug"] == "alpha"
    assert len(body["tasks"]) == 3
    # Public payload never leaks verification secrets.
    assert all("qr_token" not in t and "location" not in t for t in body["tasks"])

    # Tenant root (no slug) → newest active event.
    root = await client.get("/api/public/site/alpha")
    assert root.status_code == 200
    assert root.json()["event"]["slug"] == "walk"

    missing = await client.get("/api/public/site/alpha/nope")
    assert missing.status_code == 404


async def test_public_site_homepage_rules(client, demo):
    """Spec §VIII + PRD §6.2 tenant resolver: what the domain root serves.

    auto + 1 event → that event; auto + several → branded landing;
    admin-pinned event → that event (slug must be active); list → landing."""
    # One active event → straight to it.
    root = await client.get("/api/public/site/alpha")
    assert root.status_code == 200
    assert root.json()["mode"] == "event"

    # A second active event appears → auto now serves the landing.
    admin = await login(client, "alpha", "admin-a")
    created = await client.post(
        "/api/admin/events",
        headers=bearer(admin),
        json={"slug": "hike", "name": "Alpha Hike", "event_type": "hiking"},
    )
    assert created.status_code == 201, created.text

    root = await client.get("/api/public/site/alpha")
    body = root.json()
    assert body["mode"] == "landing"
    assert {e["slug"] for e in body["events"]} == {"walk", "hike"}
    assert body["branding"]["tenant_slug"] == "alpha"
    walk = next(e for e in body["events"] if e["slug"] == "walk")
    assert walk["task_count"] == 3

    # Admin pins the domain root to one event.
    pinned = await client.patch(
        "/api/admin/branding",
        headers=bearer(admin),
        json={"home_mode": "event", "home_event_slug": "walk"},
    )
    assert pinned.status_code == 200, pinned.text
    assert pinned.json()["home_mode"] == "event"
    assert pinned.json()["home_event_slug"] == "walk"
    root = await client.get("/api/public/site/alpha")
    assert root.json()["mode"] == "event"
    assert root.json()["event"]["slug"] == "walk"

    # Pinning an unknown event is rejected.
    bad = await client.patch(
        "/api/admin/branding",
        headers=bearer(admin),
        json={"home_mode": "event", "home_event_slug": "nope"},
    )
    assert bad.status_code == 422

    # Explicit list mode always serves the landing.
    listed = await client.patch(
        "/api/admin/branding", headers=bearer(admin), json={"home_mode": "list"}
    )
    assert listed.status_code == 200
    root = await client.get("/api/public/site/alpha")
    assert root.json()["mode"] == "landing"

    # Direct event URLs keep working regardless of the homepage rule.
    direct = await client.get("/api/public/site/alpha/hike")
    assert direct.status_code == 200
    assert direct.json()["event"]["slug"] == "hike"

    # Landing copy is tenant-editable (title/tagline/hero) and flows through
    # to the public payload; unset fields fall back client-side.
    edited = await client.patch(
        "/api/admin/branding",
        headers=bearer(admin),
        json={"landing_title": "Alpha Adventures", "landing_tagline": "Chọn hành trình của bạn"},
    )
    assert edited.status_code == 200
    assert edited.json()["landing_title"] == "Alpha Adventures"
    root = await client.get("/api/public/site/alpha")
    b = root.json()["branding"]
    assert b["landing_title"] == "Alpha Adventures"
    assert b["landing_tagline"] == "Chọn hành trình của bạn"


# ------------------------------------------------------------------ branding + in-DB media persistence


async def test_branding_custom_domain_survives_reload(client, demo):
    # Regression: GET /branding must echo custom_domain — the branding form
    # reloads from it, and an omitted field looks like "domain lost" in the UI.
    admin = await login(client, "alpha", "admin-a")
    resp = await client.patch(
        "/api/admin/branding",
        headers=bearer(admin),
        json={"custom_domain": "walk.alpha-city.tw"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["custom_domain"] == "walk.alpha-city.tw"

    resp = await client.get("/api/admin/branding", headers=bearer(admin))
    assert resp.status_code == 200
    assert resp.json()["custom_domain"] == "walk.alpha-city.tw"


async def test_media_upload_stored_in_db_and_served(client, demo):
    # Uploads live in Postgres (hosting disk is ephemeral) — the returned URL
    # must serve the exact bytes back with the right content type.
    admin = await login(client, "alpha", "admin-a")
    png = b"\x89PNG\r\n\x1a\n" + b"fakepixels" * 20
    resp = await client.post(
        "/api/admin/media",
        headers=bearer(admin),
        files={"image": ("hero.png", png, "image/png")},
    )
    assert resp.status_code == 201, resp.text
    url = resp.json()["url"]
    assert url.startswith("/media/db/")

    resp = await client.get(url)
    assert resp.status_code == 200
    assert resp.content == png
    assert resp.headers["content-type"] == "image/png"
    assert "immutable" in resp.headers.get("cache-control", "")


# ------------------------------------------------------------------ per-tenant LIFF (white-label plan)


async def test_login_ok_when_tenant_bound_to_own_liff(client, demo):
    # White-label plan: tenant carries its own LIFF app. The auth chain (tenant
    # channel first → platform channel fallback) must not break existing logins;
    # dev tokens short-circuit before any channel check.
    boss = (
        await client.post("/api/auth/platform", json={"id_token": "dev::boss::Boss"})
    ).json()["access_token"]
    resp = await client.patch(
        f"/api/platform/tenants/{demo['tenant_a'].id}",
        headers=bearer(boss),
        json={"line_liff_id": "2010999999-AbCdEfGh"},
    )
    assert resp.status_code == 200, resp.text

    token = await login(client, "alpha", "user-liff", "Liff User")
    assert token

    # Public surfaces expose the tenant's LIFF id so CTA/QR open the right app.
    site = (await client.get("/api/public/site/alpha")).json()
    assert site["branding"]["line_liff_id"] == "2010999999-AbCdEfGh"


async def test_platform_password_login(client, demo, owner_session):
    # Zoustec console: email + password sign-in (no LINE). Wrong password and
    # unknown email share one generic 401; success mints a platform JWT.
    from app.core.security import hash_password
    from app.models import PlatformAdmin

    owner_session.add(PlatformAdmin(
        line_user_id="pw::ops@zoustec.tw", display_name="Ops",
        email="ops@zoustec.tw", password_hash=hash_password("s3cret!"),
    ))
    await owner_session.commit()

    bad = await client.post("/api/auth/platform/password",
                            json={"email": "ops@zoustec.tw", "password": "wrong"})
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "invalid_credentials"

    ok = await client.post("/api/auth/platform/password",
                           json={"email": " OPS@zoustec.tw", "password": "s3cret!"})
    assert ok.status_code == 200, ok.text
    token = ok.json()["access_token"]
    resp = await client.get("/api/platform/overview", headers=bearer(token))
    assert resp.status_code == 200, resp.text
