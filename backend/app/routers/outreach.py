import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.prospect import Prospect
from app.schemas.outreach import NextStepResponse, OutreachEmailResponse, TriggerFollowupsResponse
from app.services.email_generator import EmailGeneratorProtocol, get_email_generator
from app.services.outreach_service import OutreachService

router = APIRouter(prefix="/outreach", tags=["outreach"])


def get_outreach_service(
    generator: Annotated[EmailGeneratorProtocol, Depends(get_email_generator)],
) -> OutreachService:
    return OutreachService(generator=generator)


async def _get_prospect(prospect_id: uuid.UUID, db: AsyncSession) -> Prospect:
    prospect = await db.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    return prospect


@router.post("/{prospect_id}/generate", response_model=list[OutreachEmailResponse], status_code=status.HTTP_201_CREATED)
async def generate_j0_variants(
    prospect_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
):
    prospect = await _get_prospect(prospect_id, db)
    try:
        return await svc.generate_j0_variants(db, prospect)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{prospect_id}/next-step", response_model=NextStepResponse)
async def next_step(
    prospect_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
):
    await _get_prospect(prospect_id, db)
    result = await svc.next_step(db, prospect_id)
    emails = result.pop("emails")
    return NextStepResponse(**result, emails=emails)


@router.get("/{prospect_id}", response_model=list[OutreachEmailResponse])
async def list_emails(
    prospect_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
):
    await _get_prospect(prospect_id, db)
    return await svc.list_emails(db, prospect_id)


@router.post("/{email_id}/validate", response_model=OutreachEmailResponse)
async def validate_email(
    email_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
):
    try:
        return await svc.validate(db, email_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{email_id}/send", response_model=OutreachEmailResponse)
async def send_email(
    email_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
):
    try:
        return await svc.send(db, email_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/trigger-followups", response_model=TriggerFollowupsResponse)
async def trigger_followups(
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
):
    return await svc.trigger_followups(db)
