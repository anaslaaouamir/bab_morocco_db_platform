import math
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prospect import Prospect
from app.schemas.prospect import (
    LangueEnum,
    ProspectCreate,
    ProspectListResponse,
    ProspectResponse,
    ProspectStats,
    ProspectUpdate,
    StagePatch,
)
from app.services.scoring import scoring_engine

COMMISSION_DEFAULTS: dict[str, tuple[float, float]] = {
    "hotel_riad": (10.0, 8.0),
    "hotel_luxe": (10.0, 8.0),
    "tour_operateur": (12.0, 10.0),
    "agence_voyage": (14.0, 12.0),
    "prestataire_activites": (18.0, 15.0),
    "transport": (15.0, 12.0),
    "to_golfe": (12.0, 10.0),
    "mice": (12.0, 10.0),
}

PAYS_LANGUE_MAP: list[tuple[list[str], str]] = [
    (["france", "belgique", "suisse", "maroc"], "fr"),
    (["espagne", "spain"], "es"),
    (["allemagne", "autriche", "germany", "austria"], "de"),
    (["arabie saoudite", "saudi", "qatar", "koweit", "kuwait", "bahrain", "bahreïn"], "ar"),
]


def detect_langue(pays: str) -> LangueEnum:
    pays_lower = pays.lower()
    for keywords, lang in PAYS_LANGUE_MAP:
        if any(kw in pays_lower for kw in keywords):
            return LangueEnum(lang)
    return LangueEnum.en


def _apply_scoring(payload: dict) -> dict:
    """
    Run the scoring engine and write all 5 breakdown scores + total + stage
    back into payload (in-place).
    """
    breakdown = scoring_engine.compute_breakdown(payload)
    total = scoring_engine.compute_total(breakdown)
    stage = scoring_engine.evaluate_stage(total, payload.get("stage", "prospection"))

    payload["score_activite_digitale"] = breakdown.activite_digitale
    payload["score_coherence_marche"] = breakdown.coherence_marche
    payload["score_taille_capacite"] = breakdown.taille_capacite
    payload["score_contact_decideur"] = breakdown.contact_decideur
    payload["score_liberte_ota"] = breakdown.liberte_ota
    payload["score_total"] = total
    payload["stage"] = stage
    return payload


class ProspectMapper:
    """Converts camelCase frontend keys → snake_case."""

    CAMEL_TO_SNAKE = {
        "adresseWeb": "adresse_web",
        "emailContact": "email_contact",
        "linkedinContact": "linkedin_contact",
        "nomContact": "nom_contact",
        "posteContact": "poste_contact",
        "nbChambres": "nb_chambres",
        "capaciteDescription": "capacite_description",
        "presenceBooking": "presence_booking",
        "noteBooking": "note_booking",
        "presenceExpedia": "presence_expedia",
        "commissionStandard": "commission_standard",
        "commissionPlancher": "commission_plancher",
        "dateAjout": "date_ajout",
        "dateProchainContact": "date_prochain_contact",
    }

    @classmethod
    def from_camel(cls, payload: dict) -> dict:
        return {cls.CAMEL_TO_SNAKE.get(k, k): v for k, v in payload.items()}


async def create_prospect(db: AsyncSession, data: ProspectCreate) -> Prospect:
    payload = data.model_dump()

    standard, plancher = COMMISSION_DEFAULTS.get(payload["type"], (10.0, 8.0))
    if payload.get("commission_standard") is None:
        payload["commission_standard"] = standard
    if payload.get("commission_plancher") is None:
        payload["commission_plancher"] = plancher

    if payload.get("langue") is None:
        payload["langue"] = detect_langue(payload["pays"]).value

    if payload.get("date_ajout") is None:
        payload["date_ajout"] = date.today()

    # Engine computes all 5 breakdown scores, total, and initial stage
    _apply_scoring(payload)

    prospect = Prospect(**payload)
    db.add(prospect)
    await db.flush()
    await db.refresh(prospect)
    await db.commit()
    return prospect


async def list_prospects(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    stage: Optional[str] = None,
    type: Optional[str] = None,
    score_min: Optional[int] = None,
    pays: Optional[str] = None,
    langue: Optional[str] = None,
) -> ProspectListResponse:
    stmt = select(Prospect)
    if stage:
        stmt = stmt.where(Prospect.stage == stage)
    if type:
        stmt = stmt.where(Prospect.type == type)
    if score_min is not None:
        stmt = stmt.where(Prospect.score_total >= score_min)
    if pays:
        stmt = stmt.where(Prospect.pays == pays)
    if langue:
        stmt = stmt.where(Prospect.langue == langue)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()

    pages = max(1, math.ceil(total / page_size))
    return ProspectListResponse(
        items=[ProspectResponse.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


async def get_prospect(db: AsyncSession, prospect_id: uuid.UUID) -> Optional[Prospect]:
    return await db.get(Prospect, prospect_id)


async def update_prospect(
    db: AsyncSession, prospect: Prospect, data: ProspectUpdate
) -> Prospect:
    payload = data.model_dump(exclude_none=True)
    for key, value in payload.items():
        setattr(prospect, key, value)

    # Build current state for re-scoring
    current = {
        "adresse_web": prospect.adresse_web,
        "pays": prospect.pays,
        "email_contact": prospect.email_contact,
        "linkedin_contact": prospect.linkedin_contact,
        "presence_booking": prospect.presence_booking,
        "note_booking": prospect.note_booking,
        "presence_expedia": prospect.presence_expedia,
        "nb_chambres": prospect.nb_chambres,
        "capacite_description": prospect.capacite_description,
        "stage": prospect.stage,
    }
    _apply_scoring(current)

    prospect.score_activite_digitale = int(current["score_activite_digitale"])  # type: ignore[arg-type]
    prospect.score_coherence_marche = int(current["score_coherence_marche"])  # type: ignore[arg-type]
    prospect.score_taille_capacite = int(current["score_taille_capacite"])  # type: ignore[arg-type]
    prospect.score_contact_decideur = int(current["score_contact_decideur"])  # type: ignore[arg-type]
    prospect.score_liberte_ota = int(current["score_liberte_ota"])  # type: ignore[arg-type]
    prospect.score_total = int(current["score_total"])  # type: ignore[arg-type]
    prospect.stage = str(current["stage"])  # type: ignore[assignment]

    if "pays" in payload and "langue" not in payload:
        prospect.langue = detect_langue(payload["pays"]).value

    await db.commit()
    await db.refresh(prospect)
    return prospect


async def patch_stage(
    db: AsyncSession, prospect: Prospect, data: StagePatch
) -> Prospect:
    prospect.stage = data.stage.value
    await db.commit()
    await db.refresh(prospect)
    return prospect


async def delete_prospect(db: AsyncSession, prospect: Prospect) -> None:
    await db.delete(prospect)
    await db.commit()


async def get_stats(db: AsyncSession) -> ProspectStats:
    stage_rows = (
        await db.execute(
            select(Prospect.stage, func.count(Prospect.id)).group_by(Prospect.stage)
        )
    ).all()
    nb_par_stage = {row[0]: row[1] for row in stage_rows}

    score_avg = (
        await db.execute(select(func.avg(Prospect.score_total)))
    ).scalar_one_or_none() or 0.0

    nb_eligibles = (
        await db.execute(
            select(func.count(Prospect.id)).where(Prospect.score_total >= 75)
        )
    ).scalar_one()

    return ProspectStats(
        nb_par_stage=nb_par_stage,
        score_moyen=round(float(score_avg), 2),
        nb_eligibles_outreach=nb_eligibles,
    )
