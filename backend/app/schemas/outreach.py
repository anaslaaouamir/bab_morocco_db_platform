import uuid
from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SequenceStepEnum(str, Enum):
    j0 = "j0"
    j3 = "j3"
    j7 = "j7"
    j30 = "j30"


class VariantEnum(str, Enum):
    A = "A"
    B = "B"
    C = "C"


class EmailStatutEnum(str, Enum):
    draft = "draft"
    validated = "validated"
    sent = "sent"
    opened = "opened"
    clicked = "clicked"


class OutreachEmailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    prospect_id: uuid.UUID
    sequence_step: str
    variant: str
    langue: str
    sujet: str
    corps: str
    statut: str
    date_envoi_prevu: date
    date_envoi_reel: Optional[datetime]
    created_at: datetime


class NextStepResponse(BaseModel):
    next_step: Optional[str]
    reason: str
    emails: list[OutreachEmailResponse]


class TriggerFollowupsResponse(BaseModel):
    created: int
    details: list[dict]
