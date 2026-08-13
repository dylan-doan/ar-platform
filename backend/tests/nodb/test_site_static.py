"""Static website generate + upload validation (services/site_static.py).

Pure-function coverage: rendering the design into the doc §6 file layout,
asset bundling, and the doc §11 upload security checklist. DB-backed flows
(version rows, publish pointer) live in tests/test_admin_api.py territory.
"""

import io
import json
import zipfile

import pytest

from app.core.errors import ApiError
from app.services.site_static import (
    MAX_SITE_FILES,
    SiteContext,
    build_manifest,
    collect_media_refs,
    render_site,
    validate_site_upload,
)

MEDIA_ID = "0b6f2f64-1111-2222-3333-444455556666"


def _ctx(**over):
    defaults = dict(
        tenant_slug="bnk",
        event_slug="walk",
        event_name="河岸散步",
        description="沿著河岸集章",
        tenant_name="BnK",
        brand_color="#dc2626",
        reward_name="紀念禮",
        reward_threshold=3,
        tasks=["站點 A", "站點 B"],
        api_base="https://platform.example",
        site_key="zsk_test_key",
        media={f"/media/db/{MEDIA_ID}": (b"png-bytes", "image/png")},
    )
    defaults.update(over)
    return SiteContext(**defaults)


def _design():
    return {
        "puck": {
            "root": {"props": {"theme": "default", "customCss": ".hero{min-height:700px}"}},
            "content": [
                {"type": "Heading", "props": {"text": "歡迎", "level": "h2"}},
                {"type": "StatsBand", "props": {}},
                {"type": "TaskStops", "props": {"title": "任務"}},
                {"type": "Image", "props": {"url": f"/media/db/{MEDIA_ID}", "alt": "hero"}},
            ],
        },
        "pages": [
            {"slug": "about", "title": "關於", "nav": True,
             "data": {"content": [{"type": "Paragraph", "props": {"text": "介紹"}}]}},
        ],
    }


# ---------------------------------------------------------------- generate

def test_render_site_layout_matches_doc():
    files = render_site(_design(), _ctx())
    # Doc §6: index + pages + css/ + js/ + assets/, no manifest in the stored set.
    assert set(files) == {
        "index.html", "about.html", "css/style.css",
        "js/site-config.js", "js/main.js", f"assets/{MEDIA_ID}.png",
    }


def test_generated_html_is_static_and_self_contained():
    files = render_site(_design(), _ctx())
    index = files["index.html"].decode()
    assert '<link rel="stylesheet" href="css/style.css">' in index
    assert '<script src="js/main.js" defer>' in index
    # Media reference is rewritten to the bundled relative asset.
    assert f'src="assets/{MEDIA_ID}.png"' in index
    assert "/media/db/" not in index
    # Live data is baked for first paint AND tagged for the runtime refresh.
    assert 'data-zs="stat-tasks">2<' in index
    assert 'data-zs="tasks"' in index
    # Sub-page carries the nav link back home.
    about = files["about.html"].decode()
    assert 'href="index.html"' in about


def test_site_config_carries_public_identity_only():
    files = render_site(_design(), _ctx())
    cfg_js = files["js/site-config.js"].decode()
    assert '"apiBase": "https://platform.example"' in cfg_js
    assert '"tenant": "bnk"' in cfg_js
    assert '"siteKey": "zsk_test_key"' in cfg_js
    css = files["css/style.css"].decode()
    assert "--brand: #dc2626" in css
    assert ".hero{min-height:700px}" in css  # designer custom CSS appended


def test_collect_media_refs_walks_nested_design():
    refs = collect_media_refs(_design(), hero_image=f"/media/db/{MEDIA_ID}")
    assert refs == [f"/media/db/{MEDIA_ID}"]


def test_manifest_identifies_project():
    manifest = json.loads(build_manifest(
        tenant_slug="bnk", event_id="e-1", version_id="v-1", version_number=3,
    ))
    assert manifest["platform"] == "zoustec"
    assert manifest["format"] == "static-html"
    assert manifest["project_id"] == "e-1"
    assert manifest["version_id"] == "v-1"


# ---------------------------------------------------------------- upload

def _zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


def test_upload_roundtrip_is_verbatim():
    payload = {
        "index.html": b"<h1>totally rewritten by the user</h1><script>hi()</script>",
        "css/style.css": b".product-list{display:grid}",
        "js/main.js": b"fetch('/api')",
        "assets/logo.png": b"\x89PNG fake",
        ".website/manifest.json": json.dumps({"project_id": "e-1"}).encode(),
    }
    files, manifest = validate_site_upload(_zip(payload))
    # Doc §26: stored VERBATIM — scripts included, nothing sanitized/parsed.
    assert files["index.html"] == payload["index.html"]
    assert files["js/main.js"] == payload["js/main.js"]
    assert manifest == {"project_id": "e-1"}
    assert ".website/manifest.json" not in files


def test_upload_strips_single_wrapper_dir_and_junk():
    files, _ = validate_site_upload(_zip({
        "website/index.html": b"<h1>hi</h1>",
        "website/css/style.css": b"body{}",
        "__MACOSX/website/index.html": b"junk",
        "website/.DS_Store": b"junk",
    }))
    assert set(files) == {"index.html", "css/style.css"}


def test_upload_rejects_path_traversal():
    with pytest.raises(ApiError) as e:
        validate_site_upload(_zip({"../evil.html": b"x", "index.html": b"x"}))
    assert e.value.status_code == 422


def test_upload_rejects_non_static_extensions():
    for name in ("shell.php", "run.sh", "app.exe"):
        with pytest.raises(ApiError):
            validate_site_upload(_zip({"index.html": b"x", name: b"x"}))


def test_upload_requires_index_html():
    with pytest.raises(ApiError) as e:
        validate_site_upload(_zip({"about.html": b"x"}))
    assert "index.html" in e.value.message


def test_upload_rejects_non_zip_and_bad_manifest():
    with pytest.raises(ApiError):
        validate_site_upload(b"<html>not a zip</html>")
    with pytest.raises(ApiError):
        validate_site_upload(_zip({
            "index.html": b"x", ".website/manifest.json": b"{not json",
        }))


def test_upload_rejects_too_many_files():
    entries = {f"a{i}.txt": b"x" for i in range(MAX_SITE_FILES + 1)}
    entries["index.html"] = b"x"
    with pytest.raises(ApiError) as e:
        validate_site_upload(_zip(entries))
    assert "檔案數量" in e.value.message


def test_upload_reads_actual_bytes_not_declared_size():
    inner = b"A" * (1024 * 1024)
    files, _ = validate_site_upload(_zip({"index.html": inner}))
    assert len(files["index.html"]) == len(inner)
