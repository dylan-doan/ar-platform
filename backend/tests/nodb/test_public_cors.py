"""PublicReadCors — wildcard CORS confined to anonymous read-only paths.

The statically exported customer site fetches its content from the BROWSER on
the customer's own domain, which the credentialed allowlist cannot cover. These
tests pin the security properties of that opening:

  * /api/public/* and /media/* answer any origin, WITHOUT credentials;
  * keyed (/api/headless/*) and authenticated (/api/admin/*) paths are NOT
    opened, so a hostile page cannot read them cross-origin;
  * the credentialed allowlist still works for the platform's own frontend.

No DB is needed — the middleware is exercised over stub routes.
"""

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.main import PublicReadCors

CUSTOMER = {"Origin": "https://khach-hang.com.vn"}
ALLOWLISTED = {"Origin": "http://localhost:3000"}


@pytest.fixture()
def client() -> TestClient:
    app = FastAPI()

    @app.get("/api/public/site/{tenant}")
    async def public_site(tenant: str) -> dict:
        return {"mode": "event", "tenant": tenant}

    @app.get("/media/db/{asset}")
    async def media(asset: str) -> dict:
        return {"asset": asset}

    @app.get("/api/headless/site/{tenant}")
    async def headless(tenant: str) -> dict:
        return {"tenant": tenant}

    @app.get("/api/admin/events")
    async def admin() -> dict:
        return {"events": []}

    # Same order as create_app(): credentialed allowlist first, then the
    # narrow public opening wrapping it.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(PublicReadCors, path_prefixes=("/api/public/", "/media/"))
    return TestClient(app)


@pytest.mark.parametrize("path", ["/api/public/site/bnk", "/media/db/abc"])
def test_public_paths_allow_any_origin(client: TestClient, path: str) -> None:
    res = client.get(path, headers=CUSTOMER)
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "*"


@pytest.mark.parametrize("path", ["/api/public/site/bnk", "/media/db/abc"])
def test_public_paths_never_allow_credentials(client: TestClient, path: str) -> None:
    """"*" plus credentials would let a hostile page read a logged-in session."""
    res = client.get(path, headers=CUSTOMER)
    assert "access-control-allow-credentials" not in res.headers


def test_public_path_varies_on_origin_once(client: TestClient) -> None:
    res = client.get("/api/public/site/bnk", headers=ALLOWLISTED)
    assert res.headers["vary"].lower().count("origin") == 1


def test_preflight_answered_for_public_path(client: TestClient) -> None:
    res = client.options(
        "/api/public/site/bnk",
        headers={**CUSTOMER, "Access-Control-Request-Method": "GET"},
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in res.headers


@pytest.mark.parametrize("path", ["/api/headless/site/bnk", "/api/admin/events"])
def test_keyed_and_authed_paths_not_opened(client: TestClient, path: str) -> None:
    """An unknown origin must get no ACAO at all, so the browser blocks it."""
    res = client.get(path, headers=CUSTOMER)
    assert "access-control-allow-origin" not in res.headers


def test_allowlisted_origin_keeps_credentialed_cors(client: TestClient) -> None:
    res = client.get("/api/admin/events", headers=ALLOWLISTED)
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert res.headers["access-control-allow-credentials"] == "true"
