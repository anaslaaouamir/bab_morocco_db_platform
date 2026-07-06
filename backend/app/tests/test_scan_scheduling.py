"""
SCHEDULED_SCAN_CALENDAR_PLAN.md Phase A — a scan job can now be parked with a
future `scheduled_at` instead of always starting immediately.
"""
from datetime import datetime, timedelta, timezone

import pytest

SCAN_BASE = "/scan"

MARRAKECH_RIAD = {
    "ville": "Marrakech",
    "pays": "Maroc",
    "type_partenaire": "hotel_riad",
    "limite": 6,
}


@pytest.mark.anyio
async def test_no_scheduled_at_runs_immediately(client):
    """Omitting scheduled_at must behave exactly like before this plan:
    background task is queued right away (statut="pending" on the POST
    response itself, before the queued task runs), and has completed by
    the time a follow-up GET is issued."""
    resp = await client.post(f"{SCAN_BASE}/start", json=MARRAKECH_RIAD)
    assert resp.status_code == 201
    body = resp.json()
    assert body["scheduled_at"] is None
    assert body["statut"] == "pending"

    status_resp = await client.get(f"{SCAN_BASE}/{body['id']}")
    assert status_resp.json()["statut"] == "done"


@pytest.mark.anyio
async def test_past_scheduled_at_runs_immediately(client):
    """An already-due timestamp is treated the same as 'no timestamp'."""
    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    resp = await client.post(f"{SCAN_BASE}/start", json={**MARRAKECH_RIAD, "scheduled_at": past})
    assert resp.status_code == 201
    job_id = resp.json()["id"]

    status_resp = await client.get(f"{SCAN_BASE}/{job_id}")
    assert status_resp.json()["statut"] == "done"


@pytest.mark.anyio
async def test_future_scheduled_at_parks_job(client):
    """A future timestamp must NOT run the pipeline — job stays 'scheduled'."""
    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    resp = await client.post(f"{SCAN_BASE}/start", json={**MARRAKECH_RIAD, "scheduled_at": future})
    assert resp.status_code == 201
    body = resp.json()
    assert body["statut"] == "scheduled"
    assert body["scheduled_at"] is not None
    assert body["nb_trouves"] == 0
    assert body["progression"] == 0


@pytest.mark.anyio
async def test_cancel_scheduled_job(client):
    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    start_resp = await client.post(f"{SCAN_BASE}/start", json={**MARRAKECH_RIAD, "scheduled_at": future})
    job_id = start_resp.json()["id"]

    cancel_resp = await client.delete(f"{SCAN_BASE}/{job_id}")
    assert cancel_resp.status_code == 204

    status_resp = await client.get(f"{SCAN_BASE}/{job_id}")
    assert status_resp.json()["statut"] == "cancelled"


@pytest.mark.anyio
async def test_cannot_cancel_a_completed_job(client):
    start_resp = await client.post(f"{SCAN_BASE}/start", json=MARRAKECH_RIAD)
    job_id = start_resp.json()["id"]

    status_resp = await client.get(f"{SCAN_BASE}/{job_id}")
    assert status_resp.json()["statut"] == "done"

    cancel_resp = await client.delete(f"{SCAN_BASE}/{job_id}")
    assert cancel_resp.status_code == 409


@pytest.mark.anyio
async def test_cancel_missing_job_404s(client):
    resp = await client.delete(f"{SCAN_BASE}/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
