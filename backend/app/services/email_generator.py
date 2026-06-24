import json
import logging
from typing import Protocol

import anthropic

from app.config import settings
from app.models.prospect import Prospect

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


class EmailGeneratorProtocol(Protocol):
    async def generate(self, prospect: Prospect, step: str, variant: str) -> tuple[str, str]:
        """Return (sujet, corps)."""
        ...


class MockEmailGenerator:
    async def generate(self, prospect: Prospect, step: str, variant: str) -> tuple[str, str]:
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


class ClaudeEmailGenerator:
    def __init__(self):
        self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def generate(self, prospect: Prospect, step: str, variant: str) -> tuple[str, str]:
        prompt = f"""You are the Business Development AI for Bab Morocco, a premium OTA 100% dedicated to Morocco (pre-launch).
Your mission: write a B2B partnership outreach email to a potential partner.

## Partner profile
- Name: {prospect.nom}
- Type: {prospect.type}
- Country: {prospect.pays} | City: {prospect.ville}
- Commission offered: {prospect.commission_standard}% (floor: {prospect.commission_plancher}%)
- Score: {prospect.score_total}/100
- Language to write in: {prospect.langue}
- Contact: {prospect.nom_contact} ({prospect.poste_contact})
- Notes: {prospect.notes or "None"}

## Email style — Variant {variant}
{_VARIANT_STYLES[variant]}

## Sequence step — {step}
{_STEP_INSTRUCTIONS[step]}

## Bab Morocco context
- OTA 100% dedicated to Morocco: hotels, riads, activities, circuits, transfers
- Target travelers: European (France, UK, Spain, Germany) and Gulf (UAE, Saudi Arabia)
- Pre-launch phase — founding partners get: locked commission 12 months, Founding Partner Badge, co-marketing at launch, private beta access
- Payment: 45-day settlement cycle

## Instructions
- Write entirely in {prospect.langue} (fr=French, en=English, es=Spanish, de=German, ar=Arabic)
- Length: {300 if step == "j0" else 150} words for the body
- Tone matches the variant style above
- End with a specific CTA (20-min call for j0/j3, close the loop for j7, seasonal hook for j30)
- Return ONLY a JSON object: {{"sujet": "...", "corps": "..."}}
- No markdown, no explanation, just the JSON"""

        message = await self._client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        data = json.loads(raw)
        return data["sujet"], data["corps"]


def get_email_generator() -> EmailGeneratorProtocol:
    if settings.ANTHROPIC_API_KEY and settings.ENV == "production":
        return ClaudeEmailGenerator()
    return MockEmailGenerator()
