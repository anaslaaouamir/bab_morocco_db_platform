import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.database import Base


class OutreachEmail(Base):
    __tablename__ = "outreach_emails"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    prospect_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False)
    sequence_step: Mapped[str] = mapped_column(String(10), nullable=False)  # j0, j3, j7, j30
    variant: Mapped[str] = mapped_column(String(1), nullable=False)         # A, B, C
    langue: Mapped[str] = mapped_column(String(5), nullable=False)
    sujet: Mapped[str] = mapped_column(String(500), nullable=False)
    corps: Mapped[str] = mapped_column(Text, nullable=False)
    statut: Mapped[str] = mapped_column(String(20), default="draft")        # draft/validated/sent/opened/clicked
    date_envoi_prevu: Mapped[date] = mapped_column(Date, nullable=False)
    date_envoi_reel: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    prospect: Mapped["Prospect"] = relationship("Prospect", lazy="select")  # type: ignore[name-defined]
