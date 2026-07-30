"""Symmetric encryption for secrets that must be READ BACK (not just verified).

Most secrets in this codebase are one-way hashed (passwords, export key
lookups) because verification only ever needs a comparison. Tenant API keys are
different: the Zoustec console shows the key again on the tenant detail screen,
so the plaintext has to survive round-trip.

AES-256-GCM (AEAD) with a random 12-byte nonce per encryption. The key comes
from the SECRET_ENCRYPTION_KEY env var, so a leaked database dump/backup does
not leak customer API keys — an attacker needs the application environment too.

Wire format (single opaque string, safe for a text column):

    v1.<base64url(nonce)>.<base64url(ciphertext||tag)>

The `v1` prefix leaves room to rotate the scheme later without ambiguity.
"""

import base64
import hashlib
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings

_VERSION = "v1"
_NONCE_BYTES = 12


class SecretEncryptionError(RuntimeError):
    """Raised when a secret cannot be encrypted or decrypted."""


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _aead() -> AESGCM:
    """Derive the AES-256 key from the configured secret.

    SHA-256 stretches whatever the operator supplied to exactly 32 bytes, so any
    passphrase length works. Falls back to jwt_secret when
    SECRET_ENCRYPTION_KEY is unset — dev convenience only; production sets both
    (a rotated jwt_secret would otherwise make stored keys unreadable).
    """
    settings = get_settings()
    material = settings.secret_encryption_key or settings.jwt_secret
    if not material:
        raise SecretEncryptionError("SECRET_ENCRYPTION_KEY is not configured.")
    return AESGCM(hashlib.sha256(material.encode()).digest())


def encrypt_secret(plaintext: str) -> str:
    """Encrypt `plaintext` into the opaque `v1.<nonce>.<ct>` wire format."""
    nonce = os.urandom(_NONCE_BYTES)
    blob = _aead().encrypt(nonce, plaintext.encode(), None)
    return f"{_VERSION}.{_b64e(nonce)}.{_b64e(blob)}"


def decrypt_secret(stored: str) -> str | None:
    """Reverse of `encrypt_secret`.

    Returns None when the value cannot be decrypted — wrong/rotated encryption
    key, corrupted column, or a row written before encryption existed. Callers
    treat None as "cannot reveal, offer rotation instead" rather than an error,
    so one unreadable legacy row never breaks the console screen.
    """
    if not stored:
        return None
    try:
        version, nonce_b64, blob_b64 = stored.split(".", 2)
    except ValueError:
        return None
    if version != _VERSION:
        return None
    try:
        return _aead().decrypt(_b64d(nonce_b64), _b64d(blob_b64), None).decode()
    except (InvalidTag, ValueError, SecretEncryptionError):
        return None
