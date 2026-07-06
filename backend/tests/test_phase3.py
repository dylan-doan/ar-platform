"""Phase 3 tests: AI-3D pipeline (mock provider), export keys + headless
endpoint, and the isolation/RBAC boundaries of both."""

import asyncio
import io

from tests.conftest import bearer, login

# 1x1 transparent PNG.
TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000"
    "01f15c4890000000d49444154789c626001000000ffff030000060005"
    "57bfabd40000000049454e44ae426082"
)


def png_upload(name: str = "mascot.png"):
    return {"image": (name, io.BytesIO(TINY_PNG), "image/png")}


# ------------------------------------------------------------------ AI-3D

async def test_model3d_full_flow_with_mock_provider(client, demo):
    token = await login(client, "alpha", "admin-a")

    created = await client.post(
        "/api/admin/model3d/jobs?name=Demo Mascot",
        headers=bearer(token),
        files=png_upload(),
    )
    assert created.status_code == 201, created.text
    job = created.json()
    assert job["status"] == "pending"
    assert job["provider"] == "mock"

    # Background task: submit + poll (mock succeeds after 2 polls ≈ 6 s).
    for _ in range(30):
        await asyncio.sleep(0.5)
        job = (
            await client.get(f"/api/admin/model3d/jobs/{job['id']}", headers=bearer(token))
        ).json()
        if job["status"] in ("succeeded", "failed"):
            break
    assert job["status"] == "succeeded", job
    assert job["result_glb_url"] == "/models/mascot.glb"

    # Adjustments (spec: color/scale) round-trip into params.
    adjusted = await client.patch(
        f"/api/admin/model3d/jobs/{job['id']}",
        headers=bearer(token),
        json={"scale": 0.8, "color_tint": "#ff8800", "y_offset": 0.1},
    )
    assert adjusted.status_code == 200
    params = adjusted.json()["params"]
    assert params == {"scale": 0.8, "colorTint": "#ff8800", "yOffset": 0.1}


async def test_model3d_rejects_bad_uploads(client, demo):
    token = await login(client, "alpha", "admin-a")

    bad_type = await client.post(
        "/api/admin/model3d/jobs",
        headers=bearer(token),
        files={"image": ("x.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert bad_type.status_code == 422

    empty = await client.post(
        "/api/admin/model3d/jobs",
        headers=bearer(token),
        files={"image": ("x.png", io.BytesIO(b""), "image/png")},
    )
    assert empty.status_code == 422


async def test_model3d_requires_admin_and_is_tenant_isolated(client, demo):
    member = await login(client, "alpha", "alice")
    assert (
        await client.post("/api/admin/model3d/jobs", headers=bearer(member), files=png_upload())
    ).status_code == 403

    admin_a = await login(client, "alpha", "admin-a")
    created = await client.post(
        "/api/admin/model3d/jobs", headers=bearer(admin_a), files=png_upload()
    )
    job_id = created.json()["id"]

    admin_b = await login(client, "beta", "admin-b")
    assert (
        await client.get(f"/api/admin/model3d/jobs/{job_id}", headers=bearer(admin_b))
    ).status_code == 404
    assert (
        await client.get("/api/admin/model3d/jobs", headers=bearer(admin_b))
    ).json() == []


# ------------------------------------------------------------------ headless export

async def test_export_bundle_and_headless_read(client, demo):
    token = await login(client, "alpha", "admin-a")
    event_id = str(demo["event_a"].id)

    bundle = await client.post(
        f"/api/admin/events/{event_id}/export-bundle", headers=bearer(token)
    )
    assert bundle.status_code == 200
    assert bundle.headers["content-type"] == "application/zip"

    # Extract the key from the zip's config.js.
    import json
    import re
    import zipfile

    zf = zipfile.ZipFile(io.BytesIO(bundle.content))
    assert set(zf.namelist()) == {"index.html", "config.js", "README.md"}
    config = json.loads(re.search(r"= (\{.*\});", zf.read("config.js").decode(), re.S).group(1))
    assert config["EVENT_ID"] == event_id
    assert config["TENANT_SLUG"] == "alpha"
    export_key = config["EXPORT_KEY"]
    assert export_key.startswith("zsk_")

    # Headless read with the key — no user auth needed.
    data = await client.get(
        f"/api/headless/events/{event_id}", headers={"X-Export-Key": export_key}
    )
    assert data.status_code == 200
    body = data.json()
    assert body["event"]["slug"] == "walk"
    assert len(body["tasks"]) == 3
    assert body["branding"]["tenant_slug"] == "alpha"
    # No secrets leak.
    for task in body["tasks"]:
        assert "qr_token" not in task


async def test_headless_key_is_event_scoped_and_revocable(client, demo):
    token = await login(client, "alpha", "admin-a")
    event_id = str(demo["event_a"].id)

    bundle = await client.post(
        f"/api/admin/events/{event_id}/export-bundle", headers=bearer(token)
    )
    import io as _io
    import json
    import re
    import zipfile

    config = json.loads(
        re.search(
            r"= (\{.*\});",
            zipfile.ZipFile(_io.BytesIO(bundle.content)).read("config.js").decode(),
            re.S,
        ).group(1)
    )
    export_key = config["EXPORT_KEY"]

    # Wrong event (even same tenant) → 403.
    other_event = str(demo["event_b"].id)
    assert (
        await client.get(
            f"/api/headless/events/{other_event}", headers={"X-Export-Key": export_key}
        )
    ).status_code == 403

    # Garbage key → 401; missing header → 401.
    assert (
        await client.get(
            f"/api/headless/events/{event_id}", headers={"X-Export-Key": "zsk_nope"}
        )
    ).status_code == 401
    assert (await client.get(f"/api/headless/events/{event_id}")).status_code == 401

    # Revoke → key stops working.
    keys = (
        await client.get(f"/api/admin/events/{event_id}/export-keys", headers=bearer(token))
    ).json()
    assert len(keys) == 1
    revoked = await client.post(
        f"/api/admin/export-keys/{keys[0]['id']}/revoke", headers=bearer(token)
    )
    assert revoked.status_code == 200
    assert revoked.json()["revoked_at"] is not None
    assert (
        await client.get(
            f"/api/headless/events/{event_id}", headers={"X-Export-Key": export_key}
        )
    ).status_code == 401


async def test_export_keys_are_tenant_isolated(client, demo):
    admin_a = await login(client, "alpha", "admin-a")
    event_a = str(demo["event_a"].id)
    await client.post(f"/api/admin/events/{event_a}/export-bundle", headers=bearer(admin_a))

    admin_b = await login(client, "beta", "admin-b")
    # Admin B cannot list or create keys on tenant A's event.
    assert (
        await client.get(f"/api/admin/events/{event_a}/export-keys", headers=bearer(admin_b))
    ).status_code == 404
    assert (
        await client.post(f"/api/admin/events/{event_a}/export-bundle", headers=bearer(admin_b))
    ).status_code == 404

    keys_a = (
        await client.get(f"/api/admin/events/{event_a}/export-keys", headers=bearer(admin_a))
    ).json()
    admin_b_revoke = await client.post(
        f"/api/admin/export-keys/{keys_a[0]['id']}/revoke", headers=bearer(admin_b)
    )
    assert admin_b_revoke.status_code == 404
