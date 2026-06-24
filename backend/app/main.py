from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.routers import health, prospects, scan, outreach

app = FastAPI(title="Bab Morocco BD Intelligence Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(prospects.router)
app.include_router(scan.router)
app.include_router(outreach.router)


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs", status_code=307)
