import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session, get_session_factory
from app.dependencies.auth import get_current_user, require_admin
from app.models.scan_job import ScanJob
from app.models.user import User
from app.schemas.scan import ScanJobResponse, ScanStartRequest
from app.services.scan_pipeline import run_scan_pipeline

router = APIRouter(prefix="/scan", tags=["scan"])


def _job_to_response(job: ScanJob) -> ScanJobResponse:
    return ScanJobResponse(
        id=job.id,
        ville=job.ville,
        pays=job.pays,
        type_partenaire=job.type_partenaire,
        limite=job.limite,
        statut=job.statut,
        nb_trouves=job.nb_trouves,
        nb_ajoutes=job.nb_ajoutes,
        nb_veille=job.nb_veille,
        nb_doublons=job.nb_doublons,
        progression=job.progression,
        erreur=job.erreur,
        scheduled_at=job.scheduled_at,
        created_at=job.created_at,
        completed_at=job.completed_at,
    )


def _is_due(scheduled_at) -> bool:
    """A naive datetime from the request is treated as UTC, matching how
    scheduled_at is stored and compared (see scheduler.py)."""
    if scheduled_at is None:
        return True
    now = datetime.now(timezone.utc)
    if scheduled_at.tzinfo is None:
        return scheduled_at <= now.replace(tzinfo=None)
    return scheduled_at <= now


@router.get("/history", response_model=list[ScanJobResponse])
async def scan_history(
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    rows = (await db.execute(select(ScanJob).order_by(ScanJob.created_at.desc()))).scalars().all()
    return [_job_to_response(j) for j in rows]


@router.post("/start", response_model=ScanJobResponse, status_code=201)
async def start_scan(
    data: ScanStartRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_session),
    session_factory=Depends(get_session_factory),
    _admin: User = Depends(require_admin),
):
    due = _is_due(data.scheduled_at)

    job = ScanJob(
        ville=data.ville,
        pays=data.pays,
        type_partenaire=data.type_partenaire.value,
        limite=data.limite,
        statut="pending" if due else "scheduled",
        scheduled_at=None if due else data.scheduled_at,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    if due:
        background_tasks.add_task(run_scan_pipeline, job.id, session_factory)
    # else: left as statut="scheduled" — the backend scheduler picks it up
    # and fires it once scheduled_at arrives (see scheduler.py).
    return _job_to_response(job)


@router.get("/{job_id}", response_model=ScanJobResponse)
async def get_scan_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    job = await db.get(ScanJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="ScanJob introuvable.")
    return _job_to_response(job)


@router.delete("/{job_id}", status_code=204)
async def cancel_scheduled_scan(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    job = await db.get(ScanJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="ScanJob introuvable.")
    if job.statut != "scheduled":
        raise HTTPException(
            status_code=409,
            detail="Seul un scan planifié non encore démarré peut être annulé.",
        )
    job.statut = "cancelled"
    await db.commit()
