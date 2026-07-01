import json
import logging
import uuid
from typing import Annotated

import resend
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.models.prospect import Prospect
from app.services.negotiation_generator import NegotiationGeneratorProtocol, get_negotiation_generator
from app.services.negotiation_service import NegotiationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _get_negotiation_service(
    generator: Annotated[NegotiationGeneratorProtocol, Depends(get_negotiation_generator)],
) -> NegotiationService:
    return NegotiationService(generator=generator)


@router.post("/resend/inbound", status_code=status.HTTP_200_OK)
async def resend_inbound(
    request: Request,
    db: AsyncSession = Depends(get_session),
    negotiation_svc: NegotiationService = Depends(_get_negotiation_service),
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
    if event.get("type") != "email.received":
        return {"status": "ignored", "reason": f"unhandled event type {event.get('type')}"}

    data = event.get("data", {})
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
    body_text = received.get("text") or received.get("html") or ""

    if prefix == "outreach":
        await _handle_outreach_reply(db, negotiation_svc, entity_id, body_text)
    else:
        logger.info("Resend inbound webhook: no handler yet for prefix '%s'", prefix)

    return {"status": "processed"}


async def _handle_outreach_reply(
    db: AsyncSession, negotiation_svc: NegotiationService, prospect_id_str: str, body_text: str
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

    await negotiation_svc.submit_message(db, prospect, body_text)
