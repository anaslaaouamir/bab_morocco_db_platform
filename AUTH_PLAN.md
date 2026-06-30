# AUTH_PLAN.md — Full Authentication System Implementation

> Bab Morocco BD Intelligence Platform — Admin / Commercial role-based auth
> Created: 2026-06-30

---

## Workflow

1. Before writing or editing any file, read it first.
2. After finishing a section's code changes, run the tests/checks listed for that section.
3. Only after tests pass, commit the changes for that section with the suggested commit message (or an adjusted one if scope changed).
4. Do not start the next section until told to.

---

## Summary Table

| # | Section | Layer | New files | Modified files |
|---|---------|-------|-----------|----------------|
| 1 | DB schema | Backend DB | `models/user.py`, 2 migrations | `models/prospect.py` |
| 2 | JWT auth core | Backend | `services/auth_service.py`, `schemas/auth.py`, `routers/auth.py` | `main.py`, `config.py`, `requirements.txt` |
| 3 | Route guards | Backend | `dependencies/auth.py` | 5 existing routers |
| 4 | Scan distribution | Backend | — | `scan_pipeline.py`, `routers/prospects.py` |
| 5 | Auth context + token | Frontend | `contexts/AuthContext.tsx` | `lib/api/base.ts`, `app/layout.tsx` |
| 6 | Route protection | Frontend | `middleware.ts`, `app/login/page.tsx` | `app/settings/page.tsx`, `app/layout.tsx` |
| 7 | Role-based UI | Frontend | — | `AppShell.tsx`, `navItems.ts`, `ProspectionModeDialog.tsx`, `ScanProspectDialog.tsx`, `prospection/page.tsx`, `settings/page.tsx` |

---

## Section 1 — Database: `users` table + `assigned_to` on prospects

**Status:** Done

**Goal:** Add the `users` table (Admin/Commercial accounts) and an `assigned_to` foreign key on `prospects` so prospects can be owned by a specific Commercial.

**Files to read first:**
- `backend/app/models/prospect.py`
- `backend/app/database.py`
- `backend/alembic/env.py`
- `backend/alembic/versions/` (list existing migrations to find the current head revision)
- `backend/alembic.ini`

**Files to create:**
- `backend/app/models/user.py`
- `backend/alembic/versions/<rev>_create_users_table.py`
- `backend/alembic/versions/<rev>_add_assigned_to_to_prospects.py`

**Files to modify:**
- `backend/app/models/prospect.py`

**Implementation notes:**
- `User` model fields: `id: Mapped[uuid.UUID]` (PK, default `uuid.uuid4`), `email: Mapped[str]` (unique, not null), `hashed_password: Mapped[str]`, `full_name: Mapped[str]`, `role: Mapped[str]` (String(20), values `"admin"` or `"commercial"`), `is_active: Mapped[bool]` (default `True`), `created_at: Mapped[datetime]` (default `datetime.utcnow`).
- `Prospect` model: add `assigned_to: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)`.
- Migration A creates `users` table with a unique index on `email`.
- Migration B adds the `assigned_to` column + FK constraint to `prospects`, chained after migration A's `down_revision`.
- Follow the existing migration file naming/style used in `backend/alembic/versions/` (check an existing file for the `revision`/`down_revision` header format before writing new ones).
- Do not seed any data in these migrations — seeding the first Admin is handled in Section 2.

**Tests to run before committing:**
- `cd backend && alembic upgrade head` runs cleanly with no errors.
- `cd backend && alembic downgrade -1` then `alembic upgrade head` again to confirm migration B reverses cleanly.
- `python backend/check_db.py` (or equivalent inspection) to confirm `users` table and `prospects.assigned_to` column exist.
- Existing backend test suite still passes: `cd backend && pytest`.

**Commit message:**
```
feat(db): add users table and prospect assigned_to column
```

---

## Section 2 — Backend Auth Core: JWT + password hashing + `/auth` router

**Status:** Done

**Goal:** Implement JWT issuing/validation, password hashing, and the `/auth` endpoints (`login`, `me`, `users` create/list) so accounts can authenticate and Admins can create Commercial accounts.

**Files to read first:**
- `backend/app/config.py`
- `backend/app/database.py`
- `backend/app/models/user.py` (created in Section 1)
- `backend/app/main.py`
- `backend/app/routers/prospects.py` (for router/schema conventions used in this codebase)
- `backend/app/schemas/prospect.py` (for schema style conventions)
- `backend/requirements.txt`

**Files to create:**
- `backend/app/services/auth_service.py`
- `backend/app/schemas/auth.py`
- `backend/app/routers/auth.py`

**Files to modify:**
- `backend/app/main.py` — include `auth.router`
- `backend/app/config.py` — add `JWT_ALGORITHM` (default `"HS256"`), `JWT_EXPIRE_MINUTES` (default `480`), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (for first-admin seed)
- `backend/requirements.txt` — add `python-jose[cryptography]>=3.3.0`, `passlib[bcrypt]>=1.7.4`

**Implementation notes:**
- `auth_service.py`: `hash_password(password: str) -> str`, `verify_password(plain: str, hashed: str) -> bool` (passlib `CryptContext` with `bcrypt`), `create_access_token(user: User) -> str` (JWT payload: `sub=str(user.id)`, `email`, `role`, `exp` using `JWT_EXPIRE_MINUTES`), `decode_token(token: str) -> dict` (raises on invalid/expired).
- `schemas/auth.py`: `LoginRequest {email, password}`, `TokenResponse {access_token, token_type="bearer", user: UserOut}`, `UserOut {id, email, full_name, role, is_active}`, `UserCreate {email, full_name, role}` (role restricted to `"commercial"` at the endpoint level — Admins can't self-serve-create other Admins via this endpoint).
- `routers/auth.py` endpoints:
  - `POST /auth/login` — verify email+password against `users` table, return `TokenResponse`. 401 on bad credentials or inactive user.
  - `GET /auth/me` — requires `get_current_user` (from Section 3 — if Section 3 isn't built yet, inline a minimal version here and let Section 3 replace/import it cleanly).
  - `POST /auth/users` — Admin-only. Generates a random temporary password (e.g. `secrets.token_urlsafe(10)`), creates the Commercial user, returns `{ user: UserOut, temporary_password: str }` once (never retrievable again).
  - `GET /auth/users` — Admin-only. Lists all users with prospect counts optional (keep simple: just list `UserOut[]`).
- First-admin seeding: add a small startup routine (e.g. in `main.py` startup event or a standalone `backend/seed_admin.py` script) that creates one Admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars if the `users` table is empty. Document this in `.env.example`.

**Tests to run before committing:**
- `cd backend && pytest` (existing suite still green).
- Add `backend/app/tests/test_auth.py` covering: login success, login failure (wrong password), `/auth/me` with valid token, `/auth/users` create as Admin, `/auth/users` create rejected for non-Admin/no-token.
- Manual check: `uvicorn app.main:app --reload` then `curl -X POST /auth/login` with seeded admin credentials returns a token; `curl /auth/me` with that token returns the admin profile.

**Commit message:**
```
feat(auth): add JWT login, /auth/me, and admin-only user creation
```

---

## Section 3 — Backend Auth Dependencies & Route Guards

**Status:** Not started

**Goal:** Enforce authentication on every existing router and add role/ownership checks so Commercials can only act on their own prospects and cannot start scans or reach Settings-protected endpoints.

**Files to read first:**
- `backend/app/services/auth_service.py` (Section 2)
- `backend/app/models/user.py`
- `backend/app/models/prospect.py`
- `backend/app/routers/prospects.py`
- `backend/app/routers/scan.py`
- `backend/app/routers/outreach.py`
- `backend/app/routers/negotiation.py`
- `backend/app/routers/contracts.py`
- `backend/app/database.py` (for `get_session` dependency pattern)

**Files to create:**
- `backend/app/dependencies/auth.py`
- `backend/app/dependencies/__init__.py` (if package init is needed)

**Files to modify:**
- `backend/app/routers/prospects.py`
- `backend/app/routers/scan.py`
- `backend/app/routers/outreach.py`
- `backend/app/routers/negotiation.py`
- `backend/app/routers/contracts.py`

**Implementation notes:**
- `dependencies/auth.py`:
  - `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")`
  - `async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_session)) -> User` — decodes JWT via `auth_service.decode_token`, fetches `User` by `sub`, raises `401` if token invalid/expired or user not found/inactive.
  - `def require_admin(user: User = Depends(get_current_user)) -> User` — raises `403` if `user.role != "admin"`.
  - `async def require_own_prospect(prospect_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_session)) -> Prospect` — fetches the prospect, raises `404` if missing, raises `403` if `user.role == "commercial"` and `prospect.assigned_to != user.id`. Admins bypass the ownership check.
- Apply to routers:
  - `prospects.py`: every endpoint requires `get_current_user`. List/detail/update/delete endpoints additionally use `require_own_prospect` for non-list routes; `GET /prospects` (list) and `GET /prospects/stats` filter by `assigned_to = current_user.id` when `role == "commercial"` (full implementation detail lives in Section 4, but the dependency wiring belongs here).
  - `scan.py`: `POST /scan/start` uses `require_admin`. `GET /scan/{id}` and `GET /scan/history` use `get_current_user` (no ownership filter needed — scan jobs aren't prospect-owned).
  - `outreach.py`, `negotiation.py`, `contracts.py`: every endpoint that takes a `prospect_id` (or resolves one, e.g. contract → prospect) uses `require_own_prospect` in place of/alongside the existing prospect lookup; endpoints that take an `email_id`/`contract_id`/etc. must first resolve the parent prospect and apply the same ownership check manually inside the route function if `require_own_prospect` can't be used directly as a path-param dependency.
- Do not change any business logic in these routers — only add the auth dependency and the ownership guard around existing logic.

**Tests to run before committing:**
- `cd backend && pytest` (existing suite green — update any tests whose client fixtures need a bearer token now; check `backend/app/tests/conftest.py` for a shared authenticated test client fixture pattern to add).
- Add/extend tests: Commercial cannot `GET`/`PATCH`/`DELETE` a prospect assigned to another Commercial (403). Commercial cannot `POST /scan/start` (403). Admin can do everything.
- Manual check via `/docs` (Swagger UI): confirm all prospect/outreach/negotiation/contract endpoints now show the lock icon and require a bearer token.

**Commit message:**
```
feat(auth): enforce JWT auth and prospect ownership guards on all routers
```

---

## Section 4 — Prospect Assignment Logic (Scan Distribution)

**Status:** Not started

**Goal:** When a scan completes and inserts N prospects, distribute them randomly and equally among all active Commercial users; manually-added prospects are owned by their creator; Commercials only ever see their own prospects, Admins see everything.

**Files to read first:**
- `backend/app/services/scan_pipeline.py`
- `backend/app/routers/prospects.py`
- `backend/app/routers/scan.py`
- `backend/app/services/prospect_service.py`
- `backend/app/models/user.py`
- `backend/app/dependencies/auth.py` (Section 3)

**Files to create:**
- None

**Files to modify:**
- `backend/app/services/scan_pipeline.py`
- `backend/app/routers/prospects.py`

**Implementation notes:**
- In `scan_pipeline.py`, after the new prospects are inserted (mock → score → insert step), add a distribution step:
  1. Query all `User` where `role == "commercial"` and `is_active == True`.
  2. If the list is empty, leave `assigned_to = NULL` on all newly inserted prospects (no-op — Admin can reassign manually later, no UI for this required in this plan unless added in Section 7).
  3. Otherwise, shuffle the list of newly created prospect IDs (`random.shuffle`), then round-robin assign: `prospect[i].assigned_to = commercials[i % len(commercials)].id`. Commit the updates.
- In `routers/prospects.py`:
  - `POST /prospects` (manual add): set `assigned_to = current_user.id` automatically when `current_user.role == "commercial"`; when `current_user.role == "admin"`, leave `assigned_to = NULL` unless an explicit `assigned_to` field is passed (optional — keep simple: Admin-created prospects default to unassigned).
  - `GET /prospects` (list) and `GET /prospects/stats`: add a `WHERE assigned_to = current_user.id` clause when `current_user.role == "commercial"`; no filter for `admin`.
  - `GET /prospects/{id}`, `PUT /prospects/{id}`, `PATCH /prospects/{id}/stage`, `DELETE /prospects/{id}`: ownership already enforced via `require_own_prospect` from Section 3 — no change needed here beyond confirming it's wired.

**Tests to run before committing:**
- `cd backend && pytest` — add a test that runs a scan with 3 active commercials and N prospects, asserts each commercial received `N // 3` (± 1) prospects and the union covers all N with no duplicates.
- Add a test: Commercial's `GET /prospects` only returns prospects with `assigned_to == self.id`; Admin's `GET /prospects` returns all.
- Manual check: trigger a real scan as Admin via `/scan/start`, then log in as two different seeded Commercial accounts and confirm `GET /prospects` shows disjoint, roughly-equal sets.

**Commit message:**
```
feat(prospects): random equal distribution of scanned prospects to commercials
```

---

## Section 5 — Frontend Auth Context & Token Management

**Status:** Not started

**Goal:** Provide a React context holding the authenticated user and JWT, persist the token, and automatically attach it to every API call.

**Files to read first:**
- `frontend/src/lib/api/base.ts`
- `frontend/src/lib/api/index.ts`
- `frontend/src/app/layout.tsx`
- `frontend/src/contexts/SnackbarContext.tsx` (existing context pattern to mirror)

**Files to create:**
- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/lib/api/auth.ts` (auth-specific API calls: `login`, `me`, `createUser`, `listUsers`)

**Files to modify:**
- `frontend/src/lib/api/base.ts`
- `frontend/src/app/layout.tsx`
- `frontend/src/lib/api/index.ts` (export the new `authApi`)

**Implementation notes:**
- `AuthContext.tsx`: mirrors the structure of `SnackbarContext.tsx`. Exposes `{ user: UserOut | null, token: string | null, login(email, password): Promise<void>, logout(): void, isLoading: boolean }`. Derives `isAdmin = user?.role === "admin"` and `isCommercial = user?.role === "commercial"` as convenience booleans returned from `useAuth()`.
- Token storage: store the JWT in `localStorage` under key `bm_auth_token`, **and** mirror it into a non-HttpOnly cookie (`document.cookie`) of the same name so `middleware.ts` (Section 6) can read it server-side. On `login()` success, store both; on `logout()`, clear both and redirect to `/login`.
- `lib/api/base.ts`: modify `apiFetch` to read `localStorage.getItem("bm_auth_token")` and, if present, add header `Authorization: Bearer <token>`. On a `401` response, clear the token (localStorage + cookie) and redirect (`window.location.href = "/login"`).
- `lib/api/auth.ts`: `authApi.login(email, password)`, `authApi.me()`, `authApi.createUser({email, fullName})`, `authApi.listUsers()` — calling the Section 2 endpoints.
- `app/layout.tsx`: wrap children with `<AuthProvider>` (outermost, above `<SnackbarProvider>`/`<ThemeRegistry>` or wherever fits the existing provider order — read the file first to match nesting).

**Tests to run before committing:**
- `cd frontend && npm run build` succeeds with no TypeScript errors.
- `cd frontend && npm run lint` passes.
- Manual check: with backend running, open browser console, call `useAuth().login(...)` via a temporary test button or the (not-yet-built) login page stub; confirm token appears in `localStorage` and cookie, and a subsequent `prospectsApi.list()` call includes the `Authorization` header (check Network tab).

**Commit message:**
```
feat(auth): add AuthContext, token persistence, and authenticated apiFetch
```

---

## Section 6 — Frontend Route Protection

**Status:** Not started

**Goal:** Block unauthenticated access to the app (redirect to `/login`) and block Commercials from reaching `/settings`.

**Files to read first:**
- `frontend/src/contexts/AuthContext.tsx` (Section 5)
- `frontend/src/app/layout.tsx`
- `frontend/src/app/settings/page.tsx`
- `frontend/src/app/page.tsx` (root page, for layout/structure conventions)

**Files to create:**
- `frontend/src/middleware.ts`
- `frontend/src/app/login/page.tsx`

**Files to modify:**
- `frontend/src/app/settings/page.tsx`
- `frontend/src/app/layout.tsx` (if route-group restructuring is needed so `/login` renders without `AppShell`)

**Implementation notes:**
- `middleware.ts`: Next.js Edge middleware. Reads the `bm_auth_token` cookie via `request.cookies.get("bm_auth_token")`. If absent, redirect to `/login` for any path except `/login` itself and static assets (`_next`, `favicon.png`, etc.). Use a `matcher` config excluding `/api`, `/_next/static`, `/_next/image`, `/favicon.png`.
- This is presence-only validation (cookie exists) — full JWT verification (expiry, signature) stays server-side per API call; the middleware's job is just to stop obviously-logged-out users from seeing pages flash before redirect.
- `app/login/page.tsx`: simple MD3-styled form (email + password fields, MUI `TextField`/`Button`, matching the visual style of existing dialogs like `AddProspectDialog.tsx`). On submit, calls `useAuth().login(email, password)`; on success, `router.push("/")`; on failure, show inline `Alert severity="error"`. This page must render **without** `AppShell` (no nav rail/bar) — check how `layout.tsx` currently applies `AppShell` globally; if it wraps everything, restructure using a route group (e.g. move authenticated pages under `app/(app)/` with `AppShell` in that group's layout, and keep `app/login/page.tsx` outside it) — confirm exact approach by reading `layout.tsx` first.
- `settings/page.tsx`: add a `useEffect` that calls `useAuth()`; if `user` is loaded and `user.role !== "admin"`, `router.replace("/")`. While `isLoading`, render nothing/a spinner to avoid a flash of restricted content.

**Tests to run before committing:**
- `cd frontend && npm run build` succeeds.
- Manual check: clear cookies, visit any page → redirected to `/login`. Log in as Admin → redirected to `/`, `/settings` accessible. Log in as Commercial → `/settings` redirects back to `/`.
- Manual check: refreshing `/settings` as a logged-in Commercial does not flash the settings content before redirecting.

**Commit message:**
```
feat(auth): add login page, route middleware, and settings admin guard
```

---

## Section 7 — UI Role-Based Rendering

**Status:** Not started

**Goal:** Surface the role restrictions visually — hide Settings nav and scan controls for Commercials, disable the scheduled-scan executor for non-Admins, and add an Admin-only user management panel for creating Commercial accounts.

**Files to read first:**
- `frontend/src/components/nav/AppShell.tsx`
- `frontend/src/components/nav/navItems.ts` (or wherever `navItems` is defined — confirm exact path, referenced as `./navItems` in `AppShell.tsx`)
- `frontend/src/components/crm/ProspectionModeDialog.tsx`
- `frontend/src/components/crm/ScanProspectDialog.tsx`
- `frontend/src/app/prospection/page.tsx`
- `frontend/src/app/settings/page.tsx`
- `frontend/src/contexts/AuthContext.tsx` (Section 5)

**Files to create:**
- `frontend/src/components/settings/UserManagementPanel.tsx` (Admin-only: list Commercials + "Créer un compte Commercial" dialog)

**Files to modify:**
- `frontend/src/components/nav/AppShell.tsx`
- `frontend/src/components/nav/navItems.ts`
- `frontend/src/components/crm/ProspectionModeDialog.tsx`
- `frontend/src/components/crm/ScanProspectDialog.tsx`
- `frontend/src/app/prospection/page.tsx`
- `frontend/src/app/settings/page.tsx`

**Implementation notes:**
- `navItems.ts` / `AppShell.tsx`: filter the `navItems` array (or add a `requiresAdmin` flag per item) so the **Paramètres** entry is excluded from both `NavigationRail` and `NavigationBar` when `useAuth().isCommercial`.
- `AppShell.tsx` scheduled-scan executor (`runDueJobs` effect): wrap the entire effect body in `if (!isAdmin) return;` — Commercials must never trigger `scanApi.start` automatically.
- `ProspectionModeDialog.tsx`: when `isCommercial`, render only the "Ajouter manuellement" option/card; hide or disable the "Scan automatique" option entirely (don't just gray it out — Commercials have zero scan access per spec).
- `ScanProspectDialog.tsx`: as a defense-in-depth measure (in case it's ever opened directly), add an early guard that shows an access-denied state or simply isn't reachable since Section 7's dialog change prevents Commercials from opening it.
- `prospection/page.tsx`: ensure the "Nouveau prospect" FAB/button stays visible for Commercials (manual add is allowed); any direct scan-trigger button/icon elsewhere on the page is hidden for Commercials.
- `settings/page.tsx`: add the new `UserManagementPanel` component below or beside the existing "Scan planifié" card. Panel calls `authApi.listUsers()` to show a table of Commercials with email/full name/active status, and a "+ Créer un compte Commercial" button opening a dialog (email + full name fields) that calls `authApi.createUser(...)` and displays the generated temporary password once in a copyable, dismissable `Alert` (warn the user it won't be shown again).
- All role checks read from `useAuth()` (Section 5) — no new auth logic introduced here, purely conditional rendering.

**Tests to run before committing:**
- `cd frontend && npm run build` succeeds.
- `cd frontend && npm run lint` passes.
- Manual check (Commercial account): Settings nav item absent; opening "Nouveau prospect" dialog shows only manual-add; no scan UI reachable anywhere; scheduled scan never fires (check no `/scan/start` network call appears even with scheduled settings enabled in `localStorage`).
- Manual check (Admin account): Settings nav item present; both manual-add and scan options available; User Management panel lists Commercials and successfully creates a new Commercial account end-to-end (verify the new account can log in with the temporary password).

**Commit message:**
```
feat(ui): role-based rendering for nav, scan controls, and user management
```
