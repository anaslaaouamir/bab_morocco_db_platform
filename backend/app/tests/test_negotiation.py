"""SP6 — Negotiation engine tests."""
import uuid

import pytest
from httpx import AsyncClient

from app.services.negotiation_service import extract_rate_from_text

pytestmark = pytest.mark.anyio


# ── helpers ──────────────────────────────────────────────────────────────────

def _prospect_payload(**overrides) -> dict:
    base = {
        "nom": "Riad Négociation",
        "type": "tour_operateur",
        "pays": "France",
        "ville": "Paris",
        "adresse_web": f"https://to-nego-{uuid.uuid4().hex[:6]}.fr",
        "email_contact": "contact@to-nego.fr",
        "nom_contact": "Jean Dupont",
        "poste_contact": "Directeur Commercial",
        "presence_booking": True,
        "note_booking": 8.5,
        "presence_expedia": True,
        "nb_chambres": 30,
    }
    base.update(overrides)
    return base


async def _create_prospect(client: AsyncClient, **overrides) -> dict:
    r = await client.post("/prospects", json=_prospect_payload(**overrides))
    assert r.status_code == 201, r.text
    return r.json()


async def _submit_message(client: AsyncClient, prospect_id: str, corps: str) -> dict:
    r = await client.post(f"/negotiation/{prospect_id}/message", json={"corps": corps})
    assert r.status_code == 201, r.text
    return r.json()


# ── SP6 tests ─────────────────────────────────────────────────────────────────

async def test_analyze_message_returns_structure(client: AsyncClient):
    """POST /message → full analysis JSON with all required fields."""
    p = await _create_prospect(client)
    result = await _submit_message(client, p["id"], "Je suis intéressé mais je voudrais discuter des conditions.")
    assert "intent" in result
    assert "intent_score" in result
    assert "objection_type" in result
    assert "objection_detail" in result
    assert "taux_demande" in result
    assert "requires_human" in result
    assert "scenarios" in result


async def test_detects_counter_offer_intent(client: AsyncClient):
    """Mock always returns intent=contre_offre — validates the mock wiring."""
    p = await _create_prospect(client)
    result = await _submit_message(client, p["id"], "Je voudrais 14% de commission.")
    assert result["intent"] == "contre_offre"


async def test_extracts_requested_rate(client: AsyncClient):
    """Service regex extracts '14%' from raw message text → taux_demande=14.0."""
    p = await _create_prospect(client)
    result = await _submit_message(client, p["id"], "Nous souhaiterions 14% de commission sur les réservations.")
    assert result["taux_demande"] == 14.0


async def test_extracts_rate_various_formats():
    """Unit test: regex handles multiple formats."""
    assert extract_rate_from_text("je voudrais 14%") == 14.0
    assert extract_rate_from_text("14 % de commission") == 14.0
    assert extract_rate_from_text("14 pour cent") == 14.0
    assert extract_rate_from_text("no rate here") is None
    assert extract_rate_from_text("12.5%") == 12.5


async def test_below_plancher_sets_requires_human(client: AsyncClient):
    """taux_demande < commission_plancher → requires_human MUST be True (hard rule)."""
    # tour_operateur has plancher=10% by default
    p = await _create_prospect(client)
    plancher = p["commission_plancher"]
    rate_below = plancher - 1.0
    result = await _submit_message(client, p["id"], f"Je voudrais {rate_below}% de commission.")
    assert result["taux_demande"] == rate_below
    assert result["requires_human"] is True


async def test_at_plancher_no_human_required(client: AsyncClient):
    """taux_demande == commission_plancher → requires_human MUST be False."""
    p = await _create_prospect(client)
    plancher = p["commission_plancher"]
    result = await _submit_message(client, p["id"], f"Nous acceptons {plancher}% de commission.")
    assert result["taux_demande"] == plancher
    assert result["requires_human"] is False


async def test_above_plancher_no_human_required(client: AsyncClient):
    """taux_demande above plancher → requires_human False (normal negotiation)."""
    p = await _create_prospect(client)
    plancher = p["commission_plancher"]
    rate_above = plancher + 1.0
    result = await _submit_message(client, p["id"], f"Nous demandons {rate_above}% de commission.")
    assert result["requires_human"] is False


async def test_legal_threat_sets_requires_human(client: AsyncClient):
    """Message containing legal threat keywords → requires_human True."""
    p = await _create_prospect(client)
    result = await _submit_message(client, p["id"], "Nous envisageons une action juridique si cela n'est pas résolu.")
    assert result["requires_human"] is True


async def test_exclusivity_request_sets_requires_human(client: AsyncClient):
    """Message requesting exclusivity → requires_human True."""
    p = await _create_prospect(client)
    result = await _submit_message(client, p["id"], "Nous demandons une exclusivité sur la région de Marrakech.")
    assert result["requires_human"] is True


async def test_generates_3_scenarios(client: AsyncClient):
    """GET /analysis → exactly 3 scenarios returned."""
    p = await _create_prospect(client)
    await _submit_message(client, p["id"], "Je voudrais discuter des conditions.")
    r = await client.get(f"/negotiation/{p['id']}/analysis")
    assert r.status_code == 200
    assert len(r.json()["scenarios"]) == 3


async def test_scenario_letters_are_a_b_c(client: AsyncClient):
    """Scenarios must be labeled A, B, C."""
    p = await _create_prospect(client)
    await _submit_message(client, p["id"], "Votre proposition m'intéresse.")
    r = await client.get(f"/negotiation/{p['id']}/analysis")
    letters = {s["scenario"] for s in r.json()["scenarios"]}
    assert letters == {"A", "B", "C"}


async def test_scenario_b_includes_nonfinancial_perks(client: AsyncClient):
    """Scenario B message_propose must mention non-financial perks (CLAUDE.md §6)."""
    p = await _create_prospect(client)
    await _submit_message(client, p["id"], "Votre proposition m'intéresse.")
    r = await client.get(f"/negotiation/{p['id']}/analysis")
    scenarios = {s["scenario"]: s for s in r.json()["scenarios"]}
    b = scenarios["B"]
    # At least one perk from CLAUDE.md §6 must appear in description or message_propose
    perks_keywords = ["fondateur", "verrouill", "co-marketing", "extranet", "bêta", "beta"]
    combined = (b["description"] + b["avantages"] + b["message_propose"]).lower()
    assert any(kw in combined for kw in perks_keywords)


async def test_cannot_respond_when_requires_human(client: AsyncClient):
    """POST /respond when requires_human=True → 403."""
    p = await _create_prospect(client)
    plancher = p["commission_plancher"]
    rate_below = plancher - 1.0
    await _submit_message(client, p["id"], f"Je voudrais {rate_below}% de commission.")
    r = await client.post(f"/negotiation/{p['id']}/respond", json={"scenario": "A"})
    assert r.status_code == 403


async def test_respond_without_flag_succeeds(client: AsyncClient):
    """POST /respond when requires_human=False → 200 + outbound message created."""
    p = await _create_prospect(client)
    plancher = p["commission_plancher"]
    rate_ok = plancher + 2.0
    await _submit_message(client, p["id"], f"Nous proposons {rate_ok}% de commission.")
    r = await client.post(f"/negotiation/{p['id']}/respond", json={"scenario": "B"})
    assert r.status_code == 200
    data = r.json()
    assert data["direction"] == "outbound"
    assert len(data["corps"]) > 10


async def test_history_contains_inbound_and_outbound(client: AsyncClient):
    """GET /history → returns both inbound and outbound messages."""
    p = await _create_prospect(client)
    plancher = p["commission_plancher"]
    rate_ok = plancher + 2.0
    await _submit_message(client, p["id"], f"Nous proposons {rate_ok}% de commission.")
    await client.post(f"/negotiation/{p['id']}/respond", json={"scenario": "B"})

    r = await client.get(f"/negotiation/{p['id']}/history")
    assert r.status_code == 200
    directions = {m["direction"] for m in r.json()}
    assert "inbound" in directions
    assert "outbound" in directions


async def test_analysis_not_found_for_new_prospect(client: AsyncClient):
    """GET /analysis with no messages → 404."""
    p = await _create_prospect(client)
    r = await client.get(f"/negotiation/{p['id']}/analysis")
    assert r.status_code == 404


async def test_message_unknown_prospect_returns_404(client: AsyncClient):
    r = await client.post(f"/negotiation/{uuid.uuid4()}/message", json={"corps": "test"})
    assert r.status_code == 404


async def test_respond_unknown_prospect_returns_404(client: AsyncClient):
    r = await client.post(f"/negotiation/{uuid.uuid4()}/respond", json={"scenario": "A"})
    assert r.status_code == 404
