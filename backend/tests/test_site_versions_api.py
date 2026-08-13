"""Static-website version lifecycle: generate → preview → publish → serve,
upload verbatim → new version, rollback = publishing an older version.
(docs/html_website_builder_deployment_platform.md)"""

import io
import json
import zipfile

import pytest

from tests.conftest import bearer, login


def _zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


GENERATED_SITE = {
    "index.html": b'<html><head><link rel="stylesheet" href="css/style.css">'
                  b'<script src="js/site-config.js" defer></script></head>'
                  b"<body><h1>Alpha Walk</h1></body></html>",
    "css/style.css": b"body{margin:0}",
    "js/site-config.js": b'window.ZOUSTEC_SITE = {"tenant": "alpha"};',
    "js/main.js": b"/* runtime */",
}


async def _generate(client, token, event_id):
    """The frontend's 產生網站版本 route renders the site (from the platform's
    own SSR) and posts the bundle here — simulated with a canned file set."""
    res = await client.post(
        f"/api/admin/events/{event_id}/site/upload?source_type=generated",
        headers=bearer(token),
        files={"file": ("website.zip", _zip(GENERATED_SITE), "application/zip")},
    )
    assert res.status_code == 200, res.text
    return res.json()


@pytest.mark.asyncio
async def test_generate_preview_publish_serve(client, demo):
    token = await login(client, "alpha", "admin-a")
    event = demo["event_a"]

    v1 = await _generate(client, token, event.id)
    assert v1["version_number"] == 1
    assert v1["source_type"] == "generated"
    assert v1["is_current"] is False  # generating never touches production

    # Not published yet → production 404, but the preview URL serves v1.
    live = await client.get("/sites/alpha/walk/")
    assert live.status_code == 404
    assert live.json()["error"]["code"] == "site_not_published"
    prev = await client.get(v1["preview_path"])
    assert prev.status_code == 200
    assert prev.headers["content-type"].startswith("text/html")
    # Untrusted-content isolation: HTML is sandboxed at the serving layer.
    assert "sandbox" in prev.headers["content-security-policy"]

    # Publish → production serves, with css/js/assets resolvable.
    pub = await client.post(
        f"/api/admin/events/{event.id}/site/versions/{v1['id']}/publish",
        headers=bearer(token),
    )
    assert pub.status_code == 200
    assert pub.json()["site_path"] == "/sites/alpha/walk/"
    page = await client.get("/sites/alpha/walk/")
    assert page.status_code == 200
    assert 'href="css/style.css"' in page.text
    css = await client.get("/sites/alpha/walk/css/style.css")
    assert css.status_code == 200
    assert css.headers["content-type"].startswith("text/css")
    js = await client.get("/sites/alpha/walk/js/site-config.js")
    assert '"tenant": "alpha"' in js.text


@pytest.mark.asyncio
async def test_upload_new_version_and_rollback(client, demo):
    token = await login(client, "alpha", "admin-a")
    event = demo["event_a"]

    v1 = await _generate(client, token, event.id)
    await client.post(
        f"/api/admin/events/{event.id}/site/versions/{v1['id']}/publish",
        headers=bearer(token),
    )

    # Download carries the manifest that identifies the project on re-upload.
    dl = await client.get(
        f"/api/admin/events/{event.id}/site/versions/{v1['id']}/download",
        headers=bearer(token),
    )
    assert dl.status_code == 200
    with zipfile.ZipFile(io.BytesIO(dl.content)) as zf:
        manifest = json.loads(zf.read(".website/manifest.json"))
        assert manifest["project_id"] == str(event.id)
        assert "index.html" in zf.namelist()

    # User edits freely (own JS included) and uploads → v2, stored VERBATIM.
    edited = _zip({
        "index.html": b"<h1>Custom rewrite</h1><script src=\"js/main.js\"></script>",
        "js/main.js": b"console.log('user code')",
        ".website/manifest.json": json.dumps(manifest).encode(),
    })
    up = await client.post(
        f"/api/admin/events/{event.id}/site/upload",
        headers=bearer(token),
        files={"file": ("site.zip", edited, "application/zip")},
    )
    assert up.status_code == 200, up.text
    v2 = up.json()
    assert v2["version_number"] == 2
    assert v2["source_type"] == "user_upload"

    # Production still serves v1 until v2 is published.
    assert "Custom rewrite" not in (await client.get("/sites/alpha/walk/")).text
    await client.post(
        f"/api/admin/events/{event.id}/site/versions/{v2['id']}/publish",
        headers=bearer(token),
    )
    page = await client.get("/sites/alpha/walk/")
    assert "Custom rewrite" in page.text
    assert (await client.get("/sites/alpha/walk/js/main.js")).text == "console.log('user code')"

    # Rollback = publish v1 again; nothing is rebuilt.
    await client.post(
        f"/api/admin/events/{event.id}/site/versions/{v1['id']}/publish",
        headers=bearer(token),
    )
    assert "Custom rewrite" not in (await client.get("/sites/alpha/walk/")).text

    # The live version cannot be deleted; v2 (now offline) can.
    in_use = await client.delete(
        f"/api/admin/events/{event.id}/site/versions/{v1['id']}", headers=bearer(token)
    )
    assert in_use.status_code == 409
    gone = await client.delete(
        f"/api/admin/events/{event.id}/site/versions/{v2['id']}", headers=bearer(token)
    )
    assert gone.status_code == 204


@pytest.mark.asyncio
async def test_upload_rejects_foreign_manifest_and_bad_files(client, demo):
    token = await login(client, "alpha", "admin-a")
    event = demo["event_a"]

    wrong = _zip({
        "index.html": b"x",
        ".website/manifest.json": json.dumps({"project_id": "00000000-0000-0000-0000-000000000000"}).encode(),
    })
    res = await client.post(
        f"/api/admin/events/{event.id}/site/upload",
        headers=bearer(token),
        files={"file": ("site.zip", wrong, "application/zip")},
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "site_wrong_project"

    res = await client.post(
        f"/api/admin/events/{event.id}/site/upload",
        headers=bearer(token),
        files={"file": ("site.zip", _zip({"index.html": b"x", "run.php": b"x"}), "application/zip")},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_site_versions_are_tenant_scoped(client, demo):
    token_a = await login(client, "alpha", "admin-a")
    token_b = await login(client, "beta", "admin-b")
    event = demo["event_a"]

    v1 = await _generate(client, token_a, event.id)
    # Tenant B cannot see or publish tenant A's versions (RLS + ownership).
    res = await client.get(
        f"/api/admin/events/{event.id}/site/versions", headers=bearer(token_b)
    )
    assert res.status_code == 404
    res = await client.post(
        f"/api/admin/events/{event.id}/site/versions/{v1['id']}/publish",
        headers=bearer(token_b),
    )
    assert res.status_code == 404
