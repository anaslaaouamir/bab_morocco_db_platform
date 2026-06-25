import json
import logging
import re
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.negotiation import NegotiationMessage
from app.models.prospect import Prospect
from app.services.negotiation_generator import MockNegotiationGenerator, NegotiationGeneratorProtocol

logger = logging.getLogger(__name__)

# Keywords that trigger mandatory human escalation (CLAUDE.md §9 / system_prompt_v2.md)
_LEGAL_KEYWORDS = ["menace", "avocat", "juridique", "tribunal", "procès", "lawsuit", "legal action", "insatisf"]
_EXCLUSIVITY_KEYWORDS = ["exclusiv"]


def extract_rate_from_text(text: str) -> Optional[float]:
    """Extract a commission percentage from free text (e.g. '14%', '14 pour cent')."""
    pattern = r"(\d+(?:\.\d+)?)\s*(?:%|pour\s*cent|percent|prozent|por\s*ciento)"
    match = re.search(pattern, text, re.IGNORECASE)
    return float(match.group(1)) if match else None


def _check_keyword_escalation(text: str) -> bool:
    text_lower = text.lower()
    for kw in _LEGAL_KEYWORDS + _EXCLUSIVITY_KEYWORDS:
        if kw in text_lower:
            return True
    return False


def _apply_hard_escalation_rules(
    taux_demande: Optional[float],
    commission_plancher: float,
    message_corps: str,
) -> bool:
    """Return True if any hard escalation rule fires (CLAUDE.md §9)."""
    if taux_demande is not None and taux_demande < commission_plancher:
        return True
    if _check_keyword_escalation(message_corps):
        return True
    return False


class NegotiationService:
    def __init__(self, generator: Optional[NegotiationGeneratorProtocol] = None):
        self._generator = generator or MockNegotiationGenerator()

    async def submit_message(
        self, db: AsyncSession, prospect: Prospect, corps: str
    ) -> dict:
        """Analyze an inbound message, apply escalation rules, persist, return full analysis."""
        # 1. AI semantic analysis
        analysis = await self._generator.analyze(prospect, corps)

        # 2. Extract rate from raw text (authoritative — overrides AI extraction)
        extracted_rate = extract_rate_from_text(corps)
        if extracted_rate is not None:
            analysis["taux_demande"] = extracted_rate

        taux_demande = analysis.get("taux_demande")

        # 3. Hard escalation rules (Python — never delegated to AI)
        requires_human = _apply_hard_escalation_rules(
            taux_demande, prospect.commission_plancher, corps
        )

        # 4. Generate 3 scenarios
        analysis["taux_demande"] = taux_demande  # ensure it's in the dict for scenario gen
        scenarios = await self._generator.generate_scenarios(prospect, analysis)

        # 5. Persist message
        msg = NegotiationMessage(
            id=uuid.uuid4(),
            prospect_id=prospect.id,
            direction="inbound",
            corps=corps,
            date_message=datetime.utcnow(),
            analyse_intent=analysis.get("intent"),
            analyse_objection=analysis.get("objection_type"),
            taux_demande=taux_demande,
            requires_human=requires_human,
            scenarios_json=json.dumps(scenarios),
            created_at=datetime.utcnow(),
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)

        return {
            "message_id": msg.id,
            "intent": msg.analyse_intent,
            "intent_score": analysis.get("intent_score"),
            "objection_type": msg.analyse_objection,
            "objection_detail": analysis.get("objection_detail"),
            "taux_demande": msg.taux_demande,
            "requires_human": msg.requires_human,
            "scenarios": scenarios,
        }

    async def get_analysis(self, db: AsyncSession, prospect_id: uuid.UUID) -> Optional[dict]:
        """Return the latest inbound analysis + scenarios."""
        result = await db.execute(
            select(NegotiationMessage)
            .where(
                NegotiationMessage.prospect_id == prospect_id,
                NegotiationMessage.direction == "inbound",
                NegotiationMessage.scenarios_json.isnot(None),
            )
            .order_by(NegotiationMessage.date_message.desc())
            .limit(1)
        )
        msg = result.scalars().first()
        if not msg:
            return None
        return {
            "message_id": msg.id,
            "intent": msg.analyse_intent,
            "intent_score": None,
            "objection_type": msg.analyse_objection,
            "objection_detail": None,
            "taux_demande": msg.taux_demande,
            "requires_human": msg.requires_human,
            "scenarios": json.loads(msg.scenarios_json),
        }

    async def get_history(
        self, db: AsyncSession, prospect_id: uuid.UUID
    ) -> list[NegotiationMessage]:
        result = await db.execute(
            select(NegotiationMessage)
            .where(NegotiationMessage.prospect_id == prospect_id)
            .order_by(NegotiationMessage.date_message)
        )
        return list(result.scalars().all())

    async def respond(
        self,
        db: AsyncSession,
        prospect: Prospect,
        scenario_letter: str,
        last_analysis: dict,
        custom_message: Optional[str] = None,
    ) -> NegotiationMessage:
        """Validate chosen scenario, persist outbound message."""
        # Scenario C (escalation) is always allowed — it IS the human-override path.
        # A and B are blocked when requires_human is True.
        if last_analysis["requires_human"] and scenario_letter != "C":
            raise PermissionError("Human validation required before responding")

        if custom_message:
            # Human wrote the message directly (scenario C or manual override)
            response_text = custom_message
        else:
            # Extract message_propose from stored scenarios — no second AI call
            scenarios = last_analysis.get("scenarios", [])
            match = next((s for s in scenarios if s.get("scenario") == scenario_letter), None)
            response_text = match["message_propose"] if match else await self._generator.generate_response(
                prospect, scenario_letter, last_analysis
            )

        msg = NegotiationMessage(
            id=uuid.uuid4(),
            prospect_id=prospect.id,
            direction="outbound",
            corps=response_text,
            date_message=datetime.utcnow(),
            requires_human=False,
            created_at=datetime.utcnow(),
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        return msg
