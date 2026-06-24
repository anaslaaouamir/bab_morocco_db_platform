import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.prospect import Prospect
from app.schemas.outreach import NextStepResponse, OutreachEmailResponse, TriggerFollowupsResponse
from app.services.outreach_service import OutreachService

router = APIRouter(prefix="/outreach", tags=["outreach"])
_service = OutreachService()


async def _get_prospect(prospect_id: uuid.UUID, db: AsyncSession) -> Prospect:
    prospect = await db.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    return prospect


@router.post("/{prospect_id}/generate", response_model=list[OutreachEmailResponse], status_code=status.HTTP_201_CREATED)
async def generate_j0_variants(prospect_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    prospect = await _get_prospect(prospect_id, db)
    emails = await _service.generate_j0_variants(db, prospect)
    return emails


@router.get("/{prospect_id}", response_model=list[OutreachEmailResponse])
async def list_emails(prospect_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    await _get_prospect(prospect_id, db)
    return await _service.list_emails(db, prospect_id)


@router.get("/{prospect_id}/next-step", response_model=NextStepResponse)
async def next_step(prospect_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    await _get_prospect(prospect_id, db)
    result = await _service.next_step(db, prospect_id)
    emails = result.pop("emails")
    return NextStepResponse(**result, emails=emails)


@router.post("/{email_id}/validate", response_model=OutreachEmailResponse)
async def validate_email(email_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    try:
        return await _service.validate(db, email_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{email_id}/send", response_model=OutreachEmailResponse)
async def send_email(email_id: uuid.UUID, db: AsyncSession = Depends(get_session)):
    try:
        return await _service.send(db, email_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/trigger-followups", response_model=TriggerFollowupsResponse)
async def trigger_followups(db: AsyncSession = Depends(get_session)):
    return await _service.trigger_followups(db)
