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

    # Source image is stored in-DB (doubles as the printed AR target — must
    # survive the ephemeral container disk) and served back at /media/db/*.
    src_url = job["params"]["sourceImageUrl"]
    assert src_url.startswith("/media/db/")
    served = await client.get(src_url)
    assert served.status_code == 200
    assert served.content == TINY_PNG

    # Background task: submit + poll (mock succeeds after 2 polls ≈ 6 s).
    for _ in range(30):
        await asyncio.sleep(0.5)
        job = (
            await client.get(f"/api/admin/model3d/jobs/{job['id']}", headers=bearer(token))
        ).json()
        if job["status"] in ("succeeded", "failed"):
            break
    assert job["status"] == "succeeded", job
    # Mock serves the bundled GLB with a per-job query suffix (see provider).
    assert job["result_glb_url"].startswith("/models/mascot.glb?m=")

    # Adjustments (spec: color/scale) round-trip into params.
    adjusted = await client.patch(
        f"/api/admin/model3d/jobs/{job['id']}",
        headers=bearer(token),
        json={"scale": 0.8, "color_tint": "#ff8800", "y_offset": 0.1},
    )
    assert adjusted.status_code == 200
    params = adjusted.json()["params"]
    assert params["scale"] == 0.8
    assert params["colorTint"] == "#ff8800"
    assert params["yOffset"] == 0.1
    assert params["sourceImageUrl"] == src_url  # adjustments never drop it

    # Deleting the job cleans up its in-DB media too.
    deleted = await client.delete(
        f"/api/admin/model3d/jobs/{job['id']}", headers=bearer(token)
    )
    assert deleted.status_code == 204
    assert (await client.get(src_url)).status_code == 404


async def test_model3d_animate_flow(client, demo, monkeypatch):
    # Rigging seam: the mock engine refuses explicitly; a rigging-capable
    # engine produces walk/run variants persisted in-DB, switchable per job.
    from app.providers import model3d as providers
    from app.services import model3d as m3d_service

    token = await login(client, "alpha", "admin-a")
    created = await client.post(
        "/api/admin/model3d/jobs?name=Rig Me", headers=bearer(token), files=png_upload(),
    )
    job = created.json()
    for _ in range(30):
        await asyncio.sleep(0.5)
        job = (
            await client.get(f"/api/admin/model3d/jobs/{job['id']}", headers=bearer(token))
        ).json()
        if job["status"] in ("succeeded", "failed"):
            break
    assert job["status"] == "succeeded"
    static_url = job["result_glb_url"]

    # Default (mock) engine → explicit unsupported error.
    r = await client.post(f"/api/admin/model3d/jobs/{job['id']}/animate", headers=bearer(token))
    assert r.status_code == 422 and r.json()["error"]["code"] == "rigging_unsupported"

    # Swap in a rigging-capable fake engine and stub the GLB download.
    class FakeRigProvider(providers.MockModel3DProvider):
        supports_rigging = True

        async def submit_rigging(self, input_task_id):
            return providers.SubmitResult(provider_job_id=f"rig-{input_task_id}")

        async def poll_rigging(self, rig_task_id):
            return providers.RigPollResult(
                status="succeeded",
                walk_glb_url="https://engine.example/walk.glb",
                run_glb_url="https://engine.example/run.glb",
            )

    monkeypatch.setattr(providers, "_provider", FakeRigProvider())

    async def fake_download(url):
        return b"GLB-" + url.encode()

    monkeypatch.setattr(m3d_service, "_download_bytes", fake_download)

    r = await client.post(f"/api/admin/model3d/jobs/{job['id']}/animate", headers=bearer(token))
    assert r.status_code == 200, r.text
    assert r.json()["params"]["rig"]["status"] == "processing"

    for _ in range(30):
        await asyncio.sleep(0.5)
        job = (
            await client.get(f"/api/admin/model3d/jobs/{job['id']}", headers=bearer(token))
        ).json()
        if (job["params"].get("rig") or {}).get("status") in ("succeeded", "failed"):
            break
    assert job["params"]["rig"]["status"] == "succeeded", job
    variants = job["params"]["variants"]
    assert set(variants) == {"static", "walk", "run"}
    assert variants["static"] == static_url

    # Animated GLBs live in DB media and are served back.
    walk = await client.get(variants["walk"])
    assert walk.status_code == 200
    assert walk.content == b"GLB-https://engine.example/walk.glb"

    # Switching variants swaps the served GLB; static restores the original.
    r = await client.patch(f"/api/admin/model3d/jobs/{job['id']}", headers=bearer(token),
                           json={"variant": "walk"})
    assert r.status_code == 200
    assert r.json()["result_glb_url"] == variants["walk"]
    assert r.json()["params"]["activeVariant"] == "walk"
    r = await client.patch(f"/api/admin/model3d/jobs/{job['id']}", headers=bearer(token),
                           json={"variant": "static"})
    assert r.json()["result_glb_url"] == static_url


async def test_model3d_retexture_flow_and_remote_glb_persistence(client, demo, monkeypatch):
    # (1) Remote engine GLBs must be persisted in-DB (ephemeral disk!), and
    # (2) per-model retexture: prompt → new GLB served, stale rig dropped.
    from app.providers import model3d as providers
    from app.services import model3d as m3d_service

    token = await login(client, "alpha", "admin-a")
    created = await client.post(
        "/api/admin/model3d/jobs?name=Restyle Me", headers=bearer(token), files=png_upload(),
    )
    job = created.json()
    for _ in range(30):
        await asyncio.sleep(0.5)
        job = (
            await client.get(f"/api/admin/model3d/jobs/{job['id']}", headers=bearer(token))
        ).json()
        if job["status"] in ("succeeded", "failed"):
            break
    assert job["status"] == "succeeded"

    # Default (mock) engine → explicit unsupported error.
    r = await client.post(f"/api/admin/model3d/jobs/{job['id']}/retexture",
                          headers=bearer(token), json={"prompt": "furry plush style"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "retexture_unsupported"

    class FakeEngine(providers.MockModel3DProvider):
        supports_retexture = True

        async def poll(self, provider_job_id):
            # Remote URL — exercises the download-to-DB path of generation.
            return providers.PollResult(
                status="succeeded", glb_url="https://engine.example/gen.glb"
            )

        async def submit_retexture(self, input_task_id, prompt):
            assert prompt == "furry plush style"
            return providers.SubmitResult(provider_job_id=f"rtx-{input_task_id}")

        async def poll_retexture(self, retexture_task_id):
            return providers.PollResult(
                status="succeeded", glb_url="https://engine.example/retex.glb"
            )

    monkeypatch.setattr(providers, "_provider", FakeEngine())

    async def fake_download(url):
        return b"GLB-" + url.encode()

    monkeypatch.setattr(m3d_service, "_download_bytes", fake_download)

    # (1) New generation with a remote URL lands in /media/db/*.
    created = await client.post(
        "/api/admin/model3d/jobs?name=Remote GLB", headers=bearer(token), files=png_upload(),
    )
    gen = created.json()
    for _ in range(30):
        await asyncio.sleep(0.5)
        gen = (
            await client.get(f"/api/admin/model3d/jobs/{gen['id']}", headers=bearer(token))
        ).json()
        if gen["status"] in ("succeeded", "failed"):
            break
    assert gen["status"] == "succeeded", gen
    assert gen["result_glb_url"].startswith("/media/db/")
    served = await client.get(gen["result_glb_url"])
    assert served.status_code == 200
    assert served.content == b"GLB-https://engine.example/gen.glb"

    # (2) Retexture: pretend a stale rig exists to verify it gets dropped.
    r = await client.post(f"/api/admin/model3d/jobs/{gen['id']}/retexture",
                          headers=bearer(token), json={"prompt": "furry plush style"})
    assert r.status_code == 200, r.text
    assert r.json()["params"]["retexture"]["status"] == "processing"

    for _ in range(30):
        await asyncio.sleep(0.5)
        gen = (
            await client.get(f"/api/admin/model3d/jobs/{gen['id']}", headers=bearer(token))
        ).json()
        if (gen["params"].get("retexture") or {}).get("status") in ("succeeded", "failed"):
            break
    assert gen["params"]["retexture"]["status"] == "succeeded", gen
    assert gen["params"]["prompt"] == "furry plush style"
    assert "variants" not in gen["params"] and "rig" not in gen["params"]
    served = await client.get(gen["result_glb_url"])
    assert served.content == b"GLB-https://engine.example/retex.glb"


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
