import logging
import re
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
    signer_bab_signature_link: str


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
        page: int,
    ) -> YousignResult:
        """Upload the PDF, add both signers (ordered), activate the request.

        `page` is the 1-indexed page number of the PDF's signature block
        (its last page — see pdf_generator.py's PageBreak before the
        signature section), needed because Yousign fields require a
        positive page number rather than a "last page" sentinel.
        """
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
        page: int,
    ) -> YousignResult:
        result = YousignResult(
            signature_request_id=f"mock-sr-{uuid.uuid4()}",
            document_id=f"mock-doc-{uuid.uuid4()}",
            signer_bab_id=f"mock-signer-{uuid.uuid4()}",
            signer_partner_id=f"mock-signer-{uuid.uuid4()}",
            signer_bab_signature_link="https://app.yousign.com/mock-signing-link",
        )
        logger.info(
            "[MOCK YOUSIGN] Signature request created → %s | doc=%s (%d bytes, page %d) | "
            "signer1=%s <%s> | signer2=%s <%s>",
            result.signature_request_id,
            filename,
            len(pdf_bytes),
            page,
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
        page: int,
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
            # Yousign only allows letters, spaces, hyphens, apostrophes in name fields.
            clean_name = re.sub(r"\s+", " ", re.sub(r"[^a-zA-ZÀ-ÿ\s\-']", "", partner_name)).strip()
            partner_first_name, _, partner_last_name = clean_name.partition(" ")
            # Field geometry targets the two-column signature block rendered
            # by pdf_generator.py (left = Bab Morocco, right = Partner), on
            # the PDF's last page (the PageBreak right before "SIGNATURES").
            # width/height must satisfy Yousign's enforced 2.3:1 ratio.
            # Coordinates are an initial estimate — verify visually against
            # a real sandbox document and adjust (see Section 7 of the plan).
            signer1_payload = {
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
                        "page": page,
                        "x": 100,
                        "y": 195,
                        "width": 170,
                        "height": 74,
                    },
                ],
            }
            signer1_resp = await client.post(
                f"/signature_requests/{signature_request_id}/signers",
                json=signer1_payload,
            )
            if signer1_resp.status_code >= 400:
                logger.error("Yousign signer1 error %s: %s | payload: %s",
                             signer1_resp.status_code, signer1_resp.text, signer1_payload)
            signer1_resp.raise_for_status()
            signer1_data = signer1_resp.json()
            signer_bab_id = signer1_data["id"]

            # Step 4 — add signer 2: partner (signs second, invited only after signer 1)
            signer2_payload = {
                "info": {
                    "first_name": partner_first_name or partner_name,
                    "last_name": partner_last_name or partner_name,
                    "email": partner_email,
                    "locale": partner_language,
                },
                "signature_level": "electronic_signature",
                "signature_authentication_mode": "no_otp",
                "fields": [
                    {
                        "document_id": document_id,
                        "type": "signature",
                        "page": page,
                        "x": 328,
                        "y": 195,
                        "width": 170,
                        "height": 74,
                    },
                ],
            }
            signer2_resp = await client.post(
                f"/signature_requests/{signature_request_id}/signers",
                json=signer2_payload,
            )
            if signer2_resp.status_code >= 400:
                logger.error("Yousign signer2 error %s: %s | payload: %s",
                             signer2_resp.status_code, signer2_resp.text, signer2_payload)
            signer2_resp.raise_for_status()
            signer_partner_id = signer2_resp.json()["id"]

            # Step 4b — name + date fields overlaying the "Nom et qualité :" /
            # "Date :" labels below each signature box. Bab Morocco's identity is
            # known in advance, so it's auto-filled (signer_name, read-only). The
            # partner's actual signatory is not known ahead of time (we only have
            # the company name) — eIDAS ties the signature to a natural person,
            # so instead of pre-filling with the company name, the partner types
            # their own name + role by hand into an editable text field.
            # These types aren't accepted inline on signer creation — they need
            # the dedicated document-fields endpoint, tied to the signer via
            # signer_id.
            name_field_specs = {
                signer_bab_id: {"type": "signer_name"},
                signer_partner_id: {
                    "type": "text",
                    "question": "Nom et qualité du signataire",
                    "max_length": 100,
                },
            }
            for signer_id, x in ((signer_bab_id, 100), (signer_partner_id, 328)):
                name_field = {
                    "signer_id": signer_id,
                    "page": page,
                    "x": x,
                    "y": 275,
                    **name_field_specs[signer_id],
                }
                date_field = {
                    "type": "signature_date",
                    "signer_id": signer_id,
                    "page": page,
                    "x": x,
                    "y": 297,
                }
                for field_payload in (name_field, date_field):
                    field_resp = await client.post(
                        f"/signature_requests/{signature_request_id}/documents/{document_id}/fields",
                        json=field_payload,
                    )
                    if field_resp.status_code >= 400:
                        logger.error("Yousign %s field error %s: %s | payload: %s",
                                     field_payload["type"], field_resp.status_code, field_resp.text, field_payload)
                    field_resp.raise_for_status()

            # Step 5 — activate (sends the invitation to signer 1)
            # signature_link is null until activation — it's only populated in the
            # activate response (or a subsequent GET), not at signer creation time.
            activate_resp = await client.post(f"/signature_requests/{signature_request_id}/activate")
            if activate_resp.status_code >= 400:
                logger.error("Yousign activate error %s: %s", activate_resp.status_code, activate_resp.text)
            activate_resp.raise_for_status()
            signer_bab_signature_link = ""
            for signer in activate_resp.json().get("signers", []):
                if signer.get("id") == signer_bab_id:
                    signer_bab_signature_link = signer.get("signature_link") or ""
                    break

        return YousignResult(
            signature_request_id=signature_request_id,
            document_id=document_id,
            signer_bab_id=signer_bab_id,
            signer_partner_id=signer_partner_id,
            signer_bab_signature_link=signer_bab_signature_link,
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
