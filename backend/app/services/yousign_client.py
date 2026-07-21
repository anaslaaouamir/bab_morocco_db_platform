import logging
import uuid
from dataclasses import dataclass
from typing import Optional, Protocol

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

SANDBOX_BASE_URL = "https://api-sandbox.yousign.app/v3"
PRODUCTION_BASE_URL = "https://api.yousign.app/v3"


@dataclass
class YousignResult:
    signature_request_id: str
    document_id: str
    signer_bab_id: str
    signer_partner_id: str


class YousignClientProtocol(Protocol):
    async def create_and_send(
        self,
        *,
        pdf_bytes: bytes,
        filename: str,
        request_name: str,
        bab_email: str,
        bab_first_name: str,
        bab_last_name: str,
        partner_name: str,
        partner_email: str,
        partner_language: str,
    ) -> YousignResult:
        """Upload the PDF, add both signers (ordered), activate the request."""
        ...

    async def download_signed_pdf(self, signature_request_id: str, document_id: str) -> bytes:
        """Download the eIDAS-certified signed PDF once signing is complete."""
        ...


class MockYousignClient:
    async def create_and_send(
        self,
        *,
        pdf_bytes: bytes,
        filename: str,
        request_name: str,
        bab_email: str,
        bab_first_name: str,
        bab_last_name: str,
        partner_name: str,
        partner_email: str,
        partner_language: str,
    ) -> YousignResult:
        result = YousignResult(
            signature_request_id=f"mock-sr-{uuid.uuid4()}",
            document_id=f"mock-doc-{uuid.uuid4()}",
            signer_bab_id=f"mock-signer-{uuid.uuid4()}",
            signer_partner_id=f"mock-signer-{uuid.uuid4()}",
        )
        logger.info(
            "[MOCK YOUSIGN] Signature request created → %s | doc=%s (%d bytes) | "
            "signer1=%s <%s> | signer2=%s <%s>",
            result.signature_request_id,
            filename,
            len(pdf_bytes),
            f"{bab_first_name} {bab_last_name}",
            bab_email,
            partner_name,
            partner_email,
        )
        return result

    async def download_signed_pdf(self, signature_request_id: str, document_id: str) -> bytes:
        logger.info(
            "[MOCK YOUSIGN] Download signed PDF → signature_request=%s document=%s",
            signature_request_id,
            document_id,
        )
        return b"%PDF-1.4 mock signed pdf"


class RealYousignClient:
    def __init__(self) -> None:
        self._base_url = SANDBOX_BASE_URL if settings.YOUSIGN_SANDBOX else PRODUCTION_BASE_URL
        self._headers = {"Authorization": f"Bearer {settings.YOUSIGN_API_KEY}"}

    async def create_and_send(
        self,
        *,
        pdf_bytes: bytes,
        filename: str,
        request_name: str,
        bab_email: str,
        bab_first_name: str,
        bab_last_name: str,
        partner_name: str,
        partner_email: str,
        partner_language: str,
    ) -> YousignResult:
        async with httpx.AsyncClient(base_url=self._base_url, headers=self._headers, timeout=30.0) as client:
            # Step 1 — create the signature request (ordered: Bab Morocco signs first)
            sr_resp = await client.post(
                "/signature_requests",
                json={
                    "name": request_name,
                    "delivery_mode": "email",
                    "ordered_signers": True,
                },
            )
            sr_resp.raise_for_status()
            signature_request_id = sr_resp.json()["id"]

            # Step 2 — upload the PDF
            doc_resp = await client.post(
                f"/signature_requests/{signature_request_id}/documents",
                files={"file": (filename, pdf_bytes, "application/pdf")},
                data={"nature": "signable_document"},
            )
            doc_resp.raise_for_status()
            document_id = doc_resp.json()["id"]

            # Step 3 — add signer 1: Bab Morocco (signs first)
            partner_first_name, _, partner_last_name = partner_name.partition(" ")
            signer1_resp = await client.post(
                f"/signature_requests/{signature_request_id}/signers",
                json={
                    "info": {
                        "first_name": bab_first_name,
                        "last_name": bab_last_name,
                        "email": bab_email,
                        "locale": "fr",
                    },
                    "signature_level": "electronic_signature",
                    "signature_authentication_mode": "no_otp",
                    "fields": [
                        {
                            "document_id": document_id,
                            "type": "signature",
                            "page": -1,
                            "x": 70,
                            "y": 600,
                            "width": 180,
                            "height": 60,
                        }
                    ],
                },
            )
            signer1_resp.raise_for_status()
            signer_bab_id = signer1_resp.json()["id"]

            # Step 4 — add signer 2: partner (signs second, invited only after signer 1)
            signer2_resp = await client.post(
                f"/signature_requests/{signature_request_id}/signers",
                json={
                    "info": {
                        "first_name": partner_first_name or partner_name,
                        "last_name": partner_last_name or "",
                        "email": partner_email,
                        "locale": partner_language,
                    },
                    "signature_level": "electronic_signature",
                    "signature_authentication_mode": "no_otp",
                    "fields": [
                        {
                            "document_id": document_id,
                            "type": "signature",
                            "page": -1,
                            "x": 370,
                            "y": 600,
                            "width": 180,
                            "height": 60,
                        }
                    ],
                },
            )
            signer2_resp.raise_for_status()
            signer_partner_id = signer2_resp.json()["id"]

            # Step 5 — activate (sends the invitation to signer 1)
            activate_resp = await client.post(f"/signature_requests/{signature_request_id}/activate")
            activate_resp.raise_for_status()

        return YousignResult(
            signature_request_id=signature_request_id,
            document_id=document_id,
            signer_bab_id=signer_bab_id,
            signer_partner_id=signer_partner_id,
        )

    async def download_signed_pdf(self, signature_request_id: str, document_id: str) -> bytes:
        async with httpx.AsyncClient(base_url=self._base_url, headers=self._headers, timeout=30.0) as client:
            resp = await client.get(
                f"/signature_requests/{signature_request_id}/documents/{document_id}/download"
            )
            resp.raise_for_status()
            return resp.content


def get_yousign_client() -> YousignClientProtocol:
    if settings.YOUSIGN_API_KEY:
        return RealYousignClient()
    return MockYousignClient()
