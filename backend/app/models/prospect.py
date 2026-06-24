import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.database import Base


class Prospect(Base):
    __tablename__ = "prospects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    nom: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    pays: Mapped[str] = mapped_column(String(100), nullable=False)
    ville: Mapped[str] = mapped_column(String(100), nullable=False)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    adresse_web: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    email_contact: Mapped[str] = mapped_column(String(255), nullable=False)
    linkedin_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nom_contact: Mapped[str] = mapped_column(String(255), nullable=False)
    poste_contact: Mapped[str] = mapped_column(String(255), nullable=False)
    nb_chambres: Mapped[int | None] = mapped_column(Integer, nullable=True)
    capacite_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    presence_booking: Mapped[bool] = mapped_column(Boolean, default=False)
    note_booking: Mapped[float | None] = mapped_column(Float, nullable=True)
    presence_expedia: Mapped[bool] = mapped_column(Boolean, default=False)

    score_activite_digitale: Mapped[int] = mapped_column(Integer, default=0)
    score_coherence_marche: Mapped[int] = mapped_column(Integer, default=0)
    score_taille_capacite: Mapped[int] = mapped_column(Integer, default=0)
    score_contact_decideur: Mapped[int] = mapped_column(Integer, default=0)
    score_liberte_ota: Mapped[int] = mapped_column(Integer, default=0)
    score_total: Mapped[int] = mapped_column(Integer, default=0)

    stage: Mapped[str] = mapped_column(String(50), default="prospection")
    commission_standard: Mapped[float] = mapped_column(Float, nullable=False)
    commission_plancher: Mapped[float] = mapped_column(Float, nullable=False)
    langue: Mapped[str] = mapped_column(String(5), nullable=False)
    date_ajout: Mapped[date] = mapped_column(Date, nullable=False)
    date_prochain_contact: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
