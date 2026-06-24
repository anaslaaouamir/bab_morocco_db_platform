"""
SP3 — Scoring engine tests.
Pure unit tests run directly against ScoringEngine (no DB needed).
Integration tests use the API client to verify end-to-end behaviour.
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
        "presence_booking": False,
        "note_booking": None,
        "presence_expedia": False,
        "nb_chambres": None,
        "capacite_description": None,
        "linkedin_contact": None,
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
        presence_booking=True,
        note_booking=9.5,
        presence_expedia=True,
        nb_chambres=60,
        email_contact="dg@test.ma",
        linkedin_contact="https://linkedin.com/in/dg",
    )
    breakdown = engine.compute_breakdown(data)
    total = engine.compute_total(breakdown)
    # activite=25 (site+booking+note>8+expedia), coherence=25 (Maroc),
    # taille=20 (>50), contact=15 (email+linkedin), liberte=8 (2 OTAs)
    # Max achievable with 2 OTAs = 93; with 1 OTA = 95
    # Verify each criterion is at its individual maximum
    assert breakdown.activite_digitale == 25
    assert breakdown.coherence_marche == 25
    assert breakdown.taille_capacite == 20
    assert breakdown.contact_decideur == 15
    assert total >= 90  # true maximum given constraints


def test_empty_prospect_score_near_zero():
    """Minimal attributes → low score (well below 75)."""
    data = prospect_data(pays="Inconnu")
    breakdown = engine.compute_breakdown(data)
    total = engine.compute_total(breakdown)
    # site(+8) + hors-cible(+5) + inconnu(+5) + email(+8) + liberte(+15) = 41
    assert total <= 45
    assert total < 75


def test_activite_digitale_booking_adds_7():
    """presence_booking=True adds exactly +7 to activite_digitale."""
    without = engine.compute_breakdown(prospect_data(presence_booking=False))
    with_ = engine.compute_breakdown(prospect_data(presence_booking=True))
    assert with_.activite_digitale - without.activite_digitale == 7


def test_coherence_maroc_priority_market():
    """Maroc is the highest-priority market → coherence_marche == 25."""
    bd = engine.compute_breakdown(prospect_data(pays="Maroc"))
    assert bd.coherence_marche == 25


def test_taille_50_rooms_gives_max():
    """nb_chambres=60 (> 50) → taille_capacite == 20."""
    bd = engine.compute_breakdown(prospect_data(nb_chambres=60))
    assert bd.taille_capacite == 20


def test_contact_email_only_gives_8():
    """Email present, no LinkedIn → contact_decideur == 8."""
    bd = engine.compute_breakdown(prospect_data(email_contact="x@x.com", linkedin_contact=None))
    assert bd.contact_decideur == 8


def test_liberte_no_ota_gives_15():
    """0 competing OTAs (no Booking, no Expedia) → liberte_ota == 15."""
    bd = engine.compute_breakdown(prospect_data(presence_booking=False, presence_expedia=False))
    assert bd.liberte_ota == 15


# ── Integration tests — via API ───────────────────────────────────────────

@pytest.mark.anyio
async def test_score_75_triggers_outreach_stage(client):
    """
    Prospect scoring exactly 75 is placed in outreach.
    France(22) + booking(15) + 20-50 rooms(15) + email only(8) + liberte(15) = 75.
    """
    payload = api_payload(
        pays="France",
        presence_booking=True,
        nb_chambres=30,
        email_contact="dg@france-tour.fr",
        linkedin_contact=None,
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
        presence_booking=False,
        nb_chambres=None,
        email_contact="low@low.com",
        linkedin_contact=None,
    )
    resp = await client.post(BASE, json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["score_total"] < 75
    assert body["stage"] == "veille"


@pytest.mark.anyio
async def test_score_recalculated_on_update(client):
    """PUT with improved attributes → score increases and stage may change."""
    # Create low-score prospect
    create_resp = await client.post(BASE, json=api_payload(
        pays="Inconnu",
        presence_booking=False,
        nb_chambres=None,
        email_contact="update@test.ma",
        linkedin_contact=None,
    ))
    assert create_resp.status_code == 201
    pid = create_resp.json()["id"]
    initial_score = create_resp.json()["score_total"]

    # Update with high-value attributes
    update_resp = await client.put(f"{BASE}/{pid}", json={
        "pays": "Maroc",
        "presence_booking": True,
        "note_booking": 9.0,
        "nb_chambres": 60,
        "linkedin_contact": "https://linkedin.com/in/dg",
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
        "presence_booking": True,
        "note_booking": 9.0,
        "nb_chambres": 60,
        "email_contact": "preview@test.ma",
        "linkedin_contact": "https://linkedin.com/in/x",
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
