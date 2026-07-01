import logging
import uuid
from typing import Optional, Protocol

import resend

from app.config import settings

logger = logging.getLogger(__name__)


class EmailTransportProtocol(Protocol):
    async def send(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        reply_to: str,
        attachments: Optional[list[dict]] = None,
    ) -> str:
        """Send an email, return a provider message id (mock or real)."""
        ...


class MockEmailTransport:
    async def send(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        reply_to: str,
        attachments: Optional[list[dict]] = None,
    ) -> str:
        logger.info(
            "[MOCK EMAIL SENT] → %s | %s | reply_to=%s%s",
            to,
            subject,
            reply_to,
            f" | {len(attachments)} attachment(s)" if attachments else "",
        )
        return f"mock-{uuid.uuid4()}"


class ResendEmailTransport:
    async def send(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        reply_to: str,
        attachments: Optional[list[dict]] = None,
    ) -> str:
        params: dict = {
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
            "reply_to": reply_to,
        }
        if attachments:
            params["attachments"] = attachments
        result = resend.Emails.send(params)
        return result["id"]


def get_email_transport() -> EmailTransportProtocol:
    if settings.RESEND_API_KEY:
        resend.api_key = settings.RESEND_API_KEY
        return ResendEmailTransport()
    return MockEmailTransport()
