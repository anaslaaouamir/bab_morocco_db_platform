from dataclasses import dataclass


@dataclass
class ScoreBreakdown:
    activite_digitale: int   # 0-25
    coherence_marche: int    # 0-25
    taille_capacite: int     # 0-20
    contact_decideur: int    # 0-15
    liberte_ota: int         # 0-15


# Priority markets (CLAUDE.md §4 — Maroc/France/EAU). Rescaled to a 20-pt cap
# (was 25) to make room for the langues_disponibles bonus below — see
# SCRAPING_ENRICHMENT_SCORING_PLAN.md Section 5.
_PRIORITY_PAYS: dict[str, int] = {
    "maroc": 20, "morocco": 20,
    "france": 18,
    "uae": 16, "émirats arabes unis": 16, "emirates": 16, "dubai": 16,
    "abu dhabi": 16, "sharjah": 16,
}

# Secondary markets, same 20-pt-cap rescale.
_SECONDARY_PAYS: dict[str, int] = {
    "royaume-uni": 12, "uk": 12, "united kingdom": 12, "britain": 12, "england": 12,
    "espagne": 10, "spain": 10,
    "allemagne": 10, "germany": 10,
    "autriche": 10, "austria": 10,
    "arabie saoudite": 8, "saudi": 8, "qatar": 8,
    "koweit": 8, "kuwait": 8, "bahrain": 8, "bahreïn": 8,
    "belgique": 8, "belgium": 8,
    "suisse": 8, "switzerland": 8,
    "pays-bas": 8, "netherlands": 8,
    "italie": 6, "italy": 6,
    "portugal": 6,
}

_PAYS_HORS_CIBLE = 4

# Bab Morocco's target outreach languages (CLAUDE.md §5).
_TARGET_LANGS = {"fr", "en", "es", "de", "ar"}


def _pays_base_score(pays: str) -> int:
    for keyword, pts in _PRIORITY_PAYS.items():
        if keyword in pays:
            return pts
    for keyword, pts in _SECONDARY_PAYS.items():
        if keyword in pays:
            return pts
    return _PAYS_HORS_CIBLE


class ScoringEngine:
    """
    Implements the scoring algorithm from CLAUDE.md §4. All 5 breakdown scores
    are computed from prospect attributes.

    Sub-checks rebuilt in SCRAPING_ENRICHMENT_SCORING_PLAN.md Section 5 around
    fields validated to generalize across every partner type (hotels, riads,
    agencies, transport, activities) — Google Places data (note_google,
    nb_avis_google, business_status, already fetched free by the scan) plus
    type-agnostic scrape signals (https_actif, cta_reservation_present,
    formulaire_contact_present, reseaux_sociaux, langues_disponibles).
    Booking/Expedia presence, room count, and LinkedIn are no longer scored —
    see BACKEND_PHASE2_SCAN_PLAN.md Sections 8-9 for why those stayed
    permanently unreachable for free.
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

    def _scraped(self, data: dict) -> bool:
        """
        True iff a website was actually fetched during enrichment. https_actif
        is a real boolean (True/False) whenever a site was scraped, and only
        None when there was nothing to scrape (manual entry with no site, or a
        prospect never scanned) — it's the one new field with unambiguous
        tri-state semantics, so it's used as the shared "was this prospect
        checked at all" signal for every scan-only boolean/text field below.
        reseaux_sociaux can't serve this role itself: None means both "never
        checked" and "checked, found nothing," so it can't reliably tell a
        neutral-pass case apart from a real negative on its own.
        """
        return data.get("https_actif") is not None

    def _score_activite(self, data: dict) -> int:
        score = 0
        if data.get("adresse_web"):
            score += 3

        note = data.get("note_google")
        if note is not None:
            if note >= 4.5:
                score += 8
            elif note >= 4.0:
                score += 5
            elif note >= 3.5:
                score += 2

        # None (never scanned, e.g. manual entry) is treated as a pass, same
        # as a confirmed OPERATIONAL status — only a confirmed closed status
        # should cost points.
        status = data.get("business_status")
        if status is None or status == "OPERATIONAL":
            score += 3

        scraped = self._scraped(data)
        if not scraped or data.get("https_actif"):
            score += 2
        if not scraped or data.get("cta_reservation_present"):
            score += 4
        if not scraped or data.get("reseaux_sociaux"):
            score += 5

        return min(score, 25)

    def _score_coherence(self, data: dict) -> int:
        pays = (data.get("pays") or "").lower()
        base = _pays_base_score(pays)

        langs_raw = data.get("langues_disponibles") or ""
        langs = {l.strip() for l in langs_raw.split(",") if l.strip()}
        bonus = 5 if len(langs & _TARGET_LANGS) >= 2 else 0

        return min(base + bonus, 25)

    def _score_taille(self, data: dict) -> int:
        """
        nb_avis_google (Google review count) instead of nb_chambres — a review
        count applies to a transport company or activity provider exactly as
        well as a hotel, unlike a room count, which is meaningless for 6 of
        the 8 partner types (see SCRAPING_ENRICHMENT_SCORING_PLAN.md Section 5).
        """
        nb = data.get("nb_avis_google")
        if nb is None:
            return 0
        if nb >= 300:
            return 20
        if nb >= 100:
            return 15
        if nb >= 30:
            return 10
        if nb >= 10:
            return 5
        return 0

    def _score_contact(self, data: dict) -> int:
        score = 0
        if data.get("email_contact"):
            score += 8
        if data.get("telephone"):
            score += 4
        if not self._scraped(data) or data.get("formulaire_contact_present"):
            score += 3
        return min(score, 15)

    def _score_liberte(self, data: dict) -> int:
        """
        Liberté OTA = absence de partenariat exclusif avec un concurrent.
        Flat placeholder — no free, reliable signal exists (Booking.com and
        Expedia both block direct scraping; see BACKEND_PHASE2_SCAN_PLAN.md
        Section 8). Not a computation, just documenting the constant per
        SCRAPING_ENRICHMENT_SCORING_PLAN.md's open items.
        """
        return 15


scoring_engine = ScoringEngine()
