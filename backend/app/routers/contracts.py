import math
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies.auth import get_current_user
from app.models.contract import Contract
from app.models.prospect import Prospect
from app.models.user import User
from app.schemas.contract import ContractCreate, ContractListResponse, ContractResponse, ContractWaitingDecisionItem, PartnerReplySubmit
from app.services.contract_generator import ContractGeneratorProtocol, get_contract_generator
from app.services.contract_service import ContractService
from app.services.email_transport import EmailTransportProtocol, get_email_transport


class GenerateRequest(BaseModel):
    clause_overrides: Optional[dict[str, str]] = None

router = APIRouter(prefix="/contracts", tags=["contracts"])


# ─── DI ──────────────────────────────────────────────────────────────────────

def get_contract_service(
    generator: Annotated[ContractGeneratorProtocol, Depends(get_contract_generator)],
    sender: Annotated[EmailTransportProtocol, Depends(get_email_transport)],
) -> ContractService:
    return ContractService(generator=generator, sender=sender)


async def _get_prospect_or_404(prospect_id: uuid.UUID, db: AsyncSession) -> Prospect:
    prospect = await db.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect introuvable.")
    return prospect


async def _get_contract_or_404(contract_id: uuid.UUID, svc: ContractService, db: AsyncSession):
    contract = await svc.get_contract(db, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contrat introuvable.")
    return contract


async def _get_contract_with_access(
    contract_id: uuid.UUID, svc: ContractService, db: AsyncSession, user: User
):
    """Resolves a contract and enforces that the requesting user owns its prospect."""
    contract = await _get_contract_or_404(contract_id, svc, db)
    prospect = await _get_prospect_or_404(contract.prospect_id, db)
    if user.role == "commercial" and prospect.assigned_to != user.id:
        raise HTTPException(status_code=403, detail="Vous n'avez pas accès à ce contrat.")
    return contract, prospect


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/waiting-decision", response_model=list[ContractWaitingDecisionItem])
async def contracts_waiting_decision(
    db: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Contracts sent to the partner who replied, but the user hasn't yet
    decided signed/declined — powers the Dashboard's priority alerts."""
    query = (
        select(Contract)
        .where(Contract.status == "sent_to_partner")
        .where(Contract.partner_replied_at.isnot(None))
    )
    rows = (await db.execute(query)).scalars().all()

    items = []
    for c in rows:
        prospect = await db.get(Prospect, c.prospect_id)
        if not prospect:
            continue
        if user.role == "commercial" and prospect.assigned_to != user.id:
            continue
        items.append(
            ContractWaitingDecisionItem(
                contract_id=c.id,
                prospect_id=c.prospect_id,
                prospect_nom=prospect.nom,
                partner_replied_at=c.partner_replied_at,
            )
        )
    return items


@router.get("", response_model=ContractListResponse)
async def list_contracts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
    user: User = Depends(get_current_user),
):
    assigned_to = user.id if user.role == "commercial" else None
    items, total = await svc.list_contracts(db, page=page, page_size=page_size, assigned_to=assigned_to)
    pages = max(1, math.ceil(total / page_size))
    return ContractListResponse(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post("", response_model=ContractResponse, status_code=status.HTTP_201_CREATED)
async def create_contract(
    body: ContractCreate,
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
    user: User = Depends(get_current_user),
):
    """Create a draft contract for a prospect. Idempotent — returns existing if already created."""
    prospect = await _get_prospect_or_404(body.prospect_id, db)
    if user.role == "commercial" and prospect.assigned_to != user.id:
        raise HTTPException(status_code=403, detail="Vous n'avez pas accès à ce prospect.")
    if prospect.stage not in ("closing", "activation_ota"):
        raise HTTPException(
            status_code=400,
            detail=f"Prospect must be in 'closing' or 'activation_ota' stage (current: {prospect.stage}).",
        )
    contract = await svc.create_from_prospect(db, prospect, body.estimated_annual_value)
    return await svc.get_response(contract)


@router.get("/{contract_id}", response_model=ContractResponse)
async def get_contract(
    contract_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
    user: User = Depends(get_current_user),
):
    contract, _ = await _get_contract_with_access(contract_id, svc, db, user)
    return await svc.get_response(contract)


@router.post("/{contract_id}/generate", response_model=ContractResponse)
async def generate_pdf(
    contract_id: uuid.UUID,
    body: GenerateRequest = GenerateRequest(),
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
    user: User = Depends(get_current_user),
):
    """Generate AI clauses and render the PDF. Blocked if human_review_required."""
    contract, prospect = await _get_contract_with_access(contract_id, svc, db, user)
    try:
        contract = await svc.generate_pdf(db, contract, prospect, clause_overrides=body.clause_overrides)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return await svc.get_response(contract)


@router.get("/{contract_id}/pdf")
async def download_pdf(
    contract_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
    user: User = Depends(get_current_user),
):
    """Download the generated PDF as binary."""
    contract, _ = await _get_contract_with_access(contract_id, svc, db, user)
    if not contract.pdf_bytes:
        raise HTTPException(status_code=404, detail="PDF not yet generated.")
    return Response(
        content=contract.pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="contrat_{contract.partner_name.replace(" ", "_")}.pdf"'
        },
    )


@router.get("/{contract_id}/reply-pdf")
async def download_reply_pdf(
    contract_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
    user: User = Depends(get_current_user),
):
    """Download the PDF the partner attached to their reply (e.g. a signed copy), if any."""
    contract, _ = await _get_contract_with_access(contract_id, svc, db, user)
    if not contract.partner_reply_pdf:
        raise HTTPException(status_code=404, detail="Aucun PDF reçu du partenaire.")
    return Response(
        content=contract.partner_reply_pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{contract.partner_reply_pdf_filename or "reponse_partenaire.pdf"}"'
        },
    )


@router.post("/{contract_id}/send", response_model=ContractResponse)
async def send_to_partner(
    contract_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
    user: User = Depends(get_current_user),
):
    """Send the contract PDF to the partner by email (mock in dev, Mailgun in prod)."""
    contract, _ = await _get_contract_with_access(contract_id, svc, db, user)
    try:
        contract = await svc.send_to_partner(db, contract)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await svc.get_response(contract)


@router.post("/{contract_id}/submit-reply", response_model=ContractResponse)
async def submit_partner_reply(
    contract_id: uuid.UUID,
    body: PartnerReplySubmit,
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
    user: User = Depends(get_current_user),
):
    """
    Submit the partner's email reply into the platform.
    The user pastes the reply text after reading their inbox.
    Status stays sent_to_partner — user still decides signed/declined.
    """
    contract, _ = await _get_contract_with_access(contract_id, svc, db, user)
    try:
        contract = await svc.submit_reply(db, contract, body.reply_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await svc.get_response(contract)


@router.post("/{contract_id}/mark-signed", response_model=ContractResponse)
async def mark_signed(
    contract_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
    user: User = Depends(get_current_user),
):
    """
    Human confirms the partner has signed.
    Sets status → signed, prospect stage → activation_ota.
    """
    contract, prospect = await _get_contract_with_access(contract_id, svc, db, user)
    try:
        contract = await svc.mark_signed(db, contract, prospect)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await svc.get_response(contract)


@router.post("/{contract_id}/mark-declined", response_model=ContractResponse)
async def mark_declined(
    contract_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
    user: User = Depends(get_current_user),
):
    """
    Human marks the partner as declined.
    Sets status → declined, prospect stage → negociation.
    """
    contract, prospect = await _get_contract_with_access(contract_id, svc, db, user)
    try:
        contract = await svc.mark_declined(db, contract, prospect)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await svc.get_response(contract)


@router.post("/{contract_id}/simulate-reply", response_model=ContractResponse)
async def simulate_partner_reply(
    contract_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
    user: User = Depends(get_current_user),
):
    """DEV ONLY — inject a realistic mock partner reply mentioning a signed PDF."""
    from app.config import settings as _settings
    if _settings.ENV == "production":
        raise HTTPException(status_code=403, detail="Not available in production.")

    contract, _ = await _get_contract_with_access(contract_id, svc, db, user)
    try:
        contract = await svc.simulate_partner_reply(db, contract)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await svc.get_response(contract)


@router.post("/{contract_id}/simulate-signed", response_model=ContractResponse)
async def simulate_signed(
    contract_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
    user: User = Depends(get_current_user),
):
    """
    DEV ONLY — simulate partner signing the contract.
    Skips the sent_to_partner requirement for rapid testing.
    """
    from app.config import settings as _settings
    if _settings.ENV == "production":
        raise HTTPException(status_code=403, detail="Not available in production.")

    contract, prospect = await _get_contract_with_access(contract_id, svc, db, user)

    if contract.status not in ("generated", "sent_to_partner"):
        raise HTTPException(
            status_code=400,
            detail=f"Contract must be generated first (current status: {contract.status}).",
        )

    # Force to sent_to_partner if still at generated, then sign
    if contract.status == "generated":
        contract = await svc.send_to_partner(db, contract)

    try:
        contract = await svc.mark_signed(db, contract, prospect)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await svc.get_response(contract)
