import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class MessageSubmitRequest(BaseModel):
    corps: str


class RespondRequest(BaseModel):
    scenario: str  # "A", "B", or "C"
    custom_message: Optional[str] = None  # used for scenario C (human writes the message)


class ScenarioSchema(BaseModel):
    scenario: str
    titre: str
    description: str
    avantages: str
    risques: str
    message_propose: str


class MessageAnalysisResponse(BaseModel):
    message_id: uuid.UUID
    intent: Optional[str]
    intent_score: Optional[int]
    objection_type: Optional[str]
    objection_detail: Optional[str]
    taux_demande: Optional[float]
    requires_human: bool
    scenarios: list[ScenarioSchema]


class NegotiationMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    prospect_id: uuid.UUID
    direction: str
    corps: str
    date_message: datetime
    analyse_intent: Optional[str]
    analyse_objection: Optional[str]
    taux_demande: Optional[float]
    requires_human: bool
    created_at: datetime
