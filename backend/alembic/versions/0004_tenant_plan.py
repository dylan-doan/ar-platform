"""Tenant service plan + MRR — powers the platform console (UI screen 05).

plan:    saas | white_label | one_time  (business model, spec §XI)
mrr_ntd: monthly recurring revenue in NT$ (manually managed in v1 — no
         billing engine; platform admin edits it via PATCH /tenants/{id})

Idempotent (IF NOT EXISTS) per project convention from 0002 onward.
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(32) NOT NULL DEFAULT 'saas'"
    )
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS mrr_ntd INTEGER")


def downgrade() -> None:
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS mrr_ntd")
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS plan")
