"""
SCHEDULED_SCAN_CALENDAR_PLAN.md Phase B — the server-side scheduler that fires
due "scheduled" ScanJobs on its own, independent of any browser being open.

These tests exercise `run_due_scheduled_scans` directly rather than the real
APScheduler wiring in main.py — the interval-job glue isn't worth unit
testing (same judgment call already made for the Playwright browser
lifecycle in real_providers.py), but the actual "which jobs are due, what
happens to them" logic is exactly what matters and is fully testable here.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.database import get_session_factory
from app.main import app as fastapi_app
from app.models.scan_job import ScanJob
from app.services.scheduler import run_due_scheduled_scans

MARRAKECH_RIAD = {
    "ville": "Marrakech",
    "pays": "Maroc",
    "type_partenaire": "hotel_riad",
    "limite": 6,
}


async def _get_session_factory(client):
    override = fastapi_app.dependency_overrides[get_session_factory]
    return await override()


async def _seed_scan_job(client, statut: str, scheduled_at) -> "ScanJob":
    session_factory = await _get_session_factory(client)
    async with session_factory() as session:
        job = ScanJob(
            ville=MARRAKECH_RIAD["ville"],
            pays=MARRAKECH_RIAD["pays"],
            type_partenaire=MARRAKECH_RIAD["type_partenaire"],
            limite=MARRAKECH_RIAD["limite"],
            statut=statut,
            scheduled_at=scheduled_at,
        )
        session.add(job)
        await session.flush()
        await session.commit()
        await session.refresh(job)
        return job


@pytest.mark.anyio
async def test_due_scheduled_job_gets_fired(client):
    past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
    job = await _seed_scan_job(client, "scheduled", past)

    session_factory = await _get_session_factory(client)
    fired = await run_due_scheduled_scans(session_factory)
    assert job.id in fired

    resp = await client.get(f"/scan/{job.id}")
    assert resp.json()["statut"] == "done"
    assert resp.json()["nb_trouves"] == MARRAKECH_RIAD["limite"]


@pytest.mark.anyio
async def test_future_scheduled_job_is_left_alone(client):
    future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=2)
    job = await _seed_scan_job(client, "scheduled", future)

    session_factory = await _get_session_factory(client)
    fired = await run_due_scheduled_scans(session_factory)
    assert job.id not in fired

    resp = await client.get(f"/scan/{job.id}")
    assert resp.json()["statut"] == "scheduled"


@pytest.mark.anyio
async def test_cancelled_job_is_never_fired_even_if_due(client):
    past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
    job = await _seed_scan_job(client, "cancelled", past)

    session_factory = await _get_session_factory(client)
    fired = await run_due_scheduled_scans(session_factory)
    assert job.id not in fired

    resp = await client.get(f"/scan/{job.id}")
    assert resp.json()["statut"] == "cancelled"


@pytest.mark.anyio
async def test_already_done_job_is_ignored(client):
    """Sanity check: the scheduler only ever looks at statut="scheduled" rows,
    so a completed job with a stale past scheduled_at is never touched."""
    past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
    job = await _seed_scan_job(client, "done", past)

    session_factory = await _get_session_factory(client)
    fired = await run_due_scheduled_scans(session_factory)
    assert job.id not in fired


@pytest.mark.anyio
async def test_multiple_due_jobs_all_fire(client):
    past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
    job1 = await _seed_scan_job(client, "scheduled", past)
    job2 = await _seed_scan_job(client, "scheduled", past)

    session_factory = await _get_session_factory(client)
    fired = await run_due_scheduled_scans(session_factory)
    assert job1.id in fired
    assert job2.id in fired

    for job_id in (job1.id, job2.id):
        resp = await client.get(f"/scan/{job_id}")
        assert resp.json()["statut"] == "done"
