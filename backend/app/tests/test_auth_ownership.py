"""
Section 3 — Route guard & prospect ownership tests.
Verifies Commercial users can only see/act on their own prospects,
cannot start scans, and Admins retain unrestricted access.
"""
import uuid
from datetime import date

import pytest

from app.database import get_session
from app.main import app as fastapi_app
from app.models.prospect import Prospect
from app.models.user import User
from app.services import auth_service

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


async def _create_commercial(client, email: str, full_name: str = "Commercial") -> tuple[str, str]:
    """Creates a Commercial via the admin-authenticated `client` and returns (user_id, token)."""
    resp = await client.post("/auth/users", json={"email": email, "full_name": full_name})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    login = await client.post("/auth/login", json={"email": email, "password": body["temporary_password"]})
    assert login.status_code == 200
    return body["user"]["id"], login.json()["access_token"]


async def _create_prospect_assigned_to(db_get_session, user_id) -> str:
    override = fastapi_app.dependency_overrides[get_session]
    async for session in override():
        prospect = Prospect(
            nom="Riad Test",
            type="hotel_riad",
            pays="Maroc",
            ville="Marrakech",
            adresse_web=f"https://riad-{user_id}.ma",
            email_contact="contact@riad-test.ma",
            nom_contact="Test Contact",
            poste_contact="Directeur",
            commission_standard=10.0,
            commission_plancher=8.0,
            langue="fr",
            date_ajout=date.today(),
            assigned_to=uuid.UUID(user_id),
        )
        session.add(prospect)
        await session.flush()
        pid = str(prospect.id)
        await session.commit()
        return pid


@pytest.mark.anyio
async def test_commercial_sees_only_own_prospects(client):
    com1_id, com1_token = await _create_commercial(client, "com1@babmorocco.com")
    com2_id, com2_token = await _create_commercial(client, "com2@babmorocco.com")

    p1_id = await _create_prospect_assigned_to(get_session, com1_id)
    await _create_prospect_assigned_to(get_session, com2_id)

    resp = await client.get("/prospects", headers={"Authorization": f"Bearer {com1_token}"})
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()["items"]}
    assert ids == {p1_id}


@pytest.mark.anyio
async def test_commercial_cannot_access_others_prospect(client):
    com1_id, com1_token = await _create_commercial(client, "com3@babmorocco.com")
    com2_id, com2_token = await _create_commercial(client, "com4@babmorocco.com")

    other_prospect_id = await _create_prospect_assigned_to(get_session, com2_id)

    resp = await client.get(f"/prospects/{other_prospect_id}", headers={"Authorization": f"Bearer {com1_token}"})
    assert resp.status_code == 403

    resp = await client.delete(f"/prospects/{other_prospect_id}", headers={"Authorization": f"Bearer {com1_token}"})
    assert resp.status_code == 403

    resp = await client.patch(
        f"/prospects/{other_prospect_id}/stage",
        json={"stage": "qualification"},
        headers={"Authorization": f"Bearer {com1_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_commercial_can_access_own_prospect(client):
    com_id, com_token = await _create_commercial(client, "com5@babmorocco.com")
    own_prospect_id = await _create_prospect_assigned_to(get_session, com_id)

    resp = await client.get(f"/prospects/{own_prospect_id}", headers={"Authorization": f"Bearer {com_token}"})
    assert resp.status_code == 200
    assert resp.json()["id"] == own_prospect_id


@pytest.mark.anyio
async def test_commercial_manual_add_auto_assigns_self(client):
    com_id, com_token = await _create_commercial(client, "com6@babmorocco.com")

    resp = await client.post(BASE := "/prospects", json=MINIMAL_PROSPECT, headers={"Authorization": f"Bearer {com_token}"})
    assert resp.status_code == 201

    # Commercial should see it in their own list
    list_resp = await client.get(BASE, headers={"Authorization": f"Bearer {com_token}"})
    assert list_resp.status_code == 200
    assert any(item["id"] == resp.json()["id"] for item in list_resp.json()["items"])


@pytest.mark.anyio
async def test_admin_sees_all_prospects(client):
    com1_id, _ = await _create_commercial(client, "com7@babmorocco.com")
    com2_id, _ = await _create_commercial(client, "com8@babmorocco.com")
    p1 = await _create_prospect_assigned_to(get_session, com1_id)
    p2 = await _create_prospect_assigned_to(get_session, com2_id)

    resp = await client.get("/prospects")  # client is admin-authenticated by default
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()["items"]}
    assert {p1, p2}.issubset(ids)


@pytest.mark.anyio
async def test_commercial_cannot_start_scan(client):
    _, com_token = await _create_commercial(client, "com9@babmorocco.com")
    resp = await client.post(
        "/scan/start",
        json={"ville": "Marrakech", "pays": "Maroc", "type_partenaire": "hotel_riad", "limite": 5},
        headers={"Authorization": f"Bearer {com_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_admin_can_start_scan(client):
    resp = await client.post(
        "/scan/start",
        json={"ville": "Marrakech", "pays": "Maroc", "type_partenaire": "hotel_riad", "limite": 5},
    )
    assert resp.status_code == 201


@pytest.mark.anyio
async def test_unauthenticated_request_rejected(client):
    del client.headers["Authorization"]
    resp = await client.get("/prospects")
    assert resp.status_code == 401
