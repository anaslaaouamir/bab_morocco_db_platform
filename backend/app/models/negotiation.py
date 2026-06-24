import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.database import Base


class NegotiationMessage(Base):
    __tablename__ = "negotiation_messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    prospect_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("prospects.id", ondelete="CASCADE"), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)   # inbound / outbound
    corps: Mapped[str] = mapped_column(Text, nullable=False)
    date_message: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # AI analysis — inbound only
    analyse_intent: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    analyse_objection: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    taux_demande: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    requires_human: Mapped[bool] = mapped_column(Boolean, default=False)

    # 3 scenarios stored as JSON text
    scenarios_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    prospect: Mapped["Prospect"] = relationship("Prospect", lazy="select")  # type: ignore[name-defined]
