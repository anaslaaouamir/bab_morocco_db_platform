"""
SCHEDULED_SCAN_CALENDAR_PLAN.md Phase B — server-side scan scheduler.

Replaces the old browser-resident poll loop (frontend AppShell.tsx, since
retired) with a check that runs inside the backend process itself, so a
scan scheduled for an overnight window fires whether or not any admin has
a browser tab open.
"""
import logging
import uuid
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.models.scan_job import ScanJob
from app.services.scan_pipeline import run_scan_pipeline

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 60


def is_due(scheduled_at) -> bool:
    """A naive datetime (no tzinfo) is treated as UTC, matching how
    scheduled_at is stored and compared everywhere in this feature."""
    if scheduled_at is None:
        return True
    now = datetime.now(timezone.utc)
    if scheduled_at.tzinfo is None:
        return scheduled_at <= now.replace(tzinfo=None)
    return scheduled_at <= now


async def run_due_scheduled_scans(session_factory) -> list[uuid.UUID]:
    """
    Find every ScanJob still waiting (statut="scheduled") whose scheduled_at
    has arrived, flip it to "pending", and run the pipeline — same path an
    immediate scan takes. Runs due jobs one at a time (batch sizes are small
    by design, see settingsStore.ts's batchSize slider), so there's no need
    for concurrent execution here.
    """
    fired: list[uuid.UUID] = []
    async with session_factory() as db:
        rows = (
            await db.execute(select(ScanJob).where(ScanJob.statut == "scheduled"))
        ).scalars().all()
        due_ids = [job.id for job in rows if is_due(job.scheduled_at)]

        for job_id in due_ids:
            job = await db.get(ScanJob, job_id)
            if job is None or job.statut != "scheduled":
                continue  # cancelled or already handled between the query and here
            job.statut = "pending"
            await db.commit()
            fired.append(job_id)

    for job_id in fired:
        try:
            await run_scan_pipeline(job_id, session_factory)
        except Exception:
            logger.exception("Scheduled scan %s failed to run", job_id)

    return fired


def start_scheduler(session_factory) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_due_scheduled_scans,
        trigger="interval",
        seconds=POLL_INTERVAL_SECONDS,
        args=[session_factory],
        next_run_time=datetime.now(),  # also check once immediately on startup
        id="run_due_scheduled_scans",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    return scheduler


def stop_scheduler(scheduler: AsyncIOScheduler | None) -> None:
    if scheduler is not None and scheduler.running:
        scheduler.shutdown(wait=False)
