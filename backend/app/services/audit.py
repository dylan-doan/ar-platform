"""Audit trail writer (spec §4.4). Call inside the same transaction as the
action being audited so the log commits atomically with it."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def record_audit(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID | None,
    actor_type: str,
    actor_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    data: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditLog(
            tenant_id=tenant_id,
            actor_type=actor_type,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            data=data or {},
        )
    )
