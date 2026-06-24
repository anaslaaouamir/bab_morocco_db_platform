import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session, get_session_factory
from app.models.scan_job import ScanJob
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
        created_at=job.created_at,
        completed_at=job.completed_at,
    )


@router.get("/history", response_model=list[ScanJobResponse])
async def scan_history(db: AsyncSession = Depends(get_session)):
    rows = (await db.execute(select(ScanJob).order_by(ScanJob.created_at.desc()))).scalars().all()
    return [_job_to_response(j) for j in rows]


@router.post("/start", response_model=ScanJobResponse, status_code=201)
async def start_scan(
    data: ScanStartRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_session),
    session_factory=Depends(get_session_factory),
):
    job = ScanJob(
        ville=data.ville,
        pays=data.pays,
        type_partenaire=data.type_partenaire.value,
        limite=data.limite,
        statut="pending",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(run_scan_pipeline, job.id, session_factory)
    return _job_to_response(job)


@router.get("/{job_id}", response_model=ScanJobResponse)
async def get_scan_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    job = await db.get(ScanJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="ScanJob introuvable.")
    return _job_to_response(job)
