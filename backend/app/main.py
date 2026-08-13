"""Zoustec AR Stamp Platform — FastAPI application (Phase 1).

All business logic lives here (spec §2: Next.js is presentation only).
"""

import logging
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

import os

from fastapi.staticfiles import StaticFiles

from app.api import admin, auth, headless, me, model3d, platform_admin, public, sites
from app.core.config import get_settings
from app.core.errors import ApiError, register_error_handlers


class PublicReadCors:
    """Wildcard CORS for anonymous read-only paths only.

    Starlette's CORSMiddleware applies to the whole app, so it cannot express
    "any origin, but only for these prefixes". This adds the wildcard headers
    to the listed prefixes and leaves every other path to the credentialed
    CORSMiddleware above.

    Deliberately never emits Access-Control-Allow-Credentials. The preflight
    allows exactly one extra header, X-Site-Key — the per-tenant PUBLIC site
    identifier that generated static sites send from customer domains (it is
    an identifier, not a credential — doc §19). X-Export-Key and cookies still
    cannot travel cross-origin through this path.
    """

    def __init__(self, app: ASGIApp, path_prefixes: tuple[str, ...]) -> None:
        self.app = app
        self.path_prefixes = path_prefixes

    def _covered(self, scope: Scope) -> bool:
        path = scope.get("path", "")
        return any(path.startswith(p) for p in self.path_prefixes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not self._covered(scope):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        origin = headers.get(b"origin")

        # Preflight — answer here so the wildcard is not overwritten downstream.
        if scope["method"] == "OPTIONS" and origin is not None:
            await send(
                {
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [
                        (b"access-control-allow-origin", b"*"),
                        (b"access-control-allow-methods", b"GET, HEAD, OPTIONS"),
                        (b"access-control-allow-headers", b"X-Site-Key"),
                        (b"access-control-max-age", b"600"),
                        (b"content-length", b"0"),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": b""})
            return

        async def send_with_cors(message: Message) -> None:
            if message["type"] == "http.response.start":
                mut = MutableHeaders(scope=message)
                # Overwrite: the credentialed middleware may have echoed the
                # origin, and two values would make the response invalid.
                mut["access-control-allow-origin"] = "*"
                # "*" is incompatible with credentials, so the flag must go
                # (MutableHeaders has no pop(); __delitem__ tolerates absence).
                if "access-control-allow-credentials" in mut:
                    del mut["access-control-allow-credentials"]
                # Caches must not serve one origin's response to another. The
                # credentialed middleware may already have set this.
                vary = mut.get("vary")
                if not vary:
                    mut["vary"] = "Origin"
                elif "origin" not in vary.lower():
                    mut["vary"] = f"{vary}, Origin"
            await send(message)

        await self.app(scope, receive, send_with_cors)


def _configure_logging() -> None:
    """Structured logging (spec §4.9)."""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.run_migrations_on_start:
        # Container startup convenience; local dev runs `alembic upgrade head`.
        from app.db.migrate import run_migrations

        await run_migrations()
    if settings.seed_on_start:
        from app.db.seed import seed

        await seed()
    yield


def create_app() -> FastAPI:
    _configure_logging()
    settings = get_settings()

    app = FastAPI(
        title="Zoustec AR Stamp Platform API",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS for the frontend origin(s) — spec §5.5. Credentialed, so the origin
    # list stays an explicit allowlist (never "*").
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Public read-only CORS — any origin, for the STATIC site export.
    #
    # A statically exported customer site runs on the customer's own domain and
    # fetches its content from the browser, so the credentialed allowlist above
    # would reject it (we cannot know every customer domain in advance).
    #
    # Safe to open to "*" because these paths are anonymous reads of data that
    # is public by construction — GET /api/public/site/* returns the payload
    # documented in services/site_payload.py ("no secrets: public task fields
    # only, no QR tokens"), and /media serves the same images the public site
    # already displays. Crucially allow_credentials is FALSE here: no cookie or
    # Authorization header is ever honoured on these routes, so opening the
    # origin cannot expose an authenticated session. Keyed (X-Export-Key) and
    # authenticated endpoints are NOT covered by this middleware.
    app.add_middleware(
        PublicReadCors,
        path_prefixes=("/api/public/", "/media/"),
    )

    register_error_handlers(app)

    app.include_router(auth.router)
    app.include_router(public.router)
    app.include_router(me.router)
    app.include_router(admin.router)
    app.include_router(model3d.router)
    app.include_router(headless.router)
    app.include_router(platform_admin.router)
    # Customer static websites (published versions + pre-publish previews).
    app.include_router(sites.router)

    # In-DB media (uploads that must survive ephemeral disks). Registered
    # BEFORE the /media static mount — Starlette matches in order, so /media/db/*
    # hits this route and everything else falls through to the file mount.
    @app.get("/media/db/{asset_id}", tags=["media"])
    async def media_asset(asset_id: uuid.UUID) -> Response:
        from sqlalchemy import select

        from app.db.session import platform_admin_session
        from app.models import MediaAsset

        async with platform_admin_session() as session:
            asset = (
                await session.execute(
                    select(MediaAsset).where(MediaAsset.id == asset_id)
                )
            ).scalar_one_or_none()
            if asset is None:
                raise ApiError(404, "media_not_found", "找不到媒體檔案。")
            body, content_type = asset.data, asset.content_type
        return Response(
            content=body,
            media_type=content_type,
            # Asset ids are immutable — cache hard so the (spun-down-able)
            # backend isn't re-hit for every hero/logo render.
            headers={"cache-control": "public, max-age=31536000, immutable"},
        )

    # Media: uploaded source images + generated GLBs (AI-3D pipeline).
    os.makedirs(settings.media_dir, exist_ok=True)
    app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")

    @app.get("/healthz", tags=["ops"])
    async def healthz() -> dict:
        # version identifies which build is live (docker compose watch / redeploy)
        return {"status": "ok", "version": app.version}

    @app.get("/readyz", tags=["ops"])
    async def readyz() -> dict:
        # DB reachability check.
        from sqlalchemy import text

        from app.db.session import get_sessionmaker

        async with get_sessionmaker()() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ready"}

    return app


app = create_app()
