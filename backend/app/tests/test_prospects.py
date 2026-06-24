"""
SP2 — CRUD Prospects tests.
Score fields are now computed by the ScoringEngine (SP3), not taken from frontend input.
"""
import pytest

BASE = "/prospects"

MINIMAL_PROSPECT = {
    "nom": "Riad Atlas",
    "type": "hotel_riad",
    "pays": "Maroc",
    "ville": "Marrakech",
    "adresse_web": "https://riad-atlas.ma",
    "email_contact": "contact@riad-atlas.ma",
    "nom_contact": "Hassan Benali",
    "poste_contact": "Directeur",
}


def prospect_payload(**overrides):
    return {**MINIMAL_PROSPECT, **overrides}


@pytest.mark.anyio
async def test_create_prospect_manual(client):
    resp = await client.post(BASE, json=MINIMAL_PROSPECT)
    assert resp.status_code == 201
    body = resp.json()
    assert "id" in body
    assert len(body["id"]) == 36  # UUID format


@pytest.mark.anyio
async def test_create_requires_mandatory_fields(client):
    resp = await client.post(BASE, json={"pays": "Maroc"})
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_list_prospects_paginated(client):
    for i in range(3):
        await client.post(BASE, json=prospect_payload(
            nom=f"Riad {i}", adresse_web=f"https://riad-{i}.ma"
        ))
    resp = await client.get(BASE)
    assert resp.status_code == 200
    body = resp.json()
    assert "items" in body
    assert "total" in body
    assert "page" in body
    assert "page_size" in body
    assert "pages" in body
    assert body["total"] >= 3


@pytest.mark.anyio
async def test_filter_by_stage(client):
    # High-score prospect → engine assigns stage=outreach (France+booking+30rooms+email = 75)
    await client.post(BASE, json=prospect_payload(
        adresse_web="https://high-fr.ma",
        pays="France",
        presence_booking=True,
        nb_chambres=30,
    ))
    # Low-score prospect → engine assigns stage=veille
    await client.post(BASE, json=prospect_payload(
        nom="Riad Veille", adresse_web="https://low-unknown.ma", pays="Inconnu"
    ))
    resp = await client.get(BASE, params={"stage": "outreach"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(p["stage"] == "outreach" for p in items)
    assert len(items) >= 1


@pytest.mark.anyio
async def test_filter_by_score_min(client):
    # High-score: Maroc + booking + note>8 + 60 rooms + linkedin → 25+20+20+15+15=95
    await client.post(BASE, json=prospect_payload(
        adresse_web="https://high-score.ma",
        pays="Maroc",
        presence_booking=True,
        note_booking=9.5,
        nb_chambres=60,
        linkedin_contact="https://linkedin.com/in/dg",
    ))
    # Low-score: unknown country, no extras
    await client.post(BASE, json=prospect_payload(
        nom="Low Score", adresse_web="https://low-score.ma", pays="Inconnu",
    ))
    resp = await client.get(BASE, params={"score_min": 75})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(p["score_total"] >= 75 for p in items)


@pytest.mark.anyio
async def test_get_prospect_by_id(client):
    create_resp = await client.post(BASE, json=MINIMAL_PROSPECT)
    prospect_id = create_resp.json()["id"]
    resp = await client.get(f"{BASE}/{prospect_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == prospect_id


@pytest.mark.anyio
async def test_get_unknown_id_returns_404(client):
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"{BASE}/{fake_id}")
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_update_prospect(client):
    create_resp = await client.post(BASE, json=MINIMAL_PROSPECT)
    prospect_id = create_resp.json()["id"]
    resp = await client.put(f"{BASE}/{prospect_id}", json={"nom": "Riad Atlas Updated", "ville": "Fès"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["nom"] == "Riad Atlas Updated"
    assert body["ville"] == "Fès"


@pytest.mark.anyio
async def test_patch_stage(client):
    create_resp = await client.post(BASE, json=MINIMAL_PROSPECT)
    prospect_id = create_resp.json()["id"]
    resp = await client.patch(f"{BASE}/{prospect_id}/stage", json={"stage": "negociation"})
    assert resp.status_code == 200
    assert resp.json()["stage"] == "negociation"


@pytest.mark.anyio
async def test_delete_prospect(client):
    create_resp = await client.post(BASE, json=MINIMAL_PROSPECT)
    prospect_id = create_resp.json()["id"]
    del_resp = await client.delete(f"{BASE}/{prospect_id}")
    assert del_resp.status_code == 204
    get_resp = await client.get(f"{BASE}/{prospect_id}")
    assert get_resp.status_code == 404


@pytest.mark.anyio
async def test_score_total_always_computed(client):
    """
    score_total is always computed by the ScoringEngine from prospect attributes.
    Manually provided score fields in the request are ignored.
    MINIMAL_PROSPECT (Maroc, no booking, no expedia, no rooms, email only):
      activite=8, coherence=25, taille=5, contact=8, liberte=15 → total=61
    """
    resp = await client.post(BASE, json=MINIMAL_PROSPECT)
    assert resp.status_code == 201
    body = resp.json()
    expected = (
        body["score_activite_digitale"]
        + body["score_coherence_marche"]
        + body["score_taille_capacite"]
        + body["score_contact_decideur"]
        + body["score_liberte_ota"]
    )
    assert body["score_total"] == expected
    assert body["score_total"] == 61  # exact engine output for MINIMAL_PROSPECT


@pytest.mark.anyio
async def test_deduplication_adresse_web(client):
    await client.post(BASE, json=MINIMAL_PROSPECT)
    resp2 = await client.post(BASE, json=prospect_payload(nom="Riad Copie"))
    assert resp2.status_code == 409


@pytest.mark.anyio
async def test_stats_endpoint(client):
    await client.post(BASE, json=MINIMAL_PROSPECT)
    resp = await client.get(f"{BASE}/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert "nb_par_stage" in body
    assert "score_moyen" in body
    assert "nb_eligibles_outreach" in body
    assert isinstance(body["nb_par_stage"], dict)
