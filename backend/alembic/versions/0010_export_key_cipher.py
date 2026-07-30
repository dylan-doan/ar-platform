"""Recoverable tenant API keys.

export_keys gains `key_cipher`: the AES-256-GCM encrypted plaintext (see
app/core/crypto.py) so the Zoustec console can show a customer their key again
on the tenant detail screen instead of only at creation.

`key_hash` stays and remains the authentication path — headless requests are
still authenticated by hashing the presented key and looking it up. The cipher
column is read ONLY by the platform-admin reveal endpoint.

Nullable: rows created before this migration have no recoverable plaintext, and
the reveal endpoint falls back to offering rotation.

Idempotent (IF NOT EXISTS) per project convention.
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE export_keys ADD COLUMN IF NOT EXISTS key_cipher TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE export_keys DROP COLUMN IF EXISTS key_cipher")
