import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.database import Base


class Contract(Base):
    __tablename__ = "contracts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    prospect_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False, unique=True
    )

    # Status lifecycle: draft → generated → sent_to_partner → signed | declined
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")

    # Partner snapshot at contract creation time (denormalised for PDF stability)
    partner_name: Mapped[str] = mapped_column(String(255), nullable=False)
    partner_type: Mapped[str] = mapped_column(String(50), nullable=False)
    partner_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    language: Mapped[str] = mapped_column(String(5), nullable=False, default="fr")
    commission: Mapped[float] = mapped_column(Float, nullable=False)

    # Optional: used to check $50k annual value threshold (CLAUDE.md §9)
    estimated_annual_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # AI-generated clause content stored as JSON text
    clauses_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Generated PDF stored as bytes (dev); swap for S3 key in production
    pdf_bytes: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)

    # Human review gate (CLAUDE.md §9)
    human_review_required: Mapped[bool] = mapped_column(Boolean, default=False)
    human_review_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Timestamps
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    declined_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    prospect: Mapped["Prospect"] = relationship("Prospect", lazy="select")  # type: ignore[name-defined]
