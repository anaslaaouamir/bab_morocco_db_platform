"""
SP3 — Scoring engine tests.
Pure unit tests run directly against ScoringEngine (no DB needed).
Integration tests use the API client to verify end-to-end behaviour.

Formula rebuilt in SCRAPING_ENRICHMENT_SCORING_PLAN.md Section 5 — see
app/services/scoring.py's module/class docstrings for the full rationale.
"""
import pytest

from app.services.scoring import ScoringEngine

BASE = "/prospects"

engine = ScoringEngine()


# ── helpers ──────────────────────────────────────────────────────────────────

def prospect_data(**overrides):
    base = {
        "nom": "Test Riad",
        "type": "hotel_riad",
        "pays": "Maroc",
        "ville": "Marrakech",
        "adresse_web": "https://test.ma",
        "email_contact": "test@test.ma",
        "nom_contact": "Ali",
        "poste_contact": "DG",
        "telephone": None,
        "note_google": None,
        "nb_avis_google": None,
        "business_status": None,
        "https_actif": None,
        "cta_reservation_present": None,
        "formulaire_contact_present": None,
        "reseaux_sociaux": None,
        "langues_disponibles": None,
    }
    return {**base, **overrides}


def api_payload(**overrides):
    return {
        "nom": "Riad Scoring",
        "type": "hotel_riad",
        "pays": "Maroc",
        "ville": "Marrakech",
        "adresse_web": "https://scoring-test.ma",
        "email_contact": "scoring@test.ma",
        "nom_contact": "Ali",
        "poste_contact": "DG",
        **overrides,
    }


# ── Unit tests — pure engine (no DB, no client fixture) ───────────────────

def test_perfect_prospect_score_100():
    """All criteria at maximum → score 100."""
    data = prospect_data(
        pays="Maroc",
        note_google=4.8,
        business_status="OPERATIONAL",
        https_actif=True,
        cta_reservation_present=True,
        reseaux_sociaux="instagram,facebook",
        langues_disponibles="fr,en",
        nb_avis_google=350,
        email_contact="dg@test.ma",
        telephone="+212600000000",
        formulaire_contact_present=True,
    )
    breakdown = engine.compute_breakdown(data)
    total = engine.compute_total(breakdown)
    assert breakdown.activite_digitale == 25
    assert breakdown.coherence_marche == 25
    assert breakdown.taille_capacite == 20
    assert breakdown.contact_decideur == 15
    assert breakdown.liberte_ota == 15
    assert total == 100


def test_manual_entry_gets_neutral_pass_on_scan_only_signals():
    """
    A prospect never scanned (https_actif/cta/formulaire/business_status all
    None, e.g. a manual Add-Prospect entry) must not be penalized for fields
    the manual form doesn't collect — those sub-checks award full credit
    rather than 0. This is intentional (see scoring.py's _scraped docstring),
    not a bug — documented here so a future change to that design shows up as
    a deliberate test update, not a silent regression.
    """
    data = prospect_data(pays="Inconnu")
    breakdown = engine.compute_breakdown(data)
    total = engine.compute_total(breakdown)
    # activite: site(3) + note(0, None) + status neutral(3) + https/cta/social neutral(2+4+5=11) = 17
    # coherence: hors-cible(4) + no lang bonus(0) = 4
    # taille: nb_avis None = 0
    # contact: email(8) + no phone(0) + formulaire neutral(3) = 11
    # liberte: 15
    assert breakdown.activite_digitale == 17
    assert breakdown.coherence_marche == 4
    assert breakdown.taille_capacite == 0
    assert breakdown.contact_decideur == 11
    assert breakdown.liberte_ota == 15
    assert total == 47
    assert total < 75


@pytest.mark.parametrize(
    "note_google,expected_points",
    [(4.8, 8), (4.5, 8), (4.2, 5), (4.0, 5), (3.7, 2), (3.5, 2), (3.0, 0), (None, 0)],
)
def test_activite_note_google_tiers(note_google, expected_points):
    """note_google tiers add exactly the documented points, isolated from every
    other activite_digitale sub-check by forcing them to their zero state."""
    data = prospect_data(
        note_google=note_google, business_status="CLOSED_PERMANENTLY",
        https_actif=False, cta_reservation_present=False, reseaux_sociaux=None,
    )
    bd = engine.compute_breakdown(data)
    # site(3) + note(expected_points) + status(0, confirmed closed) + https/cta/social(0, scraped and all False)
    assert bd.activite_digitale == 3 + expected_points


def test_activite_scraped_signals_scored_when_present():
    """When a real scan ran (https_actif is not None), the three scan-only
    booleans are scored on their real values, not neutral-passed."""
    good = engine.compute_breakdown(prospect_data(
        https_actif=True, cta_reservation_present=True, reseaux_sociaux="instagram",
        note_google=None, business_status="CLOSED_PERMANENTLY",
    ))
    bad = engine.compute_breakdown(prospect_data(
        https_actif=False, cta_reservation_present=False, reseaux_sociaux=None,
        note_google=None, business_status="CLOSED_PERMANENTLY",
    ))
    # 2 (https) + 4 (cta) + 5 (social) = 11-point spread between all-present and all-absent
    assert good.activite_digitale - bad.activite_digitale == 11


def test_coherence_maroc_priority_market_no_language_bonus():
    """Maroc base score, no published-language bonus → 20."""
    bd = engine.compute_breakdown(prospect_data(pays="Maroc", langues_disponibles=None))
    assert bd.coherence_marche == 20


def test_coherence_language_bonus_requires_two_target_languages():
    """Publishing >=2 of Bab Morocco's target languages adds +5, capped at 25."""
    one_lang = engine.compute_breakdown(prospect_data(pays="Maroc", langues_disponibles="fr"))
    two_langs = engine.compute_breakdown(prospect_data(pays="Maroc", langues_disponibles="fr,en"))
    assert one_lang.coherence_marche == 20
    assert two_langs.coherence_marche == 25


def test_taille_nb_avis_google_gives_max():
    """nb_avis_google=350 (>= 300) → taille_capacite == 20."""
    bd = engine.compute_breakdown(prospect_data(nb_avis_google=350))
    assert bd.taille_capacite == 20


def test_taille_nb_avis_google_none_gives_zero():
    """No review count at all (never scanned) → taille_capacite == 0, unlike
    the old nb_chambres formula which gave a default 5 for 'unknown'."""
    bd = engine.compute_breakdown(prospect_data(nb_avis_google=None))
    assert bd.taille_capacite == 0


def test_contact_email_only_gives_8_when_scanned():
    """Email present, no phone, scanned-and-confirmed-no-form → contact == 8."""
    bd = engine.compute_breakdown(prospect_data(
        email_contact="x@x.com", telephone=None,
        https_actif=False, formulaire_contact_present=False,
    ))
    assert bd.contact_decideur == 8


def test_contact_telephone_adds_4():
    without = engine.compute_breakdown(prospect_data(
        telephone=None, https_actif=False, formulaire_contact_present=False,
    ))
    with_ = engine.compute_breakdown(prospect_data(
        telephone="+212600000000", https_actif=False, formulaire_contact_present=False,
    ))
    assert with_.contact_decideur - without.contact_decideur == 4


def test_liberte_always_15():
    """Flat placeholder — no free signal exists, see scoring.py docstring."""
    assert engine.compute_breakdown(prospect_data()).liberte_ota == 15


# ── Integration tests — via API ───────────────────────────────────────────

@pytest.mark.anyio
async def test_score_75_triggers_outreach_stage(client):
    """
    Prospect scoring exactly 75 is placed in outreach.
    France(18) + telephone(+4) + nb_avis 30-99(+10) on top of the unscanned
    baseline (activite 17, contact 8+neutral-3) = 75.
    """
    payload = api_payload(
        pays="France",
        email_contact="dg@france-tour.fr",
        telephone="+33600000000",
        nb_avis_google=50,
    )
    resp = await client.post(BASE, json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["score_total"] == 75
    assert body["stage"] == "outreach"


@pytest.mark.anyio
async def test_score_74_triggers_veille_stage(client):
    """Prospect scoring < 75 is placed in veille."""
    payload = api_payload(
        adresse_web="https://low-scorer.ma",
        pays="Inconnu",
        email_contact="low@low.com",
    )
    resp = await client.post(BASE, json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["score_total"] < 75
    assert body["stage"] == "veille"


@pytest.mark.anyio
async def test_score_recalculated_on_update(client):
    """PUT with improved attributes → score increases and stage may change."""
    create_resp = await client.post(BASE, json=api_payload(
        pays="Inconnu",
        email_contact="update@test.ma",
    ))
    assert create_resp.status_code == 201
    pid = create_resp.json()["id"]
    initial_score = create_resp.json()["score_total"]

    update_resp = await client.put(f"{BASE}/{pid}", json={
        "pays": "Maroc",
        "note_google": 4.8,
        "nb_avis_google": 350,
        "telephone": "+212600000000",
    })
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["score_total"] > initial_score
    assert updated["stage"] == "outreach"


@pytest.mark.anyio
async def test_score_preview_endpoint(client):
    """POST /score-preview returns score breakdown without creating a prospect."""
    payload = {
        "pays": "Maroc",
        "note_google": 4.5,
        "nb_avis_google": 150,
        "telephone": "+212600000000",
        "email_contact": "preview@test.ma",
    }
    resp = await client.post(f"{BASE}/score-preview", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert "score_total" in body
    assert "score_activite_digitale" in body
    assert "score_coherence_marche" in body
    assert "score_taille_capacite" in body
    assert "score_contact_decideur" in body
    assert "score_liberte_ota" in body
    assert "stage_recommande" in body
    assert "is_premium" in body
    assert body["score_total"] > 0

    # Verify no DB record was created
    list_resp = await client.get(BASE)
    assert list_resp.json()["total"] == 0
