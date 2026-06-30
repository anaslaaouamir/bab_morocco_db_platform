import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

import app.models  # noqa — register all models with Base.metadata
from app.database import Base, get_session, get_session_factory
from app.main import app as fastapi_app
from app.models.user import User
from app.services import auth_service
from app.services.email_generator import MockEmailGenerator, get_email_generator
from app.services.negotiation_generator import MockNegotiationGenerator, get_negotiation_generator
from app.services.contract_generator import MockContractGenerator, get_contract_generator


@pytest.fixture(params=["asyncio"])
def anyio_backend(request):
    return request.param


@pytest.fixture
async def client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def override_get_session():
        async with SessionLocal() as session:
            yield session

    async def override_get_session_factory():
        return SessionLocal

    def override_get_email_generator():
        return MockEmailGenerator()

    def override_get_negotiation_generator():
        return MockNegotiationGenerator()

    def override_get_contract_generator():
        return MockContractGenerator()

    fastapi_app.dependency_overrides[get_session] = override_get_session
    fastapi_app.dependency_overrides[get_session_factory] = override_get_session_factory
    fastapi_app.dependency_overrides[get_email_generator] = override_get_email_generator
    fastapi_app.dependency_overrides[get_negotiation_generator] = override_get_negotiation_generator
    fastapi_app.dependency_overrides[get_contract_generator] = override_get_contract_generator

    # Seed a default Admin user and authenticate the test client as them.
    # Admins have unrestricted access, so existing business-logic tests
    # (written before auth existed) keep working without changes. Tests
    # that specifically exercise auth/role behavior pass their own
    # Authorization header per-request, which overrides this default.
    async with SessionLocal() as session:
        admin = User(
            email="test-admin@babmorocco.com",
            hashed_password=auth_service.hash_password("test-admin-password"),
            full_name="Test Admin",
            role="admin",
            is_active=True,
        )
        session.add(admin)
        await session.flush()
        await session.commit()
        admin_token = auth_service.create_access_token(admin)

    async with AsyncClient(
        transport=ASGITransport(app=fastapi_app),
        base_url="http://test",
        headers={"Authorization": f"Bearer {admin_token}"},
    ) as ac:
        yield ac

    fastapi_app.dependency_overrides.clear()
    await engine.dispose()
