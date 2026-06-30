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
async def test_abandon_negociation_marks_perdu(client):
    """
    Abandoning a negotiation moves prospect to 'perdu' (CLAUDE.md §9 — human decision required).
    Verifies the stage transition works and is permanent.
    """
    create_resp = await client.post(BASE, json=MINIMAL_PROSPECT)
    prospect_id = create_resp.json()["id"]

    # Move through pipeline to negociation
    await client.patch(f"{BASE}/{prospect_id}/stage", json={"stage": "negociation"})

    # Human decides to abandon
    resp = await client.patch(f"{BASE}/{prospect_id}/stage", json={"stage": "perdu"})
    assert resp.status_code == 200
    assert resp.json()["stage"] == "perdu"

    # Verify persisted
    get_resp = await client.get(f"{BASE}/{prospect_id}")
    assert get_resp.json()["stage"] == "perdu"


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


async def _seed_commercial(client, email: str, password: str = "secret123", full_name: str = "Commercial"):
    from app.database import get_session
    from app.main import app as fastapi_app
    from app.models.user import User
    from app.services import auth_service

    override = fastapi_app.dependency_overrides[get_session]
    async for session in override():
        user = User(
            email=email,
            hashed_password=auth_service.hash_password(password),
            full_name=full_name,
            role="commercial",
            is_active=True,
        )
        session.add(user)
        await session.flush()
        await session.commit()
        return user


@pytest.mark.anyio
async def test_admin_list_includes_assigned_to_name(client):
    commercial = await _seed_commercial(client, "owner1@babmorocco.com")
    create_resp = await client.post(BASE, json=prospect_payload(adresse_web="https://owned1.ma"))
    prospect_id = create_resp.json()["id"]
    await client.patch(f"{BASE}/{prospect_id}/assign", json={"assigned_to": str(commercial.id)})

    resp = await client.get(BASE)
    item = next(p for p in resp.json()["items"] if p["id"] == prospect_id)
    assert item["assigned_to"] == str(commercial.id)
    assert item["assigned_to_name"] == "Commercial"


@pytest.mark.anyio
async def test_commercial_list_omits_assigned_to_name(client):
    commercial = await _seed_commercial(client, "owner2@babmorocco.com")
    create_resp = await client.post(BASE, json=prospect_payload(adresse_web="https://owned2.ma"))
    prospect_id = create_resp.json()["id"]
    await client.patch(f"{BASE}/{prospect_id}/assign", json={"assigned_to": str(commercial.id)})

    login_resp = await client.post("/auth/login", json={"email": "owner2@babmorocco.com", "password": "secret123"})
    token = login_resp.json()["access_token"]

    resp = await client.get(BASE, headers={"Authorization": f"Bearer {token}"})
    item = next(p for p in resp.json()["items"] if p["id"] == prospect_id)
    assert item.get("assigned_to_name") is None


@pytest.mark.anyio
async def test_reassign_to_active_commercial_succeeds(client):
    commercial_a = await _seed_commercial(client, "reassign-a@babmorocco.com")
    commercial_b = await _seed_commercial(client, "reassign-b@babmorocco.com")
    create_resp = await client.post(BASE, json=prospect_payload(adresse_web="https://reassign.ma"))
    prospect_id = create_resp.json()["id"]

    await client.patch(f"{BASE}/{prospect_id}/assign", json={"assigned_to": str(commercial_a.id)})
    resp = await client.patch(f"{BASE}/{prospect_id}/assign", json={"assigned_to": str(commercial_b.id)})
    assert resp.status_code == 200
    assert resp.json()["assigned_to"] == str(commercial_b.id)


@pytest.mark.anyio
async def test_assign_to_inactive_commercial_rejected(client):
    commercial = await _seed_commercial(client, "inactive1@babmorocco.com")
    create_resp = await client.post(BASE, json=prospect_payload(adresse_web="https://inactive1.ma"))
    prospect_id = create_resp.json()["id"]
    await client.patch(f"/auth/users/{commercial.id}", json={"is_active": False})

    resp = await client.patch(f"{BASE}/{prospect_id}/assign", json={"assigned_to": str(commercial.id)})
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_assign_to_nonexistent_user_rejected(client):
    create_resp = await client.post(BASE, json=prospect_payload(adresse_web="https://ghost-assign.ma"))
    prospect_id = create_resp.json()["id"]
    fake_id = "00000000-0000-0000-0000-000000000000"

    resp = await client.patch(f"{BASE}/{prospect_id}/assign", json={"assigned_to": fake_id})
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_unassign_prospect_succeeds(client):
    commercial = await _seed_commercial(client, "unassign1@babmorocco.com")
    create_resp = await client.post(BASE, json=prospect_payload(adresse_web="https://unassign1.ma"))
    prospect_id = create_resp.json()["id"]
    await client.patch(f"{BASE}/{prospect_id}/assign", json={"assigned_to": str(commercial.id)})

    resp = await client.patch(f"{BASE}/{prospect_id}/assign", json={"assigned_to": None})
    assert resp.status_code == 200
    assert resp.json()["assigned_to"] is None


@pytest.mark.anyio
async def test_assign_rejected_for_commercial(client):
    commercial = await _seed_commercial(client, "noaccess1@babmorocco.com")
    create_resp = await client.post(BASE, json=prospect_payload(adresse_web="https://noaccess1.ma"))
    prospect_id = create_resp.json()["id"]
    await client.patch(f"{BASE}/{prospect_id}/assign", json={"assigned_to": str(commercial.id)})

    login_resp = await client.post(
        "/auth/login", json={"email": "noaccess1@babmorocco.com", "password": "secret123"}
    )
    token = login_resp.json()["access_token"]

    resp = await client.patch(
        f"{BASE}/{prospect_id}/assign",
        json={"assigned_to": None},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
