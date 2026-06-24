import pytest


@pytest.mark.anyio
async def test_health_returns_ok(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.anyio
async def test_health_db_connected(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["db"] == "connected"


@pytest.mark.anyio
async def test_root_redirects_to_docs(client):
    response = await client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/docs"


@pytest.mark.anyio
async def test_cors_header_present(client):
    response = await client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
