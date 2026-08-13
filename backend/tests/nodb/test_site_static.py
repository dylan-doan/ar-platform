"""Static website upload validation + manifest (services/site_static.py).

Pure-function coverage of the doc §11 security checklist. Rendering is NOT
tested here — generation captures the frontend's own SSR (one renderer, no
backend HTML generator to test). DB-backed flows live in
tests/test_site_versions_api.py.
"""

import io
import json
import zipfile

import pytest

from app.core.errors import ApiError
from app.services.site_static import (
    MAX_SITE_FILES,
    build_manifest,
    validate_site_upload,
)


def _zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


def test_manifest_identifies_project():
    manifest = json.loads(build_manifest(
        tenant_slug="bnk", event_id="e-1", version_id="v-1", version_number=3,
    ))
    assert manifest["platform"] == "zoustec"
    assert manifest["format"] == "static-html"
    assert manifest["project_id"] == "e-1"
    assert manifest["version_id"] == "v-1"


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
