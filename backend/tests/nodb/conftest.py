"""Tests that need NO database.

The parent tests/conftest.py migrates and truncates the test DB in autouse
fixtures, so every test there requires the db-test container. Pure-unit tests
(middleware, helpers) do not, and should not be unrunnable just because Docker
is not up. Overriding the autouse fixtures here with no-ops opts this directory
out while leaving the DB-backed suite untouched.
"""

import pytest


@pytest.fixture(scope="session", autouse=True)
def _database():
    """No-op override of the parent's DB migration fixture."""
    yield


@pytest.fixture(autouse=True)
def _clean_tables():
    """No-op override of the parent's TRUNCATE fixture."""
    yield
