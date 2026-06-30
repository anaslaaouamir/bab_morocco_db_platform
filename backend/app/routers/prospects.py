import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import get_current_user, require_admin, require_own_prospect
from app.models.prospect import Prospect
from app.models.user import User
from app.schemas.prospect import (
    ProspectAssignRequest,
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
async def stats(
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    assigned_to = user.id if user.role == "commercial" else None
    return await svc.get_stats(db, assigned_to=assigned_to)


@router.post("/score-preview", response_model=ScorePreviewResponse)
async def score_preview(data: ScorePreviewRequest, user: User = Depends(get_current_user)):
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
    user: User = Depends(get_current_user),
):
    assigned_to = user.id if user.role == "commercial" else None
    return await svc.list_prospects(
        db, page=page, page_size=page_size,
        stage=stage, type=type, score_min=score_min, pays=pays, langue=langue,
        assigned_to=assigned_to,
        populate_assignee_names=user.role == "admin",
    )


@router.post("", response_model=ProspectResponse, status_code=201)
async def create_prospect(
    data: ProspectCreate,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    try:
        prospect = await svc.create_prospect(db, data)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Un prospect avec cette adresse web existe déjà.")
    if user.role == "commercial":
        prospect.assigned_to = user.id
        await db.commit()
        await db.refresh(prospect)
    return prospect


@router.get("/{prospect_id}", response_model=ProspectResponse)
async def get_prospect(
    prospect: Prospect = Depends(require_own_prospect),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    response = ProspectResponse.model_validate(prospect)
    if user.role == "admin" and prospect.assigned_to:
        assignee = await db.get(User, prospect.assigned_to)
        if assignee:
            response.assigned_to_name = assignee.full_name
    return response


@router.put("/{prospect_id}", response_model=ProspectResponse)
async def update_prospect(
    data: ProspectUpdate,
    db: AsyncSession = Depends(get_session),
    prospect: Prospect = Depends(require_own_prospect),
):
    try:
        return await svc.update_prospect(db, prospect, data)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Un prospect avec cette adresse web existe déjà.")


@router.patch("/{prospect_id}/stage", response_model=ProspectResponse)
async def patch_stage(
    data: StagePatch,
    db: AsyncSession = Depends(get_session),
    prospect: Prospect = Depends(require_own_prospect),
):
    updated = await svc.patch_stage(db, prospect, data)

    # Auto-create a draft contract when prospect enters closing stage
    if data.stage == "closing":
        from app.services.contract_service import ContractService
        await ContractService().create_from_prospect(db, updated)

    return updated


@router.delete("/{prospect_id}", status_code=204)
async def delete_prospect(
    db: AsyncSession = Depends(get_session),
    prospect: Prospect = Depends(require_own_prospect),
):
    await svc.delete_prospect(db, prospect)


@router.patch("/{prospect_id}/assign", response_model=ProspectResponse)
async def assign_prospect(
    prospect_id: uuid.UUID,
    data: ProspectAssignRequest,
    db: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    prospect = await db.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect introuvable.")

    if data.assigned_to is not None:
        target = await db.get(User, data.assigned_to)
        if not target or target.role != "commercial" or not target.is_active:
            raise HTTPException(status_code=400, detail="Utilisateur cible invalide.")

    prospect.assigned_to = data.assigned_to
    await db.commit()
    await db.refresh(prospect)

    response = ProspectResponse.model_validate(prospect)
    if prospect.assigned_to:
        assignee = await db.get(User, prospect.assigned_to)
        if assignee:
            response.assigned_to_name = assignee.full_name
    return response
