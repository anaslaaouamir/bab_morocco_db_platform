import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ContractCreate(BaseModel):
    prospect_id: uuid.UUID
    estimated_annual_value: Optional[float] = None


class PartnerReplySubmit(BaseModel):
    reply_text: str


class ContractClauses(BaseModel):
    parties: str
    objet: str
    commission_clause: str
    obligations_bab: str
    obligations_partner: str
    duree_clause: str
    confidentialite: str
    rgpd_clause: str
    juridiction: str
    post_signature_note: str


class ContractResponse(BaseModel):
    id: uuid.UUID
    prospect_id: uuid.UUID
    status: str
    partner_name: str
    partner_type: str
    partner_email: Optional[str]
    country: str
    language: str
    commission: float
    estimated_annual_value: Optional[float]
    clauses: Optional[ContractClauses]
    has_pdf: bool
    human_review_required: bool
    human_review_reason: Optional[str]
    partner_reply: Optional[str]
    partner_replied_at: Optional[datetime]
    sent_at: Optional[datetime]
    signed_at: Optional[datetime]
    declined_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContractListResponse(BaseModel):
    items: list[ContractResponse]
    total: int
