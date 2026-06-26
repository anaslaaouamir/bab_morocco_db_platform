"""
Contract text generator — dual-mode (Mock / Claude).

Dev mode  : MockContractGenerator — realistic pre-written clauses filled with
            prospect data. No AI call. Real, complete French text by default.
Prod mode : ClaudeContractGenerator — full Anthropic call that generates all
            9 clauses in the partner's language with proper legal phrasing.

Activation gate (same pattern as email_generator / negotiation_generator):
  ANTHROPIC_API_KEY set + ENV=production  →  Claude
  anything else                           →  Mock
"""

import json
import logging
from typing import Protocol

import anthropic

from app.config import settings
from app.models.prospect import Prospect

logger = logging.getLogger(__name__)

# ─── Commission floors per partner type (CLAUDE.md §3) ───────────────────────
COMMISSION_FLOORS: dict[str, float] = {
    "hotel_riad":    8.0,
    "tour_operateur": 10.0,
    "agence_voyage": 12.0,
    "hotel_luxe":    8.0,
    "activite":      15.0,
    "transport":     12.0,
    "to_golfe":      10.0,
    "mice":          10.0,
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _partner_type_description(partner_type: str, language: str) -> str:
    desc = {
        "hotel_riad":     {"fr": "d'hébergement (hôtel / riad)", "en": "accommodation (hotel / riad)", "es": "alojamiento (hotel / riad)", "de": "Unterkunft (Hotel / Riad)", "ar": "الإقامة (فندق / رياض)"},
        "tour_operateur": {"fr": "de tour-opérateur", "en": "tour operator", "es": "operador turístico", "de": "Reiseveranstalter", "ar": "منظم رحلات"},
        "agence_voyage":  {"fr": "d'agence de voyages B2B", "en": "B2B travel agency", "es": "agencia de viajes B2B", "de": "B2B-Reisebüro", "ar": "وكالة سفر"},
        "hotel_luxe":     {"fr": "d'hébergement de luxe 5 étoiles", "en": "5-star luxury accommodation", "es": "alojamiento de lujo 5 estrellas", "de": "5-Sterne-Luxusunterkunft", "ar": "إقامة فاخرة 5 نجوم"},
        "activite":       {"fr": "de prestataires d'activités", "en": "activity provider", "es": "proveedor de actividades", "de": "Aktivitätsanbieter", "ar": "مزود الأنشطة"},
        "transport":      {"fr": "de transport et transferts", "en": "transport and transfers", "es": "transporte y traslados", "de": "Transport und Transfers", "ar": "النقل والتحويلات"},
        "to_golfe":       {"fr": "de tour-opérateur Golfe", "en": "Gulf tour operator", "es": "operador turístico del Golfo", "de": "Golf-Reiseveranstalter", "ar": "منظم رحلات الخليج"},
        "mice":           {"fr": "MICE et incentive", "en": "MICE and incentive", "es": "MICE e incentivos", "de": "MICE und Incentive", "ar": "السياحة والحوافز"},
    }
    lang = language if language in ("fr", "en", "es", "de", "ar") else "fr"
    return desc.get(partner_type, {}).get(lang, partner_type)


def _get_jurisdiction(country: str) -> tuple[str, str]:
    """Return (applicable_law_label, jurisdiction_city) for the given country."""
    c = country.lower()
    if c in ("france", "belgique", "suisse"):
        return "français", "Paris"
    if c in ("maroc", "morocco"):
        return "marocain (Code des obligations et contrats)", "Casablanca"
    if c in ("espagne", "spain", "españa"):
        return "espagnol", "Madrid"
    if c in ("allemagne", "germany", "autriche", "österreich"):
        return "allemand (BGB)", "Francfort"
    if c in ("emirats arabes unis", "uae", "united arab emirates"):
        return "anglais (droit des Émirats Arabes Unis, DIFC)", "Dubaï"
    if c in ("arabie saoudite", "saudi arabia"):
        return "islamique (droit saoudien)", "Riyad"
    if c in ("qatar",):
        return "qatarien (QFC)", "Doha"
    if c in ("royaume-uni", "united kingdom", "uk"):
        return "anglais", "Londres"
    return "français", "Paris"


def _get_gdpr_clause_label(country: str) -> str:
    c = country.lower()
    if c in ("emirats arabes unis", "uae", "united arab emirates", "arabie saoudite", "saudi arabia", "qatar"):
        return "PDPL"   # Personal Data Protection Law (Gulf)
    if c in ("maroc", "morocco"):
        return "Loi 09-08"  # Moroccan data protection law
    return "RGPD"   # EU GDPR (default for Europe)


# ─── Protocol ────────────────────────────────────────────────────────────────

class ContractGeneratorProtocol(Protocol):
    async def generate_clauses(self, prospect: Prospect) -> dict: ...


# ─── Mock generator ──────────────────────────────────────────────────────────

class MockContractGenerator:
    """
    Returns complete, realistic French contract clauses filled with actual
    prospect data. No AI call — always works in dev mode.
    English/other languages get the same French text with an [EN] prefix note;
    ClaudeContractGenerator handles proper multilingual output.
    """

    async def generate_clauses(self, prospect: Prospect) -> dict:
        law, city = _get_jurisdiction(prospect.pays)
        gdpr = _get_gdpr_clause_label(prospect.pays)
        type_desc = _partner_type_description(prospect.type, "fr")
        commission = prospect.commission_standard

        return {
            "parties": (
                f"Entre :\n\n"
                f"**Bab Morocco SARL**, société à responsabilité limitée, dont le siège social est "
                f"situé au Maroc, immatriculée au Registre du Commerce, ci-après dénommée "
                f"« Bab Morocco » ou « la Plateforme »,\n\n"
                f"ET :\n\n"
                f"**{prospect.nom}**, dont le siège social est situé à {prospect.ville}, {prospect.pays}, "
                f"représenté(e) par {prospect.nom_contact}, en qualité de {prospect.poste_contact}, "
                f"ci-après dénommé « le Partenaire »."
            ),
            "objet": (
                f"Le présent contrat a pour objet de définir les modalités et conditions du "
                f"partenariat commercial entre Bab Morocco et le Partenaire, portant sur la "
                f"distribution et la commercialisation des prestations {type_desc} du Partenaire "
                f"via la plateforme de réservation en ligne babmorocco.com, dédiée aux destinations "
                f"marocaines et ciblant une clientèle internationale (Europe, Golfe).\n\n"
                f"Ce partenariat vise à assurer la visibilité maximale des offres du Partenaire "
                f"auprès d'une clientèle qualifiée, et à générer des réservations directes via "
                f"les canaux numériques de Bab Morocco."
            ),
            "commission_clause": (
                f"En contrepartie de la mise en avant des prestations du Partenaire sur la "
                f"plateforme Bab Morocco, le Partenaire s'engage à verser à Bab Morocco une "
                f"commission de **{commission}% (hors taxes)** sur le montant hors taxes de chaque "
                f"réservation confirmée et effectivement séjournée.\n\n"
                f"**Modalités de paiement :** Les commissions sont facturées mensuellement et "
                f"réglées par virement bancaire dans un délai de **45 jours** suivant la clôture "
                f"du mois de référence. Tout retard de paiement supérieur à 15 jours entraîne "
                f"l'application de pénalités de retard au taux légal en vigueur.\n\n"
                f"**Annulations :** Les réservations annulées dans les délais de la politique "
                f"d'annulation du Partenaire ne donnent lieu à aucune commission. Les "
                f"no-shows sont facturés à hauteur de 50% de la commission applicable."
            ),
            "obligations_bab": (
                f"Bab Morocco s'engage à :\n\n"
                f"1. Assurer la visibilité permanente des offres du Partenaire sur babmorocco.com, "
                f"dans les sections pertinentes correspondant à son type de prestation ;\n"
                f"2. Fournir un accès à un tableau de bord partenaire permettant le suivi "
                f"en temps réel des réservations, disponibilités et revenus générés ;\n"
                f"3. Transmettre un rapport mensuel détaillé des réservations, annulations "
                f"et commissions dues, dans les 5 premiers jours ouvrables du mois suivant ;\n"
                f"4. Garantir la sécurité des données du Partenaire et des voyageurs "
                f"conformément aux réglementations applicables ;\n"
                f"5. Mettre à disposition une équipe support dédiée aux partenaires, "
                f"disponible en jours ouvrables ;\n"
                f"6. Promouvoir les offres du Partenaire via ses canaux marketing "
                f"(newsletter, réseaux sociaux, campagnes digitales) proportionnellement "
                f"au volume de réservations généré."
            ),
            "obligations_partner": (
                f"Le Partenaire s'engage à :\n\n"
                f"1. Maintenir ses disponibilités et tarifs à jour sur la plateforme Bab Morocco, "
                f"avec un délai de mise à jour maximal de 24 heures ;\n"
                f"2. Garantir la **parité tarifaire** : les tarifs proposés sur Bab Morocco ne "
                f"pourront en aucun cas être supérieurs à ceux proposés en direct ou sur toute "
                f"autre plateforme de distribution ;\n"
                f"3. Confirmer toute demande de réservation dans un délai de **24 heures** "
                f"ouvrables ;\n"
                f"4. Maintenir un niveau de qualité de service conforme aux standards attendus "
                f"par la clientèle cible de Bab Morocco (satisfaction minimale de 4/5) ;\n"
                f"5. Informer Bab Morocco de toute modification significative de l'établissement "
                f"(fermeture, rénovation, changement de catégorie) avec un préavis de 30 jours ;\n"
                f"6. Ne pas conclure de partenariat d'exclusivité avec une plateforme OTA "
                f"concurrente opérant sur le même segment de marché sans accord préalable "
                f"écrit de Bab Morocco."
            ),
            "duree_clause": (
                f"Le présent contrat est conclu pour une durée de **douze (12) mois** à compter "
                f"de la date de signature électronique par les deux parties.\n\n"
                f"Il se renouvelle ensuite **tacitement** par périodes successives de 12 mois, "
                f"sauf dénonciation notifiée par l'une ou l'autre des parties par lettre "
                f"recommandée avec accusé de réception ou par email certifié, moyennant un "
                f"préavis de **30 jours** avant l'échéance.\n\n"
                f"En cas de manquement grave aux obligations contractuelles non rectifié dans "
                f"un délai de 15 jours après mise en demeure, chaque partie se réserve le "
                f"droit de résilier le contrat avec effet immédiat et sans indemnité."
            ),
            "confidentialite": (
                f"Chacune des parties s'engage à traiter comme strictement confidentielle "
                f"toute information technique, commerciale, financière ou stratégique que "
                f"l'autre partie lui aura communiquée dans le cadre de ce partenariat, "
                f"et à ne pas la divulguer à des tiers sans consentement préalable écrit.\n\n"
                f"Cette obligation de confidentialité s'applique à l'ensemble des informations "
                f"marquées « Confidentiel » ou dont la nature confidentielle est évidente, "
                f"et survit à l'expiration ou à la résiliation du présent contrat pour une "
                f"durée de **trois (3) ans**.\n\n"
                f"Les éléments visuels, marques, logos et contenus produits dans le cadre "
                f"de ce partenariat restent la propriété intellectuelle de leur créateur "
                f"respectif. Toute utilisation à des fins promotionnelles requiert un accord "
                f"préalable écrit."
            ),
            "rgpd_clause": (
                f"Les parties s'engagent à respecter les dispositions du **{gdpr}** applicables "
                f"au traitement des données personnelles des voyageurs dans le cadre de ce "
                f"partenariat.\n\n"
                f"Chaque partie agit en qualité de **responsable de traitement** pour les "
                f"données qu'elle collecte directement auprès des voyageurs. Dans les cas "
                f"où Bab Morocco transmet des données personnelles au Partenaire pour "
                f"permettre l'exécution d'une prestation, un **Accord de Traitement des "
                f"Données (DPA)** sera annexé au présent contrat et en fera partie intégrante.\n\n"
                f"Le Partenaire s'engage à ne pas utiliser les données personnelles des "
                f"voyageurs transmises par Bab Morocco à des fins autres que l'exécution "
                f"des prestations réservées, et à les supprimer ou les anonymiser à l'issue "
                f"de la période légale de conservation applicable."
            ),
            "juridiction": (
                f"Le présent contrat est régi par le **droit {law}**.\n\n"
                f"Tout litige relatif à l'interprétation, à l'exécution ou à la résiliation "
                f"du présent contrat fera l'objet, préalablement à toute action judiciaire, "
                f"d'une tentative de résolution amiable entre les parties dans un délai de "
                f"30 jours suivant la notification du différend.\n\n"
                f"À défaut de règlement amiable, les parties se soumettent à la compétence "
                f"exclusive des **tribunaux de {city}**."
            ),
            "post_signature_note": (
                f"La signature électronique du présent contrat par les deux parties via la "
                f"plateforme YouSign (certifiée **eIDAS**) a valeur d'original et emporte "
                f"acceptation de l'ensemble des clauses.\n\n"
                f"**Activation automatique :** dans un délai d'**une (1) heure** suivant la "
                f"signature des deux parties, le compte Partenaire de {prospect.nom} sera "
                f"automatiquement activé sur babmorocco.com. Le Partenaire recevra ses "
                f"identifiants d'accès à l'espace partenaire (extranet) par email à l'adresse "
                f"{prospect.email_contact}.\n\n"
                f"Le Partenaire bénéficiera du statut **« Partenaire Fondateur »** comprenant : "
                f"visibilité prioritaire en première page au lancement, commission et conditions "
                f"verrouillées 12 mois, co-marketing au lancement (newsletter, réseaux sociaux, "
                f"page dédiée), influence directe sur le produit (feedback extranet), et accès "
                f"bêta privé avant le grand public."
            ),
        }


# ─── Claude generator ─────────────────────────────────────────────────────────

class ClaudeContractGenerator:
    """Generates all 9 contract clauses via Claude in the partner's language."""

    def __init__(self) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def generate_clauses(self, prospect: Prospect) -> dict:
        law, city = _get_jurisdiction(prospect.pays)
        gdpr = _get_gdpr_clause_label(prospect.pays)
        type_desc = _partner_type_description(prospect.type, prospect.langue)
        floor = COMMISSION_FLOORS.get(prospect.type, 8.0)

        lang_names = {
            "fr": "French", "en": "English", "es": "Spanish",
            "de": "German", "ar": "Arabic",
        }
        lang_name = lang_names.get(prospect.langue, "French")

        prompt = f"""You are a senior B2B contract writer for Bab Morocco, a Morocco-dedicated OTA.

Generate a complete, professional partnership contract in **{lang_name}** for the following partner.

## Partner profile
- Name: {prospect.nom}
- Type: {prospect.type} ({type_desc})
- Country: {prospect.pays}, City: {prospect.ville}
- Contact: {prospect.nom_contact} ({prospect.poste_contact})
- Email: {prospect.email_contact}
- Commission agreed: {prospect.commission_standard}% (absolute floor: {floor}%)
- Applicable law: {law}
- Jurisdiction city: {city}
- Data protection framework: {gdpr}

## Non-financial perks (ALWAYS include in post_signature_note)
Badge Partenaire Fondateur, commission locked 12 months, co-marketing at launch,
product influence (extranet feedback), private beta access before public launch.

## Output format
Return ONLY a valid JSON object with exactly these 10 keys — no markdown fences,
no extra keys, no explanation. All text values in **{lang_name}**:

{{
  "parties": "<full parties clause — both parties named with address and representative>",
  "objet": "<scope of partnership clause — what products, which channels, which markets>",
  "commission_clause": "<commission %, payment delay 45 days, penalties, cancellation policy>",
  "obligations_bab": "<Bab Morocco obligations — visibility, dashboard, monthly report, support>",
  "obligations_partner": "<Partner obligations — rate parity, 24h confirmation, quality standard>",
  "duree_clause": "<12 months, tacit renewal, 30-day notice, termination for cause>",
  "confidentialite": "<confidentiality, 3-year survival, IP ownership>",
  "rgpd_clause": "<{gdpr} compliance, DPA annex, data usage restrictions>",
  "juridiction": "<{law} law, {city} jurisdiction, 30-day amicable resolution attempt>",
  "post_signature_note": "<YouSign eIDAS signature, 1-hour automatic OTA activation, Partenaire Fondateur perks>"
}}

## Strict rules
- If commission < {floor}%, include field "human_review_required": true and stop — do NOT write clauses.
- Never promise features not yet live: no partner portal, no advanced analytics, no channel managers.
- All monetary references use the currency standard of {prospect.pays}.
- Keep each clause self-contained and professional (150-250 words per clause).
"""

        message = await self._client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, KeyError) as exc:
            logger.error(
                "ClaudeContractGenerator.generate_clauses invalid JSON | error=%s | raw=%.300s",
                exc, raw,
            )
            raise ValueError(f"Contract generation failed — Claude returned unexpected output: {exc}") from exc


# ─── DI factory ──────────────────────────────────────────────────────────────

def get_contract_generator() -> ContractGeneratorProtocol:
    if settings.ANTHROPIC_API_KEY and settings.ENV == "production":
        return ClaudeContractGenerator()
    return MockContractGenerator()
