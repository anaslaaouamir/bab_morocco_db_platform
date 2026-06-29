"""
Contract service — orchestrates the full contract lifecycle:
  draft → generated → sent_to_partner → signed | declined

Business rules enforced (CLAUDE.md §9 / system_prompt_v2.md):
  - Commission below absolute floor → human_review_required = True, PDF blocked
  - Estimated annual value > $50,000 → human_review_required = True, PDF blocked
  - Exclusivity detected → must be flagged by negotiation service (not handled here)
"""

import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contract import Contract
from app.models.prospect import Prospect
from app.schemas.contract import ContractClauses, ContractResponse, PartnerReplySubmit
from app.services.contract_generator import (
    COMMISSION_FLOORS,
    ContractGeneratorProtocol,
    MockContractGenerator,
)
from app.services.pdf_generator import generate_contract_pdf

logger = logging.getLogger(__name__)

_ANNUAL_VALUE_THRESHOLD = 50_000.0  # USD (CLAUDE.md §9)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _check_human_review(prospect: Prospect, estimated_annual_value: Optional[float]) -> tuple[bool, Optional[str]]:
    """Return (required, reason) based on hard business rules from CLAUDE.md §9."""
    floor = COMMISSION_FLOORS.get(prospect.type, 8.0)

    if prospect.commission_standard < floor:
        return True, (
            f"Commission {prospect.commission_standard}% est inférieure au plancher absolu "
            f"de {floor}% pour le type « {prospect.type} » (CLAUDE.md §3)"
        )

    if estimated_annual_value is not None and estimated_annual_value > _ANNUAL_VALUE_THRESHOLD:
        return True, (
            f"Valeur annuelle estimée {estimated_annual_value:,.0f} $ dépasse le seuil "
            f"de {_ANNUAL_VALUE_THRESHOLD:,.0f} $ — validation commerciale requise (CLAUDE.md §9)"
        )

    return False, None


def _contract_to_response(contract: Contract) -> ContractResponse:
    clauses: Optional[ContractClauses] = None
    if contract.clauses_json:
        try:
            data = json.loads(contract.clauses_json)
            clauses = ContractClauses(**{k: data.get(k, "") for k in ContractClauses.model_fields})
        except Exception:
            pass

    return ContractResponse(
        id=contract.id,
        prospect_id=contract.prospect_id,
        status=contract.status,
        partner_name=contract.partner_name,
        partner_type=contract.partner_type,
        partner_email=contract.partner_email,
        country=contract.country,
        language=contract.language,
        commission=contract.commission,
        estimated_annual_value=contract.estimated_annual_value,
        clauses=clauses,
        has_pdf=contract.pdf_bytes is not None,
        human_review_required=contract.human_review_required,
        human_review_reason=contract.human_review_reason,
        partner_reply=contract.partner_reply,
        partner_replied_at=contract.partner_replied_at,
        sent_at=contract.sent_at,
        signed_at=contract.signed_at,
        declined_at=contract.declined_at,
        created_at=contract.created_at,
        updated_at=contract.updated_at,
    )


# ─── Service ─────────────────────────────────────────────────────────────────

class ContractService:
    def __init__(self, generator: Optional[ContractGeneratorProtocol] = None) -> None:
        self._generator = generator or MockContractGenerator()

    # ── Create ────────────────────────────────────────────────────────────────

    async def create_from_prospect(
        self,
        db: AsyncSession,
        prospect: Prospect,
        estimated_annual_value: Optional[float] = None,
    ) -> Contract:
        """
        Create a draft contract for the given prospect.
        Idempotent: returns the existing contract if one already exists.
        """
        existing = await self._get_by_prospect(db, prospect.id)
        if existing:
            if existing.status != "declined":
                return existing
            # Prospect renegotiated and closed again — reset declined contract to fresh draft
            existing.status = "draft"
            existing.clauses_json = None
            existing.pdf_bytes = None
            existing.partner_reply = None
            existing.partner_replied_at = None
            existing.sent_at = None
            existing.signed_at = None
            existing.declined_at = None
            requires_human, reason = _check_human_review(prospect, estimated_annual_value)
            existing.human_review_required = requires_human
            existing.human_review_reason = reason
            existing.commission = prospect.commission_standard
            existing.updated_at = datetime.utcnow()
            await db.commit()
            await db.refresh(existing)
            logger.info("[CONTRACT] Declined contract reset to draft — prospect=%s", prospect.id)
            return existing

        requires_human, reason = _check_human_review(prospect, estimated_annual_value)

        contract = Contract(
            id=uuid.uuid4(),
            prospect_id=prospect.id,
            status="draft",
            partner_name=prospect.nom,
            partner_type=prospect.type,
            partner_email=prospect.email_contact,
            country=prospect.pays,
            language=prospect.langue,
            commission=prospect.commission_standard,
            estimated_annual_value=estimated_annual_value,
            human_review_required=requires_human,
            human_review_reason=reason,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(contract)
        await db.commit()
        await db.refresh(contract)

        if requires_human:
            logger.warning(
                "[CONTRACT] human_review_required=True for prospect=%s | reason=%s",
                prospect.id, reason,
            )

        return contract

    # ── Generate PDF ──────────────────────────────────────────────────────────

    async def generate_pdf(
        self,
        db: AsyncSession,
        contract: Contract,
        prospect: Prospect,
        clause_overrides: dict[str, str] | None = None,
    ) -> Contract:
        """
        Generate contract clauses (via AI or mock) then render a real ReportLab PDF.
        Blocked if human_review_required is True.
        Optional clause_overrides: non-empty values replace the AI-generated text for that key.
        """
        if contract.human_review_required:
            raise PermissionError(
                f"Validation humaine requise avant génération PDF : {contract.human_review_reason}"
            )
        if contract.status not in ("draft", "generated"):
            raise ValueError(f"Cannot generate PDF for contract in status '{contract.status}'")

        # Generate clause text
        try:
            clauses = await self._generator.generate_clauses(prospect)
        except ValueError as exc:
            raise ValueError(f"Clause generation failed: {exc}") from exc

        # Merge user-provided overrides (non-blank values win over AI output)
        if clause_overrides:
            for key, text in clause_overrides.items():
                if text and text.strip():
                    clauses[key] = text.strip()

        # Render PDF
        pdf_bytes = generate_contract_pdf(
            partner_name=prospect.nom,
            partner_type=prospect.type,
            country=prospect.pays,
            language=prospect.langue,
            commission=prospect.commission_standard,
            clauses=clauses,
        )

        contract.clauses_json = json.dumps(clauses, ensure_ascii=False)
        contract.pdf_bytes = pdf_bytes
        contract.status = "generated"
        contract.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(contract)

        logger.info(
            "[CONTRACT] PDF generated for prospect=%s | size=%d bytes",
            prospect.id, len(pdf_bytes),
        )
        return contract

    # ── Send to partner ───────────────────────────────────────────────────────

    async def send_to_partner(self, db: AsyncSession, contract: Contract) -> Contract:
        """
        Send the contract PDF to the partner via email.
        Dev: logs the send action (mock). Prod: use Mailgun with PDF attachment.
        """
        if contract.status != "generated":
            raise ValueError(f"Contract must be in 'generated' status to send (current: {contract.status})")
        if contract.pdf_bytes is None:
            raise ValueError("PDF must be generated before sending")

        # Mock send — log only. In prod, replace with Mailgun API call.
        logger.info(
            "[MOCK EMAIL SENT] Contract PDF → %s | %s | commission=%.1f%%",
            contract.partner_email,
            contract.partner_name,
            contract.commission,
        )

        contract.status = "sent_to_partner"
        contract.sent_at = datetime.utcnow()
        contract.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(contract)
        return contract

    # ── Mark signed ───────────────────────────────────────────────────────────

    async def mark_signed(self, db: AsyncSession, contract: Contract, prospect: Prospect) -> Contract:
        """
        Mark contract as signed (user confirms partner signature).
        Automatically moves prospect to activation_ota stage.
        """
        if contract.status != "sent_to_partner":
            raise ValueError(f"Cannot mark signed from status '{contract.status}'")

        contract.status = "signed"
        contract.signed_at = datetime.utcnow()
        contract.updated_at = datetime.utcnow()

        prospect.stage = "activation_ota"
        prospect.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(contract)

        logger.info(
            "[CONTRACT] Signed — prospect=%s moved to activation_ota | [WEBHOOK_PLACEHOLDER] → babmorocco.com",
            prospect.id,
        )
        return contract

    # ── Mark declined ─────────────────────────────────────────────────────────

    async def mark_declined(self, db: AsyncSession, contract: Contract, prospect: Prospect) -> Contract:
        """
        Mark contract as declined by the partner.
        Moves prospect back to negociation stage for re-engagement.
        """
        if contract.status != "sent_to_partner":
            raise ValueError(f"Cannot mark declined from status '{contract.status}'")

        contract.status = "declined"
        contract.declined_at = datetime.utcnow()
        contract.updated_at = datetime.utcnow()

        prospect.stage = "negociation"
        prospect.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(contract)

        logger.info("[CONTRACT] Declined — prospect=%s returned to negociation", prospect.id)
        return contract

    async def submit_reply(self, db: AsyncSession, contract: Contract, reply_text: str) -> Contract:
        """
        Record the partner's email reply in the platform.
        Must be in sent_to_partner status. Does not change status — user still
        decides whether to mark signed or declined after reading the reply.
        """
        if contract.status != "sent_to_partner":
            raise ValueError(f"Cannot submit reply for contract in status '{contract.status}'")

        contract.partner_reply = reply_text.strip()
        contract.partner_replied_at = datetime.utcnow()
        contract.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(contract)

        logger.info("[CONTRACT] Partner reply recorded — contract=%s", contract.id)
        return contract

    async def simulate_partner_reply(self, db: AsyncSession, contract: Contract) -> Contract:
        """
        DEV ONLY — inject a realistic mock partner reply with a PDF mention.
        Calls submit_reply internally so all business rules apply.
        """
        mock_reply = (
            f"Bonjour,\n\n"
            f"Merci pour l'envoi du contrat de partenariat concernant notre collaboration avec Bab Morocco.\n\n"
            f"Après examen attentif des conditions proposées — notamment la commission de {contract.commission}% "
            f"et les contreparties non-financières — nous sommes heureux de confirmer notre accord.\n\n"
            f"Veuillez trouver en pièce jointe le contrat signé (PDF). "
            f"Notre équipe juridique a paraphé chaque page et apposé le cachet officiel en page de signature.\n\n"
            f"Nous sommes impatients de démarrer cette collaboration et d'être référencés sur babmorocco.com "
            f"dès le lancement.\n\n"
            f"Cordialement,\n"
            f"Direction commerciale — {contract.partner_name}"
        )
        return await self.submit_reply(db, contract, mock_reply)

    # ── Queries ───────────────────────────────────────────────────────────────

    async def list_contracts(self, db: AsyncSession) -> list[ContractResponse]:
        result = await db.execute(
            select(Contract).order_by(Contract.created_at.desc())
        )
        return [_contract_to_response(c) for c in result.scalars().all()]

    async def get_contract(self, db: AsyncSession, contract_id: uuid.UUID) -> Optional[Contract]:
        return await db.get(Contract, contract_id)

    async def get_response(self, contract: Contract) -> ContractResponse:
        return _contract_to_response(contract)

    async def _get_by_prospect(self, db: AsyncSession, prospect_id: uuid.UUID) -> Optional[Contract]:
        result = await db.execute(
            select(Contract).where(Contract.prospect_id == prospect_id)
        )
        return result.scalars().first()

    async def get_pdf_bytes(self, db: AsyncSession, contract_id: uuid.UUID) -> Optional[bytes]:
        contract = await db.get(Contract, contract_id)
        return contract.pdf_bytes if contract else None
