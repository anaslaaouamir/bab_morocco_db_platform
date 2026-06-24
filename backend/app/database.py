from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def get_session_factory():
    """
    Dependency that returns the session factory itself (not a session).
    Injected into background-task endpoints so the pipeline can open
    its own sessions. Overridden in tests to use the in-memory factory.
    """
    return AsyncSessionLocal
