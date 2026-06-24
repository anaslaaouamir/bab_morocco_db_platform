import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.prospect import (
    ProspectCreate,
    ProspectListResponse,
    ProspectResponse,
    ProspectStats,
    ProspectUpdate,
    ScorePreviewRequest,
    ScorePreviewResponse,
    StagePatch,
)
from app.services import prospect_service as svc
from app.services.scoring import scoring_engine

router = APIRouter(prefix="/prospects", tags=["prospects"])


@router.get("/stats", response_model=ProspectStats)
async def stats(db: AsyncSession = Depends(get_session)):
    return await svc.get_stats(db)


@router.post("/score-preview", response_model=ScorePreviewResponse)
async def score_preview(data: ScorePreviewRequest):
    """Compute score without persisting — used by frontend form for live preview."""
    payload = data.model_dump()
    breakdown = scoring_engine.compute_breakdown(payload)
    total = scoring_engine.compute_total(breakdown)
    return ScorePreviewResponse(
        score_activite_digitale=breakdown.activite_digitale,
        score_coherence_marche=breakdown.coherence_marche,
        score_taille_capacite=breakdown.taille_capacite,
        score_contact_decideur=breakdown.contact_decideur,
        score_liberte_ota=breakdown.liberte_ota,
        score_total=total,
        stage_recommande=scoring_engine.evaluate_stage(total, "prospection"),
        is_premium=scoring_engine.should_escalate(total),
    )


@router.get("", response_model=ProspectListResponse)
async def list_prospects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    stage: Optional[str] = None,
    type: Optional[str] = None,
    score_min: Optional[int] = None,
    pays: Optional[str] = None,
    langue: Optional[str] = None,
    db: AsyncSession = Depends(get_session),
):
    return await svc.list_prospects(
        db, page=page, page_size=page_size,
        stage=stage, type=type, score_min=score_min, pays=pays, langue=langue,
    )


@router.post("", response_model=ProspectResponse, status_code=201)
async def create_prospect(data: ProspectCreate, db: AsyncSession = Depends(get_session)):
    try:
        prospect = await svc.create_prospect(db, data)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Un prospect avec cette adresse web existe déjà.")
    return prospect


@router.get("/{prospect_id}", response_model=ProspectResponse)
async def get_prospect(prospect_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    prospect = await svc.get_prospect(db, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect introuvable.")
    return prospect


@router.put("/{prospect_id}", response_model=ProspectResponse)
async def update_prospect(
    prospect_id: uuid.UUID,
    data: ProspectUpdate,
    db: AsyncSession = Depends(get_session),
):
    prospect = await svc.get_prospect(db, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect introuvable.")
    try:
        return await svc.update_prospect(db, prospect, data)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Un prospect avec cette adresse web existe déjà.")


@router.patch("/{prospect_id}/stage", response_model=ProspectResponse)
async def patch_stage(
    prospect_id: uuid.UUID,
    data: StagePatch,
    db: AsyncSession = Depends(get_session),
):
    prospect = await svc.get_prospect(db, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect introuvable.")
    return await svc.patch_stage(db, prospect, data)


@router.delete("/{prospect_id}", status_code=204)
async def delete_prospect(prospect_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    prospect = await svc.get_prospect(db, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect introuvable.")
    await svc.delete_prospect(db, prospect)
