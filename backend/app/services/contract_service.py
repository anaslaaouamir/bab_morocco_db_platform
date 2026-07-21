"""
Contract service — orchestrates the full contract lifecycle:
  draft → generated → sent_to_partner → signed | declined

Business rules enforced (CLAUDE.md §9 / system_prompt_v2.md):
  - Commission below absolute floor → human_review_required = True, PDF blocked
  - Estimated annual value > $50,000 → human_review_required = True, PDF blocked
  - Exclusivity detected → must be flagged by negotiation service (not handled here)
"""

import base64
import io
import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from pypdf import PdfReader
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.contract import Contract
from app.models.negotiation import NegotiationMessage
from app.models.prospect import Prospect
from app.schemas.contract import ContractClauses, ContractResponse, PartnerReplySubmit
from app.services.contract_generator import (
    COMMISSION_FLOORS,
    ContractGeneratorProtocol,
    MockContractGenerator,
)
from app.services.email_transport import EmailTransportProtocol, MockEmailTransport
from app.services.pdf_generator import generate_contract_pdf
from app.services.yousign_client import MockYousignClient, YousignClientProtocol

logger = logging.getLogger(__name__)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _build_floor_warning(commission: float, partner_type: str) -> Optional[str]:
    """Return a warning string if commission is below the floor, None otherwise."""
    floor = COMMISSION_FLOORS.get(partner_type, 8.0)
    if commission < floor:
        return (
            f"Commission {commission}% est inférieure au plancher de "
            f"{floor}% pour le type « {partner_type} » (CLAUDE.md §3)"
        )
    return None


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
        has_reply_pdf=contract.partner_reply_pdf is not None,
        partner_reply_pdf_filename=contract.partner_reply_pdf_filename,
        opened_at=contract.opened_at,
        sent_at=contract.sent_at,
        signed_at=contract.signed_at,
        declined_at=contract.declined_at,
        created_at=contract.created_at,
        updated_at=contract.updated_at,
        signing_method="yousign" if contract.yousign_signature_request_id else "manual",
        yousign_signature_request_id=contract.yousign_signature_request_id,
        yousign_signer_bab_done=contract.yousign_signer_bab_done,
        has_signed_pdf=contract.signed_pdf_bytes is not None,
    )


# ─── Service ─────────────────────────────────────────────────────────────────

class ContractService:
    def __init__(
        self,
        generator: Optional[ContractGeneratorProtocol] = None,
        sender: Optional[EmailTransportProtocol] = None,
        yousign: Optional[YousignClientProtocol] = None,
    ) -> None:
        self._generator = generator or MockContractGenerator()
        self._sender = sender or MockEmailTransport()
        self._yousign = yousign or MockYousignClient()

    # ── Create ────────────────────────────────────────────────────────────────

    async def _resolve_commission(self, db: AsyncSession, prospect: Prospect) -> float:
        """Pick the best commission rate: last inbound taux_demande > prospect.commission_standard."""
        result = await db.execute(
            select(NegotiationMessage)
            .where(
                NegotiationMessage.prospect_id == prospect.id,
                NegotiationMessage.direction == "inbound",
                NegotiationMessage.taux_demande.isnot(None),
            )
            .order_by(NegotiationMessage.date_message.desc())
            .limit(1)
        )
        last_inbound = result.scalars().first()
        if last_inbound and last_inbound.taux_demande is not None:
            return last_inbound.taux_demande
        return prospect.commission_standard

    async def create_from_prospect(
        self,
        db: AsyncSession,
        prospect: Prospect,
    ) -> Contract:
        """
        Create a draft contract for the given prospect.
        Idempotent: returns the existing contract if one already exists.
        """
        commission = await self._resolve_commission(db, prospect)
        warning = _build_floor_warning(commission, prospect.type)

        existing = await self._get_by_prospect(db, prospect.id)
        if existing:
            if existing.status != "declined":
                return existing
            existing.status = "draft"
            existing.clauses_json = None
            existing.pdf_bytes = None
            existing.partner_reply = None
            existing.partner_replied_at = None
            existing.sent_at = None
            existing.signed_at = None
            existing.declined_at = None
            existing.resend_email_id = None
            existing.opened_at = None
            existing.yousign_signature_request_id = None
            existing.yousign_document_id = None
            existing.yousign_signer_bab_id = None
            existing.yousign_signer_partner_id = None
            existing.yousign_signer_bab_done = False
            existing.signed_pdf_bytes = None
            existing.human_review_required = False
            existing.human_review_reason = warning
            existing.commission = commission
            existing.estimated_annual_value = None
            existing.updated_at = datetime.utcnow()
            await db.commit()
            await db.refresh(existing)
            logger.info("[CONTRACT] Declined contract reset to draft — prospect=%s", prospect.id)
            return existing

        contract = Contract(
            id=uuid.uuid4(),
            prospect_id=prospect.id,
            status="draft",
            partner_name=prospect.nom,
            partner_type=prospect.type,
            partner_email=prospect.email_contact,
            country=prospect.pays,
            language=prospect.langue,
            commission=commission,
            estimated_annual_value=None,
            human_review_required=False,
            human_review_reason=warning,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(contract)
        await db.commit()
        await db.refresh(contract)

        if warning:
            logger.warning(
                "[CONTRACT] Commission below floor for prospect=%s | %s",
                prospect.id, warning,
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
        if contract.status not in ("draft", "generated"):
            raise ValueError(f"Cannot generate PDF for contract in status '{contract.status}'")

        # Build compact negotiation summary (last 4 messages, ~100 words each)
        neg_result = await db.execute(
            select(NegotiationMessage)
            .where(NegotiationMessage.prospect_id == prospect.id)
            .order_by(NegotiationMessage.date_message.desc())
            .limit(4)
        )
        neg_msgs = list(reversed(neg_result.scalars().all()))
        negotiation_summary = ""
        if neg_msgs:
            lines = []
            for m in neg_msgs:
                role = "Partner" if m.direction == "inbound" else "Bab Morocco"
                body = (m.corps or "")[:300]
                lines.append(f"[{role}]: {body}")
            negotiation_summary = "\n".join(lines)

        # Generate clause text
        try:
            clauses = await self._generator.generate_clauses(prospect, negotiation_summary)
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
            commission=contract.commission,
            clauses=clauses,
            signing_method="manual" if isinstance(self._yousign, MockYousignClient) else "yousign",
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
        Send the contract for signature: via Yousign e-signature when
        YOUSIGN_API_KEY is set (see get_yousign_client()), otherwise via the
        original Resend email-with-attachment flow (mock fallback when
        RESEND_API_KEY is unset — see get_email_transport()).
        """
        if contract.status != "generated":
            raise ValueError(f"Contract must be in 'generated' status to send (current: {contract.status})")
        if contract.pdf_bytes is None:
            raise ValueError("PDF must be generated before sending")

        filename = f"contrat_{contract.partner_name.replace(' ', '_')}.pdf"

        if not isinstance(self._yousign, MockYousignClient):
            if not contract.partner_email:
                raise ValueError("Partner email is required to send via Yousign")

            # The signature block is the PDF's last page (see pdf_generator.py's
            # PageBreak before "SIGNATURES") — Yousign fields need that page
            # number explicitly, it doesn't accept a "last page" sentinel.
            last_page = len(PdfReader(io.BytesIO(contract.pdf_bytes)).pages)

            result = await self._yousign.create_and_send(
                pdf_bytes=contract.pdf_bytes,
                filename=filename,
                request_name=f"Contrat Partenariat — {contract.partner_name}",
                bab_email=settings.YOUSIGN_SIGNER_EMAIL,
                bab_first_name=settings.YOUSIGN_SIGNER_FIRST_NAME,
                bab_last_name=settings.YOUSIGN_SIGNER_LAST_NAME,
                partner_name=contract.partner_name,
                partner_email=contract.partner_email,
                partner_language=contract.language,
                page=last_page,
            )
            contract.yousign_signature_request_id = result.signature_request_id
            contract.yousign_document_id = result.document_id
            contract.yousign_signer_bab_id = result.signer_bab_id
            contract.yousign_signer_partner_id = result.signer_partner_id
        else:
            body_html = (
                f"Bonjour,<br><br>"
                f"Veuillez trouver ci-joint le contrat de partenariat Bab Morocco pour "
                f"{contract.partner_name}, avec une commission de {contract.commission:.1f}%.<br><br>"
                f"Merci de nous répondre par retour d'email avec votre décision (accord et signature, "
                f"ou questions complémentaires).<br><br>"
                f"Cordialement,<br>L'équipe Bab Morocco"
            )
            email_id = await self._sender.send(
                to=contract.partner_email,
                subject=f"Contrat de partenariat Bab Morocco — {contract.partner_name}",
                html=body_html,
                reply_to=f"contract-{contract.id}@{settings.RESEND_INBOUND_DOMAIN}",
                attachments=[{"filename": filename, "content": base64.b64encode(contract.pdf_bytes).decode()}],
            )
            contract.resend_email_id = email_id

        contract.status = "sent_to_partner"
        contract.sent_at = datetime.utcnow()
        contract.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(contract)
        return contract

    async def fetch_yousign_signed_pdf(self, contract: Contract) -> bytes:
        """Download the eIDAS-certified PDF from Yousign once both parties have signed."""
        return await self._yousign.download_signed_pdf(
            contract.yousign_signature_request_id, contract.yousign_document_id
        )

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

        if contract.partner_reply:
            db.add(NegotiationMessage(
                prospect_id=prospect.id,
                direction="inbound",
                corps=contract.partner_reply,
            ))

        await db.commit()
        await db.refresh(contract)

        logger.info("[CONTRACT] Declined — prospect=%s returned to negociation", prospect.id)
        return contract

    async def submit_reply(
        self,
        db: AsyncSession,
        contract: Contract,
        reply_text: str,
        reply_pdf_bytes: Optional[bytes] = None,
        reply_pdf_filename: Optional[str] = None,
    ) -> Contract:
        """
        Record the partner's email reply in the platform.
        Must be in sent_to_partner status. Does not change status — user still
        decides whether to mark signed or declined after reading the reply.

        reply_pdf_bytes/reply_pdf_filename are only ever passed by the real
        Resend inbound webhook (when the partner's reply had a PDF attached) —
        the manual "paste reply text" path and the dev simulate-reply path
        never set them. Storing the file is purely so a human can view it
        in-app; it never influences signed/declined (CLAUDE.md §9).
        """
        if contract.status != "sent_to_partner":
            raise ValueError(f"Cannot submit reply for contract in status '{contract.status}'")

        contract.partner_reply = reply_text.strip()
        contract.partner_replied_at = datetime.utcnow()
        if reply_pdf_bytes is not None:
            contract.partner_reply_pdf = reply_pdf_bytes
            contract.partner_reply_pdf_filename = reply_pdf_filename
        contract.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(contract)

        logger.info(
            "[CONTRACT] Partner reply recorded — contract=%s%s",
            contract.id,
            f" | pdf={reply_pdf_filename} ({len(reply_pdf_bytes)} bytes)" if reply_pdf_bytes else "",
        )
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

    # ── Update commission ──────────────────────────────────────────────────────

    async def update_commission(
        self,
        db: AsyncSession,
        contract: Contract,
        commission: float,
    ) -> Contract:
        """Update contract commission. Recalculates floor warning."""
        if contract.status not in ("draft", "generated"):
            raise ValueError(f"Cannot update commission for contract in status '{contract.status}'")

        contract.commission = commission
        warning = _build_floor_warning(commission, contract.partner_type)
        contract.human_review_reason = warning
        contract.human_review_required = False
        contract.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(contract)

        logger.info(
            "[CONTRACT] Commission updated to %s%% for contract=%s%s",
            commission, contract.id, f" | warning: {warning}" if warning else "",
        )
        return contract

    # ── Queries ───────────────────────────────────────────────────────────────

    async def list_contracts(
        self,
        db: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        assigned_to: Optional[uuid.UUID] = None,
    ) -> tuple[list[ContractResponse], int]:
        stmt = select(Contract)
        if assigned_to is not None:
            stmt = stmt.join(Prospect, Prospect.id == Contract.prospect_id).where(
                Prospect.assigned_to == assigned_to
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await db.execute(count_stmt)).scalar_one()

        offset = (page - 1) * page_size
        stmt = stmt.order_by(Contract.created_at.desc()).offset(offset).limit(page_size)
        result = await db.execute(stmt)
        items = [_contract_to_response(c) for c in result.scalars().all()]
        return items, total

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

    async def get_signed_pdf_bytes(self, db: AsyncSession, contract_id: uuid.UUID) -> Optional[bytes]:
        contract = await db.get(Contract, contract_id)
        return contract.signed_pdf_bytes if contract else None
