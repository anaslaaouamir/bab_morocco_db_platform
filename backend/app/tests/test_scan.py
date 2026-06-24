"""
SP4 — Scan pipeline tests.
Background tasks run synchronously within ASGI transport, so job status
is already "done" by the time any GET is issued after POST /start.
"""
import pytest

SCAN_BASE = "/scan"
PROSPECT_BASE = "/prospects"

MARRAKECH_RIAD = {
    "ville": "Marrakech",
    "pays": "Maroc",
    "type_partenaire": "hotel_riad",
    "limite": 6,
}


async def start_and_wait(client, payload=None):
    """Start a scan and return the completed job dict."""
    payload = payload or MARRAKECH_RIAD
    resp = await client.post(f"{SCAN_BASE}/start", json=payload)
    assert resp.status_code == 201
    job_id = resp.json()["id"]
    # Background task is done at this point (ASGI in-process execution)
    status_resp = await client.get(f"{SCAN_BASE}/{job_id}")
    return status_resp.json()


@pytest.mark.anyio
async def test_scan_job_created_on_start(client):
    resp = await client.post(f"{SCAN_BASE}/start", json=MARRAKECH_RIAD)
    assert resp.status_code == 201
    body = resp.json()
    assert "id" in body
    assert len(body["id"]) == 36
    assert body["ville"] == "Marrakech"
    assert body["type_partenaire"] == "hotel_riad"


@pytest.mark.anyio
async def test_scan_invalid_params_rejected(client):
    resp = await client.post(f"{SCAN_BASE}/start", json={"pays": "Maroc", "type_partenaire": "hotel_riad", "limite": 5})
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_scan_status_polling(client):
    resp = await client.post(f"{SCAN_BASE}/start", json=MARRAKECH_RIAD)
    job_id = resp.json()["id"]
    status_resp = await client.get(f"{SCAN_BASE}/{job_id}")
    assert status_resp.status_code == 200
    body = status_resp.json()
    assert body["statut"] in ("pending", "running", "done", "error")
    assert body["id"] == job_id


@pytest.mark.anyio
async def test_scan_completes_with_results(client):
    job = await start_and_wait(client)
    assert job["statut"] == "done"
    assert job["nb_ajoutes"] > 0
    assert job["nb_trouves"] == MARRAKECH_RIAD["limite"]


@pytest.mark.anyio
async def test_scan_respects_limite(client):
    payload = {**MARRAKECH_RIAD, "limite": 4}
    job = await start_and_wait(client, payload)
    assert job["nb_trouves"] <= 4


@pytest.mark.anyio
async def test_deduplication_prevents_duplicates(client):
    # First scan — all new prospects
    job1 = await start_and_wait(client)
    assert job1["nb_ajoutes"] > 0
    assert job1["nb_doublons"] == 0

    # Second identical scan — all should be duplicates
    job2 = await start_and_wait(client)
    assert job2["nb_doublons"] > 0


@pytest.mark.anyio
async def test_low_score_goes_to_veille(client):
    """Odd-indexed prospects (poor enrichment) must land in veille."""
    job = await start_and_wait(client)
    assert job["nb_veille"] > 0

    # Verify via prospects endpoint
    veille_resp = await client.get(PROSPECT_BASE, params={"stage": "veille"})
    assert veille_resp.status_code == 200
    assert veille_resp.json()["total"] > 0


@pytest.mark.anyio
async def test_high_score_goes_to_outreach(client):
    """Even-indexed prospects (good enrichment) must land in outreach."""
    job = await start_and_wait(client)
    outreach_ajoutes = job["nb_ajoutes"] - job["nb_veille"]
    assert outreach_ajoutes > 0

    outreach_resp = await client.get(PROSPECT_BASE, params={"stage": "outreach"})
    assert outreach_resp.status_code == 200
    assert outreach_resp.json()["total"] > 0


@pytest.mark.anyio
async def test_scan_history_lists_jobs(client):
    await client.post(f"{SCAN_BASE}/start", json=MARRAKECH_RIAD)
    await client.post(f"{SCAN_BASE}/start", json={
        "ville": "Dubai", "pays": "EAU", "type_partenaire": "hotel_luxe", "limite": 4
    })
    history_resp = await client.get(f"{SCAN_BASE}/history")
    assert history_resp.status_code == 200
    jobs = history_resp.json()
    assert len(jobs) >= 2


@pytest.mark.anyio
async def test_scan_pipeline_end_to_end(client):
    """Full pipeline: scan → prospects in DB, scored and staged correctly."""
    job = await start_and_wait(client)

    assert job["statut"] == "done"
    assert job["nb_trouves"] == MARRAKECH_RIAD["limite"]
    assert job["nb_ajoutes"] + job["nb_doublons"] == job["nb_trouves"]
    assert job["progression"] == 100

    # Prospects must be in DB with scores
    prospects_resp = await client.get(PROSPECT_BASE)
    assert prospects_resp.status_code == 200
    items = prospects_resp.json()["items"]
    assert len(items) == job["nb_ajoutes"]

    for p in items:
        assert p["score_total"] > 0
        assert p["stage"] in ("outreach", "veille")
        assert p["pays"] == "Maroc"
