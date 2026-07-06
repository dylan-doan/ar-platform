"""Programmatic `alembic upgrade head` (container startup convenience)."""

import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


def _upgrade_sync() -> None:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")


async def run_migrations() -> None:
    # Alembic drives its own (async) event loop internally via env.py; run it
    # in a thread so we don't nest loops.
    await asyncio.to_thread(_upgrade_sync)
