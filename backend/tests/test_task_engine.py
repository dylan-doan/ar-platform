"""Task & stamp engine tests: QR / GPS (PostGIS) / hybrid verification,
idempotency, progress, reward unlock, audit writeback."""

from sqlalchemy import text

from tests.conftest import bearer, login

# ~25.0330,121.5654 is the checkpoint; this point is ~55 m away (inside 100 m).
NEAR = {"lat": 25.0335, "lng": 121.5654}
# ~1.1 km away (outside 100 m).
FAR = {"lat": 25.0430, "lng": 121.5654}


async def test_qr_wrong_code_rejected(client, demo):
    token = await login(client, "alpha", "alice")
    resp = await client.post(
        f"/api/me/tasks/{demo['task_qr'].id}/complete",
        headers=bearer(token),
        json={"qr_code": "wrong"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "qr_invalid"


async def test_qr_correct_code_stamps(client, demo):
    token = await login(client, "alpha", "alice")
    resp = await client.post(
        f"/api/me/tasks/{demo['task_qr'].id}/complete",
        headers=bearer(token),
        json={"qr_code": "secret-a"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["already_completed"] is False
    assert body["stamps_collected"] == 1
    assert body["reward_unlocked"] is False


async def test_gps_out_of_range_rejected_with_distance(client, demo):
    token = await login(client, "alpha", "alice")
    resp = await client.post(
        f"/api/me/tasks/{demo['task_gps'].id}/complete",
        headers=bearer(token),
        json=FAR,
    )
    assert resp.status_code == 422
    err = resp.json()["error"]
    assert err["code"] == "gps_out_of_range"
    assert err["details"]["distance_m"] > 100  # PostGIS-computed evidence


async def test_gps_in_range_stamps(client, demo):
    token = await login(client, "alpha", "alice")
    resp = await client.post(
        f"/api/me/tasks/{demo['task_gps'].id}/complete",
        headers=bearer(token),
        json=NEAR,
    )
    assert resp.status_code == 200
    assert resp.json()["stamps_collected"] == 1


async def test_gps_task_requires_position(client, demo):
    token = await login(client, "alpha", "alice")
    resp = await client.post(
        f"/api/me/tasks/{demo['task_gps'].id}/complete",
        headers=bearer(token),
        json={},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "gps_required"


async def test_hybrid_requires_both(client, demo):
    token = await login(client, "alpha", "alice")
    task_id = demo["task_hybrid"].id

    # QR only → rejected on missing GPS.
    resp = await client.post(
        f"/api/me/tasks/{task_id}/complete",
        headers=bearer(token),
        json={"qr_code": "secret-h"},
    )
    assert resp.status_code == 422

    # GPS only → rejected on missing/invalid QR.
    resp = await client.post(
        f"/api/me/tasks/{task_id}/complete", headers=bearer(token), json=NEAR
    )
    assert resp.status_code == 422

    # Both → stamped.
    resp = await client.post(
        f"/api/me/tasks/{task_id}/complete",
        headers=bearer(token),
        json={"qr_code": "secret-h", **NEAR},
    )
    assert resp.status_code == 200


async def test_completion_is_idempotent(client, demo):
    token = await login(client, "alpha", "alice")
    for expected_already in (False, True):
        resp = await client.post(
            f"/api/me/tasks/{demo['task_qr'].id}/complete",
            headers=bearer(token),
            json={"qr_code": "secret-a"},
        )
        assert resp.status_code == 200
        assert resp.json()["already_completed"] is expected_already
        assert resp.json()["stamps_collected"] == 1  # never double-counts


async def test_reward_unlocks_at_threshold_and_progress(client, demo):
    token = await login(client, "alpha", "alice")

    r1 = await client.post(
        f"/api/me/tasks/{demo['task_qr'].id}/complete",
        headers=bearer(token),
        json={"qr_code": "secret-a"},
    )
    assert r1.json()["reward_unlocked"] is False  # threshold is 2

    r2 = await client.post(
        f"/api/me/tasks/{demo['task_gps'].id}/complete",
        headers=bearer(token),
        json=NEAR,
    )
    assert r2.json()["reward_unlocked"] is True

    progress = await client.get(
        f"/api/me/events/{demo['event_a'].id}/progress", headers=bearer(token)
    )
    body = progress.json()
    assert body["stamps_collected"] == 2
    assert body["total_tasks"] == 3
    assert body["reward_unlocked"] is True
    assert len(body["completed_task_ids"]) == 2


async def test_completion_writes_audit_trail(client, demo, owner_session):
    token = await login(client, "alpha", "alice")
    await client.post(
        f"/api/me/tasks/{demo['task_qr'].id}/complete",
        headers=bearer(token),
        json={"qr_code": "secret-a"},
    )
    actions = (
        (await owner_session.execute(text("SELECT action FROM audit_logs ORDER BY created_at")))
        .scalars()
        .all()
    )
    assert "member.registered" in actions
    assert "task.completed" in actions


async def test_end_user_task_list_never_leaks_qr_secret(client, demo):
    token = await login(client, "alpha", "alice")
    resp = await client.get(
        f"/api/me/events/{demo['event_a'].id}/tasks", headers=bearer(token)
    )
    assert resp.status_code == 200
    for task in resp.json():
        assert "qr_token" not in task
