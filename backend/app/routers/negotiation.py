from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import get_current_user, require_own_prospect
from app.models.prospect import Prospect
from app.models.user import User
from app.schemas.negotiation import (
    MessageAnalysisResponse,
    MessageSubmitRequest,
    NegotiationMessageResponse,
    RespondRequest,
    ScenarioSchema,
    WaitingReplyItem,
)
from app.services.email_transport import EmailTransportProtocol, get_email_transport
from app.services.negotiation_generator import NegotiationGeneratorProtocol, get_negotiation_generator
from app.services.negotiation_service import NegotiationService

router = APIRouter(prefix="/negotiation", tags=["negotiation"])


def get_negotiation_service(
    generator: Annotated[NegotiationGeneratorProtocol, Depends(get_negotiation_generator)],
    sender: Annotated[EmailTransportProtocol, Depends(get_email_transport)],
) -> NegotiationService:
    return NegotiationService(generator=generator, sender=sender)


@router.get("/waiting-reply", response_model=list[WaitingReplyItem])
async def waiting_reply(
    db: AsyncSession = Depends(get_session),
    svc: NegotiationService = Depends(get_negotiation_service),
    user: User = Depends(get_current_user),
):
    """Prospects in négociation whose latest message is inbound — powers the
    Dashboard's "Alertes prioritaires" card. Commercial sees only their own,
    Admin sees all — same ownership rule as everywhere else."""
    items = await svc.get_waiting_on_reply(db)
    if user.role == "commercial":
        items = [i for i in items if i["assigned_to"] == user.id]
    return [
        WaitingReplyItem(
            prospect_id=i["prospect_id"],
            prospect_nom=i["prospect_nom"],
            last_message_at=i["last_message_at"],
        )
        for i in items
    ]


@router.post("/{prospect_id}/message", response_model=MessageAnalysisResponse, status_code=status.HTTP_201_CREATED)
async def submit_message(
    body: MessageSubmitRequest,
    db: AsyncSession = Depends(get_session),
    svc: NegotiationService = Depends(get_negotiation_service),
    prospect: Prospect = Depends(require_own_prospect),
):
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
    db: AsyncSession = Depends(get_session),
    svc: NegotiationService = Depends(get_negotiation_service),
    prospect: Prospect = Depends(require_own_prospect),
):
    result = await svc.get_analysis(db, prospect.id)
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
    db: AsyncSession = Depends(get_session),
    svc: NegotiationService = Depends(get_negotiation_service),
    prospect: Prospect = Depends(require_own_prospect),
):
    return await svc.get_history(db, prospect.id)


@router.post("/{prospect_id}/simulate-reply", response_model=MessageAnalysisResponse, status_code=status.HTTP_201_CREATED)
async def simulate_reply(
    db: AsyncSession = Depends(get_session),
    svc: NegotiationService = Depends(get_negotiation_service),
    prospect: Prospect = Depends(require_own_prospect),
):
    """Dev-only: simulate a partner inbound reply, move prospect to negociation, run analysis."""
    from app.config import settings as _settings
    if _settings.ENV == "production":
        raise HTTPException(status_code=403, detail="Not available in production")

    mock_text = (
        f"Bonjour,\n\nMerci pour votre message concernant un partenariat avec Bab Morocco. "
        f"Votre plateforme semble intéressante pour notre clientèle. "
        f"Cependant, étant donné que vous êtes en phase de pré-lancement, "
        f"nous aurions besoin d'au moins {prospect.commission_standard + 2}% de commission "
        f"pour justifier l'intégration d'une nouvelle plateforme. "
        f"Nous avons également des questions sur les garanties de trafic et le SLA de paiement.\n\n"
        f"Cordialement,\n{prospect.nom_contact} — {prospect.nom}"
    )

    # Move prospect to negociation stage
    prospect.stage = "negociation"
    await db.commit()
    await db.refresh(prospect)

    try:
        result = await svc.submit_message(db, prospect, mock_text)
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


@router.post("/{prospect_id}/respond", response_model=NegotiationMessageResponse)
async def respond(
    body: RespondRequest,
    db: AsyncSession = Depends(get_session),
    svc: NegotiationService = Depends(get_negotiation_service),
    prospect: Prospect = Depends(require_own_prospect),
):
    last_analysis = await svc.get_analysis(db, prospect.id)
    if not last_analysis:
        raise HTTPException(status_code=404, detail="No analysis found — submit a message first")
    try:
        return await svc.respond(db, prospect, body.scenario, last_analysis, body.custom_message, body.human_validated)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
