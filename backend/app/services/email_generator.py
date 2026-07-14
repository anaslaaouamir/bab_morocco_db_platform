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

_LOREM = (
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor "
    "incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud "
    "exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure "
    "dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. "
    "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt "
    "mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit "
    "voluptatem accusantium doloremque laudantium, totam rem aperiam eaque ipsa quae ab "
    "illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo "
    "enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia "
    "consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro "
    "quisquam est qui dolorem ipsum quia dolor sit amet consectetur adipisci velit."
)

_VARIANT_STYLES = {
    "A": "Direct & Professional: clear pitch, specific commission, CTA 20-min call",
    "B": "Benefits-led: 3 numbered tangible benefits, consultant tone",
    "C": "Storytelling: open with the ideal traveller persona, emotional, invitation CTA",
}

_STEP_INSTRUCTIONS = {
    "j0": "Initial outreach email. Full pitch, warm but professional.",
    "j3": "First follow-up. Prospect has not opened J0. New angle, benefit-focused. Shorter.",
    "j7": "Second follow-up. Direct tone. Last attempt. Close the loop.",
    "j30": "Reactivation after 30 days of silence. Seasonal or market news hook.",
}

_TYPE_ANGLES = {
    "hotel_riad": "visibility + occupancy: fill rooms via a new international booking channel",
    "tour_operateur": "exclusive Moroccan inventory: full-country coverage they can't source alone",
    "agence_voyage": "ready-made Morocco catalogue + partner extranet for easy booking",
    "hotel_luxe": "premium positioning: curated luxury segment targeting Europe and Gulf travelers",
    "activite": "captive OTA audience: travelers already in Morocco looking for experiences",
    "transport": "seamless transfers: integrated into the booking flow for every traveler",
    "to_golfe": "Morocco as a trending destination for Gulf travelers, exclusive local supply",
    "mice": "all-in-one Morocco destination for corporate events and incentives",
}


class EmailGeneratorProtocol(Protocol):
    async def generate(self, prospect: Prospect, step: str, variant: str, prior_emails: str = "") -> tuple[str, str]:
        """Return (sujet, corps)."""
        ...


class MockEmailGenerator:
    async def generate(self, prospect: Prospect, step: str, variant: str, prior_emails: str = "") -> tuple[str, str]:
        sujet = f"[{step.upper()}-{variant}] Partnership opportunity for {prospect.nom}"
        corps = (
            f"Hello {prospect.nom},\n\n"
            f"This is Variant {variant} — step {step} — language: {prospect.langue}.\n"
            f"Partner type: {prospect.type} | Country: {prospect.pays} | "
            f"Commission: {prospect.commission_standard}%\n\n"
            f"{_LOREM}\n\n"
            f"Best regards,\nThe Bab Morocco Team"
        )
        return sujet, corps


def _build_email_prompt(prospect: Prospect, step: str, variant: str, prior_emails: str = "") -> str:
    prior_block = ""
    if prior_emails:
        prior_block = f"""
## Previous emails already sent to this prospect
{prior_emails}

IMPORTANT: Your subject and angle MUST be clearly different from those above.
"""
    _GENERIC_NAMES = {"responsable", "dg", "directeur", "directrice", "gérant", "gérante", "manager", ""}
    contact_name = prospect.nom_contact.strip()
    is_generic = contact_name.lower() in _GENERIC_NAMES
    contact_line = (
        f"- Contact: {contact_name} ({prospect.poste_contact})"
        if not is_generic
        else "- Contact name: unknown — use a neutral greeting (e.g. 'Madame, Monsieur,' in French)"
    )

    google_lines = ""
    if prospect.note_google:
        google_lines += f"\n- Google rating: {prospect.note_google}/5"
    if prospect.nb_avis_google:
        google_lines += f"\n- Google reviews: {prospect.nb_avis_google}"
    if prospect.langues_disponibles:
        google_lines += f"\n- Languages on their site: {prospect.langues_disponibles}"
    google_instruction = ""
    if google_lines:
        google_instruction = "\n- Use the Google rating / review count as a credibility argument when they are high; do not invent data if absent"

    type_label = _partner_type_description(prospect.type, prospect.langue)
    type_angle = _TYPE_ANGLES.get(prospect.type, "")
    angle_line = f"\n- Key selling angle for this partner type: {type_angle}" if type_angle else ""

    return f"""You are the Business Development AI for Bab Morocco, a premium OTA 100% dedicated to Morocco (pre-launch).
Your mission: write a B2B partnership outreach email to a potential partner.

## Partner profile
- Name: {prospect.nom}
- Type: {type_label}
- Country: {prospect.pays} | City: {prospect.ville}{angle_line}
- Commission offered: {prospect.commission_standard}% (floor: {prospect.commission_plancher}%)
- Language to write in: {prospect.langue}
{contact_line}{google_lines}
- Notes: {prospect.notes or "None"}

## Email style — Variant {variant}
{_VARIANT_STYLES[variant]}

## Sequence step — {step}
{_STEP_INSTRUCTIONS[step]}
{prior_block}## Bab Morocco context
- OTA 100% dedicated to Morocco: hotels, riads, activities, circuits, transfers
- Target travelers: European (France, UK, Spain, Germany) and Gulf (UAE, Saudi Arabia)
- Pre-launch phase — founding partners get: locked commission 12 months, Founding Partner Badge, co-marketing at launch, private beta access
- Payment: 45-day settlement cycle

## Strict rules
- NEVER promise features that don't exist yet (partner portal, advanced analytics, channel managers)
- NEVER invent traffic, sales, or booking numbers — only use data provided above
- NEVER reveal internal strategy or technical roadmap
- NEVER propose a commission below the floor ({prospect.commission_plancher}%)

## Instructions
- Write entirely in {prospect.langue} (fr=French, en=English, es=Spanish, de=German, ar=Arabic)
- Length: {300 if step == "j0" else 150} words for the body
- Tone matches the variant style above
- End with a specific CTA (20-min call for j0/j3, close the loop for j7, seasonal hook for j30){google_instruction}
- Return ONLY a JSON object: {{"sujet": "...", "corps": "..."}}
- No markdown, no explanation, just the JSON"""


def _parse_email_response(raw: str, source: str) -> tuple[str, str]:
    try:
        data = extract_json(raw)
        return data["sujet"], data["corps"]
    except (ValueError, KeyError) as exc:
        logger.error("%s invalid response | error=%s | raw=%.300s", source, exc, raw)
        raise ValueError(f"Email generation failed — {source} returned unexpected output: {exc}") from exc


class ClaudeEmailGenerator:
    def __init__(self):
        self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def generate(self, prospect: Prospect, step: str, variant: str, prior_emails: str = "") -> tuple[str, str]:
        prompt = _build_email_prompt(prospect, step, variant, prior_emails)
        message = await tracked_claude_call(
            self._client,
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
            generator="email",
            prospect_id=prospect.id,
        )
        raw = message.content[0].text.strip()
        return _parse_email_response(raw, "ClaudeEmailGenerator")


class OpenAIEmailGenerator:
    def __init__(self):
        self._client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def generate(self, prospect: Prospect, step: str, variant: str, prior_emails: str = "") -> tuple[str, str]:
        prompt = _build_email_prompt(prospect, step, variant, prior_emails)
        response = await tracked_openai_call(
            self._client,
            model="gpt-4o",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
            generator="email",
            prospect_id=prospect.id,
        )
        raw = response.choices[0].message.content.strip()
        return _parse_email_response(raw, "OpenAIEmailGenerator")


def get_email_generator() -> EmailGeneratorProtocol:
    default = settings.DEFAULT_AI_PROVIDER
    claude_ok = bool(settings.ANTHROPIC_API_KEY) and settings.ENV == "production"
    openai_ok = bool(settings.OPENAI_API_KEY) and settings.ENV == "production"

    if default == "openai" and openai_ok:
        return OpenAIEmailGenerator()
    if default == "claude" and claude_ok:
        return ClaudeEmailGenerator()
    if claude_ok:
        return ClaudeEmailGenerator()
    if openai_ok:
        return OpenAIEmailGenerator()
    return MockEmailGenerator()
