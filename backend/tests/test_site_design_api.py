"""Design JSON round-trip API tests: upload draft → tokenized preview →
publish, plus the server-side gates (block whitelist on PATCH too, media
ownership under RLS)."""

import pytest

from app.models import MediaAsset
from tests.conftest import bearer, login


def _design(**root_props):
    return {
        "zoustec_design": 1,
        "puck": {
            "root": {"props": {"theme": "dark", "title": "HACKED-TITLE", **root_props}},
            "content": [
                {"type": "Banner", "props": {"title": "新橫幅"}},
                {"type": "StatsBand", "props": {}},
            ],
            "zones": {},
        },
        "pages": [
            {"slug": "guide", "title": "指南", "nav": True,
             "data": {"content": [{"type": "Paragraph", "props": {"text": "hi"}}]}},
        ],
        "header": {"content": [{"type": "SiteHeader", "props": {}}]},
        "footer": None,
    }


@pytest.mark.asyncio
async def test_design_draft_preview_publish_loop(client, demo):
    token = await login(client, "alpha", "admin-a")
    event = demo["event_a"]

    # Upload: lands as a draft, answers with a tokenized preview path.
    up = await client.put(
        f"/api/admin/events/{event.id}/design", headers=bearer(token), json=_design()
    )
    assert up.status_code == 200, up.text
    body = up.json()
    preview_token = body["preview_token"]
    assert body["preview_path"] == f"/e/alpha/walk?draft={preview_token}"

    # The LIVE site is untouched by the upload.
    live = (await client.get("/api/public/site/alpha/walk")).json()
    assert "puck" not in (live["event"]["config"] or {})

    # The preview token swaps in the draft — with event-owned props re-injected
    # from the event record, not taken from the upload.
    prev = (await client.get(f"/api/public/site/alpha/walk?draft={preview_token}")).json()
    cfg = prev["event"]["config"]
    assert cfg["puck"]["content"][0]["props"]["title"] == "新橫幅"
    assert cfg["puck"]["root"]["props"]["title"] == "Alpha Walk"  # not HACKED-TITLE
    assert cfg["pages"][0]["slug"] == "guide"

    # A wrong token is a hard 404, never a silent fallback to the live design.
    bad = await client.get("/api/public/site/alpha/walk?draft=wrong-token")
    assert bad.status_code == 404
    assert bad.json()["error"]["code"] == "draft_not_found"

    # GET design reports the pending draft.
    got = (await client.get(f"/api/admin/events/{event.id}/design", headers=bearer(token))).json()
    assert got["draft"]["preview_path"].endswith(preview_token)

    # Publish: the draft becomes the live config and is cleared.
    pub = await client.post(
        f"/api/admin/events/{event.id}/design/publish", headers=bearer(token)
    )
    assert pub.status_code == 200
    live2 = (await client.get("/api/public/site/alpha/walk")).json()
    cfg2 = live2["event"]["config"]
    assert cfg2["puck"]["content"][0]["props"]["title"] == "新橫幅"
    assert cfg2["puckVersion"] == 2
    again = await client.post(
        f"/api/admin/events/{event.id}/design/publish", headers=bearer(token)
    )
    assert again.status_code == 409  # nothing left to publish

    # The old preview token dies with the draft.
    stale = await client.get(f"/api/public/site/alpha/walk?draft={preview_token}")
    assert stale.status_code == 404


@pytest.mark.asyncio
async def test_design_upload_rejects_unknown_block_and_wrong_media(
    client, demo, owner_session
):
    token = await login(client, "alpha", "admin-a")
    event = demo["event_a"]

    evil = _design()
    evil["puck"]["content"].append({"type": "RawHtml", "props": {}})
    resp = await client.put(
        f"/api/admin/events/{event.id}/design", headers=bearer(token), json=evil
    )
    assert resp.status_code == 422
    assert "RawHtml" in resp.json()["error"]["message"]

    # Media owned by tenant B is invisible to tenant A's session (RLS) → 422.
    other = MediaAsset(
        tenant_id=demo["tenant_b"].id, content_type="image/png", data=b"x"
    )
    owner_session.add(other)
    await owner_session.commit()
    stolen = _design()
    stolen["puck"]["content"][0]["props"]["image"] = f"/media/db/{other.id}"
    resp = await client.put(
        f"/api/admin/events/{event.id}/design", headers=bearer(token), json=stolen
    )
    assert resp.status_code == 422
    assert str(other.id) in resp.json()["error"]["message"]

    # Media owned by tenant A passes.
    mine = MediaAsset(
        tenant_id=demo["tenant_a"].id, content_type="image/png", data=b"x"
    )
    owner_session.add(mine)
    await owner_session.commit()
    ok = _design()
    ok["puck"]["content"][0]["props"]["image"] = f"/media/db/{mine.id}"
    resp = await client.put(
        f"/api/admin/events/{event.id}/design", headers=bearer(token), json=ok
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_event_patch_config_holds_same_block_whitelist(client, demo):
    token = await login(client, "alpha", "admin-a")
    event = demo["event_a"]

    resp = await client.patch(
        f"/api/admin/events/{event.id}",
        headers=bearer(token),
        json={"config": {"puck": {"root": {}, "content": [{"type": "Evil"}]}}},
    )
    assert resp.status_code == 422

    # A config without a puck doc (legacy shape) is untouched by the gate.
    resp = await client.patch(
        f"/api/admin/events/{event.id}",
        headers=bearer(token),
        json={"config": {"heroImage": "/media/x.png"}},
    )
    assert resp.status_code == 200


# The old HTML→design round-trip (download .html, parse back into blocks) was
# replaced by the static-website version flow — tests/test_site_versions_api.py.


@pytest.mark.asyncio
async def test_design_draft_discard(client, demo):
    token = await login(client, "alpha", "admin-a")
    event = demo["event_a"]
    up = await client.put(
        f"/api/admin/events/{event.id}/design", headers=bearer(token), json=_design()
    )
    preview_token = up.json()["preview_token"]
    resp = await client.delete(
        f"/api/admin/events/{event.id}/design", headers=bearer(token)
    )
    assert resp.status_code == 204
    gone = await client.get(f"/api/public/site/alpha/walk?draft={preview_token}")
    assert gone.status_code == 404
