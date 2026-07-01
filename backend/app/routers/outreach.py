import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import get_current_user, require_own_prospect
from app.models.outreach import OutreachEmail
from app.models.prospect import Prospect
from app.models.user import User
from app.schemas.outreach import NextStepResponse, OutreachEmailResponse, TriggerFollowupsResponse
from app.services.email_generator import EmailGeneratorProtocol, get_email_generator
from app.services.email_transport import EmailTransportProtocol, get_email_transport
from app.services.outreach_service import OutreachService

router = APIRouter(prefix="/outreach", tags=["outreach"])


def get_outreach_service(
    generator: Annotated[EmailGeneratorProtocol, Depends(get_email_generator)],
    sender: Annotated[EmailTransportProtocol, Depends(get_email_transport)],
) -> OutreachService:
    return OutreachService(generator=generator, sender=sender)


async def _get_prospect_for_email(email_id: uuid.UUID, user: User, db: AsyncSession) -> Prospect:
    """Resolves the parent prospect of an outreach email and enforces ownership."""
    email = await db.get(OutreachEmail, email_id)
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    prospect = await db.get(Prospect, email.prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if user.role == "commercial" and prospect.assigned_to != user.id:
        raise HTTPException(status_code=403, detail="Vous n'avez pas accès à ce prospect.")
    return prospect


@router.post("/{prospect_id}/generate", response_model=list[OutreachEmailResponse], status_code=status.HTTP_201_CREATED)
async def generate_j0_variants(
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
    prospect: Prospect = Depends(require_own_prospect),
):
    try:
        return await svc.generate_j0_variants(db, prospect)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{prospect_id}/next-step", response_model=NextStepResponse)
async def next_step(
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
    prospect: Prospect = Depends(require_own_prospect),
):
    result = await svc.next_step(db, prospect.id)
    emails = result.pop("emails")
    return NextStepResponse(**result, emails=emails)


@router.get("/{prospect_id}", response_model=list[OutreachEmailResponse])
async def list_emails(
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
    prospect: Prospect = Depends(require_own_prospect),
):
    return await svc.list_emails(db, prospect.id)


@router.post("/{email_id}/validate", response_model=OutreachEmailResponse)
async def validate_email(
    email_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
    user: User = Depends(get_current_user),
):
    await _get_prospect_for_email(email_id, user, db)
    try:
        return await svc.validate(db, email_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{email_id}/send", response_model=OutreachEmailResponse)
async def send_email(
    email_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
    user: User = Depends(get_current_user),
):
    await _get_prospect_for_email(email_id, user, db)
    try:
        return await svc.send(db, email_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/{prospect_id}/trigger-followup", response_model=list[OutreachEmailResponse])
async def trigger_followup_for_prospect(
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
    prospect: Prospect = Depends(require_own_prospect),
):
    """Per-prospect idempotent check — generates next due follow-up step (A/B/C) if timing is met."""
    return await svc.auto_trigger_followup(db, prospect)


@router.post("/trigger-followups", response_model=TriggerFollowupsResponse)
async def trigger_followups(
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
    user: User = Depends(get_current_user),
):
    return await svc.trigger_followups(db)
