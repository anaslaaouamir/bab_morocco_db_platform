"""
SP4 scan pipeline — runs as a FastAPI BackgroundTask.
Steps: MockGoogleMaps → MockEnrichment → Scoring → Dedup → Insert → Update job.
Newly inserted prospects are then distributed randomly and equally among
active Commercial users (CLAUDE.md prospect assignment logic).
"""
import logging
import random
import uuid
from datetime import datetime, date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.prospect import Prospect
from app.models.scan_job import ScanJob
from app.models.user import User
from app.services.mock_providers import MockEnrichmentService, MockGoogleMapsProvider
from app.services.scoring import scoring_engine
from app.services.prospect_service import COMMISSION_DEFAULTS, detect_langue

logger = logging.getLogger(__name__)

_maps_provider = MockGoogleMapsProvider()
_enrichment_svc = MockEnrichmentService()


async def _distribute_to_commercials(db, prospect_ids: list[uuid.UUID]) -> None:
    """
    Randomly and equally distributes the given prospects among all active
    Commercial users (round-robin after shuffling). If there are no active
    commercials, prospects are left unassigned (assigned_to stays NULL).
    """
    if not prospect_ids:
        return

    commercials = (
        await db.execute(
            select(User).where(User.role == "commercial", User.is_active == True)  # noqa: E712
        )
    ).scalars().all()
    if not commercials:
        return

    shuffled = list(prospect_ids)
    random.shuffle(shuffled)

    for i, prospect_id in enumerate(shuffled):
        commercial = commercials[i % len(commercials)]
        prospect = await db.get(Prospect, prospect_id)
        if prospect:
            prospect.assigned_to = commercial.id

    await db.commit()


async def run_scan_pipeline(job_id: uuid.UUID, session_factory) -> None:
    """
    Full scan pipeline executed as a background task.
    `session_factory` is an async_sessionmaker so the pipeline can open
    its own sessions independently of the HTTP request session.
    """
    async with session_factory() as db:
        job: ScanJob | None = await db.get(ScanJob, job_id)
        if not job:
            logger.error("ScanJob %s not found", job_id)
            return

        try:
            # ── Step 1: Mock Google Maps search ──────────────────────────────
            job.statut = "running"
            await db.commit()

            raw_results = _maps_provider.search(
                ville=job.ville,
                pays=job.pays,
                type_partenaire=job.type_partenaire,
                limite=job.limite,
            )
            job.nb_trouves = len(raw_results)
            await db.commit()

            total = len(raw_results)
            new_prospect_ids: list[uuid.UUID] = []

            for i, raw in enumerate(raw_results):
                # ── Step 2: Enrichment ──────────────────────────────────────
                enriched = _enrichment_svc.enrich(raw)

                # ── Step 3: Scoring ─────────────────────────────────────────
                breakdown = scoring_engine.compute_breakdown(enriched)
                score_total = scoring_engine.compute_total(breakdown)
                stage = scoring_engine.evaluate_stage(score_total, "prospection")

                # ── Step 4: Deduplication ───────────────────────────────────
                existing = (
                    await db.execute(
                        select(Prospect).where(
                            Prospect.adresse_web == enriched["adresse_web"]
                        )
                    )
                ).scalar_one_or_none()

                if existing:
                    job.nb_doublons += 1
                else:
                    # ── Step 5: Insert ──────────────────────────────────────
                    partner_type = enriched["type"]
                    standard, plancher = COMMISSION_DEFAULTS.get(partner_type, (10.0, 8.0))
                    langue = detect_langue(enriched["pays"]).value

                    prospect = Prospect(
                        nom=enriched["nom"],
                        type=partner_type,
                        pays=enriched["pays"],
                        ville=enriched["ville"],
                        adresse_web=enriched["adresse_web"],
                        email_contact=enriched["email_contact"],
                        linkedin_contact=enriched.get("linkedin_contact"),
                        nom_contact=enriched.get("nom_contact", "Responsable"),
                        poste_contact=enriched.get("poste_contact", "DG"),
                        nb_chambres=enriched.get("nb_chambres"),
                        capacite_description=enriched.get("capacite_description"),
                        presence_booking=enriched.get("presence_booking", False),
                        note_booking=enriched.get("note_booking"),
                        presence_expedia=enriched.get("presence_expedia", False),
                        score_activite_digitale=breakdown.activite_digitale,
                        score_coherence_marche=breakdown.coherence_marche,
                        score_taille_capacite=breakdown.taille_capacite,
                        score_contact_decideur=breakdown.contact_decideur,
                        score_liberte_ota=breakdown.liberte_ota,
                        score_total=score_total,
                        stage=stage,
                        commission_standard=standard,
                        commission_plancher=plancher,
                        langue=langue,
                        date_ajout=date.today(),
                    )
                    try:
                        db.add(prospect)
                        await db.flush()
                        job.nb_ajoutes += 1
                        new_prospect_ids.append(prospect.id)
                        if stage == "veille":
                            job.nb_veille += 1
                    except IntegrityError:
                        await db.rollback()
                        job.nb_doublons += 1

                # ── Step 6: Update progression ──────────────────────────────
                job.progression = int((i + 1) / total * 100)
                await db.commit()

            # ── Step 7: Distribute new prospects among active commercials ──
            await _distribute_to_commercials(db, new_prospect_ids)

            job.statut = "done"
            job.progression = 100
            job.completed_at = datetime.utcnow()
            await db.commit()

        except Exception as exc:
            logger.exception("Scan pipeline error for job %s", job_id)
            job.statut = "error"
            job.erreur = str(exc)
            await db.commit()
