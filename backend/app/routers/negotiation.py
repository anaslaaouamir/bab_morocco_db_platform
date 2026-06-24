import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.prospect import Prospect
from app.schemas.negotiation import (
    MessageAnalysisResponse,
    MessageSubmitRequest,
    NegotiationMessageResponse,
    RespondRequest,
    ScenarioSchema,
)
from app.services.negotiation_generator import NegotiationGeneratorProtocol, get_negotiation_generator
from app.services.negotiation_service import NegotiationService

router = APIRouter(prefix="/negotiation", tags=["negotiation"])


def get_negotiation_service(
    generator: Annotated[NegotiationGeneratorProtocol, Depends(get_negotiation_generator)],
) -> NegotiationService:
    return NegotiationService(generator=generator)


async def _get_prospect(prospect_id: uuid.UUID, db: AsyncSession) -> Prospect:
    prospect = await db.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    return prospect


@router.post("/{prospect_id}/message", response_model=MessageAnalysisResponse, status_code=status.HTTP_201_CREATED)
async def submit_message(
    prospect_id: uuid.UUID,
    body: MessageSubmitRequest,
    db: AsyncSession = Depends(get_session),
    svc: NegotiationService = Depends(get_negotiation_service),
):
    prospect = await _get_prospect(prospect_id, db)
    try:
        result = await svc.submit_message(db, prospect, body.corps)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return MessageAnalysisResponse(
        message_id=result["message_id"],
        intent=result["intent"],
        intent_score=result["intent_score"],
        objection_type=result["objection_type"],
        objection_detail=result["objection_detail"],
        taux_demande=result["taux_demande"],
        requires_human=result["requires_human"],
        scenarios=[ScenarioSchema(**s) for s in result["scenarios"]],
    )


@router.get("/{prospect_id}/analysis", response_model=MessageAnalysisResponse)
async def get_analysis(
    prospect_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: NegotiationService = Depends(get_negotiation_service),
):
    await _get_prospect(prospect_id, db)
    result = await svc.get_analysis(db, prospect_id)
    if not result:
        raise HTTPException(status_code=404, detail="No analysis found for this prospect")
    return MessageAnalysisResponse(
        message_id=result["message_id"],
        intent=result["intent"],
        intent_score=result["intent_score"],
        objection_type=result["objection_type"],
        objection_detail=result["objection_detail"],
        taux_demande=result["taux_demande"],
        requires_human=result["requires_human"],
        scenarios=[ScenarioSchema(**s) for s in result["scenarios"]],
    )


@router.get("/{prospect_id}/history", response_model=list[NegotiationMessageResponse])
async def get_history(
    prospect_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: NegotiationService = Depends(get_negotiation_service),
):
    await _get_prospect(prospect_id, db)
    return await svc.get_history(db, prospect_id)


@router.post("/{prospect_id}/respond", response_model=NegotiationMessageResponse)
async def respond(
    prospect_id: uuid.UUID,
    body: RespondRequest,
    db: AsyncSession = Depends(get_session),
    svc: NegotiationService = Depends(get_negotiation_service),
):
    prospect = await _get_prospect(prospect_id, db)
    last_analysis = await svc.get_analysis(db, prospect_id)
    if not last_analysis:
        raise HTTPException(status_code=404, detail="No analysis found — submit a message first")
    try:
        return await svc.respond(db, prospect, body.scenario, last_analysis)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
