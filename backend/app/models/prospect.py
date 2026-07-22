import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
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

    # Google Places-sourced (free, already fetched by the scan, previously discarded)
    note_google: Mapped[float | None] = mapped_column(Float, nullable=True)
    nb_avis_google: Mapped[int | None] = mapped_column(Integer, nullable=True)
    telephone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    business_status: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # Scrape-derived, type-agnostic signals (httpx-first, Playwright fallback — see
    # SCRAPING_ENRICHMENT_SCORING_PLAN.md). Nullable, not default=False: None means
    # "never checked" (e.g. manual entry), False means "checked, confirmed absent" —
    # the scoring engine treats these differently.
    https_actif: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    cta_reservation_present: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    formulaire_contact_present: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Text, not String(255) — stores "label|url" pairs per platform (see
    # real_providers.py _extract_page_signals), which can exceed 255 chars
    # once real profile URLs are included instead of just platform names.
    reseaux_sociaux: Mapped[str | None] = mapped_column(Text, nullable=True)
    langues_disponibles: Mapped[str | None] = mapped_column(String(100), nullable=True)

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

    email_bounced: Mapped[bool] = mapped_column(Boolean, default=False)

    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
