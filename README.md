# Bab Morocco BD Intelligence Platform

An internal Business Development CRM and automation platform for **Bab Morocco**, an Online Travel Agency (OTA) specialising exclusively in Morocco. The platform automates the full B2B partner acquisition cycle — from prospecting to contract signing — with AI assistance at every step and a mandatory human-in-the-loop before any action is taken externally.

```
Prospection → Qualification (scoring) → Outreach → Négociation → Closing → Activation OTA
```

> **Status:** Active development. Deployed at `https://bab.elbahi.ma`.

---

## Features

| Module | What it does |
|---|---|
| **Dashboard** | KPI overview, pipeline funnel, priority alerts, score distribution, market breakdown, commercial potential |
| **Prospection** | Prospect CRM with filtering, manual entry, automated Google Maps scanning, export to PDF/Excel |
| **Outreach** | AI-generated email sequences in 5 languages (FR/EN/ES/DE/AR), human approval before send |
| **Négociation** | Incoming message threads, AI semantic analysis, 3 response scenarios with trade-off explanations |
| **Contrats** | AI-generated 9-clause partnership contracts, PDF export, YouSign e-signature, webhook on signing |
| **Calendrier** | Scheduled scan calendar backed by APScheduler (runs server-side, no browser required) |
| **Settings** | AI provider/model toggle (Claude ↔ GPT-4o), API key management, token usage tracker, user management |

### Key design principles

- **Human-in-the-loop enforced** — no email sends without approval; below-floor commission offers escalate to a human; no contract is signed by AI alone.
- **Mock / production split** — all external services (AI, email, scraping) use local mock generators in `ENV=development`. Set `ENV=production` with real API keys to activate live providers. No code changes required.
- **Runtime AI switching** — active provider (Anthropic Claude or OpenAI GPT-4o) and model tier are switchable from the Settings UI and persisted in the database.
- **Fully async backend** — SQLAlchemy async + asyncpg throughout; no blocking I/O on any route.

---

## Tech Stack

### Frontend
- **Next.js 14** (App Router) + TypeScript
- **MUI v6** with Material Design 3 tokens
- `@hello-pangea/dnd` — drag-and-drop Kanban
- `jsPDF` + `jspdf-autotable` — PDF export
- `xlsx` — Excel export

### Backend
- **Python 3.11** + **FastAPI**
- **SQLAlchemy** (async) + **Alembic** migrations
- **PostgreSQL 16** (production) / SQLite (dev tests)
- **JWT** auth via `python-jose` + `bcrypt`
- **APScheduler** — scheduled scan jobs

### AI & Integrations
- **Anthropic Claude** (`claude-sonnet-4-6` default) — email drafting, negotiation analysis, contract generation
- **OpenAI GPT-4o** — optional alternate provider, switchable at runtime
- **Google Maps Places API** — automated prospect scanning
- **Apify** — website enrichment / OTA presence detection
- **Playwright** — headless Chromium fallback for scraping
- **Resend** — transactional email delivery with inbound reply routing and open tracking
- **YouSign** (EIDAS) — e-signature lifecycle for partnership contracts

---

## Project Structure

```
bab_morocco_db_platform/
├── frontend/                   # Next.js 14 + TypeScript + MUI v6
│   └── src/
│       ├── app/(app)/          # Protected pages: dashboard, prospection, outreach,
│       │                       #   negociation, contrats, calendrier, settings
│       ├── components/         # auth, contracts, crm, kanban, nav, settings, shared
│       ├── contexts/           # AuthContext, NotificationsContext, SnackbarContext
│       ├── lib/                # API client, theme, filters, constants
│       └── types/              # TypeScript types (prospect.ts, …)
│
├── backend/                    # Python FastAPI
│   └── app/
│       ├── main.py             # App entry, CORS, startup hooks, router registration
│       ├── config.py           # Pydantic settings + AI model options
│       ├── routers/            # health, auth, prospects, scan, outreach,
│       │                       #   negotiation, contracts, webhooks, notifications,
│       │                       #   api_settings
│       ├── models/             # SQLAlchemy ORM models (9 tables)
│       ├── schemas/            # Pydantic I/O schemas
│       ├── services/           # scoring, email_generator, negotiation_generator,
│       │                       #   contract_generator, pdf_generator, scan_pipeline,
│       │                       #   email_transport, yousign_client, ai_tracker,
│       │                       #   scheduler, auth_service, notification_bus
│       ├── dependencies/       # JWT auth guards
│       └── tests/              # pytest suite (SQLite in-memory)
│
├── alembic/                    # 16+ database migrations
├── scripts/                    # Utility scripts (SQLite → PostgreSQL migration)
└── markdowns/                  # Technical planning docs and phase specs
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL 16 (for production) or SQLite (dev/test only)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
cp .env.example .env            # fill in values — see Environment Variables below
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                         # runs on http://localhost:3000
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (`postgresql+asyncpg://...`) |
| `ENV` | Yes | `development` or `production` — switches mocks on/off |
| `SECRET_KEY` | Yes | JWT signing secret |
| `ADMIN_EMAIL` | Startup | Seeds first Admin user if DB is empty |
| `ADMIN_PASSWORD` | Startup | Seeds first Admin user if DB is empty |
| `ANTHROPIC_API_KEY` | AI | Claude API key (active only when `ENV=production`) |
| `OPENAI_API_KEY` | AI | OpenAI fallback (optional) |
| `GOOGLE_MAPS_API_KEY` | Phase 2 | Places API for automated prospect scanning |
| `APIFY_API_TOKEN` | Phase 2 | Website enrichment scraping |
| `RESEND_API_KEY` | Phase 2 | Email delivery |
| `RESEND_FROM_EMAIL` | Phase 2 | Sender address |
| `RESEND_INBOUND_DOMAIN` | Phase 2 | Inbound reply tracking domain |
| `RESEND_WEBHOOK_SECRET` | Phase 2 | Webhook signature verification |
| `YOUSIGN_API_KEY` | Phase 2 | E-signature API |
| `YOUSIGN_SANDBOX` | Phase 2 | `true` for sandbox mode |
| `JWT_EXPIRE_MINUTES` | Optional | Default: `480` (8 hours) |

### Frontend (`frontend/.env.local`)

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Backend base URL (e.g. `http://localhost:8000`) |

---

## Scoring Algorithm

Prospects are scored 0–100 across five weighted criteria:

| Criterion | Weight | Details |
|---|---|---|
| Digital activity | 25 pts | Website presence, Google rating, HTTPS, booking CTA, social media |
| Market coherence | 25 pts | Target country match + multilingual site bonus |
| Size / capacity | 20 pts | Google review count tiers |
| Decision-maker contact | 15 pts | Email, phone, or contact form found |
| OTA freedom | 15 pts | Not exclusively tied to Booking/Expedia |

Prospects scoring **≥ 75** are eligible for outreach. Below that threshold, they are placed in *veille* (watchlist) with a re-evaluation date.

---

## Partner Types

Eight partner types are tracked with individual commission grids (10–18%):

- Hotels & Riads
- European tour operators
- B2B travel agencies
- 5-star luxury hotels
- Activity providers
- Transport & transfers
- Gulf tour operators
- MICE / incentive agencies

The AI enforces absolute floor thresholds per partner type and escalates to a human for any below-floor offer received during negotiation.

---

## Roles & Access

| Role | Capabilities |
|---|---|
| **Admin** | Full access: manage users, configure API keys, view all prospects, all settings |
| **Commercial** | View and manage assigned prospects only; no user/settings access |

First login forces a mandatory password change.

---

## Running Tests

```bash
cd backend
pytest
```

Tests use an in-memory SQLite database; no external services or API keys required.

---

## Production Deployment

```
Internet → Cloudflare (DNS) → nginx (vhost bab.elbahi.ma, SSL Let's Encrypt)
                                 ├── /       → Next.js   :3010   (pm2)
                                 └── /api    → FastAPI    :8010   (uvicorn, pm2)
                                                  └── PostgreSQL (dedicated DB)
```

| Component | Details |
|---|---|
| Server | VPS at `13.140.187.6` — user `deploy-bab`, folder `/var/www/bab` |
| Frontend | Next.js on `127.0.0.1:3010` |
| Backend | FastAPI / uvicorn on `127.0.0.1:8010` |
| Process manager | pm2 (per-account instance, no sudo) |
| DNS | Cloudflare |
| Reverse proxy | nginx + Let's Encrypt SSL (pre-configured, do not modify) |
| URL | `https://bab.elbahi.ma` |
