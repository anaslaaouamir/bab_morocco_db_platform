import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import get_current_user, require_own_prospect
from app.models.outreach import OutreachEmail
from app.models.prospect import Prospect
from app.models.user import User
from app.schemas.outreach import (
    NextStepResponse,
    OutreachEmailResponse,
    OutreachEmailUpdate,
    OutreachQueueResponse,
    ProspectWithNextStep,
    TriggerFollowupsResponse,
)
from app.services import prospect_service
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


@router.get("/sent-count")
async def outreach_sent_count(
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
):
    """Count of distinct prospects still in 'outreach' stage that have at least one sent/opened email."""
    result = await db.execute(
        select(func.count(func.distinct(OutreachEmail.prospect_id)))
        .join(Prospect, OutreachEmail.prospect_id == Prospect.id)
        .where(OutreachEmail.statut.in_(["sent", "opened"]))
        .where(Prospect.stage == "outreach")
    )
    return {"sent_count": result.scalar_one()}


@router.get("/queue", response_model=OutreachQueueResponse)
async def outreach_queue(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
    user: User = Depends(get_current_user),
):
    """Prospects in the 'outreach' stage together with their next-step email data,
    batched in a single grouped query instead of one HTTP/SQL round-trip per prospect."""
    assigned_to = user.id if user.role == "commercial" else None
    prospect_page = await prospect_service.list_prospects(
        db, page=page, page_size=page_size, stage="outreach", assigned_to=assigned_to,
    )
    next_steps = await svc.next_step_batch(db, [p.id for p in prospect_page.items])
    items = [
        ProspectWithNextStep(
            prospect=p,
            next_step=next_steps[p.id]["next_step"],
            reason=next_steps[p.id]["reason"],
            emails=[OutreachEmailResponse.model_validate(e) for e in next_steps[p.id]["emails"]],
        )
        for p in prospect_page.items
    ]
    return OutreachQueueResponse(
        items=items,
        total=prospect_page.total,
        page=prospect_page.page,
        page_size=prospect_page.page_size,
        pages=prospect_page.pages,
    )


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


@router.post("/{prospect_id}/generate/{step}", response_model=list[OutreachEmailResponse], status_code=status.HTTP_201_CREATED)
async def generate_step_variants(
    step: str,
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
    prospect: Prospect = Depends(require_own_prospect),
):
    if step not in ("j0", "j3", "j7", "j30"):
        raise HTTPException(status_code=400, detail=f"Invalid step: {step}")
    try:
        return await svc.generate_step_variants(db, prospect, step)
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


@router.patch("/{email_id}", response_model=OutreachEmailResponse)
async def update_email(
    email_id: uuid.UUID,
    body: OutreachEmailUpdate,
    db: AsyncSession = Depends(get_session),
    svc: OutreachService = Depends(get_outreach_service),
    user: User = Depends(get_current_user),
):
    await _get_prospect_for_email(email_id, user, db)
    try:
        return await svc.update_content(db, email_id, body.sujet, body.corps)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


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
