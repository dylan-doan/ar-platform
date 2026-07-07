"""Zoustec AR Stamp Platform — FastAPI application (Phase 1).

All business logic lives here (spec §2: Next.js is presentation only).
"""

import logging
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

import os

from fastapi.staticfiles import StaticFiles

from app.api import admin, auth, headless, me, model3d, platform_admin, public
from app.core.config import get_settings
from app.core.errors import ApiError, register_error_handlers


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

    # CORS for the frontend origin(s) — spec §5.5.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)

    app.include_router(auth.router)
    app.include_router(public.router)
    app.include_router(me.router)
    app.include_router(admin.router)
    app.include_router(model3d.router)
    app.include_router(headless.router)
    app.include_router(platform_admin.router)

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
                raise ApiError(404, "media_not_found", "Media asset not found.")
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
