import pytest
from sqlalchemy import select

from app.models.user import User
from app.services import auth_service


async def _seed_user(client, email: str, password: str, role: str, full_name: str = "Test User"):
    # Reach into the overridden session factory via the app's dependency override
    from app.database import get_session
    from app.main import app as fastapi_app

    override = fastapi_app.dependency_overrides[get_session]
    async for session in override():
        user = User(
            email=email,
            hashed_password=auth_service.hash_password(password),
            full_name=full_name,
            role=role,
            is_active=True,
        )
        session.add(user)
        await session.flush()
        await session.commit()
        return user


@pytest.mark.anyio
async def test_login_success(client):
    await _seed_user(client, "admin@babmorocco.com", "supersecret", "admin")
    resp = await client.post("/auth/login", json={"email": "admin@babmorocco.com", "password": "supersecret"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["user"]["email"] == "admin@babmorocco.com"
    assert body["user"]["role"] == "admin"


@pytest.mark.anyio
async def test_login_wrong_password(client):
    await _seed_user(client, "admin2@babmorocco.com", "supersecret", "admin")
    resp = await client.post("/auth/login", json={"email": "admin2@babmorocco.com", "password": "wrong"})
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_login_unknown_email(client):
    resp = await client.post("/auth/login", json={"email": "ghost@babmorocco.com", "password": "whatever"})
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_me_with_valid_token(client):
    await _seed_user(client, "admin3@babmorocco.com", "supersecret", "admin")
    login_resp = await client.post("/auth/login", json={"email": "admin3@babmorocco.com", "password": "supersecret"})
    token = login_resp.json()["access_token"]

    resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "admin3@babmorocco.com"


@pytest.mark.anyio
async def test_me_without_token(client):
    # `client` carries a default Admin Authorization header (see conftest.py) —
    # remove it to test the unauthenticated case.
    del client.headers["Authorization"]
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_admin_can_create_commercial_user(client):
    await _seed_user(client, "admin4@babmorocco.com", "supersecret", "admin")
    login_resp = await client.post("/auth/login", json={"email": "admin4@babmorocco.com", "password": "supersecret"})
    token = login_resp.json()["access_token"]

    resp = await client.post(
        "/auth/users",
        json={"email": "commercial1@babmorocco.com", "full_name": "Commercial One"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["user"]["role"] == "commercial"
    assert body["user"]["email"] == "commercial1@babmorocco.com"
    assert len(body["temporary_password"]) > 0

    # The generated credentials must actually work
    login_as_commercial = await client.post(
        "/auth/login",
        json={"email": "commercial1@babmorocco.com", "password": body["temporary_password"]},
    )
    assert login_as_commercial.status_code == 200


@pytest.mark.anyio
async def test_create_user_rejected_for_non_admin(client):
    await _seed_user(client, "commercial2@babmorocco.com", "secret123", "commercial")
    login_resp = await client.post("/auth/login", json={"email": "commercial2@babmorocco.com", "password": "secret123"})
    token = login_resp.json()["access_token"]

    resp = await client.post(
        "/auth/users",
        json={"email": "newcommercial@babmorocco.com", "full_name": "New Commercial"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_create_user_rejected_without_token(client):
    del client.headers["Authorization"]
    resp = await client.post(
        "/auth/users",
        json={"email": "noauth@babmorocco.com", "full_name": "No Auth"},
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_list_users_admin_only(client):
    await _seed_user(client, "admin5@babmorocco.com", "supersecret", "admin")
    await _seed_user(client, "commercial3@babmorocco.com", "secret123", "commercial")

    login_resp = await client.post("/auth/login", json={"email": "admin5@babmorocco.com", "password": "supersecret"})
    token = login_resp.json()["access_token"]

    resp = await client.get("/auth/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    emails = {u["email"] for u in resp.json()}
    assert "admin5@babmorocco.com" in emails
    assert "commercial3@babmorocco.com" in emails


@pytest.mark.anyio
async def test_admin_can_deactivate_and_reactivate_commercial(client):
    await _seed_user(client, "admin6@babmorocco.com", "supersecret", "admin")
    commercial = await _seed_user(client, "commercial4@babmorocco.com", "secret123", "commercial")

    login_resp = await client.post("/auth/login", json={"email": "admin6@babmorocco.com", "password": "supersecret"})
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch(f"/auth/users/{commercial.id}", json={"is_active": False}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    blocked_login = await client.post(
        "/auth/login", json={"email": "commercial4@babmorocco.com", "password": "secret123"}
    )
    assert blocked_login.status_code == 401

    resp = await client.patch(f"/auth/users/{commercial.id}", json={"is_active": True}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True

    restored_login = await client.post(
        "/auth/login", json={"email": "commercial4@babmorocco.com", "password": "secret123"}
    )
    assert restored_login.status_code == 200


@pytest.mark.anyio
async def test_admin_can_edit_commercial_full_name_and_email(client):
    await _seed_user(client, "admin7@babmorocco.com", "supersecret", "admin")
    commercial = await _seed_user(client, "commercial5@babmorocco.com", "secret123", "commercial")

    login_resp = await client.post("/auth/login", json={"email": "admin7@babmorocco.com", "password": "supersecret"})
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch(
        f"/auth/users/{commercial.id}",
        json={"full_name": "Updated Name", "email": "updated5@babmorocco.com"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Updated Name"
    assert resp.json()["email"] == "updated5@babmorocco.com"

    list_resp = await client.get("/auth/users", headers=headers)
    emails = {u["email"] for u in list_resp.json()}
    assert "updated5@babmorocco.com" in emails


@pytest.mark.anyio
async def test_edit_user_to_duplicate_email_conflicts(client):
    await _seed_user(client, "admin8@babmorocco.com", "supersecret", "admin")
    await _seed_user(client, "taken@babmorocco.com", "secret123", "commercial")
    target = await _seed_user(client, "commercial6@babmorocco.com", "secret123", "commercial")

    login_resp = await client.post("/auth/login", json={"email": "admin8@babmorocco.com", "password": "supersecret"})
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch(
        f"/auth/users/{target.id}", json={"email": "taken@babmorocco.com"}, headers=headers
    )
    assert resp.status_code == 409


@pytest.mark.anyio
async def test_update_user_rejected_for_non_admin(client):
    commercial = await _seed_user(client, "commercial7@babmorocco.com", "secret123", "commercial")

    login_resp = await client.post(
        "/auth/login", json={"email": "commercial7@babmorocco.com", "password": "secret123"}
    )
    token = login_resp.json()["access_token"]

    resp = await client.patch(
        f"/auth/users/{commercial.id}",
        json={"full_name": "Hacked"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_admin_cannot_edit_own_account_via_endpoint(client):
    admin = await _seed_user(client, "admin9@babmorocco.com", "supersecret", "admin")

    login_resp = await client.post("/auth/login", json={"email": "admin9@babmorocco.com", "password": "supersecret"})
    token = login_resp.json()["access_token"]

    resp = await client.patch(
        f"/auth/users/{admin.id}",
        json={"full_name": "Self Edit"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
