# Token Tracking, Usage Limits & API Key Management — Implementation Plan

> Reference file for Claude Code. Each section is self-contained — when told
> "apply section N", implement that section fully (backend + frontend), test it,
> commit, and mark it done below.

---

## Codebase context (read-only reference)

### Claude API call sites (4 total — ALL must be tracked)

| # | File | Method | max_tokens |
|---|------|--------|------------|
| A | `backend/app/services/negotiation_generator.py:152` | `ClaudeNegotiationGenerator.analyze` | 512 |
| B | `backend/app/services/negotiation_generator.py:216` | `ClaudeNegotiationGenerator.generate_scenarios` | 2048 |
| C | `backend/app/services/email_generator.py:146` | `ClaudeEmailGenerator.generate` | 1024 |
| D | `backend/app/services/contract_generator.py:306` | `ClaudeContractGenerator.generate_clauses` | 8192 |

All use `anthropic.AsyncAnthropic`, model `claude-sonnet-4-6`.
Response object has `message.usage.input_tokens` and `message.usage.output_tokens`.
No existing middleware, wrapper, or token logging — every call is bare.

### Existing Settings page

- Route: `frontend/src/app/(app)/settings/page.tsx`
- Admin-only (redirects non-admin users)
- Currently contains: Scheduled scan config (window hours, batch size) + user management panel
- Settings state: `frontend/src/lib/settingsStore.ts` — **localStorage only**, no backend persistence
- Page uses MUI v6 (Paper, Slider, Switch, Alert, Typography, Button, Chip, Divider)

### Navigation

- `frontend/src/components/nav/navItems.ts` — nav rail items array
- Settings entry: `{ label: "Paramètres", href: "/settings", requiresAdmin: true }`
- No sub-routing under `/settings` today — single page

### API patterns

- Frontend: `apiFetch<T>(path, init)` in `frontend/src/lib/api/base.ts` — all calls go through this
- Frontend API module: `frontend/src/lib/api/index.ts` — domain-grouped exports
- Backend routers: `backend/app/routers/*.py` — FastAPI routers, JWT-protected
- Backend DI: `get_session` from `backend/app/database.py`
- DB: SQLite + aiosqlite, async SQLAlchemy, models in `backend/app/models/`
- Table creation: `Base.metadata.create_all` in `startup` events in `main.py`
- Auth: JWT, roles `admin` | `commercial`, guard via `get_current_user` dependency

### Config / .env keys currently in `backend/app/config.py`

```
ANTHROPIC_API_KEY, GOOGLE_MAPS_API_KEY, APIFY_API_TOKEN,
MAILGUN_API_KEY, MAILGUN_DOMAIN,
RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_INBOUND_DOMAIN, RESEND_WEBHOOK_SECRET,
ENV, SECRET_KEY, APP_VERSION,
JWT_ALGORITHM, JWT_EXPIRE_MINUTES, ADMIN_EMAIL, ADMIN_PASSWORD
```

Keys that should be user-manageable via the UI:
`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `GOOGLE_MAPS_API_KEY`

Keys that stay in .env only (infrastructure / security):
`SECRET_KEY`, `JWT_*`, `ADMIN_*`, `ENV`, `DATABASE_URL`, `MAILGUN_*`,
`RESEND_FROM_EMAIL`, `RESEND_INBOUND_DOMAIN`, `RESEND_WEBHOOK_SECRET`, `APIFY_API_TOKEN`

---

## Section 1 — Token usage tracking (backend + frontend)

**Goal:** Every Claude API call is logged with its token counts. An admin can see
usage broken down by today / this week / this month, with a per-generator breakdown.

### 1.1 Backend — Model

Create `backend/app/models/api_usage.py`:

```python
class ApiUsageLog(Base):
    __tablename__ = "api_usage_logs"

    id            — UUID, primary key
    timestamp     — DateTime, default utcnow, indexed
    generator     — String(30), not null
                    # values: "email", "negotiation_analyze",
                    #         "negotiation_scenarios", "contract"
    model         — String(50), not null          # e.g. "claude-sonnet-4-6"
    input_tokens  — Integer, not null
    output_tokens — Integer, not null
    total_tokens  — Integer, not null             # computed: input + output
    prospect_id   — UUID, nullable (FK prospects.id, ondelete SET NULL)
    duration_ms   — Integer, nullable             # wall-clock time of the API call
    success       — Boolean, default True         # False if the call raised
    error_message — Text, nullable                # short error if success=False
```

Register in `backend/app/models/__init__.py`.

Add `Base.metadata.create_all` for the new table — it already runs on startup
via the existing `on_event("startup")` in `main.py` (SQLAlchemy `create_all`
is additive — new tables are created, existing ones are untouched).
**Verify** that `main.py` calls `create_all` on startup. If not, add it:
```python
@app.on_event("startup")
async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

### 1.2 Backend — Tracking wrapper

Create `backend/app/services/claude_tracker.py`:

```python
import time, uuid, logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.api_usage import ApiUsageLog

logger = logging.getLogger(__name__)

async def tracked_claude_call(
    client,                 # anthropic.AsyncAnthropic instance
    *,
    model: str,
    max_tokens: int,
    messages: list,
    generator: str,         # "email" | "negotiation_analyze" | "negotiation_scenarios" | "contract"
    db: AsyncSession | None = None,
    prospect_id: uuid.UUID | None = None,
) -> object:
    """
    Wraps client.messages.create, logs token usage to api_usage_logs.
    Returns the Anthropic Message object unchanged so callers keep working.
    """
    start = time.monotonic()
    success = True
    error_msg = None
    message = None

    try:
        message = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=messages,
        )
        return message
    except Exception as exc:
        success = False
        error_msg = str(exc)[:500]
        raise
    finally:
        duration_ms = int((time.monotonic() - start) * 1000)
        input_tokens = message.usage.input_tokens if message else 0
        output_tokens = message.usage.output_tokens if message else 0

        if db:
            try:
                log = ApiUsageLog(
                    id=uuid.uuid4(),
                    timestamp=datetime.utcnow(),
                    generator=generator,
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=input_tokens + output_tokens,
                    prospect_id=prospect_id,
                    duration_ms=duration_ms,
                    success=success,
                    error_message=error_msg,
                )
                db.add(log)
                await db.commit()
            except Exception:
                logger.exception("Failed to log API usage")
```

### 1.3 Backend — Wire into all 4 call sites

Each Claude generator class needs a `db` session and `prospect_id` to log usage.
This means the `generate` / `analyze` / `generate_scenarios` / `generate_clauses`
methods need `db` and `prospect_id` as parameters.

**Changes per generator:**

**email_generator.py** — `ClaudeEmailGenerator`:
- Add `db: AsyncSession | None = None` and `prospect_id: UUID | None = None` params to `generate()`
- Replace `self._client.messages.create(...)` with:
  ```python
  message = await tracked_claude_call(
      self._client,
      model="claude-sonnet-4-6",
      max_tokens=1024,
      messages=[{"role": "user", "content": prompt}],
      generator="email",
      db=db,
      prospect_id=prospect_id,
  )
  ```
- Update `EmailGeneratorProtocol.generate` signature to include `db` and `prospect_id` (with defaults `None`)
- Update `MockEmailGenerator.generate` signature too (params accepted but ignored)

**negotiation_generator.py** — `ClaudeNegotiationGenerator`:
- Same pattern for `analyze()` → generator name `"negotiation_analyze"`
- Same pattern for `generate_scenarios()` → generator name `"negotiation_scenarios"`
- Update Protocol + Mock signatures to match

**contract_generator.py** — `ClaudeContractGenerator`:
- Same pattern for `generate_clauses()` → generator name `"contract"`
- Update Protocol + Mock signatures to match

**Callers** (services that call generators — pass `db` and `prospect.id`):
- `outreach_service.py` → `self._generator.generate(prospect, step, variant, ..., db=db, prospect_id=prospect.id)`
- `negotiation_service.py` → `self._generator.analyze(prospect, corps, ..., db=db, prospect_id=prospect.id)`
  and `self._generator.generate_scenarios(prospect, analysis, ..., db=db, prospect_id=prospect.id)`
- `contract_service.py` → `self._generator.generate_clauses(prospect, db=db, prospect_id=prospect.id)`
  (check where `generate_clauses` is called in `contract_service.py` and pass `db`)

### 1.4 Backend — Usage stats endpoint

Create `backend/app/routers/api_settings.py`:

```
GET /api-settings/usage
```

Query params: `period` = `today` | `week` | `month` (default `month`)

Response:
```json
{
  "period": "month",
  "period_start": "2026-07-01T00:00:00",
  "period_end": "2026-07-31T23:59:59",
  "total_tokens": 245000,
  "total_input_tokens": 180000,
  "total_output_tokens": 65000,
  "total_calls": 87,
  "failed_calls": 2,
  "by_generator": {
    "email": { "calls": 45, "input_tokens": 90000, "output_tokens": 22000, "total_tokens": 112000 },
    "negotiation_analyze": { "calls": 15, "input_tokens": 30000, "output_tokens": 7500, "total_tokens": 37500 },
    "negotiation_scenarios": { "calls": 15, "input_tokens": 45000, "output_tokens": 30000, "total_tokens": 75000 },
    "contract": { "calls": 12, "input_tokens": 15000, "output_tokens": 5500, "total_tokens": 20500 }
  },
  "daily_breakdown": [
    { "date": "2026-07-13", "total_tokens": 12000, "calls": 5 },
    ...
  ]
}
```

**Implementation:**
- Admin-only (use existing `get_current_admin` dependency)
- Query `api_usage_logs` table with date filters
- Aggregate with SQL `func.sum` + `func.count` grouped by `generator` and by `date`
- Register router in `main.py`

### 1.5 Frontend — Usage dashboard in Settings page

Add a new section **above** the "Scan planifié" section in `settings/page.tsx`.

**Component:** `frontend/src/components/settings/ApiUsagePanel.tsx`

**Layout (MUI Paper, same style as existing sections):**
- Section header: Token icon + "Consommation API Claude" title
- Period selector: 3 Chips (Aujourd'hui / Cette semaine / Ce mois) — toggles the query
- Summary cards row (3 small cards in a row):
  - Total tokens (formatted with locale separator, e.g. "245 000")
  - Total calls
  - Failed calls (red if > 0)
- Per-generator breakdown: simple MUI Table with 4 rows (email, negotiation analyze,
  negotiation scenarios, contract) showing calls + input + output + total tokens
- Daily chart: simple bar chart using an inline SVG (no chart library needed —
  just proportional bars). X-axis = dates, Y-axis = tokens. Keep it lightweight.
- If the limit is set (Section 2), show a LinearProgress bar: used / limit with
  percentage label, color changes to warning at 80%, error at 95%

**Frontend API:**
Add to `frontend/src/lib/api/index.ts`:
```typescript
export const apiSettingsApi = {
  usage: (period: "today" | "week" | "month" = "month") =>
    apiFetch<ApiUsageResponse>(`/api-settings/usage?period=${period}`),
};
```

Add types to `frontend/src/lib/api/types.ts`.

### 1.6 Testing & commit

- Verify the new table is created on backend startup
- Verify that calling a mock endpoint that would trigger a Claude call (if API key were set)
  doesn't crash the logging (mock generators receive `db`/`prospect_id` but ignore them)
- Verify the `/api-settings/usage` endpoint returns correct aggregated data
- Start the frontend dev server, navigate to Settings, verify the panel renders
- Commit with message: `feat(api-tracking): log token usage for all Claude calls + usage dashboard`

**[x] DONE — Section 1**

---

## Section 2 — Monthly token limit

**Goal:** Admin sets a monthly token cap. Before each Claude call, the system checks
the running total. If over the limit, the call is blocked with a clear error.

### 2.1 Backend — SystemSettings model

Create `backend/app/models/system_settings.py`:

```python
class SystemSetting(Base):
    __tablename__ = "system_settings"

    key        — String(100), primary key        # e.g. "monthly_token_limit"
    value      — Text, not null                  # stored as string, parsed by caller
    updated_at — DateTime, default utcnow
```

Register in `backend/app/models/__init__.py`.

### 2.2 Backend — Limit check in tracker

Update `claude_tracker.py`:

Before making the API call in `tracked_claude_call`:
1. Read `monthly_token_limit` from `system_settings` table (if `db` is available)
2. If limit is set and > 0, query `SUM(total_tokens)` from `api_usage_logs` for
   current calendar month
3. If current total >= limit, raise a clear error:
   `raise ValueError("Monthly token limit reached (X / Y tokens). Increase the limit in Settings or wait until next month.")`
4. This check runs **before** the API call, so no tokens are wasted

**Default:** No limit (no row in system_settings = unlimited).
**Suggested default when first set by user:** 2,000,000 tokens/month.

### 2.3 Backend — Settings CRUD endpoints

Add to `backend/app/routers/api_settings.py`:

```
GET  /api-settings/settings
     → returns all manageable settings as { key: value } dict

PUT  /api-settings/settings
     body: { "monthly_token_limit": 2000000 }
     → upserts each key/value pair into system_settings table
```

Admin-only.

### 2.4 Frontend — Limit setting in ApiUsagePanel

Add to the `ApiUsagePanel` component (from Section 1):

- Below the usage summary, a "Limite mensuelle" section:
  - TextField showing current limit (formatted with locale separator)
  - "Illimité" chip/switch if no limit is set
  - Save button (calls `PUT /api-settings/settings`)
- The LinearProgress bar from Section 1.5 uses this limit value:
  - Shows `used / limit` with percentage
  - Color: default < 80%, warning 80-95%, error > 95%
  - If no limit: hide the progress bar, show "Illimité" chip

**Frontend API:**
```typescript
export const apiSettingsApi = {
  // ... existing usage endpoint ...
  getSettings: () => apiFetch<Record<string, string>>("/api-settings/settings"),
  updateSettings: (data: Record<string, unknown>) =>
    apiFetch<void>("/api-settings/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
```

### 2.5 Testing & commit

- Set a limit of 100 tokens, trigger a generation → verify it blocks with a clear error
- Set limit to 0 or remove → verify unlimited works
- Verify the frontend shows the limit, progress bar, and save works
- Commit: `feat(api-limits): monthly token cap with admin-configurable limit`

**[ ] DONE — Section 2**

---

## Section 3 — API key management via UI

**Goal:** Admin can view (masked), update, or deactivate API keys from the Settings
page instead of editing `.env` manually. Keys are stored in the `system_settings`
table. On startup, DB values override `.env` values.

### 3.1 Backend — Key storage and retrieval

Reuse the `SystemSetting` model from Section 2.

**Keys to manage (3):**
- `anthropic_api_key` — Claude AI (email/negotiation/contract generation)
- `resend_api_key` — Email sending (outreach + negotiation replies)
- `google_maps_api_key` — Prospect scanning (Google Places)

**Storage:** Values stored as-is in the `value` column. The database file
(`bab_morocco.db`) is local, same security as the `.env` file. If stronger
encryption is needed later, it can be added without changing the API.

### 3.2 Backend — Settings resolution order

Update `backend/app/config.py` or create a helper `backend/app/services/settings_resolver.py`:

```python
async def resolve_api_key(key_name: str, db: AsyncSession) -> str:
    """
    Resolution order:
    1. system_settings table (DB) — if row exists and value is not empty
    2. .env / config.py Settings — fallback
    Returns the effective value.
    """
```

The 3 generator factory functions (`get_email_generator`, `get_negotiation_generator`,
`get_contract_generator`) currently read `settings.ANTHROPIC_API_KEY` directly.

**Approach:** Rather than making the factories async (which would cascade changes
everywhere), use a **startup hook** that loads DB keys into the `settings` singleton:

```python
@app.on_event("startup")
async def load_db_settings():
    """Override config.py Settings with values from system_settings table."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(SystemSetting))
        for row in result.scalars().all():
            if row.key == "anthropic_api_key" and row.value:
                settings.ANTHROPIC_API_KEY = row.value
            elif row.key == "resend_api_key" and row.value:
                settings.RESEND_API_KEY = row.value
            elif row.key == "google_maps_api_key" and row.value:
                settings.GOOGLE_MAPS_API_KEY = row.value
```

When the admin updates a key via the API, the endpoint also updates the
`settings` singleton in-memory so the change takes effect immediately without
a server restart.

### 3.3 Backend — Key management endpoints

Add to `backend/app/routers/api_settings.py`:

```
GET  /api-settings/keys
     → returns keys with masked values + active status:
     {
       "keys": [
         {
           "key": "anthropic_api_key",
           "label": "Claude AI (Anthropic)",
           "masked_value": "sk-ant-...7x2Q",    # first 6 + last 4 chars
           "is_set": true,
           "is_active": true,
           "source": "database"                   # or "env_file" or "not_set"
         },
         ...
       ]
     }

PUT  /api-settings/keys/{key_name}
     body: { "value": "sk-ant-api03-..." }
     → saves to system_settings, updates settings singleton in-memory
     → returns same masked format as GET

DELETE /api-settings/keys/{key_name}
     → removes from system_settings (falls back to .env value if exists)
     → if .env also empty, key becomes not_set, feature degrades gracefully
```

Admin-only. Validate key names against an allow-list (only the 3 keys above).

### 3.4 Frontend — Key management UI in Settings page

Add component: `frontend/src/components/settings/ApiKeysPanel.tsx`

**Layout (new Paper section in settings page, below the usage panel):**
- Section header: Key icon + "Clés API" title
- For each key, a row:
  - Left: service icon/label (e.g. "Claude AI (Anthropic)")
  - Center: masked value display (or "Non configurée" in muted text)
  - Right: status chip (Actif / Inactif / .env) + Edit button + Delete button
- Edit opens an inline form (not a dialog — stays in the flow):
  - Password-type TextField (with show/hide toggle)
  - Save / Cancel buttons
  - On save: `PUT /api-settings/keys/{key_name}`, refresh the list
- Delete: confirmation snackbar, then `DELETE /api-settings/keys/{key_name}`

**Source indicator:**
- "Base de données" chip → key comes from DB (user saved it via UI)
- "Fichier .env" chip → key comes from .env (user hasn't overridden via UI)
- "Non configurée" → no key anywhere, feature is disabled

**Frontend API:**
```typescript
export const apiSettingsApi = {
  // ... existing endpoints ...
  getKeys: () => apiFetch<{ keys: ApiKeyInfo[] }>("/api-settings/keys"),
  updateKey: (keyName: string, value: string) =>
    apiFetch<ApiKeyInfo>(`/api-settings/keys/${keyName}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),
  deleteKey: (keyName: string) =>
    apiFetch<void>(`/api-settings/keys/${keyName}`, { method: "DELETE" }),
};
```

### 3.5 Frontend — Wire panels into Settings page

Update `frontend/src/app/(app)/settings/page.tsx`:

Order of sections (top to bottom):
1. **API Usage** (ApiUsagePanel) — token consumption + limit
2. **API Keys** (ApiKeysPanel) — key management
3. **Scan planifié** (existing) — scan scheduler config
4. **User Management** (existing UserManagementPanel) — user accounts

Import and render the new panels above the existing content.

### 3.6 Testing & commit

- Start with a key in `.env` only → verify GET shows source "env_file", masked value
- Save a key via PUT → verify GET shows source "database", feature works with new key
- Delete the DB key → verify fallback to `.env` value
- Save an empty/invalid key → verify feature degrades (mock generator activates)
- Verify the settings page renders all 3 sections without layout issues
- Commit: `feat(api-keys): manage API keys from Settings UI with DB override`

**[ ] DONE — Section 3**

---

## Implementation order

1. **Section 1** first — token tracking is foundational, Section 2 depends on it
2. **Section 2** — limit check uses the usage data from Section 1 + the SystemSetting
   model that Section 3 also needs
3. **Section 3** — key management reuses the SystemSetting model from Section 2

Each section: implement backend → implement frontend → test → commit → mark done.

---

*Created 2026-07-13 — Bab Morocco BD Intelligence Platform*
