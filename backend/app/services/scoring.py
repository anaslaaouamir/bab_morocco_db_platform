from dataclasses import dataclass


@dataclass
class ScoreBreakdown:
    activite_digitale: int   # 0-25
    coherence_marche: int    # 0-25
    taille_capacite: int     # 0-20
    contact_decideur: int    # 0-15
    liberte_ota: int         # 0-15


# Priority markets (CLAUDE.md §4 — Maroc/France/EAU)
_PRIORITY_PAYS: dict[str, int] = {
    "maroc": 25, "morocco": 25,
    "france": 22,
    "uae": 20, "émirats arabes unis": 20, "emirates": 20, "dubai": 20,
    "abu dhabi": 20, "sharjah": 20,
}

# Secondary markets
_SECONDARY_PAYS: dict[str, int] = {
    "royaume-uni": 15, "uk": 15, "united kingdom": 15, "britain": 15, "england": 15,
    "espagne": 13, "spain": 13,
    "allemagne": 12, "germany": 12,
    "autriche": 11, "austria": 11,
    "arabie saoudite": 10, "saudi": 10, "qatar": 10,
    "koweit": 10, "kuwait": 10, "bahrain": 10, "bahreïn": 10,
    "belgique": 10, "belgium": 10,
    "suisse": 10, "switzerland": 10,
    "pays-bas": 10, "netherlands": 10,
    "italie": 8, "italy": 8,
    "portugal": 8,
    "allemagne": 12,
}


class ScoringEngine:
    """
    Implements the scoring algorithm from CLAUDE.md §4.
    All 5 breakdown scores are computed from prospect attributes.
    liberte_ota = 15 by default (freedom assumed; exclusivity requires a future field).
    """

    def compute_breakdown(self, prospect_data: dict) -> ScoreBreakdown:
        return ScoreBreakdown(
            activite_digitale=self._score_activite(prospect_data),
            coherence_marche=self._score_coherence(prospect_data),
            taille_capacite=self._score_taille(prospect_data),
            contact_decideur=self._score_contact(prospect_data),
            liberte_ota=self._score_liberte(prospect_data),
        )

    def compute_total(self, breakdown: ScoreBreakdown) -> int:
        return (
            breakdown.activite_digitale
            + breakdown.coherence_marche
            + breakdown.taille_capacite
            + breakdown.contact_decideur
            + breakdown.liberte_ota
        )

    def evaluate_stage(self, total: int, current_stage: str) -> str:
        """
        Auto-assign stage based on score threshold.
        Only overrides early-pipeline stages; preserves advanced stages.
        """
        if current_stage in ("prospection", "qualification", "veille", "outreach"):
            return "outreach" if total >= 75 else "veille"
        return current_stage

    def should_escalate(self, total: int) -> bool:
        """Score >= 85 = premium prospect, flag for priority attention."""
        return total >= 85

    # ── private scorers ──────────────────────────────────────────────────────

    def _score_activite(self, data: dict) -> int:
        score = 0
        if data.get("adresse_web"):       # required field, always present
            score += 8
        if data.get("presence_booking"):
            score += 7
        if data.get("note_booking") and data["note_booking"] > 8.0:
            score += 5
        if data.get("presence_expedia"):
            score += 5
        return min(score, 25)

    def _score_coherence(self, data: dict) -> int:
        pays = (data.get("pays") or "").lower()
        for keyword, pts in _PRIORITY_PAYS.items():
            if keyword in pays:
                return pts
        for keyword, pts in _SECONDARY_PAYS.items():
            if keyword in pays:
                return pts
        return 5  # hors cible

    def _score_taille(self, data: dict) -> int:
        nb = data.get("nb_chambres")
        if nb is not None:
            if nb > 50:
                return 20
            if nb >= 20:
                return 15
            if nb >= 10:
                return 10
            return 5
        if data.get("capacite_description"):
            return 10  # described but unknown count → partial credit
        return 5  # inconnu

    def _score_contact(self, data: dict) -> int:
        score = 0
        if data.get("email_contact"):
            score += 8
        if data.get("linkedin_contact"):
            score += 7
        return min(score, 15)

    def _score_liberte(self, data: dict) -> int:
        """
        Liberté OTA = absence de partenariat exclusif avec un concurrent.
        Being listed on Booking/Expedia is standard distribution, not exclusivity.
        Score = 15 (full freedom) unless an exclusive tie is detected.
        The < 2 OTAs / sur 2 rule will apply once an `exclusif_ota` field is added.
        For now: 0–1 OTAs → 15, 2 OTAs → 8 (reflects less flexibility in practice).
        """
        count = (1 if data.get("presence_booking") else 0) + (
            1 if data.get("presence_expedia") else 0
        )
        if count >= 2:
            return 8
        return 15


scoring_engine = ScoringEngine()
