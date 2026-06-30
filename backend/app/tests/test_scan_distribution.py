"""
Section 4 — Scan distribution tests.
Verifies that prospects produced by a scan are distributed randomly and
equally among active Commercial users, and that each Commercial only sees
their own assigned share via GET /prospects.
"""
import pytest

SCAN_BASE = "/scan"
PROSPECT_BASE = "/prospects"

MARRAKECH_RIAD = {
    "ville": "Marrakech",
    "pays": "Maroc",
    "type_partenaire": "hotel_riad",
    "limite": 12,
}


async def _create_commercial(client, email: str, full_name: str = "Commercial") -> tuple[str, str]:
    resp = await client.post("/auth/users", json={"email": email, "full_name": full_name})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    login = await client.post("/auth/login", json={"email": email, "password": body["temporary_password"]})
    assert login.status_code == 200
    return body["user"]["id"], login.json()["access_token"]


async def _run_scan(client, payload=None) -> dict:
    payload = payload or MARRAKECH_RIAD
    resp = await client.post(f"{SCAN_BASE}/start", json=payload)
    assert resp.status_code == 201
    job_id = resp.json()["id"]
    status_resp = await client.get(f"{SCAN_BASE}/{job_id}")
    return status_resp.json()


@pytest.mark.anyio
async def test_scan_distributes_prospects_equally_among_commercials(client):
    com1_id, com1_token = await _create_commercial(client, "dist1@babmorocco.com")
    com2_id, com2_token = await _create_commercial(client, "dist2@babmorocco.com")
    com3_id, com3_token = await _create_commercial(client, "dist3@babmorocco.com")

    job = await _run_scan(client)
    assert job["statut"] == "done"
    nb_ajoutes = job["nb_ajoutes"]
    assert nb_ajoutes > 0

    counts = {}
    seen_ids = set()
    for token in (com1_token, com2_token, com3_token):
        resp = await client.get(PROSPECT_BASE, params={"page_size": 100}, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        items = resp.json()["items"]
        counts[token] = len(items)
        for item in items:
            assert item["id"] not in seen_ids  # no prospect assigned to more than one commercial
            seen_ids.add(item["id"])

    # Union of all commercials' prospects covers every newly added prospect
    assert len(seen_ids) == nb_ajoutes

    # Roughly equal split — no commercial gets more than 1 extra vs the minimum
    counts_values = list(counts.values())
    assert max(counts_values) - min(counts_values) <= 1


@pytest.mark.anyio
async def test_scan_leaves_prospects_unassigned_when_no_active_commercials(client):
    # No commercials seeded in this test — only the default admin exists.
    job = await _run_scan(client)
    assert job["statut"] == "done"

    resp = await client.get(PROSPECT_BASE, params={"page_size": 100})  # admin sees all
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= job["nb_ajoutes"]


@pytest.mark.anyio
async def test_admin_list_unaffected_by_distribution(client):
    com_id, com_token = await _create_commercial(client, "dist4@babmorocco.com")
    job = await _run_scan(client)
    assert job["statut"] == "done"

    admin_resp = await client.get(PROSPECT_BASE, params={"page_size": 100})
    assert admin_resp.status_code == 200
    assert admin_resp.json()["total"] >= job["nb_ajoutes"]
