"""Design-draft column for the JSON round-trip (download → edit → upload back).

`events.design_draft` holds an UNPUBLISHED design uploaded via
PUT /api/admin/events/{id}/design:

    {"design": {puck, pages, header, footer}, "token": "...", "updated_at": "..."}

It is deliberately a separate column, NOT a key inside `events.config`:
`config` is shipped wholesale to the public site payload
(app/services/site_payload.py), so a draft stored there would leak to every
visitor before publish. The draft only reaches a render when the preview token
is presented (?draft=<token>), and publishing moves it into `config`.

Idempotent (IF NOT EXISTS) per project convention.
"""

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS design_draft JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE events DROP COLUMN IF EXISTS design_draft")
