import logging
from typing import Protocol

import anthropic
import openai

from app.config import settings
from app.models.prospect import Prospect
from app.services.ai_tracker import tracked_claude_call, tracked_openai_call
from app.services.contract_generator import _partner_type_description
from app.services.json_extract import extract_json

logger = logging.getLogger(__name__)

_PERKS = (
    "Badge Partenaire Fondateur, commission verrouillée 12 mois, "
    "co-marketing au lancement, influence produit (feedback extranet), accès bêta privé"
)

_LOREM = (
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor "
    "incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud "
    "exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat."
)


class NegotiationGeneratorProtocol(Protocol):
    async def analyze(self, prospect: Prospect, message_corps: str, history: str = "") -> dict: ...
    async def generate_scenarios(self, prospect: Prospect, analysis: dict, history: str = "") -> list[dict]: ...
    async def generate_response(self, prospect: Prospect, scenario_letter: str, analysis: dict) -> str: ...


class MockNegotiationGenerator:
    async def analyze(self, prospect: Prospect, message_corps: str, history: str = "") -> dict:
        return {
            "intent": "contre_offre",
            "intent_score": 3,
            "objection_type": "prix",
            "objection_detail": (
                f"Le partenaire ({prospect.pays}) semble demander un ajustement de commission. "
                f"Commission standard actuelle : {prospect.commission_standard}%."
            ),
            "taux_demande": None,  # extracted by service via regex on the raw message
        }

    async def generate_scenarios(self, prospect: Prospect, analysis: dict, history: str = "") -> list[dict]:
        taux = analysis.get("taux_demande") or prospect.commission_standard
        return [
            {
                "scenario": "A",
                "titre": "Accepter les conditions du partenaire",
                "description": (
                    f"Accepter le taux demandé de {taux}% pour accélérer le closing. "
                    f"Applicable si le taux reste supérieur au plancher absolu de {prospect.commission_plancher}%."
                ),
                "avantages": "Closing rapide, relation partenaire positive dès le départ, gain de temps.",
                "risques": "Marge réduite, crée un précédent pour de futures renégociations.",
                "message_propose": (
                    f"Bonjour,\n\nNous avons bien pris note de votre demande concernant un taux de {taux}%. "
                    f"Après examen, nous sommes en mesure d'accepter ces conditions. "
                    f"{_LOREM}\n\nCordialement,\nL'équipe Bab Morocco"
                ),
            },
            {
                "scenario": "B",
                "titre": "Contre-proposer avec contreparties non-financières",
                "description": (
                    f"Maintenir la commission standard de {prospect.commission_standard}% "
                    f"en offrant des contreparties à forte valeur perçue : {_PERKS}."
                ),
                "avantages": (
                    "Marge préservée. Valeur perçue augmentée via Badge Fondateur et co-marketing. "
                    "Différenciation par rapport aux OTAs concurrentes."
                ),
                "risques": "Négociation plus longue. Le partenaire peut maintenir sa demande.",
                "message_propose": (
                    f"Bonjour,\n\nNous vous remercions pour votre retour. "
                    f"Nous souhaitons maintenir notre commission standard de {prospect.commission_standard}%, "
                    f"mais nous vous proposons en contrepartie : {_PERKS}. "
                    f"{_LOREM}\n\nCordialement,\nL'équipe Bab Morocco"
                ),
            },
            {
                "scenario": "C",
                "titre": "Escalade vers le responsable commercial",
                "description": (
                    "Transmettre ce dossier au responsable commercial Bab Morocco "
                    "pour une décision stratégique adaptée à ce profil de partenaire."
                ),
                "avantages": "Décision optimale. Relation partenaire respectée. Aucun engagement prématuré.",
                "risques": "Délai supplémentaire de 24-48h. Risque de perte du momentum.",
                "message_propose": (
                    "Bonjour,\n\nVotre demande a retenu toute notre attention. "
                    "Notre responsable commercial prendra contact avec vous sous 48 heures "
                    "pour trouver ensemble la meilleure solution.\n\nCordialement,\nL'équipe Bab Morocco"
                ),
            },
        ]

    async def generate_response(self, prospect: Prospect, scenario_letter: str, analysis: dict) -> str:
        taux = analysis.get("taux_demande") or prospect.commission_standard
        return (
            f"[Réponse — Scénario {scenario_letter}]\n\n"
            f"Bonjour,\n\nSuite à votre message concernant notre partenariat, "
            f"voici notre position (commission discutée : {taux}%, plancher : {prospect.commission_plancher}%). "
            f"{_LOREM}\n\nCordialement,\nL'équipe Bab Morocco"
        )


def _build_negotiation_analyze_prompt(prospect: Prospect, message_corps: str, history: str = "") -> str:
    history_block = ""
    if history:
        history_block = f"""
## Conversation history (most recent last)
{history}

"""
    return f"""You are the Business Development AI for Bab Morocco, an OTA dedicated to Morocco.

Analyze this inbound message from a potential partner and return a structured JSON analysis.

## Partner profile
- Name: {prospect.nom}
- Type: {_partner_type_description(prospect.type, prospect.langue)}
- Country: {prospect.pays}
- Commission standard: {prospect.commission_standard}%
- Commission floor (plancher absolu): {prospect.commission_plancher}%
- Score: {prospect.score_total}/100
{history_block}## Inbound message to analyze
\"\"\"{message_corps}\"\"\"

## Instructions
Analyze the message and return ONLY this JSON (no markdown, no explanation):
{{
  "intent": "<tres_motive|interesse|contre_offre|objection|neutre>",
  "intent_score": <1-5 where 5=very motivated>,
  "objection_type": "<prix|risque|concurrence|timing|confiance|null>",
  "objection_detail": "<one sentence describing the objection or counter-offer>",
  "taux_demande": <float if partner explicitly requested a specific rate, else null>
}}

Rules:
- If the partner requests a specific commission rate, extract it as taux_demande (float)
- intent=contre_offre if the partner proposes different conditions
- intent=objection if the partner raises concerns without a counter-offer
- Be precise about the objection_type based on the actual content
- NEVER invent traffic, sales, or booking numbers not provided above
- NEVER reveal internal strategy or technical roadmap"""


def _parse_negotiation_json(raw: str, source: str) -> dict | list:
    try:
        return extract_json(raw)
    except ValueError as exc:
        logger.error("%s failed | %s | raw=%.300s", source, exc, raw)
        raise


def _build_negotiation_scenarios_prompt(prospect: Prospect, analysis: dict, history: str = "") -> str:
    taux = analysis.get("taux_demande") or prospect.commission_standard
    history_block = ""
    if history:
        history_block = f"""
## Conversation history (most recent last)
{history}

"""
    return f"""You are the Business Development AI for Bab Morocco.

Generate exactly 3 negotiation response scenarios for the following situation.

## Partner profile
- Name: {prospect.nom} | Type: {_partner_type_description(prospect.type, prospect.langue)} | Country: {prospect.pays}
- Commission standard: {prospect.commission_standard}% | Floor: {prospect.commission_plancher}%
{history_block}## Analysis of their message
- Intent: {analysis.get("intent")} (score: {analysis.get("intent_score")}/5)
- Objection type: {analysis.get("objection_type")}
- Detail: {analysis.get("objection_detail")}
- Rate requested: {taux}%

## Non-financial perks available (use in Scenario B)
Badge Partenaire Fondateur, commission verrouillée 12 mois, co-marketing au lancement,
influence produit (feedback extranet), accès bêta privé.

## Instructions
Return ONLY a JSON array of 3 objects (no markdown):
[
  {{
    "scenario": "A",
    "titre": "...",
    "description": "...",
    "avantages": "...",
    "risques": "...",
    "message_propose": "..."
  }},
  {{ "scenario": "B", ... }},
  {{ "scenario": "C", ... }}
]

Rules:
- Scenario A: Accept partner conditions (only if taux >= plancher, else escalate)
- Scenario B: Counter-propose standard commission + non-financial perks listed above
- Scenario C: Escalate to human commercial manager
- message_propose for each: write the actual email text to send (150-200 words)
- Language: match the partner's country language ({prospect.langue})
- NEVER promise features that don't exist yet (partner portal, advanced analytics, channel managers)
- NEVER propose a commission below the floor ({prospect.commission_plancher}%)
- NEVER invent traffic, sales, or booking numbers — only use data provided above
- If conversation history is provided, do NOT re-offer perks already proposed or contradict earlier messages"""


class ClaudeNegotiationGenerator:
    def __init__(self):
        self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def analyze(self, prospect: Prospect, message_corps: str, history: str = "") -> dict:
        prompt = _build_negotiation_analyze_prompt(prospect, message_corps, history)
        message = await tracked_claude_call(
            self._client,
            model="claude-sonnet-4-6",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
            generator="negotiation_analyze",
            prospect_id=prospect.id,
        )
        raw = message.content[0].text.strip()
        return _parse_negotiation_json(raw, "ClaudeNegotiationGenerator.analyze")

    async def generate_scenarios(self, prospect: Prospect, analysis: dict, history: str = "") -> list[dict]:
        prompt = _build_negotiation_scenarios_prompt(prospect, analysis, history)
        message = await tracked_claude_call(
            self._client,
            model="claude-sonnet-4-6",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
            generator="negotiation_scenarios",
            prospect_id=prospect.id,
        )
        raw = message.content[0].text.strip()
        return _parse_negotiation_json(raw, "ClaudeNegotiationGenerator.generate_scenarios")

    async def generate_response(self, prospect: Prospect, scenario_letter: str, analysis: dict) -> str:
        scenarios = await self.generate_scenarios(prospect, analysis)
        for s in scenarios:
            if s["scenario"] == scenario_letter:
                return s["message_propose"]
        return ""


class OpenAINegotiationGenerator:
    def __init__(self):
        self._client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def analyze(self, prospect: Prospect, message_corps: str, history: str = "") -> dict:
        prompt = _build_negotiation_analyze_prompt(prospect, message_corps, history)
        response = await tracked_openai_call(
            self._client,
            model="gpt-4o",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
            generator="negotiation_analyze",
            prospect_id=prospect.id,
        )
        raw = response.choices[0].message.content.strip()
        return _parse_negotiation_json(raw, "OpenAINegotiationGenerator.analyze")

    async def generate_scenarios(self, prospect: Prospect, analysis: dict, history: str = "") -> list[dict]:
        prompt = _build_negotiation_scenarios_prompt(prospect, analysis, history)
        response = await tracked_openai_call(
            self._client,
            model="gpt-4o",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
            generator="negotiation_scenarios",
            prospect_id=prospect.id,
        )
        raw = response.choices[0].message.content.strip()
        return _parse_negotiation_json(raw, "OpenAINegotiationGenerator.generate_scenarios")

    async def generate_response(self, prospect: Prospect, scenario_letter: str, analysis: dict) -> str:
        scenarios = await self.generate_scenarios(prospect, analysis)
        for s in scenarios:
            if s["scenario"] == scenario_letter:
                return s["message_propose"]
        return ""


def get_negotiation_generator() -> NegotiationGeneratorProtocol:
    default = settings.DEFAULT_AI_PROVIDER
    claude_ok = bool(settings.ANTHROPIC_API_KEY) and settings.ENV == "production"
    openai_ok = bool(settings.OPENAI_API_KEY) and settings.ENV == "production"

    if default == "openai" and openai_ok:
        return OpenAINegotiationGenerator()
    if default == "claude" and claude_ok:
        return ClaudeNegotiationGenerator()
    if claude_ok:
        return ClaudeNegotiationGenerator()
    if openai_ok:
        return OpenAINegotiationGenerator()
    return MockNegotiationGenerator()
