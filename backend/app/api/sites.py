"""Serving customer static websites (the platform's "Nginx" role).

The architecture doc assumes Nginx + release directories + a `current` symlink.
On this stack (Render free tier: no Nginx of our own, ephemeral disk) the same
properties come from Postgres:

    releases/v{n}/            → site_versions + site_files rows (immutable)
    current -> releases/v{n}  → events.site_version_id (atomic column update)

Routes:
    GET /sites/{tenant}/{event}/...      the PUBLISHED version (production)
    GET /sites/preview/{version_id}/...  any version, pre-publish preview —
                                         the unguessable UUID is the token

Security note — uploaded sites contain arbitrary user HTML/JS, served verbatim
by design (doc §26). Every HTML response therefore carries a sandbox CSP: the
page runs in an opaque origin with scripts enabled but no access to any other
origin's storage/cookies — so a hostile upload previewed by an admin cannot
touch admin sessions, even when /sites/ is proxied through the dashboard origin.
The public data fetch in js/main.js still works (the public API is CORS "*").
"""

import uuid

from fastapi import APIRouter
from starlette.responses import RedirectResponse, Response

from app.core.errors import ApiError
from app.db.session import platform_admin_session
from app.models import Event, SiteFile, SiteVersion, Tenant

from sqlalchemy import select

router = APIRouter(tags=["sites"])

_HTML_SANDBOX_CSP = "sandbox allow-scripts allow-forms allow-popups allow-modals"


def _not_found() -> ApiError:
    return ApiError(404, "site_not_found", "找不到網站或檔案。")


async def _serve(version_id: uuid.UUID, path: str, version_number: int | None = None) -> Response:
    if not path or path.endswith("/"):
        path = f"{path}index.html"
    async with platform_admin_session() as session:
        file = (
            await session.execute(
                select(SiteFile).where(
                    SiteFile.version_id == version_id, SiteFile.path == path
                )
            )
        ).scalar_one_or_none()
        if file is None and "." not in path.rsplit("/", 1)[-1]:
            # Extensionless URL (e.g. /about) → try the .html file.
            file = (
                await session.execute(
                    select(SiteFile).where(
                        SiteFile.version_id == version_id,
                        SiteFile.path == f"{path}.html",
                    )
                )
            ).scalar_one_or_none()
        if file is None:
            raise _not_found()
        body, content_type = file.data, file.content_type

    is_html = content_type.startswith("text/html")
    headers = {
        # HTML revalidates (publish/rollback must show up immediately);
        # css/js/assets can be briefly stale after a publish.
        "cache-control": "no-cache" if is_html else "public, max-age=300",
    }
    if version_number is not None:
        headers["x-zoustec-site-version"] = str(version_number)
    if is_html:
        headers["content-security-policy"] = _HTML_SANDBOX_CSP
    return Response(content=body, media_type=content_type, headers=headers)


# Registered before /sites/{tenant_slug}/{event_slug} — route order matters.
@router.get("/sites/preview/{version_id}")
async def preview_site_root(version_id: uuid.UUID) -> Response:
    return RedirectResponse(f"/sites/preview/{version_id}/")


@router.get("/sites/preview/{version_id}/{path:path}")
async def preview_site(version_id: uuid.UUID, path: str = "") -> Response:
    async with platform_admin_session() as session:
        version = (
            await session.execute(
                select(SiteVersion).where(SiteVersion.id == version_id)
            )
        ).scalar_one_or_none()
    if version is None:
        raise _not_found()
    return await _serve(version.id, path, version.version_number)


@router.get("/sites/{tenant_slug}/{event_slug}")
async def site_root(tenant_slug: str, event_slug: str) -> Response:
    # Relative links inside the site ("css/style.css") need the trailing slash.
    return RedirectResponse(f"/sites/{tenant_slug}/{event_slug}/")


@router.get("/sites/{tenant_slug}/{event_slug}/{path:path}")
async def site_file(tenant_slug: str, event_slug: str, path: str = "") -> Response:
    async with platform_admin_session() as session:
        row = (
            await session.execute(
                select(Event.site_version_id, SiteVersion.version_number)
                .join(Tenant, Tenant.id == Event.tenant_id)
                .join(SiteVersion, SiteVersion.id == Event.site_version_id)
                .where(
                    Tenant.slug == tenant_slug,
                    Tenant.is_active,
                    Event.slug == event_slug,
                    Event.is_active,
                )
            )
        ).one_or_none()
    if row is None or row.site_version_id is None:
        raise ApiError(404, "site_not_published", "此活動尚未發佈靜態網站。")
    return await _serve(row.site_version_id, path, row.version_number)
