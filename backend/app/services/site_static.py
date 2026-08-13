"""Static customer websites: validate uploads, store immutable versions.

The model (docs/html_website_builder_deployment_platform.md):

    Frontend 產生網站版本 route captures the platform's OWN SSR output
    (/e/{tenant}/{event}) into index.html, {page}.html, css/style.css,
    js/main.js, js/site-config.js, assets/* — so the bundle looks exactly
    like the live site (one renderer, no drift) — and posts it here
        → SiteVersion(source_type="generated"), files stored verbatim
    User downloads the zip → edits ANY file freely (VS Code) → uploads it back
        → validate_site_upload (static files only, hard limits)
        → SiteVersion(source_type="user_upload"), files stored VERBATIM
    Publish / rollback = repointing events.site_version_id.

Two deliberate non-goals, straight from the doc:
- No reverse engineering (§26): an uploaded site is never parsed back into
  builder blocks. The backend only stores, validates, versions, serves.
- Data independence (§17/§23): business data is not baked into the HTML as the
  source of truth. Pages carry a snapshot for first paint, and js/main.js
  re-fetches the public site payload (X-Site-Key) at runtime and refreshes
  every [data-zs] region — user edits to HTML/CSS never touch data.
"""

import hashlib
import io
import json
import posixpath
import re
import zipfile

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models import SiteFile, SiteVersion

# ---------------------------------------------------------------- constants

# Static-only allowlist (doc §11) — anything else is rejected, loudly.
STATIC_CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".bin": "application/octet-stream",
}

MAX_SITE_ZIP = 20 * 1024 * 1024        # raw upload
MAX_SITE_FILE = 10 * 1024 * 1024       # one extracted file
MAX_SITE_TOTAL = 40 * 1024 * 1024      # sum of extracted files (zip-bomb cap)
MAX_SITE_FILES = 300                   # entry count (zip-bomb cap)

MANIFEST_PATH = ".website/manifest.json"
MANIFEST_FORMAT = "static-html"

# Junk that every OS zip tool sneaks in — skipped silently, not rejected.
_JUNK_RE = re.compile(r"(^|/)(__MACOSX/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)")


def content_type_for(path: str) -> str:
    ext = posixpath.splitext(path)[1].lower()
    return STATIC_CONTENT_TYPES.get(ext, "application/octet-stream")


def _err(message: str) -> ApiError:
    return ApiError(422, "site_invalid", message)


# ---------------------------------------------------------------- manifest

def build_manifest(*, tenant_slug: str, event_id, version_id, version_number: int) -> bytes:
    """`.website/manifest.json` — identifies the export so an upload can be
    matched to its project (doc §8: the ZIP FILENAME must never be the id)."""
    return json.dumps(
        {
            "platform": "zoustec",
            "format": MANIFEST_FORMAT,
            "export_version": 1,
            "tenant": tenant_slug,
            "project_id": str(event_id),
            "version_id": str(version_id),
            "version_number": version_number,
        },
        ensure_ascii=False,
        indent=2,
    ).encode("utf-8")


# ---------------------------------------------------------------- upload

def _normalize_path(name: str) -> str | None:
    """Zip entry name → safe relative posix path, or None to skip the entry.
    Raises on traversal — a hostile zip fails loudly, junk is skipped quietly."""
    path = name.replace("\\", "/").lstrip("/")
    if not path or path.endswith("/"):
        return None
    if _JUNK_RE.search(path):
        return None
    normalized = posixpath.normpath(path)
    if normalized.startswith("../") or normalized == ".." or normalized.startswith("/"):
        raise _err("ZIP 內含不安全的路徑（..），已拒絕。")
    return normalized


def _strip_wrapper_dir(files: dict[str, bytes]) -> dict[str, bytes]:
    """`website/index.html` → `index.html` when the whole zip sits inside one
    wrapper folder (what you get from zipping the extracted folder itself)."""
    if "index.html" in files or not files:
        return files
    first_segments = {path.split("/", 1)[0] for path in files}
    if len(first_segments) != 1:
        return files
    stripped = {path.split("/", 1)[1]: data for path, data in files.items() if "/" in path}
    return stripped if "index.html" in stripped else files


def validate_site_upload(data: bytes) -> tuple[dict[str, bytes], dict | None]:
    """Uploaded zip → ({path: bytes}, manifest|None). Enforces the doc §11
    security checklist: traversal, zip bomb (count/size/total), extension
    allowlist, static files only. Files are otherwise NOT touched — what the
    user uploads is what production serves (doc §26)."""
    if len(data) > MAX_SITE_ZIP:
        raise _err(f"ZIP 檔案過大（上限 {MAX_SITE_ZIP // (1024 * 1024)}MB）。")
    if data[:2] != b"PK":
        raise _err("請上傳 ZIP 檔（從平台下載的網站壓縮檔）。")

    files: dict[str, bytes] = {}
    total = 0
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            infos = [i for i in zf.infolist() if not i.is_dir()]
            if len(infos) > MAX_SITE_FILES:
                raise _err(f"檔案數量過多（上限 {MAX_SITE_FILES} 個）。")
            for info in infos:
                path = _normalize_path(info.filename)
                if path is None:
                    continue
                # Read with a hard cap — the declared size in the zip header
                # can lie, so never trust info.file_size alone.
                with zf.open(info) as fh:
                    content = fh.read(MAX_SITE_FILE + 1)
                if len(content) > MAX_SITE_FILE:
                    raise _err(f"檔案 {path} 過大（單檔上限 {MAX_SITE_FILE // (1024 * 1024)}MB）。")
                total += len(content)
                if total > MAX_SITE_TOTAL:
                    raise _err(f"解壓縮後總大小超過上限（{MAX_SITE_TOTAL // (1024 * 1024)}MB）。")
                files[path] = content
    except zipfile.BadZipFile:
        raise _err("ZIP 檔案無法讀取。")

    files = _strip_wrapper_dir(files)

    manifest: dict | None = None
    manifest_raw = files.pop(MANIFEST_PATH, None)
    # The .website/ folder is export metadata, never part of the served site.
    files = {p: c for p, c in files.items() if not p.startswith(".website/")}
    if manifest_raw is not None:
        try:
            parsed = json.loads(manifest_raw.decode("utf-8"))
            manifest = parsed if isinstance(parsed, dict) else None
        except (ValueError, UnicodeDecodeError):
            raise _err(".website/manifest.json 格式錯誤。")

    for path in files:
        ext = posixpath.splitext(path)[1].lower()
        if ext not in STATIC_CONTENT_TYPES:
            raise _err(
                f"不支援的檔案類型：{path} — 網站只能包含靜態檔案"
                f"（{'、'.join(sorted(STATIC_CONTENT_TYPES))}）。"
            )

    if "index.html" not in files:
        raise _err("網站缺少 index.html（首頁）。")
    return files, manifest


# ---------------------------------------------------------------- storage

def _fileset_hash(files: dict[str, bytes]) -> str:
    digest = hashlib.sha256()
    for path in sorted(files):
        digest.update(path.encode("utf-8"))
        digest.update(b"\x00")
        digest.update(files[path])
        digest.update(b"\x00")
    return digest.hexdigest()


async def create_site_version(
    session: AsyncSession,
    *,
    tenant_id,
    event_id,
    source_type: str,
    files: dict[str, bytes],
    created_by: str = "",
) -> SiteVersion:
    """Persist a file set as the next immutable version of this event's site."""
    next_number = (
        (
            await session.execute(
                select(func.coalesce(func.max(SiteVersion.version_number), 0)).where(
                    SiteVersion.event_id == event_id
                )
            )
        ).scalar_one()
        + 1
    )
    version = SiteVersion(
        tenant_id=tenant_id,
        event_id=event_id,
        version_number=next_number,
        source_type=source_type,
        source_hash=_fileset_hash(files),
        file_count=len(files),
        total_bytes=sum(len(c) for c in files.values()),
        created_by=created_by[:64],
    )
    session.add(version)
    await session.flush()
    for path, content in files.items():
        session.add(
            SiteFile(
                tenant_id=tenant_id,
                version_id=version.id,
                path=path,
                content_type=content_type_for(path),
                data=content,
                size=len(content),
            )
        )
    await session.flush()
    return version


def version_out(version: SiteVersion, current_version_id) -> dict:
    return {
        "id": str(version.id),
        "version_number": version.version_number,
        "source_type": version.source_type,
        "source_hash": version.source_hash,
        "file_count": version.file_count,
        "total_bytes": version.total_bytes,
        "created_at": version.created_at.isoformat() if version.created_at else None,
        "is_current": current_version_id == version.id,
        "preview_path": f"/sites/preview/{version.id}/",
    }
