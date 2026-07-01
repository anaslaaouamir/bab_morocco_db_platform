import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.outreach import OutreachEmail
from app.models.prospect import Prospect
from app.services.email_generator import EmailGeneratorProtocol, MockEmailGenerator
from app.services.email_transport import EmailTransportProtocol, MockEmailTransport

logger = logging.getLogger(__name__)

_STEP_OFFSETS = {"j0": 0, "j3": 3, "j7": 7, "j30": 30}

# j3 triggers 3 days after j0 sent; j7 triggers 4 days after j3 sent (= 7 days after j0)
_FOLLOWUP_DELAY_DAYS = {"j3": 3, "j7": 4, "j30": 0}


class OutreachService:
    def __init__(
        self,
        generator: Optional[EmailGeneratorProtocol] = None,
        sender: Optional[EmailTransportProtocol] = None,
    ):
        self._generator = generator or MockEmailGenerator()
        self._sender = sender or MockEmailTransport()

    # ── Core generation ──────────────────────────────────────────────────────

    async def generate_step_variants(
        self,
        db: AsyncSession,
        prospect: Prospect,
        step: str,
        base_date: Optional[date] = None,
    ) -> list[OutreachEmail]:
        """
        Generate draft variants A, B, C for any sequence step.
        Uses MockEmailGenerator now; swap get_email_generator() env flag to
        switch to ClaudeEmailGenerator in production — no other code change needed.
        """
        if base_date is None:
            base_date = date.today()
        offset = _STEP_OFFSETS.get(step, 0)
        planned_date = base_date + timedelta(days=offset)

        emails = []
        for variant in ("A", "B", "C"):
            sujet, corps = await self._generator.generate(prospect, step, variant)
            email = OutreachEmail(
                id=uuid.uuid4(),
                prospect_id=prospect.id,
                sequence_step=step,
                variant=variant,
                langue=prospect.langue,
                sujet=sujet,
                corps=corps,
                statut="draft",
                date_envoi_prevu=planned_date,
                created_at=datetime.utcnow(),
            )
            db.add(email)
            emails.append(email)

        await db.commit()
        for e in emails:
            await db.refresh(e)
        return emails

    async def generate_j0_variants(
        self, db: AsyncSession, prospect: Prospect
    ) -> list[OutreachEmail]:
        """Backward-compatible wrapper — generates J0 A/B/C variants."""
        return await self.generate_step_variants(db, prospect, "j0")

    # ── Per-prospect auto-trigger ─────────────────────────────────────────────

    async def auto_trigger_followup(
        self, db: AsyncSession, prospect: Prospect
    ) -> list[OutreachEmail]:
        """
        Check whether the next follow-up step is due for this prospect and, if so,
        generate its 3 variants (A/B/C) as drafts for human review.

        Timing rules (from spec §5):
          J+3  — j0 sent (not opened) for >= 3 days
          J+7  — j3 sent for >= 4 days  (= 7 days total from j0)
          J+30 — prospect in 'veille' stage and no j30 yet

        Idempotent: does nothing if the step already exists.
        Returns newly created emails (empty list if nothing was due or generated).
        """
        emails = await self.list_emails(db, prospect.id)
        if not emails:
            return []

        # Group by step; pick best (highest-progress statut) per step
        by_step: dict[str, OutreachEmail] = {}
        statut_order = ["draft", "validated", "sent", "opened", "clicked"]
        for e in emails:
            prev = by_step.get(e.sequence_step)
            if prev is None:
                by_step[e.sequence_step] = e
            else:
                e_idx   = statut_order.index(e.statut)   if e.statut   in statut_order else -1
                prv_idx = statut_order.index(prev.statut) if prev.statut in statut_order else -1
                if e_idx > prv_idx:
                    by_step[e.sequence_step] = e

        # Infer j0 base date for planned-date calculation
        j0_ref = by_step.get("j0")
        base_date = j0_ref.date_envoi_prevu if j0_ref else date.today()
        now = datetime.utcnow()

        # ── J+3: j0 sent (not opened/clicked), 3+ days ago, no j3 yet ──────
        if "j3" not in by_step:
            j0 = by_step.get("j0")
            if j0 and j0.statut == "sent" and j0.date_envoi_reel:
                if (now - j0.date_envoi_reel).days >= _FOLLOWUP_DELAY_DAYS["j3"]:
                    logger.info("auto_trigger: generating j3 for prospect %s", prospect.id)
                    return await self.generate_step_variants(db, prospect, "j3", base_date)

        # ── J+7: j3 sent, 4+ days ago (7 days total), no j7 yet ─────────────
        if "j7" not in by_step:
            j3 = by_step.get("j3")
            if j3 and j3.statut == "sent" and j3.date_envoi_reel:
                if (now - j3.date_envoi_reel).days >= _FOLLOWUP_DELAY_DAYS["j7"]:
                    logger.info("auto_trigger: generating j7 for prospect %s", prospect.id)
                    return await self.generate_step_variants(db, prospect, "j7", base_date)

        # ── J+30: prospect in 'veille', no j30 yet ───────────────────────────
        if "j30" not in by_step and prospect.stage == "veille":
            logger.info("auto_trigger: generating j30 reactivation for prospect %s", prospect.id)
            return await self.generate_step_variants(db, prospect, "j30", base_date)

        return []

    # ── Queries ───────────────────────────────────────────────────────────────

    async def list_emails(
        self, db: AsyncSession, prospect_id: uuid.UUID
    ) -> list[OutreachEmail]:
        result = await db.execute(
            select(OutreachEmail)
            .where(OutreachEmail.prospect_id == prospect_id)
            .order_by(OutreachEmail.date_envoi_prevu, OutreachEmail.variant)
        )
        return list(result.scalars().all())

    async def next_step(self, db: AsyncSession, prospect_id: uuid.UUID) -> dict:
        emails = await self.list_emails(db, prospect_id)
        if not emails:
            return {"next_step": "j0", "reason": "No emails yet — start with J0", "emails": []}
        sent = [e for e in emails if e.statut in ("sent", "opened", "clicked")]
        if not sent:
            validated = [e for e in emails if e.statut == "validated"]
            if validated:
                return {"next_step": None, "reason": "Emails generated, awaiting validation/send", "emails": emails}
            return {"next_step": None, "reason": "Emails in draft — validate before sending", "emails": emails}
        last_sent = max(sent, key=lambda e: e.date_envoi_reel or datetime.min)
        steps_order = ["j0", "j3", "j7", "j30"]
        current_idx = steps_order.index(last_sent.sequence_step)
        if last_sent.statut in ("opened", "clicked"):
            return {"next_step": None, "reason": "Prospect engaged — no follow-up needed", "emails": emails}
        if current_idx < len(steps_order) - 1:
            return {
                "next_step": steps_order[current_idx + 1],
                "reason": f"{last_sent.sequence_step} sent but not opened",
                "emails": emails,
            }
        return {"next_step": None, "reason": "Sequence complete", "emails": emails}

    # ── Validate / Send ───────────────────────────────────────────────────────

    async def validate(self, db: AsyncSession, email_id: uuid.UUID) -> OutreachEmail:
        email = await db.get(OutreachEmail, email_id)
        if not email:
            raise ValueError("Email not found")
        email.statut = "validated"
        await db.commit()
        await db.refresh(email)
        return email

    async def send(self, db: AsyncSession, email_id: uuid.UUID) -> OutreachEmail:
        email = await db.get(OutreachEmail, email_id)
        if not email:
            raise ValueError("Email not found")
        if email.statut != "validated":
            raise PermissionError("Email must be validated before sending")
        prospect = await db.get(Prospect, email.prospect_id)
        if not prospect:
            raise ValueError("Prospect not found for email")
        email.prospect = prospect  # type: ignore[assignment]
        await self._sender.send(
            to=prospect.email_contact,
            subject=email.sujet,
            html=email.corps.replace("\n", "<br>"),
            reply_to=f"outreach-{prospect.id}@{settings.RESEND_INBOUND_DOMAIN}",
        )
        email.statut = "sent"
        email.date_envoi_reel = datetime.utcnow()
        await db.commit()
        await db.refresh(email)
        await self.auto_trigger_followup(db, prospect)
        return email

    # ── Batch scheduler operation ─────────────────────────────────────────────

    async def _create_followup(
        self, db: AsyncSession, prospect: Prospect, step: str, variant: str, base_date: date
    ) -> OutreachEmail:
        """Create a single variant email for a follow-up step (used by trigger_followups)."""
        offset = _STEP_OFFSETS[step]
        sujet, corps = await self._generator.generate(prospect, step, variant)
        email = OutreachEmail(
            id=uuid.uuid4(),
            prospect_id=prospect.id,
            sequence_step=step,
            variant=variant,
            langue=prospect.langue,
            sujet=sujet,
            corps=corps,
            statut="draft",
            date_envoi_prevu=base_date + timedelta(days=offset),
            created_at=datetime.utcnow(),
        )
        db.add(email)
        return email

    async def trigger_followups(self, db: AsyncSession) -> dict:
        """
        Batch scheduler operation (called by n8n / cron) — creates A/B/C draft variants
        for all due follow-up steps across all outreach prospects.
        The per-prospect equivalent is auto_trigger_followup().
        """
        today = date.today()
        created = []

        # ── J0 sent + not opened >= 3 days → generate j3 (A/B/C) ───────────
        result = await db.execute(
            select(OutreachEmail).where(
                OutreachEmail.sequence_step == "j0",
                OutreachEmail.statut == "sent",
            )
        )
        for j0 in result.scalars().all():
            existing = (await db.execute(
                select(OutreachEmail).where(
                    OutreachEmail.prospect_id == j0.prospect_id,
                    OutreachEmail.sequence_step == "j3",
                )
            )).scalars().first()
            if existing:
                continue
            sent_dt = j0.date_envoi_reel if isinstance(j0.date_envoi_reel, datetime) else datetime.fromisoformat(str(j0.date_envoi_reel))
            if j0.date_envoi_reel and (datetime.utcnow() - sent_dt).days >= 3:
                prospect = await db.get(Prospect, j0.prospect_id)
                if prospect:
                    for variant in ("A", "B", "C"):
                        await self._create_followup(db, prospect, "j3", variant, j0.date_envoi_prevu)
                    created.append({"prospect_id": str(j0.prospect_id), "step": "j3"})

        # ── J3 sent >= 4 days → generate j7 (A/B/C) ─────────────────────────
        result = await db.execute(
            select(OutreachEmail).where(
                OutreachEmail.sequence_step == "j3",
                OutreachEmail.statut == "sent",
            )
        )
        for j3 in result.scalars().all():
            existing = (await db.execute(
                select(OutreachEmail).where(
                    OutreachEmail.prospect_id == j3.prospect_id,
                    OutreachEmail.sequence_step == "j7",
                )
            )).scalars().first()
            if existing:
                continue
            sent_dt = j3.date_envoi_reel if isinstance(j3.date_envoi_reel, datetime) else datetime.fromisoformat(str(j3.date_envoi_reel))
            if j3.date_envoi_reel and (datetime.utcnow() - sent_dt).days >= 4:
                j3_prospect = await db.get(Prospect, j3.prospect_id)
                if j3_prospect:
                    for variant in ("A", "B", "C"):
                        await self._create_followup(db, j3_prospect, "j7", variant, j3.date_envoi_prevu)
                    created.append({"prospect_id": str(j3.prospect_id), "step": "j7"})

        # ── Veille prospects → generate j30 reactivation (A/B/C) ─────────────
        veille_result = await db.execute(select(Prospect).where(Prospect.stage == "veille"))
        for veille_prospect in veille_result.scalars().all():
            existing = (await db.execute(
                select(OutreachEmail).where(
                    OutreachEmail.prospect_id == veille_prospect.id,
                    OutreachEmail.sequence_step == "j30",
                )
            )).scalars().first()
            if existing:
                continue
            for variant in ("A", "B", "C"):
                await self._create_followup(db, veille_prospect, "j30", variant, today)
            created.append({"prospect_id": str(veille_prospect.id), "step": "j30"})

        await db.commit()
        return {"created": len(created), "details": created}
