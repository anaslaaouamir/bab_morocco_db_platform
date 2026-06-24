import uuid
from datetime import datetime
from typing import Optional
from enum import Enum

from pydantic import BaseModel, Field

from app.schemas.prospect import PartnerTypeEnum


class ScanStatutEnum(str, Enum):
    pending = "pending"
    running = "running"
    done = "done"
    error = "error"


class ScanStartRequest(BaseModel):
    ville: str
    pays: str
    type_partenaire: PartnerTypeEnum
    limite: int = Field(default=10, ge=1, le=100)


class ScanJobResponse(BaseModel):
    id: uuid.UUID
    ville: str
    pays: str
    type_partenaire: str
    limite: int
    statut: str
    nb_trouves: int
    nb_ajoutes: int
    nb_veille: int
    nb_doublons: int
    progression: int
    erreur: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]
