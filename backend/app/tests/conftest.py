import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

import app.models  # noqa — register all models with Base.metadata
from app.database import Base, get_session, get_session_factory
from app.main import app as fastapi_app


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

    fastapi_app.dependency_overrides[get_session] = override_get_session
    fastapi_app.dependency_overrides[get_session_factory] = override_get_session_factory

    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as ac:
        yield ac

    fastapi_app.dependency_overrides.clear()
    await engine.dispose()
