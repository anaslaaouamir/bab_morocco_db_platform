import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from app.database import Base


class ScanJob(Base):
    __tablename__ = "scan_jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    ville: Mapped[str] = mapped_column(String(100), nullable=False)
    pays: Mapped[str] = mapped_column(String(100), nullable=False)
    type_partenaire: Mapped[str] = mapped_column(String(50), nullable=False)
    limite: Mapped[int] = mapped_column(Integer, nullable=False)

    statut: Mapped[str] = mapped_column(String(20), default="pending")
    nb_trouves: Mapped[int] = mapped_column(Integer, default=0)
    nb_ajoutes: Mapped[int] = mapped_column(Integer, default=0)
    nb_veille: Mapped[int] = mapped_column(Integer, default=0)
    nb_doublons: Mapped[int] = mapped_column(Integer, default=0)
    progression: Mapped[int] = mapped_column(Integer, default=0)
    erreur: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
