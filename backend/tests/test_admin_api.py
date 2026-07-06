"""Tenant-admin API tests: event/task CRUD, stats, export, audit."""

from sqlalchemy import text

from tests.conftest import bearer, login


async def test_event_crud_and_audit(client, demo, owner_session):
    token = await login(client, "alpha", "admin-a")

    created = await client.post(
        "/api/admin/events",
        headers=bearer(token),
        json={"slug": "new-event", "name": "New Event", "event_type": "hiking", "reward_threshold": 2},
    )
    assert created.status_code == 201
    event_id = created.json()["id"]

    updated = await client.patch(
        f"/api/admin/events/{event_id}", headers=bearer(token), json={"name": "Renamed"}
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed"

    deleted = await client.delete(f"/api/admin/events/{event_id}", headers=bearer(token))
    assert deleted.status_code == 204

    actions = (
        (await owner_session.execute(text("SELECT action FROM audit_logs")))
        .scalars()
        .all()
    )
    for expected in ("event.created", "event.updated", "event.deleted"):
        assert expected in actions


async def test_duplicate_event_slug_rejected(client, demo):
    token = await login(client, "alpha", "admin-a")
    resp = await client.post(
        "/api/admin/events",
        headers=bearer(token),
        json={"slug": "walk", "name": "Dup", "event_type": "city"},
    )
    assert resp.status_code == 409


async def test_task_create_generates_qr_and_validates_gps(client, demo):
    token = await login(client, "alpha", "admin-a")
    event_id = str(demo["event_a"].id)

    # QR task: server generates the secret.
    qr = await client.post(
        f"/api/admin/events/{event_id}/tasks",
        headers=bearer(token),
        json={"name": "New QR", "verification_type": "qr"},
    )
    assert qr.status_code == 201
    assert qr.json()["qr_token"]  # admin view exposes the printable secret

    # GPS task without location → rejected.
    bad = await client.post(
        f"/api/admin/events/{event_id}/tasks",
        headers=bearer(token),
        json={"name": "Bad GPS", "verification_type": "gps"},
    )
    assert bad.status_code == 422

    # GPS task with location → ok, location echoed back.
    ok = await client.post(
        f"/api/admin/events/{event_id}/tasks",
        headers=bearer(token),
        json={
            "name": "Good GPS",
            "verification_type": "gps",
            "location": {"lat": 25.03, "lng": 121.56},
            "radius_m": 50,
        },
    )
    assert ok.status_code == 201
    loc = ok.json()["location"]
    assert abs(loc["lat"] - 25.03) < 1e-6 and abs(loc["lng"] - 121.56) < 1e-6


async def test_stats_and_export(client, demo):
    admin = await login(client, "alpha", "admin-a")
    alice = await login(client, "alpha", "alice", "Alice")
    await client.post(
        f"/api/me/tasks/{demo['task_qr'].id}/complete",
        headers=bearer(alice),
        json={"qr_code": "secret-a"},
    )

    stats = await client.get(
        f"/api/admin/events/{demo['event_a'].id}/stats", headers=bearer(admin)
    )
    assert stats.status_code == 200
    body = stats.json()
    assert body["participants"] == 1
    assert body["total_stamps"] == 1
    by_task = {t["task_name"]: t["completions"] for t in body["completions_by_task"]}
    assert by_task["QR Spot"] == 1
    assert by_task["GPS Spot"] == 0

    export = await client.get(
        f"/api/admin/events/{demo['event_a'].id}/export.csv", headers=bearer(admin)
    )
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("text/csv")
    lines = export.text.strip().splitlines()
    assert lines[0] == "completed_at,member_name,line_user_id,task,method"
    assert len(lines) == 2
    assert "Alice" in lines[1] and "QR Spot" in lines[1]


async def test_members_listing(client, demo):
    admin = await login(client, "alpha", "admin-a")
    await login(client, "alpha", "alice", "Alice")
    await login(client, "beta", "bob", "Bob")  # other tenant — must not appear

    resp = await client.get("/api/admin/members", headers=bearer(admin))
    assert resp.status_code == 200
    line_ids = {m["line_user_id"] for m in resp.json()}
    assert "alice" in line_ids
    assert "bob" not in line_ids
