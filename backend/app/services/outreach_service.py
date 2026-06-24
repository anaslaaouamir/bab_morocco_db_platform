import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.outreach import OutreachEmail
from app.models.prospect import Prospect
from app.services.email_generator import EmailGeneratorProtocol, MockEmailGenerator

logger = logging.getLogger(__name__)

_STEP_OFFSETS = {"j0": 0, "j3": 3, "j7": 7, "j30": 30}


class MockEmailSender:
    async def send(self, email: OutreachEmail) -> bool:
        logger.info(
            "[MOCK EMAIL SENT] → %s | %s | Variant %s",
            email.prospect.email_contact,
            email.sujet,
            email.variant,
        )
        return True


class OutreachService:
    def __init__(
        self,
        generator: Optional[EmailGeneratorProtocol] = None,
        sender: Optional[MockEmailSender] = None,
    ):
        self._generator = generator or MockEmailGenerator()
        self._sender = sender or MockEmailSender()

    async def generate_j0_variants(
        self, db: AsyncSession, prospect: Prospect
    ) -> list[OutreachEmail]:
        today = date.today()
        emails = []
        for variant in ("A", "B", "C"):
            sujet, corps = await self._generator.generate(prospect, "j0", variant)
            email = OutreachEmail(
                id=uuid.uuid4(),
                prospect_id=prospect.id,
                sequence_step="j0",
                variant=variant,
                langue=prospect.langue,
                sujet=sujet,
                corps=corps,
                statut="draft",
                date_envoi_prevu=today,
                created_at=datetime.utcnow(),
            )
            db.add(email)
            emails.append(email)
        await db.commit()
        for e in emails:
            await db.refresh(e)
        return emails

    async def list_emails(
        self, db: AsyncSession, prospect_id: uuid.UUID
    ) -> list[OutreachEmail]:
        result = await db.execute(
            select(OutreachEmail)
            .where(OutreachEmail.prospect_id == prospect_id)
            .order_by(OutreachEmail.date_envoi_prevu)
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
            return {"next_step": steps_order[current_idx + 1], "reason": f"{last_sent.sequence_step} sent but not opened", "emails": emails}
        return {"next_step": None, "reason": "Sequence complete", "emails": emails}

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
        email.prospect = prospect  # type: ignore[assignment]
        await self._sender.send(email)
        email.statut = "sent"
        email.date_envoi_reel = datetime.utcnow()
        await db.commit()
        await db.refresh(email)
        return email

    async def _create_followup(
        self, db: AsyncSession, prospect: Prospect, step: str, variant: str, base_date: date
    ) -> OutreachEmail:
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
        today = date.today()
        created = []

        # j0 sent + not opened → j3
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
            if j0.date_envoi_reel and (datetime.utcnow() - j0.date_envoi_reel).days >= 3:
                prospect = await db.get(Prospect, j0.prospect_id)
                if prospect:
                    await self._create_followup(db, prospect, "j3", j0.variant, j0.date_envoi_prevu)
                    created.append({"prospect_id": str(j0.prospect_id), "step": "j3"})

        # j3 sent → j7
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
            if j3.date_envoi_reel and (datetime.utcnow() - j3.date_envoi_reel).days >= 4:
                prospect = await db.get(Prospect, j3.prospect_id)
                if prospect:
                    await self._create_followup(db, prospect, "j7", j3.variant, j3.date_envoi_prevu)
                    created.append({"prospect_id": str(j3.prospect_id), "step": "j7"})

        # veille prospects → j30
        result = await db.execute(select(Prospect).where(Prospect.stage == "veille"))
        for prospect in result.scalars().all():
            existing = (await db.execute(
                select(OutreachEmail).where(
                    OutreachEmail.prospect_id == prospect.id,
                    OutreachEmail.sequence_step == "j30",
                )
            )).scalars().first()
            if existing:
                continue
            await self._create_followup(db, prospect, "j30", "A", today)
            created.append({"prospect_id": str(prospect.id), "step": "j30"})

        await db.commit()
        return {"created": len(created), "details": created}
