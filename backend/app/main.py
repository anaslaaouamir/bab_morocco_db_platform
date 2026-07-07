from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User
from app.routers import auth, health, prospects, scan, outreach, negotiation, contracts, webhooks, notifications
from app.services import auth_service
from app.services.scheduler import start_scheduler, stop_scheduler

app = FastAPI(title="Bab Morocco BD Intelligence Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(prospects.router)
app.include_router(scan.router)
app.include_router(outreach.router)
app.include_router(negotiation.router)
app.include_router(contracts.router)
app.include_router(webhooks.router)
app.include_router(notifications.router)


@app.on_event("startup")
async def seed_first_admin() -> None:
    """Create the initial Admin account from env vars if no users exist yet."""
    if not settings.ADMIN_EMAIL or not settings.ADMIN_PASSWORD:
        return
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).limit(1))
        if result.scalar_one_or_none() is not None:
            return
        admin = User(
            email=settings.ADMIN_EMAIL,
            hashed_password=auth_service.hash_password(settings.ADMIN_PASSWORD),
            full_name="Admin",
            role="admin",
            is_active=True,
        )
        session.add(admin)
        await session.commit()


@app.on_event("startup")
async def start_scan_scheduler() -> None:
    """Server-side clock for scheduled scans (SCHEDULED_SCAN_CALENDAR_PLAN.md
    Phase B) — runs inside this process, so a scan scheduled for an
    unattended overnight window fires without any browser tab open."""
    app.state.scan_scheduler = start_scheduler(AsyncSessionLocal)


@app.on_event("shutdown")
async def stop_scan_scheduler() -> None:
    stop_scheduler(getattr(app.state, "scan_scheduler", None))


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs", status_code=307)
