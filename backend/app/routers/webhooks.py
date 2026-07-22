import asyncio
import hashlib
import hmac
import json
import logging
import re
import uuid
from datetime import datetime
from typing import Annotated, Optional

import httpx
import resend
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.models.contract import Contract
from app.models.negotiation import NegotiationMessage
from app.models.outreach import OutreachEmail
from app.models.prospect import Prospect
from app.services.contract_service import ContractService
from app.services.negotiation_generator import NegotiationGeneratorProtocol, get_negotiation_generator
from app.services.negotiation_service import NegotiationService
from app.services.notification_bus import notification_bus
from app.services.yousign_client import YousignClientProtocol, get_yousign_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Matches the "On <date>, <name> wrote:" header line email clients prepend to a
# quoted thread (plus the common FR/ES/DE/AR equivalents). Everything from this
# line onward — or from the first ">"-quoted line, whichever comes first — is
# the quoted history and is dropped so only the partner's new text is analyzed,
# matching what the mock reply flow (simulate-reply) always produced.
_QUOTE_HEADER_RE = re.compile(
    r"^(On .+ wrote:|Le .+ a écrit\s*:|El .+ escribió:|Am .+ schrieb.*:|في .+ كتب:)\s*$",
    re.IGNORECASE,
)


def strip_quoted_reply(text: str) -> str:
    """Cut off the quoted-history tail of a plain-text email reply."""
    lines = text.splitlines()
    cutoff = len(lines)
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith(">") or _QUOTE_HEADER_RE.match(stripped):
            cutoff = i
            break
    return "\n".join(lines[:cutoff]).strip()


def _get_negotiation_service(
    generator: Annotated[NegotiationGeneratorProtocol, Depends(get_negotiation_generator)],
) -> NegotiationService:
    return NegotiationService(generator=generator)


def _get_contract_service(
    yousign: Annotated[YousignClientProtocol, Depends(get_yousign_client)],
) -> ContractService:
    # submit_reply()/mark_signed()/mark_declined() don't need the clause
    # generator or email sender — only the Yousign client, for downloading
    # the signed PDF in _handle_yousign_event().
    return ContractService(yousign=yousign)


@router.post("/resend/inbound", status_code=status.HTTP_200_OK)
async def resend_inbound(
    request: Request,
    db: AsyncSession = Depends(get_session),
    negotiation_svc: NegotiationService = Depends(_get_negotiation_service),
    contract_svc: ContractService = Depends(_get_contract_service),
):
    """
    Single entry point for all inbound Resend email events. Verifies the Svix
    signature, then dispatches to the correct handler by parsing the local-part
    prefix of the 'to' address (outreach-<id> / negotiation-<id> / contract-<id>).
    """
    raw_body = await request.body()
    payload_str = raw_body.decode("utf-8")

    try:
        resend.Webhooks.verify(
            {
                "payload": payload_str,
                "headers": {
                    "id": request.headers.get("svix-id", ""),
                    "timestamp": request.headers.get("svix-timestamp", ""),
                    "signature": request.headers.get("svix-signature", ""),
                },
                "webhook_secret": settings.RESEND_WEBHOOK_SECRET,
            }
        )
    except ValueError as exc:
        logger.warning("Resend webhook signature verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event = json.loads(payload_str)
    event_type = event.get("type")
    data = event.get("data", {})

    if event_type == "email.opened":
        await _handle_email_opened(db, data.get("email_id"))
        return {"status": "processed"}

    if event_type in ("email.bounced", "email.complained"):
        await _handle_email_bounced(db, data.get("email_id"))
        return {"status": "processed"}

    if event_type != "email.received":
        return {"status": "ignored", "reason": f"unhandled event type {event_type}"}

    email_id = data.get("email_id")
    to_addresses = data.get("to") or []
    if not email_id or not to_addresses:
        logger.warning("Resend inbound webhook missing email_id or to address: %s", data)
        return {"status": "ignored", "reason": "missing email_id or to"}

    to_local_part = to_addresses[0].split("@", 1)[0]
    if "-" not in to_local_part:
        logger.warning("Resend inbound webhook: unrecognized to address format: %s", to_addresses[0])
        return {"status": "ignored", "reason": "unrecognized address format"}
    prefix, entity_id = to_local_part.split("-", 1)

    received = resend.Emails.Receiving.get(email_id)
    raw_body_text = received.get("text") or received.get("html") or ""
    body_text = strip_quoted_reply(raw_body_text)
    email_message_id = received.get("message_id")
    email_subject = received.get("subject") or data.get("subject")

    if prefix == "outreach":
        await _handle_outreach_reply(db, negotiation_svc, entity_id, body_text, email_message_id, email_subject)
    elif prefix == "negotiation":
        await _handle_negotiation_reply(db, negotiation_svc, entity_id, body_text, email_message_id, email_subject)
    elif prefix == "contract":
        attachments = received.get("attachments") or []
        await _handle_contract_reply(db, contract_svc, entity_id, body_text, email_id, attachments)
    else:
        logger.info("Resend inbound webhook: no handler yet for prefix '%s'", prefix)

    return {"status": "processed"}


@router.post("/yousign", status_code=status.HTTP_200_OK)
async def yousign_webhook(
    request: Request,
    db: AsyncSession = Depends(get_session),
    contract_svc: ContractService = Depends(_get_contract_service),
):
    """
    Single entry point for all Yousign signature request events. Verifies the
    HMAC-SHA256 signature, then dispatches by event_name. Never blocks on a
    missing/unknown contract — Yousign retries on non-2xx, so unmatched events
    are logged and acknowledged rather than erroring.
    """
    raw_body = await request.body()

    signature_header = request.headers.get("x-yousign-signature-256", "")
    expected = "sha256=" + hmac.new(
        settings.YOUSIGN_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(signature_header, expected):
        logger.warning("Yousign webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event = json.loads(raw_body.decode("utf-8"))
    event_name = event.get("event_name")
    data = event.get("data", {})
    signature_request = data.get("signature_request", {})
    signature_request_id = signature_request.get("id")

    if not signature_request_id:
        logger.warning("Yousign webhook: missing signature_request id in payload (event=%s)", event_name)
        return {"status": "ignored", "reason": "missing signature_request id"}

    contract = (
        await db.execute(
            select(Contract).where(Contract.yousign_signature_request_id == signature_request_id)
        )
    ).scalars().first()
    if not contract:
        logger.warning(
            "Yousign webhook: no contract found for signature_request=%s (event=%s)",
            signature_request_id, event_name,
        )
        return {"status": "ignored", "reason": "contract not found"}

    prospect = await db.get(Prospect, contract.prospect_id)

    if event_name == "signature_request.done":
        await _handle_yousign_done(db, contract_svc, contract, prospect)
    elif event_name == "signature_request.declined":
        await _handle_yousign_declined(db, contract_svc, contract, prospect, signature_request)
    elif event_name == "signer.done":
        await _handle_yousign_signer_done(db, contract, prospect, data.get("signer", {}))
    elif event_name == "signature_request.expired":
        await _handle_yousign_expired(contract, prospect)
    else:
        logger.info("Yousign webhook: no handler for event_name '%s'", event_name)

    return {"status": "processed"}


async def _handle_yousign_done(
    db: AsyncSession, contract_svc: ContractService, contract: Contract, prospect: Optional[Prospect]
) -> None:
    """Both signers completed — download the certified PDF and mark the contract signed."""
    if not prospect:
        logger.warning("Yousign webhook: prospect %s not found for contract %s", contract.prospect_id, contract.id)
        return
    if contract.status != "sent_to_partner":
        logger.info(
            "Yousign webhook: contract %s not in 'sent_to_partner' status (current: %s) — skipping",
            contract.id, contract.status,
        )
        return

    try:
        signed_pdf = await contract_svc.fetch_yousign_signed_pdf(contract)
        contract.signed_pdf_bytes = signed_pdf
        await db.commit()
    except Exception:
        logger.exception(
            "Yousign webhook: failed to download signed PDF for contract %s — "
            "marking signed anyway, PDF can be retrieved later from Yousign",
            contract.id,
        )

    await contract_svc.mark_signed(db, contract, prospect)
    notification_bus.publish(
        {
            "type": "contract_signed",
            "contract_id": str(contract.id),
            "prospect_id": str(prospect.id),
            "prospect_nom": prospect.nom,
        },
        prospect.assigned_to,
    )


async def _handle_yousign_declined(
    db: AsyncSession,
    contract_svc: ContractService,
    contract: Contract,
    prospect: Optional[Prospect],
    signature_request: dict,
) -> None:
    """A signer declined — record the reason (if provided) and mark the contract declined."""
    if not prospect:
        logger.warning("Yousign webhook: prospect %s not found for contract %s", contract.prospect_id, contract.id)
        return
    if contract.status != "sent_to_partner":
        logger.info(
            "Yousign webhook: contract %s not in 'sent_to_partner' status (current: %s) — skipping",
            contract.id, contract.status,
        )
        return

    reason = signature_request.get("decline_reason") or signature_request.get("comment")
    if reason:
        contract.partner_reply = reason
        contract.partner_replied_at = datetime.utcnow()
        await db.commit()

    await contract_svc.mark_declined(db, contract, prospect)
    notification_bus.publish(
        {
            "type": "contract_declined",
            "contract_id": str(contract.id),
            "prospect_id": str(prospect.id),
            "prospect_nom": prospect.nom,
        },
        prospect.assigned_to,
    )


async def _handle_yousign_signer_done(
    db: AsyncSession, contract: Contract, prospect: Optional[Prospect], signer: dict
) -> None:
    """A single signer completed. If it's Bab Morocco (signer 1), flag it —
    Yousign automatically emails the partner next since ordered_signers=True."""
    signer_id = signer.get("id")
    if signer_id and signer_id == contract.yousign_signer_bab_id and not contract.yousign_signer_bab_done:
        contract.yousign_signer_bab_done = True
        await db.commit()
        if prospect:
            notification_bus.publish(
                {
                    "type": "contract_bab_signed",
                    "contract_id": str(contract.id),
                    "prospect_id": str(prospect.id),
                    "prospect_nom": prospect.nom,
                },
                prospect.assigned_to,
            )


async def _handle_yousign_expired(contract: Contract, prospect: Optional[Prospect]) -> None:
    """Signing deadline passed without completion — notify only, no status change
    (CLAUDE.md §9: leave the signed/declined decision to a human)."""
    logger.info("Yousign webhook: signature_request expired for contract %s", contract.id)
    if prospect:
        notification_bus.publish(
            {
                "type": "contract_signature_expired",
                "contract_id": str(contract.id),
                "prospect_id": str(prospect.id),
                "prospect_nom": prospect.nom,
            },
            prospect.assigned_to,
        )


async def _handle_email_opened(db: AsyncSession, email_id: str | None) -> None:
    """A partner opened a real Resend email — match it back to whichever row
    sent it (an outbound NegotiationMessage, a Contract's send_to_partner
    email, or an OutreachEmail) by the id stored at send time, and stamp the
    first-open timestamp. Never used to decide signed/declined or anything
    else — informational only."""
    if not email_id:
        return

    msg = (
        await db.execute(
            select(NegotiationMessage).where(NegotiationMessage.resend_email_id == email_id)
        )
    ).scalars().first()
    if msg:
        if msg.opened_at is None:
            msg.opened_at = datetime.utcnow()
            await db.commit()
            prospect = await db.get(Prospect, msg.prospect_id)
            if prospect:
                notification_bus.publish(
                    {
                        "type": "email_opened",
                        "context": "negotiation",
                        "prospect_id": str(prospect.id),
                        "prospect_nom": prospect.nom,
                    },
                    prospect.assigned_to,
                )
        return

    contract = (
        await db.execute(select(Contract).where(Contract.resend_email_id == email_id))
    ).scalars().first()
    if contract:
        if contract.opened_at is None:
            contract.opened_at = datetime.utcnow()
            await db.commit()
            prospect = await db.get(Prospect, contract.prospect_id)
            if prospect:
                notification_bus.publish(
                    {
                        "type": "email_opened",
                        "context": "contract",
                        "contract_id": str(contract.id),
                        "prospect_id": str(prospect.id),
                        "prospect_nom": prospect.nom,
                    },
                    prospect.assigned_to,
                )
        return

    outreach_email = (
        await db.execute(select(OutreachEmail).where(OutreachEmail.resend_email_id == email_id))
    ).scalars().first()
    if outreach_email:
        if outreach_email.opened_at is None:
            outreach_email.opened_at = datetime.utcnow()
            if outreach_email.statut == "sent":
                outreach_email.statut = "opened"
            await db.commit()
            prospect = await db.get(Prospect, outreach_email.prospect_id)
            if prospect:
                notification_bus.publish(
                    {
                        "type": "email_opened",
                        "context": "outreach",
                        "prospect_id": str(prospect.id),
                        "prospect_nom": prospect.nom,
                    },
                    prospect.assigned_to,
                )
        return

    logger.info("Resend inbound webhook: email.opened for unknown email_id '%s' — ignored", email_id)


async def _handle_email_bounced(db: AsyncSession, email_id: str | None) -> None:
    """A Resend delivery failed (bounce or spam complaint) — mark the prospect's
    email as bounced so the outreach UI warns the user and stops the sequence."""
    if not email_id:
        return

    outreach_email = (
        await db.execute(select(OutreachEmail).where(OutreachEmail.resend_email_id == email_id))
    ).scalars().first()
    if not outreach_email:
        logger.info("Resend bounce webhook: no outreach email found for email_id '%s' — ignored", email_id)
        return

    prospect = await db.get(Prospect, outreach_email.prospect_id)
    if not prospect:
        logger.warning("Resend bounce webhook: prospect %s not found for email_id '%s'", outreach_email.prospect_id, email_id)
        return

    if not prospect.email_bounced:
        prospect.email_bounced = True
        await db.commit()
        logger.info("Resend bounce webhook: marked prospect %s (%s) email as bounced", prospect.id, prospect.nom)
        notification_bus.publish(
            {
                "type": "email_bounced",
                "prospect_id": str(prospect.id),
                "prospect_nom": prospect.nom,
            },
            prospect.assigned_to,
        )


async def _handle_outreach_reply(
    db: AsyncSession,
    negotiation_svc: NegotiationService,
    prospect_id_str: str,
    body_text: str,
    email_message_id: str | None = None,
    email_subject: str | None = None,
) -> None:
    """Mirrors negotiation.py's simulate_reply: move prospect to negociation, run first analysis."""
    try:
        prospect_id = uuid.UUID(prospect_id_str)
    except ValueError:
        logger.warning("Resend inbound webhook: invalid prospect UUID '%s'", prospect_id_str)
        return

    prospect = await db.get(Prospect, prospect_id)
    if not prospect:
        logger.warning("Resend inbound webhook: prospect %s not found", prospect_id)
        return

    if prospect.stage != "outreach":
        logger.info(
            "Resend inbound webhook: prospect %s not in 'outreach' stage (current: %s) — skipping",
            prospect_id,
            prospect.stage,
        )
        return

    prospect.stage = "negociation"
    await db.commit()
    await db.refresh(prospect)

    await negotiation_svc.submit_message(
        db, prospect, body_text, email_message_id=email_message_id, email_subject=email_subject
    )
    notification_bus.publish(
        {"type": "outreach_reply", "prospect_id": str(prospect.id), "prospect_nom": prospect.nom},
        prospect.assigned_to,
    )


async def _fetch_first_pdf_attachment(
    email_id: str, attachments: list[dict]
) -> tuple[Optional[bytes], Optional[str]]:
    """
    Download the first application/pdf attachment on an inbound email, if any.

    Resend's inbound payload only carries attachment *metadata* (id, filename,
    content_type, size) — the actual bytes require a second call to get a
    short-lived signed download_url, then a plain HTTP GET on that URL. Both
    hops are wrapped so a slow/failing download never breaks reply capture —
    the reply text is always saved regardless of what happens here.
    """
    pdf_meta = next((a for a in attachments if a.get("content_type") == "application/pdf"), None)
    if not pdf_meta:
        return None, None
    if len([a for a in attachments if a.get("content_type") == "application/pdf"]) > 1:
        logger.warning(
            "Resend inbound webhook: email %s has multiple PDF attachments — keeping only '%s'",
            email_id,
            pdf_meta.get("filename"),
        )

    details = await asyncio.to_thread(
        resend.Emails.Receiving.Attachments.get, email_id, pdf_meta["id"]
    )
    download_url = details.get("download_url")
    if not download_url:
        logger.warning("Resend inbound webhook: no download_url for attachment %s", pdf_meta["id"])
        return None, None

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(download_url)
        resp.raise_for_status()
        return resp.content, pdf_meta.get("filename") or "reponse_partenaire.pdf"


async def _handle_contract_reply(
    db: AsyncSession,
    contract_svc: ContractService,
    contract_id_str: str,
    body_text: str,
    email_id: str,
    attachments: list[dict],
) -> None:
    """A reply to a sent contract: record the partner's reply text, and — if a
    PDF was attached (e.g. a signed copy) — store it too so it's viewable
    in-app. Never auto-decides signed/declined from this: that stays a human
    decision made via the 'Marquer comme signé/refusé' buttons (CLAUDE.md §9)."""
    try:
        contract_id = uuid.UUID(contract_id_str)
    except ValueError:
        logger.warning("Resend inbound webhook: invalid contract UUID '%s'", contract_id_str)
        return

    contract = await db.get(Contract, contract_id)
    if not contract:
        logger.warning("Resend inbound webhook: contract %s not found", contract_id)
        return

    if contract.status != "sent_to_partner":
        logger.info(
            "Resend inbound webhook: contract %s not in 'sent_to_partner' status (current: %s) — skipping",
            contract_id,
            contract.status,
        )
        return

    pdf_bytes: Optional[bytes] = None
    pdf_filename: Optional[str] = None
    if attachments:
        try:
            pdf_bytes, pdf_filename = await _fetch_first_pdf_attachment(email_id, attachments)
        except Exception:
            logger.exception(
                "Resend inbound webhook: failed to fetch PDF attachment for contract %s — "
                "reply text will still be recorded",
                contract_id,
            )

    await contract_svc.submit_reply(
        db, contract, body_text, reply_pdf_bytes=pdf_bytes, reply_pdf_filename=pdf_filename
    )
    prospect = await db.get(Prospect, contract.prospect_id)
    notification_bus.publish(
        {
            "type": "contract_reply",
            "contract_id": str(contract.id),
            "prospect_id": str(contract.prospect_id),
            "prospect_nom": prospect.nom if prospect else None,
        },
        prospect.assigned_to if prospect else None,
    )


async def _handle_negotiation_reply(
    db: AsyncSession,
    negotiation_svc: NegotiationService,
    prospect_id_str: str,
    body_text: str,
    email_message_id: str | None = None,
    email_subject: str | None = None,
) -> None:
    """A reply during an active negotiation: append to history + fresh AI analysis.
    No stage change — the prospect is already in 'negociation'."""
    try:
        prospect_id = uuid.UUID(prospect_id_str)
    except ValueError:
        logger.warning("Resend inbound webhook: invalid prospect UUID '%s'", prospect_id_str)
        return

    prospect = await db.get(Prospect, prospect_id)
    if not prospect:
        logger.warning("Resend inbound webhook: prospect %s not found", prospect_id)
        return

    if prospect.stage != "negociation":
        logger.info(
            "Resend inbound webhook: prospect %s not in 'negociation' stage (current: %s) — skipping",
            prospect_id,
            prospect.stage,
        )
        return

    await negotiation_svc.submit_message(
        db, prospect, body_text, email_message_id=email_message_id, email_subject=email_subject
    )
    notification_bus.publish(
        {"type": "negotiation_reply", "prospect_id": str(prospect.id), "prospect_nom": prospect.nom},
        prospect.assigned_to,
    )
