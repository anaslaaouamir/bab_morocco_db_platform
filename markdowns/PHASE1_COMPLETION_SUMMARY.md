# Phase 1 Completion Summary
# Bab Morocco BD Intelligence Platform

> Single source of truth for the completed Phase 1 — backend, frontend, and full API integration.
> Updated: 2026-06-26 (v2.0 — contracts & negotiation closing added)

---

## 1. Overview

Phase 1 was delivered in four successive layers:

| Layer | Commits | Key output |
|-------|---------|------------|
| **Frontend (pre-backend)** | `a9b4bae` → `f904122` | Full UI built against mock data |
| **Backend (SP1–SP6)** | `cc99187` → `0428b4e` | FastAPI + PostgreSQL + Claude AI |
| **API integration** | `5024bb7` → `5877c9a` | Frontend wired to live backend; mock data removed |
| **Contracts & Negotiation closing** | `940ef54` → `27a9e90` | Full contract lifecycle + Conclure/Abandonner flows |

Phase 1 is now **complete**. All six sub-phases (SP1–SP6) are implemented, every frontend page reads from and writes to the real backend API, and the full partner lifecycle from prospection through signed contract is operational end-to-end.

---

## 2. Final Backend Structure

```
backend/
├── app/
│   ├── main.py                        # FastAPI app, CORS, router inclusion
│   ├── config.py                      # Pydantic settings (env vars)
│   ├── database.py                    # Async SQLAlchemy engine + get_session
│   ├── models/
│   │   ├── prospect.py                # Prospect table (UUID PK, 30+ columns)
│   │   ├── scan_job.py                # ScanJob table
│   │   ├── outreach.py                # OutreachEmail table
│   │   ├── negotiation.py             # NegotiationMessage table
│   │   └── contract.py                # Contract table (status lifecycle, PDF bytes, partner reply)
│   ├── schemas/
│   │   ├── prospect.py                # ProspectCreate / ProspectOut / ProspectStats
│   │   ├── scan.py                    # ScanJobCreate / ScanJobOut
│   │   ├── outreach.py                # EmailOut / GenerateRequest
│   │   ├── negotiation.py             # MessageIn / AnalysisOut / ScenarioOut
│   │   └── contract.py                # ContractCreate / ContractResponse / PartnerReplySubmit
│   ├── routers/
│   │   ├── health.py                  # GET /health, GET /
│   │   ├── prospects.py               # Full CRUD + /stats + /score-preview
│   │   ├── scan.py                    # POST /scan/start, GET /scan/{id}, GET /scan/history
│   │   ├── outreach.py                # Generate / validate / send / trigger-followup
│   │   ├── negotiation.py             # Submit / analysis / history / respond + /simulate-reply (dev)
│   │   └── contracts.py               # Full contract lifecycle — 10 endpoints
│   ├── services/
│   │   ├── scoring.py                 # ScoringEngine — 5-criteria algorithm
│   │   ├── prospect_service.py        # Business logic wrapping CRUD
│   │   ├── scan_pipeline.py           # BackgroundTask pipeline (mock → score → insert)
│   │   ├── mock_providers.py          # MockGoogleMapsProvider + MockEnrichmentService
│   │   ├── email_generator.py         # EmailGeneratorProtocol: ClaudeEmailGenerator / MockEmailGenerator
│   │   ├── outreach_service.py        # Variant generation, sequence logic, send
│   │   ├── negotiation_generator.py   # ClaudeNegotiationGenerator / MockNegotiationGenerator
│   │   ├── negotiation_service.py     # Analysis, scenario generation, respond
│   │   ├── contract_generator.py      # ContractGeneratorProtocol: ClaudeContractGenerator / MockContractGenerator
│   │   ├── contract_service.py        # Full contract lifecycle: create → generate → send → sign/decline
│   │   └── pdf_generator.py           # ReportLab A4 PDF — branded, multilingual, real bytes
│   └── tests/
│       ├── conftest.py                # SQLite in-memory fixtures, DI overrides
│       ├── test_health.py
│       ├── test_prospects.py          # Includes perdu stage transition test
│       ├── test_scoring.py
│       ├── test_scan.py
│       ├── test_outreach.py
│       ├── test_negotiation.py
│       └── test_contracts.py          # 29 tests covering full contract lifecycle
├── alembic/
│   └── versions/                      # 6 migration files:
│                                      #   prospects, scan_jobs, outreach_emails,
│                                      #   negotiation_messages, contracts (c5d2f1a8b3e7),
│                                      #   partner_reply columns (d4e1f2a3b8c9)
├── alembic.ini
├── requirements.txt                   # includes reportlab
├── .env.example
└── Makefile
```

**Test suite:** 103+ tests, all green (73 pre-contracts → 96 post-contract backend → 103+ current).

---

## 3. Final Frontend Structure

```
frontend/src/
├── app/
│   ├── page.tsx                       # Dashboard — live KPIs from /prospects
│   ├── prospection/page.tsx           # Kanban + Table — live CRUD + optimistic stage drag
│   ├── outreach/page.tsx              # Email composer — generate/validate/send flow
│   ├── negociation/page.tsx           # Negotiation flow — full loop + Conclure + Abandonner
│   └── contrats/page.tsx              # Contracts page — live API, grouped by status
├── components/
│   ├── crm/
│   │   ├── AddProspectDialog.tsx      # POST /prospects (async, server score)
│   │   ├── ScanProspectDialog.tsx     # POST /scan/start → polling GET /scan/{id}
│   │   ├── ProspectDrawer.tsx         # Fiche partenaire with outreach sub-section
│   │   ├── ProspectTable.tsx          # Data table with filters
│   │   └── ProspectionModeDialog.tsx  # Mode chooser: Manuel vs Scan automatique
│   ├── contracts/
│   │   └── ContractGenerateDialog.tsx # 4-step MUI Stepper dialog — full contract lifecycle
│   ├── kanban/KanbanBoard.tsx         # PATCH /prospects/{id}/stage with undo
│   ├── nav/AppShell.tsx               # MD3 Navigation Rail / Bar
│   └── shared/
│       ├── ConfirmationDialog.tsx
│       └── FilterBar.tsx
├── lib/
│   ├── api/
│   │   ├── base.ts                    # apiFetch<T> with ApiError for FastAPI shapes
│   │   ├── types.ts                   # Raw snake_case backend types (Pydantic mirrors)
│   │   │                              #   includes RawContract, RawContractClauses,
│   │   │                              #   ContractStatus, partner_reply fields
│   │   ├── mappers.ts                 # rawToProspect, prospectToCreate, prospectToUpdate
│   │   └── index.ts                   # prospectsApi, scanApi, outreachApi,
│   │                                  #   negotiationApi, contractsApi
│   ├── constants/geography.ts         # COUNTRIES, COUNTRIES_BY_MARKET, CITIES_BY_COUNTRY
│   ├── filters.ts
│   └── theme.ts
├── contexts/SnackbarContext.tsx
├── data/mockProspects.ts              # Retained for dev fallback only (not used in pages)
└── types/prospect.ts
```

---

## 4. Complete API Integration Map

### 4.1 Prospects API (`/prospects`)

| Frontend action | HTTP call | File |
|----------------|-----------|------|
| Load Kanban / Table | `GET /prospects?pageSize=100` | `prospection/page.tsx` |
| Load Dashboard KPIs | `GET /prospects?pageSize=500` | `page.tsx` |
| Add prospect (manual) | `POST /prospects` | `AddProspectDialog.tsx` |
| Move stage (drag Kanban) | `PATCH /prospects/{id}/stage` | `KanbanBoard.tsx` |
| Score preview (live form) | `POST /prospects/score-preview` | `AddProspectDialog.tsx` |
| Dashboard stats | `GET /prospects/stats` | `page.tsx` |
| Conclude negotiation → closing | `PATCH /prospects/{id}/stage` (closing) | `negociation/page.tsx` |
| Abandon negotiation → perdu | `PATCH /prospects/{id}/stage` (perdu) | `negociation/page.tsx` |

### 4.2 Scan API (`/scan`)

| Frontend action | HTTP call | File |
|----------------|-----------|------|
| Launch scan | `POST /scan/start` | `ScanProspectDialog.tsx` |
| Poll progress (every 2 s) | `GET /scan/{job_id}` | `ScanProspectDialog.tsx` |
| View past scans | `GET /scan/history` | `ScanProspectDialog.tsx` |
| Refresh prospects on done | calls `fetchProspects()` callback | `prospection/page.tsx` |

### 4.3 Outreach API (`/outreach`)

| Frontend action | HTTP call | File |
|----------------|-----------|------|
| Load outreach prospects | `GET /prospects?stage=outreach` | `outreach/page.tsx` |
| Load email step for prospect | `GET /outreach/{id}/next-step` | `outreach/page.tsx` |
| Prefetch all emails on load | `GET /outreach/{id}` (per prospect) | `outreach/page.tsx` |
| Generate J0 variants (A/B/C) | `POST /outreach/{id}/generate` | `outreach/page.tsx` |
| Validate a draft email | `POST /outreach/{email_id}/validate` | `outreach/page.tsx` |
| Send a validated email | `POST /outreach/{email_id}/send` | `outreach/page.tsx` |
| Trigger next follow-up step | `POST /outreach/{id}/trigger-followup` | `outreach/page.tsx` |

### 4.4 Negotiation API (`/negotiation`)

| Frontend action | HTTP call | File |
|----------------|-----------|------|
| Load negotiation prospects | `GET /prospects?stage=negociation` | `negociation/page.tsx` |
| Submit inbound message | `POST /negotiation/{id}/message` | `negociation/page.tsx` |
| Load analysis + scenarios | `GET /negotiation/{id}/analysis` | `negociation/page.tsx` |
| Load full message history | `GET /negotiation/{id}/history` | `negociation/page.tsx` |
| Respond with chosen scenario | `POST /negotiation/{id}/respond` | `negociation/page.tsx` |
| [DEV] Simulate partner follow-up | `POST /negotiation/{id}/simulate-reply` | `negociation/page.tsx` |

### 4.5 Contracts API (`/contracts`)

| Frontend action | HTTP call | File |
|----------------|-----------|------|
| Load all contracts | `GET /contracts` | `contrats/page.tsx` |
| Load closing/activation prospects | `GET /prospects?stage=closing\|activation_ota` | `contrats/page.tsx` |
| Create draft contract | `POST /contracts` | `ContractGenerateDialog.tsx` |
| Get single contract | `GET /contracts/{id}` | `ContractGenerateDialog.tsx` |
| Generate clauses + PDF | `POST /contracts/{id}/generate` | `ContractGenerateDialog.tsx` |
| Download PDF | `GET /contracts/{id}/pdf` | `ContractGenerateDialog.tsx` |
| Send to partner (mock email) | `POST /contracts/{id}/send` | `ContractGenerateDialog.tsx` |
| Submit partner email reply | `POST /contracts/{id}/submit-reply` | `ContractGenerateDialog.tsx` |
| [DEV] Simulate partner reply | `POST /contracts/{id}/simulate-reply` | `ContractGenerateDialog.tsx` |
| Mark as signed | `POST /contracts/{id}/mark-signed` | `ContractGenerateDialog.tsx` |
| Mark as declined | `POST /contracts/{id}/mark-declined` | `ContractGenerateDialog.tsx` |
| [DEV] Simulate full signing | `POST /contracts/{id}/simulate-signed` | `ContractGenerateDialog.tsx` |

---

## 5. Negotiation Page — Full Flow Detail

The negotiation page (`negociation/page.tsx`) implements the complete human-in-the-loop negotiation loop defined in CLAUDE.md §6. It manages multiple concurrent prospects each with their own independent state.

### 5.1 Panel State Machine

Each prospect cycles through four UI panels based on API state:

```
SubmitMessagePanel
    ↓  POST /negotiation/{id}/message
AnalysisPanel (3 scenarios: A, B, C)
    ↓  POST /negotiation/{id}/respond  (scenario A or B)
WaitingForReplyPanel
    ↓  "Envoyer une autre note" button (manual re-entry)
SubmitMessagePanel  ←── loop continues
```

Scenario C (Escalade) does not call `/respond` — it opens a pre-filled editable text box that the commercial agent sends manually. The EscalationPanel shows the draft and confirms the handoff.

### 5.2 State Persistence Across Refresh

When the page loads, both analysis and full message history are fetched in parallel. If the last persisted message in history has `direction = "outbound"`, the page reconstructs the `respondedCache` entry so the `WaitingForReplyPanel` appears immediately on reload — no data is lost on browser refresh.

### 5.3 Non-Financial Counterparts Display

The analysis panel surfaces the 5 non-financial perks (CLAUDE.md §6) as toggleable chips. The commercial agent selects which perks to include in the response before choosing a scenario. Selection state is local to the current session (not persisted).

### 5.4 Intent Score & Human Review Gate

The analysis response includes an `intent_score` (1–5) and a `requires_human` flag:
- `intent_score >= 4` → green banner "Partenaire très motivé — moment idéal pour conclure"
- `requires_human = true` on Scenario A → red Alert chip on the ScenarioCard + error button color + no send without escalation

### 5.5 Conclure le Partenariat (→ Closing)

A green **Conclure le partenariat** button is always visible in the analysis card header (not blocked by state). On click:

1. `ConfirmationDialog` is shown — irreversible action warning.
2. On confirm: `PATCH /prospects/{id}/stage` with `closing` is called.
3. Backend auto-creates a draft `Contract` row for the prospect (idempotent — see §7.2).
4. Prospect is removed from the negotiation list.
5. Snackbar confirms: "Passé en Closing — contrat créé automatiquement."
6. `router.push("/contrats")` redirects to the contracts page.

### 5.6 Abandonner / Perdu (→ Perdu)

A red **Abandonner** button sits next to the Conclure button in the analysis card header. On click:

1. `ConfirmationDialog` warns the action is **irreversible** (CLAUDE.md §9 — human escalation required).
2. On confirm: `PATCH /prospects/{id}/stage` with `perdu` is called.
3. Prospect is removed from the negotiation list.
4. Warning snackbar: "Marqué comme perdu."
5. A backend test verifies the `perdu` stage transition persists in the database.

### 5.7 DEV Simulation Flow

In `ENV != production`, a `[DEV] Simuler réponse suivante du partenaire →` chip is shown in the WaitingForReplyPanel. It calls `POST /negotiation/{id}/simulate-reply`, which injects a realistic inbound message and re-runs the mock negotiation generator — rotating through 3 different message templates per click to make repeated testing feel realistic.

---

## 6. Contracts System — Full Detail

### 6.1 Database Model (`contracts` table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `prospect_id` | UUID FK → prospects | CASCADE delete, UNIQUE (one contract per prospect) |
| `status` | String(30) | `draft → generated → sent_to_partner → signed \| declined` |
| `partner_name` | String(255) | Snapshot at creation — PDF-stable even if prospect edited |
| `partner_type` | String(50) | Used for commission floor lookup |
| `partner_email` | String(255) | |
| `country` | String(100) | Determines jurisdiction + GDPR framework |
| `language` | String(5) | `fr \| en \| es \| de \| ar` — drives PDF section headers |
| `commission` | Float | Commission rate at time of contract creation |
| `estimated_annual_value` | Float (nullable) | For $50k threshold check |
| `clauses_json` | Text (nullable) | JSON of 9 clause texts — stored after generation |
| `pdf_bytes` | LargeBinary (nullable) | Real ReportLab PDF stored in DB (swap for S3 in prod) |
| `human_review_required` | Boolean | Set by business rule gate on creation |
| `human_review_reason` | String(255) | Human-readable reason for the gate |
| `partner_reply` | Text (nullable) | Partner's email reply text, submitted by the user |
| `partner_replied_at` | DateTime (nullable) | Timestamp of reply submission |
| `sent_at` | DateTime (nullable) | |
| `signed_at` | DateTime (nullable) | |
| `declined_at` | DateTime (nullable) | |
| `created_at` / `updated_at` | DateTime | |

### 6.2 Contract Status Lifecycle

```
draft
  │  POST /contracts/{id}/generate  (blocked if human_review_required)
  ▼
generated
  │  POST /contracts/{id}/send
  ▼
sent_to_partner
  │  POST /contracts/{id}/submit-reply  (records partner reply text, status unchanged)
  │
  ├── POST /contracts/{id}/mark-signed  ──► signed   → prospect.stage = activation_ota
  └── POST /contracts/{id}/mark-declined ──► declined → prospect.stage = negociation
                                                            (partner renegotiates →
                                                             closing again →
                                                             contract RESET to draft)
```

**Re-closing idempotency:** If a prospect is declined, returns to negotiation, renegotiates, and is moved to `closing` again, `create_from_prospect` detects the existing `declined` contract and resets it to a fresh `draft` (clears all clause/PDF/reply/timestamp fields, re-evaluates commission floor and human review gate with the new rate).

### 6.3 Human Review Gate (CLAUDE.md §9)

Two business rules block PDF generation and flag the contract as requiring human validation:

| Rule | Condition | Reason shown |
|------|-----------|-------------|
| Commission floor | `commission < COMMISSION_FLOORS[type]` | e.g. "Commission 7% est inférieure au plancher absolu de 8% pour hotel_riad" |
| Annual value | `estimated_annual_value > $50,000` | "Valeur annuelle estimée … dépasse le seuil de 50 000 $" |

When `human_review_required = True`, `POST /contracts/{id}/generate` returns `HTTP 403`. The contracts page displays a warning badge on the ContractCard.

### 6.4 Contract Generator — Dual-Mode DI Pattern

Same activation gate as email and negotiation generators:

| ENV condition | Generator used | Output |
|---------------|---------------|--------|
| `ENV != production` OR no API key | `MockContractGenerator` | 9 realistic French clauses filled with actual prospect data — real text, no placeholders |
| `ENV=production` + `ANTHROPIC_API_KEY` set | `ClaudeContractGenerator` | Full Anthropic API call — generates all 9 clauses in the partner's language (fr/en/es/de/ar) |

The mock generator is not Lorem ipsum — it produces complete, legally-structured French clauses using real prospect fields (`nom`, `ville`, `pays`, `commission_standard`, `email_contact`, `nom_contact`, `poste_contact`). Commission floor, payment delay (45 days), data protection framework (RGPD/PDPL/Loi 09-08), jurisdiction, and non-financial perks are all correctly derived from the prospect's country.

**COMMISSION_FLOORS** (enforced at both `ContractService` and `ClaudeContractGenerator` prompt level):

| Partner type | Absolute floor |
|-------------|---------------|
| `hotel_riad` | 8% |
| `tour_operateur` | 10% |
| `agence_voyage` | 12% |
| `hotel_luxe` | 8% |
| `activite` | 15% |
| `transport` | 12% |
| `to_golfe` | 10% |
| `mice` | 10% |

### 6.5 PDF Generator (ReportLab)

`pdf_generator.py` produces a real, valid A4 PDF in both dev and production — the only difference is the clause text source (mock vs Claude). Features:

- Bab Morocco brand orange header bar (`#B5451B`)
- Section headers translated into 5 languages (fr/en/es/de/ar) chosen from the prospect's `langue` field
- Numbered clauses (1–9) with justified paragraphs
- Signature block: two columns (Pour Bab Morocco / Le Partenaire) with printed name + date lines
- Post-signature activation note: YouSign eIDAS, 1-hour OTA activation, Partenaire Fondateur perks
- Jurisdiction and GDPR framework auto-derived from `pays` field

### 6.6 Backend Endpoints (`/contracts`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/contracts` | List all contracts, ordered by `created_at` desc |
| `POST` | `/contracts` | Create draft (idempotent). Requires prospect in `closing` or `activation_ota`. |
| `GET` | `/contracts/{id}` | Get single contract |
| `GET` | `/contracts/{id}/pdf` | Download PDF bytes as `application/pdf` |
| `POST` | `/contracts/{id}/generate` | Generate clauses + render PDF. 403 if `human_review_required`. |
| `POST` | `/contracts/{id}/send` | Mock send (log). Sets `sent_to_partner`. |
| `POST` | `/contracts/{id}/submit-reply` | Record partner reply text. Status stays `sent_to_partner`. |
| `POST` | `/contracts/{id}/simulate-reply` | **DEV ONLY** (403 in production). Inject realistic mock reply. |
| `POST` | `/contracts/{id}/mark-signed` | Sign → `activation_ota`. |
| `POST` | `/contracts/{id}/mark-declined` | Decline → prospect back to `negociation`. |
| `POST` | `/contracts/{id}/simulate-signed` | **DEV ONLY**. Skips `sent_to_partner` for rapid testing. |

Auto-creation hook: `PATCH /prospects/{id}/stage` with `closing` triggers `ContractService.create_from_prospect()` in the same request — the prospect arrives on the contracts page with a draft contract already waiting.

### 6.7 Frontend — `ContractGenerateDialog`

A 4-step MUI Stepper dialog (`ContractGenerateDialog.tsx`) drives the user through the full lifecycle:

**Step 0 — Réviser (draft)**
- Displays partner summary (type, commission, country, language)
- Shows `human_review_required` warning badge if set
- "Générer le contrat" button calls `POST /contracts/{id}/generate`

**Step 1 — PDF généré (generated)**
- Expandable `ClauseAccordion` for each of the 9 clauses (shows full text)
- PDF download link → `GET /contracts/{id}/pdf`
- "Envoyer au partenaire" button calls `POST /contracts/{id}/send`

**Step 2 — Envoyé (sent_to_partner)**
Two sub-states:

- *No reply yet:* Empty state with InboxIcon. DEV chip: `[DEV] Simuler réponse du partenaire` calls `POST /contracts/{id}/simulate-reply`. The simulated reply mentions the PDF attachment ("pièce jointe signée").
- *Reply received:* Reply displayed as a message bubble. Auto-detected PDF attachment badge (scans reply text for "pièce jointe"/"PDF"). Two decision buttons: **Signé** (calls `mark-signed`) and **Refusé** (calls `mark-declined`), each behind a `ConfirmationDialog`. DEV shortcut chip `[DEV] Simuler signature complète` always visible as a fallback.

**Step 3 — Résultat (signed / declined)**
- Signed: green success banner + "Partenaire actif sur babmorocco.com" + `[WEBHOOK_PLACEHOLDER]` note
- Declined: orange banner + explanation that prospect returned to negotiation

### 6.8 Frontend — `contrats/page.tsx`

Fetches both `contractsApi.list()` and `prospectsApi.list({ stage: "closing" | "activation_ota" })` in parallel on mount. Contracts are grouped into three sections:

| Section | Criteria |
|---------|---------|
| Signés & actifs | `status === "signed"` |
| En cours | `status` in `draft / generated / sent_to_partner` |
| Refusés | `status === "declined"` |

**ContractCard** (inline component in the page):
- Left accent bar color = status color (green / orange / blue / red)
- Status chip with icon (CheckCircle / HourglassTop / PictureAsPdf / DoNotDisturb)
- `human_review_required` warning chip (amber, WarningAmber icon)
- For `sent_to_partner` status: smart reply chip — "En attente de réponse" (warning) or "Réponse reçue" (success) — both clickable and open the dialog
- "Ouvrir le contrat" button opens `ContractGenerateDialog`

---

## 7. Deviations from BACKEND_PHASE1_PLAN.md

### 7.1 Additions (not in the original plan)

#### Email generator: dual-mode DI pattern (`9e5ff32`)
The plan specified a single `MockEmailSender` that logs. The implementation introduced a clean `EmailGeneratorProtocol` with two concrete implementations:
- `MockEmailGenerator` — lorem-ipsum at realistic length, used when `ENV != production`.
- `ClaudeEmailGenerator` — real Anthropic API call with full prospect-aware prompt, activated automatically when `ANTHROPIC_API_KEY` is set **and** `ENV=production`.

Dependency injection via `get_email_generator()` allows tests to override without patching globals.

#### Same pattern for Negotiation generator (`0428b4e`)
`MockNegotiationGenerator` / `ClaudeNegotiationGenerator` with the same DI gate. Not described in the plan at all.

#### Same pattern for Contract generator (`940ef54`)
`MockContractGenerator` / `ClaudeContractGenerator` with the same DI gate. Not described in the original Phase 1 plan — the contract system was scoped to Phase 2.

#### Full contract lifecycle (`940ef54` → `27a9e90`)
Originally deferred to Phase 2. Delivered in Phase 1 in mock mode:
- `Contract` model, `contracts` table, Alembic migrations
- `ContractService` with idempotent create, generate, send, sign, decline, submit-reply, simulate-reply
- `MockContractGenerator` + `ClaudeContractGenerator`
- Real ReportLab PDF renderer (5-language support)
- `ContractGenerateDialog` 4-step frontend dialog
- Partner reply inbox with automated simulation
- Decline → re-close → reset idempotency

#### `POST /outreach/{prospect_id}/trigger-followup` endpoint (`c214630`)
The plan listed only `POST /outreach/trigger-followups` (batch cron). A per-prospect variant was added so the frontend can trigger the next follow-up immediately after a send, without waiting for a cron cycle.

#### `generate_step_variants()` — multi-step generation (`c214630`)
The plan described generating only J0 variants. `generate_step_variants(step)` now generates A/B/C drafts for any step (j0, j3, j7, j30). `generate_j0_variants()` delegates to it.

#### `auto_trigger_followup()` — idempotent per-prospect check (`c214630`)
Not in the plan. This service method checks per-prospect timing conditions (j0 sent ≥ 3 days → create j3, etc.) and is called both by the batch cron and immediately after each send.

#### `POST /negotiation/{id}/simulate-reply` — dev-only endpoint (`aa03e5c`)
Dev-only endpoint that moves a prospect from `outreach` → `negociation` and runs `MockNegotiationGenerator`. Used by the `[DEV]` button in the Outreach page. Not in the plan.

#### `backend/check_db.py` utility (`aa03e5c`)
Small standalone script added to inspect live database state during integration work.

#### Pre-production blocker patch (`0366888`)
Three fixes not anticipated in the plan:
1. Missing Alembic migrations for `outreach_emails` and `negotiation_messages` tables were created and chained.
2. `json.loads()` wrapped in try/except in both Claude generators — `JSONDecodeError | KeyError` → `ValueError` → router returns `502` instead of an unhandled `500`.
3. `.env.example` updated to document the `ENV=production` gate for Claude activation.

#### Shared geography constants (`8bb8d40`)
`src/lib/constants/geography.ts` — single source for `COUNTRIES`, `COUNTRIES_BY_MARKET`, `CITIES_BY_COUNTRY`. Not in scope of the backend plan but added to avoid duplication between `AddProspectDialog` and `ScanProspectDialog`.

#### Dashboard fully derived from live API (`560d1cb`)
Every KPI widget, chart, and stat on `page.tsx` now derives from a live `prospectsApi.list()` call. The plan did not specify a Dashboard API integration.

#### Email prefetch on Outreach page load (`1504f05`)
All prospects' emails are fetched upfront when the Outreach page loads, so timeline cards reflect the correct step state without waiting for individual selection.

#### Negotiation page state persistence across refresh (`eda7dc6`)
The responded/waiting state is reconstructed from API history on page reload. Plan did not cover this persistence requirement.

#### Conclure le partenariat — Closing exit from negotiation (`aeb38e7`)
Not originally planned in the negotiation frontend. Green button in analysis card header. On confirm: patches stage to `closing`, auto-creates draft contract, redirects to `/contrats`.

#### Abandonner / Perdu — Permanent exit from negotiation (`27a9e90`)
CLAUDE.md §9 requires human escalation for abandoning a prospect. Implemented as a red button next to Conclure, with irreversibility warning dialog. Patches stage to `perdu`, removes from negotiation list.

---

### 7.2 Changes to Planned Behaviour

#### `PATCH /prospects/stage` → closing now auto-creates contract
When stage is set to `closing`, the router immediately calls `ContractService.create_from_prospect()` in the same request. The contract page receives a prospect with a draft contract already created.

#### `POST /prospects` — score computed server-side
The plan required `score_total` to always be computed server-side. During integration, the frontend `AddProspectDialog` was updated to stop passing a client-computed score and instead use the server-returned prospect (including score) to replace the locally-created object.

#### `GET /prospects/stats` — path conflict resolved
The plan placed `GET /prospects/stats` alongside `/prospects/{id}`. In FastAPI, `/stats` would be caught as an `{id}` path parameter. The implementation registers the `/stats` route before the `/{id}` route.

#### Outreach variant selection expanded to all steps
The plan described email generation only for J0. The UI's step selector (J0 / J+3 / J+7 / J+30 pills) and supporting backend changes mean all sequence steps have full A/B/C generation and selection parity.

#### Negotiation page: full submit→analyze→respond loop UI
The plan described the negotiation endpoints but not the frontend states. The final implementation includes distinct panels: `SubmitMessagePanel`, analysis view with 3 scenarios, `WaitingForReplyPanel`, and `EscalationPanel`. Multiple refinement commits were required to stabilize this flow.

#### Contract decline → re-close idempotency (`c7c26ef`)
When a declined contract's prospect re-enters closing, `create_from_prospect` resets the existing `declined` row to a fresh `draft` rather than returning the stale record. All clause, PDF, reply, and timestamp fields are cleared; commission and human_review gate are re-evaluated with any new rate.

---

### 7.3 Items from the Plan Not Yet Implemented

| Item | Status | Notes |
|------|--------|-------|
| `POST /prospects/score-preview` tests | Not confirmed | Endpoint exists; test listed in plan but not verified in commit messages. |
| `Makefile` commands | Partial | Makefile created in SP1 but only `dev`, `test`, `migrate` targets mentioned; not all verified. |
| `DELETE /prospects/{id}` frontend wiring | Not wired | Endpoint exists in backend; no frontend UI connected. |
| `PUT /prospects/{id}` frontend wiring (full update) | Not wired | `PATCH /stage` is wired; full `PUT` is not exposed in the UI yet. |
| Real email delivery (Mailgun) | Phase 2 | `send_to_partner` logs mock only. |
| YouSign eIDAS signature | Phase 2 | Referenced in contract PDF text; API not integrated. |
| OTA webhook post-signature | Phase 2 | `[WEBHOOK_PLACEHOLDER]` logged on `mark_signed`. |

---

## 8. Environment & Configuration

### Backend (`.env`)
```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/bab_morocco
ANTHROPIC_API_KEY=sk-ant-...       # optional in dev; required for Claude in prod
ENV=development                    # set to "production" to activate all Claude generators
SECRET_KEY=changeme
# Phase 2 — not used in Phase 1:
GOOGLE_MAPS_API_KEY=
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
YOUSIGN_API_KEY=
```

**Claude activation gate:** `ClaudeEmailGenerator`, `ClaudeNegotiationGenerator`, and `ClaudeContractGenerator` all activate only when `ANTHROPIC_API_KEY` is set **and** `ENV=production`. In all other cases, mock generators are used automatically — no code change required.

### Frontend (`.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ENV=development        # set to "production" to hide all [DEV] chips
```

---

## 9. Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Typed API client layer (`src/lib/api/`) | Single place for all HTTP calls, error handling, and snake↔camel mapping. Pages never call `fetch` directly. |
| `rawToProspect` / `prospectToCreate` mappers | Backend uses `snake_case`; frontend uses `camelCase`. Mappers isolate the translation. |
| Optimistic Kanban stage updates | `PATCH /stage` is called after the UI updates; on failure, state rolls back and shows error toast. |
| Dual-mode DI for all AI generators | `EmailGeneratorProtocol`, `NegotiationGeneratorProtocol`, `ContractGeneratorProtocol` — same gate for all three. One env var (`ENV=production`) flips all three to real AI simultaneously. |
| PDF stored as `LargeBinary` in DB | Dev simplicity — no S3 dependency. Swap `pdf_bytes` column for an S3 key in production. |
| Partner snapshot on contract | `partner_name`, `partner_email`, `country`, `language`, `commission` are copied at creation time. Editing the prospect later does not corrupt existing contract PDFs. |
| `NEXT_PUBLIC_ENV` gates DEV chips | All `[DEV]` simulation buttons (simulate-reply, simulate-signed, simulate-followup) check `process.env.NEXT_PUBLIC_ENV !== "production"` — one env var removes all dev scaffolding from the prod build. |
| `mockProspects.ts` retained but unused | File kept as a dev reference; no page imports it. Can be deleted in Phase 2 cleanup. |

---

## 10. Phase 2 Transition Map

The following table maps every mock or stub in Phase 1 to its production replacement. This is the migration checklist for Phase 2.

| Phase 1 Mock | Location | Phase 2 Production Replacement |
|-------------|----------|-------------------------------|
| `MockGoogleMapsProvider` | `services/mock_providers.py` | Playwright + Apify scraping pipeline |
| `MockEnrichmentService` | `services/mock_providers.py` | LinkedIn scraping / enrichment API |
| `MockEmailGenerator` | `services/email_generator.py` | `ClaudeEmailGenerator` (already written — flip `ENV=production`) |
| `MockNegotiationGenerator` | `services/negotiation_generator.py` | `ClaudeNegotiationGenerator` (already written — same gate) |
| `MockContractGenerator` | `services/contract_generator.py` | `ClaudeContractGenerator` (already written — same gate) |
| `send_to_partner()` mock log | `services/contract_service.py` | Mailgun API call with PDF attachment (`MAILGUN_API_KEY`) |
| `pdf_bytes` LargeBinary column | `models/contract.py` | Replace with S3 key (`pdf_s3_key`); upload bytes to S3 on generate |
| YouSign reference in PDF text | `services/pdf_generator.py` | YouSign API integration — `YOUSIGN_API_KEY`, eIDAS signature flow |
| `[WEBHOOK_PLACEHOLDER]` on `mark_signed` | `services/contract_service.py` | POST to babmorocco.com webhook → partner activated on OTA |
| `simulate-reply` endpoint | `routers/contracts.py` | Remove or keep as internal load-test tool (already 403-gated in prod) |
| `simulate-reply` endpoint | `routers/negotiation.py` | Same — remove or guard |
| `simulate-signed` endpoint | `routers/contracts.py` | Remove — no prod use case |
| `[DEV]` chips in frontend | All pages | Already hidden by `NEXT_PUBLIC_ENV=production` — no code change needed |
| `mockProspects.ts` | `src/data/mockProspects.ts` | Delete file entirely |
| `check_db.py` utility | `backend/check_db.py` | Replace with proper admin dashboard or psql access |

**Activation summary for Phase 2 launch:**
1. Set `ENV=production` and `NEXT_PUBLIC_ENV=production` — all three Claude generators activate, all DEV chips hide.
2. Set `MAILGUN_API_KEY` + `MAILGUN_DOMAIN` — wire `send_to_partner()` to real email.
3. Set `GOOGLE_MAPS_API_KEY` + Apify credentials — replace mock scan pipeline.
4. Set `YOUSIGN_API_KEY` — integrate signature flow.
5. Configure babmorocco.com webhook URL — wire `[WEBHOOK_PLACEHOLDER]` call.
6. Migrate `pdf_bytes` column to S3 key — update `pdf_generator.py` to upload, `contracts/{id}/pdf` endpoint to redirect to signed S3 URL.

---

*Version 2.0 — 2026-06-26*
*Bab Morocco BD Intelligence Platform — Phase 1 Complete (contracts + negotiation closing included)*
