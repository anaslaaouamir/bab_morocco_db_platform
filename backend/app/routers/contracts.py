import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.prospect import Prospect
from app.schemas.contract import ContractCreate, ContractListResponse, ContractResponse, PartnerReplySubmit
from app.services.contract_generator import ContractGeneratorProtocol, get_contract_generator
from app.services.contract_service import ContractService


class GenerateRequest(BaseModel):
    clause_overrides: Optional[dict[str, str]] = None

router = APIRouter(prefix="/contracts", tags=["contracts"])


# ─── DI ──────────────────────────────────────────────────────────────────────

def get_contract_service(
    generator: Annotated[ContractGeneratorProtocol, Depends(get_contract_generator)],
) -> ContractService:
    return ContractService(generator=generator)


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


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("", response_model=ContractListResponse)
async def list_contracts(
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
):
    items = await svc.list_contracts(db)
    return ContractListResponse(items=items, total=len(items))


@router.post("", response_model=ContractResponse, status_code=status.HTTP_201_CREATED)
async def create_contract(
    body: ContractCreate,
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
):
    """Create a draft contract for a prospect. Idempotent — returns existing if already created."""
    prospect = await _get_prospect_or_404(body.prospect_id, db)
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
):
    contract = await _get_contract_or_404(contract_id, svc, db)
    return await svc.get_response(contract)


@router.post("/{contract_id}/generate", response_model=ContractResponse)
async def generate_pdf(
    contract_id: uuid.UUID,
    body: GenerateRequest = GenerateRequest(),
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
):
    """Generate AI clauses and render the PDF. Blocked if human_review_required."""
    contract = await _get_contract_or_404(contract_id, svc, db)
    prospect = await _get_prospect_or_404(contract.prospect_id, db)
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
):
    """Download the generated PDF as binary."""
    contract = await _get_contract_or_404(contract_id, svc, db)
    if not contract.pdf_bytes:
        raise HTTPException(status_code=404, detail="PDF not yet generated.")
    return Response(
        content=contract.pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="contrat_{contract.partner_name.replace(" ", "_")}.pdf"'
        },
    )


@router.post("/{contract_id}/send", response_model=ContractResponse)
async def send_to_partner(
    contract_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    svc: ContractService = Depends(get_contract_service),
):
    """Send the contract PDF to the partner by email (mock in dev, Mailgun in prod)."""
    contract = await _get_contract_or_404(contract_id, svc, db)
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
):
    """
    Submit the partner's email reply into the platform.
    The user pastes the reply text after reading their inbox.
    Status stays sent_to_partner — user still decides signed/declined.
    """
    contract = await _get_contract_or_404(contract_id, svc, db)
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
):
    """
    Human confirms the partner has signed.
    Sets status → signed, prospect stage → activation_ota.
    """
    contract = await _get_contract_or_404(contract_id, svc, db)
    prospect = await _get_prospect_or_404(contract.prospect_id, db)
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
):
    """
    Human marks the partner as declined.
    Sets status → declined, prospect stage → negociation.
    """
    contract = await _get_contract_or_404(contract_id, svc, db)
    prospect = await _get_prospect_or_404(contract.prospect_id, db)
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
):
    """DEV ONLY — inject a realistic mock partner reply mentioning a signed PDF."""
    from app.config import settings as _settings
    if _settings.ENV == "production":
        raise HTTPException(status_code=403, detail="Not available in production.")

    contract = await _get_contract_or_404(contract_id, svc, db)
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
):
    """
    DEV ONLY — simulate partner signing the contract.
    Skips the sent_to_partner requirement for rapid testing.
    """
    from app.config import settings as _settings
    if _settings.ENV == "production":
        raise HTTPException(status_code=403, detail="Not available in production.")

    contract = await _get_contract_or_404(contract_id, svc, db)
    prospect = await _get_prospect_or_404(contract.prospect_id, db)

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
