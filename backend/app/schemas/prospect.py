import uuid
from datetime import date, datetime
from typing import Optional
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class PartnerTypeEnum(str, Enum):
    hotel_riad = "hotel_riad"
    hotel_luxe = "hotel_luxe"
    tour_operateur = "tour_operateur"
    agence_voyage = "agence_voyage"
    prestataire_activites = "prestataire_activites"
    transport = "transport"
    to_golfe = "to_golfe"
    mice = "mice"


class StageEnum(str, Enum):
    prospection = "prospection"
    qualification = "qualification"
    outreach = "outreach"
    negociation = "negociation"
    closing = "closing"
    activation_ota = "activation_ota"
    veille = "veille"
    perdu = "perdu"


class LangueEnum(str, Enum):
    fr = "fr"
    en = "en"
    es = "es"
    de = "de"
    ar = "ar"


class ProspectCreate(BaseModel):
    nom: str
    type: PartnerTypeEnum
    pays: str
    ville: str
    region: Optional[str] = None
    adresse_web: str
    email_contact: str
    linkedin_contact: Optional[str] = None
    nom_contact: str
    poste_contact: str
    nb_chambres: Optional[int] = None
    capacite_description: Optional[str] = None
    presence_booking: bool = False
    note_booking: Optional[float] = None
    presence_expedia: bool = False

    # Score fields accepted but overridden by engine
    score_activite_digitale: int = Field(default=0, ge=0, le=25)
    score_coherence_marche: int = Field(default=0, ge=0, le=25)
    score_taille_capacite: int = Field(default=0, ge=0, le=20)
    score_contact_decideur: int = Field(default=0, ge=0, le=15)
    score_liberte_ota: int = Field(default=0, ge=0, le=15)

    stage: StageEnum = StageEnum.prospection
    commission_standard: Optional[float] = None
    commission_plancher: Optional[float] = None
    langue: Optional[LangueEnum] = None
    date_ajout: Optional[date] = None
    date_prochain_contact: Optional[date] = None
    notes: Optional[str] = None


class ProspectUpdate(BaseModel):
    nom: Optional[str] = None
    type: Optional[PartnerTypeEnum] = None
    pays: Optional[str] = None
    ville: Optional[str] = None
    region: Optional[str] = None
    adresse_web: Optional[str] = None
    email_contact: Optional[str] = None
    linkedin_contact: Optional[str] = None
    nom_contact: Optional[str] = None
    poste_contact: Optional[str] = None
    nb_chambres: Optional[int] = None
    capacite_description: Optional[str] = None
    presence_booking: Optional[bool] = None
    note_booking: Optional[float] = None
    presence_expedia: Optional[bool] = None

    stage: Optional[StageEnum] = None
    commission_standard: Optional[float] = None
    commission_plancher: Optional[float] = None
    langue: Optional[LangueEnum] = None
    date_prochain_contact: Optional[date] = None
    notes: Optional[str] = None


class StagePatch(BaseModel):
    stage: StageEnum


class ProspectAssignRequest(BaseModel):
    assigned_to: Optional[uuid.UUID] = None


class ScorePreviewRequest(BaseModel):
    adresse_web: str = "https://example.com"
    pays: str = ""
    email_contact: str = ""
    linkedin_contact: Optional[str] = None
    presence_booking: bool = False
    note_booking: Optional[float] = None
    presence_expedia: bool = False
    nb_chambres: Optional[int] = None
    capacite_description: Optional[str] = None


class ScorePreviewResponse(BaseModel):
    score_activite_digitale: int
    score_coherence_marche: int
    score_taille_capacite: int
    score_contact_decideur: int
    score_liberte_ota: int
    score_total: int
    stage_recommande: str
    is_premium: bool


class ProspectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nom: str
    type: str
    pays: str
    ville: str
    region: Optional[str]
    adresse_web: str
    email_contact: str
    linkedin_contact: Optional[str]
    nom_contact: str
    poste_contact: str
    nb_chambres: Optional[int]
    capacite_description: Optional[str]
    presence_booking: bool
    note_booking: Optional[float]
    presence_expedia: bool

    score_activite_digitale: int
    score_coherence_marche: int
    score_taille_capacite: int
    score_contact_decideur: int
    score_liberte_ota: int
    score_total: int

    stage: str
    commission_standard: float
    commission_plancher: float
    langue: str
    date_ajout: date
    date_prochain_contact: Optional[date]
    notes: Optional[str]

    created_at: datetime
    updated_at: datetime

    assigned_to: Optional[uuid.UUID] = None
    assigned_to_name: Optional[str] = None


class ProspectListResponse(BaseModel):
    items: list[ProspectResponse]
    total: int
    page: int
    page_size: int
    pages: int


class ProspectStats(BaseModel):
    nb_par_stage: dict[str, int]
    score_moyen: float
    nb_eligibles_outreach: int
