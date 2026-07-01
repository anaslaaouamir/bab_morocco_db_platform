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
| 8 | Commercial lifecycle | Backend | — | `routers/auth.py`, `schemas/auth.py` |
| 9 | Password lifecycle & self profile | Backend | 1 migration | `models/user.py`, `routers/auth.py`, `schemas/auth.py` |
| 10 | Prospect ownership & reassignment | Backend | — | `schemas/prospect.py`, `routers/prospects.py` |
| 11 | Login lockout & activity tracking | Backend | 1 migration | `models/user.py`, `routers/auth.py`, `schemas/auth.py` |
| 12 | User management UI | Frontend | — | `UserManagementPanel.tsx`, `lib/api/auth.ts`, `lib/api/index.ts` |
| 13 | Self profile & forced password change | Frontend | `app/change-password/page.tsx` | `AuthContext.tsx`, `app/(app)/layout.tsx`, `AppShell.tsx` |

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

**Status:** Done

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

**Status:** Done

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

**Status:** Done

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

**Status:** Done

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

**Status:** Done

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

---

# Phase 1.5 — Account Management Hardening

> Added 2026-06-30 after a real-world test pass surfaced that account management was implemented narrowly: Admin could create Commercials but never edit, deactivate, or recover access for them, and there was no path for a user to change their own password. Sections 8-13 close those gaps.

---

## Section 8 — Backend: Commercial Account Lifecycle (Deactivate, Reactivate, Edit)

**Status:** Done

**Goal:** Let Admin deactivate/reactivate a Commercial and edit their `full_name`/`email` after creation. No hard delete — deactivation is the only removal path, to preserve the ownership history on prospects/contracts tied to that account. No role field here — single-Admin model, no promotion/demotion in scope.

**Files to read first:**
- `backend/app/routers/auth.py`
- `backend/app/models/user.py`
- `backend/app/schemas/auth.py`
- `backend/app/dependencies/auth.py`

**Files to create:**
- None

**Files to modify:**
- `backend/app/routers/auth.py`
- `backend/app/schemas/auth.py`

**Implementation notes:**
- New schema `UserUpdate` (admin-facing): optional `full_name`, `email`, `is_active`. Deliberately no `role` field — out of scope.
- `PATCH /auth/users/{id}` (admin-only via `require_admin`). 404 if the target doesn't exist. Reject with 400/403 if `id == current_user.id` — this endpoint manages *other* accounts only; there is no admin self-edit path in this plan (single admin, no scenario where they'd need to deactivate themselves through here).
- Apply only the fields actually present in the request body (partial update). On an email change, reuse the same uniqueness handling as `create_commercial_user` (catch `IntegrityError` → 409 "Un utilisateur avec cet email existe déjà.").
- Deactivating doesn't touch `assigned_to` on any prospect — that's handled by Section 10's reassignment flow, triggered separately (e.g. from the UI before/after deactivating, per Section 12).
- Returns the updated `UserOut`.

**Tests to run before committing:**
- `cd backend && pytest` (existing suite green).
- Add tests: admin deactivates a commercial → `is_active` false, that account's subsequent `/auth/login` returns 401; admin reactivates → login works again; admin edits `full_name`/`email` → reflected in `GET /auth/users`; editing to an already-used email → 409; commercial calling `PATCH /auth/users/{id}` → 403; admin targeting their own id → rejected.

**Commit message:**
```
feat(auth): admin can deactivate, reactivate, and edit commercial accounts
```

---

## Section 9 — Backend: Password Lifecycle & Self-Service Profile

**Status:** Done

**Goal:** Close the password gap end to end: force a password change after any admin-issued temp password, let every user change their own password and edit their own `full_name`, and give Admin a real "reset password" action instead of the manual DB edits used earlier in this project.

**Files to read first:**
- `backend/app/models/user.py`
- `backend/app/routers/auth.py`
- `backend/app/schemas/auth.py`
- `backend/app/services/auth_service.py`
- `backend/alembic/versions/` (for the current head + migration file style)

**Files to create:**
- `backend/alembic/versions/<rev>_add_must_change_password_to_users.py`

**Files to modify:**
- `backend/app/models/user.py`
- `backend/app/routers/auth.py`
- `backend/app/schemas/auth.py`

**Implementation notes:**
- `User.must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)`.
- Set `True` whenever a temp password is issued: on creation (`create_commercial_user`, already generates one) and on admin reset (new endpoint below).
- `UserOut` gains `must_change_password` so the frontend can branch on it right after login or on `/auth/me`.
- `PATCH /auth/me` (any authenticated user, self only): body `{ full_name? }` — the only field a user may self-edit. No `email`/`role`/`is_active` here by design (see plan discussion: email/role changes stay Admin-only to prevent identity/privilege changes from a possibly-hijacked session).
- `POST /auth/me/change-password` (any authenticated user, self only): body `{ current_password, new_password }`. Verify `current_password` via `auth_service.verify_password` — 401 if wrong (defends an unattended-but-logged-in session). Enforce `len(new_password) >= 8` and reject if `new_password == current_password`. On success: hash and store the new password, set `must_change_password = False`.
- `POST /auth/users/{id}/reset-password` (admin-only): same temp-password generator as creation (`secrets.token_urlsafe(10)`), sets `must_change_password = True`, returns `{ temporary_password }` once — identical one-time-display contract as account creation.
- This single change-password endpoint serves both the *forced* first-login case and any *voluntary* later password change (Section 13's frontend) — no branching needed server-side, the difference is purely how the frontend decides when to show the form.

**Tests to run before committing:**
- `cd backend && pytest`.
- Add tests: new commercial has `must_change_password = True`; `POST /auth/me/change-password` with correct current password + valid new password succeeds and clears the flag; wrong current password → 401; new password under 8 chars → 422; admin reset flips the flag back to `True`, invalidates the old password, and the new temp password works; `PATCH /auth/me` updates `full_name` only and silently ignores/rejects any other field sent.

**Commit message:**
```
feat(auth): forced password change, self-service updates, and admin reset
```

---

## Section 10 — Backend: Prospect Ownership Visibility & Reassignment

**Status:** Done

**Goal:** Make `assigned_to` visible to Admin and give Admin a way to manually reassign a prospect — without this, deactivating a Commercial (Section 8) silently orphans their pipeline with no way to discover or fix it short of a raw DB query.

**Files to read first:**
- `backend/app/schemas/prospect.py`
- `backend/app/routers/prospects.py`
- `backend/app/models/prospect.py`
- `backend/app/models/user.py`

**Files to create:**
- None

**Files to modify:**
- `backend/app/schemas/prospect.py`
- `backend/app/routers/prospects.py`

**Implementation notes:**
- Add `assigned_to: uuid.UUID | None` and `assigned_to_name: str | None` to the prospect response schema. Populate `assigned_to_name` via a join/lookup only when `current_user.role == "admin"` — Commercials never need this (they only ever see their own prospects already).
- `PATCH /prospects/{id}/assign` (admin-only): body `{ assigned_to: uuid.UUID | None }`. If not null, validate the target user exists, has `role == "commercial"`, and `is_active == True` (400 otherwise). Updates `prospect.assigned_to` directly — no other side effects, no change to `stage` or anything else on the prospect.

**Tests to run before committing:**
- `cd backend && pytest`.
- Add tests: admin's `GET /prospects`/`GET /prospects/{id}` includes `assigned_to_name`; commercial's response omits it; reassigning to a different active commercial succeeds; reassigning to an inactive or non-existent commercial → 400; setting `assigned_to: null` unassigns successfully; commercial calling this endpoint → 403.

**Commit message:**
```
feat(prospects): expose ownership and allow admin reassignment
```

---

## Section 11 — Backend: Login Lockout & Account Activity Tracking

**Status:** Done

**Goal:** Protect `/auth/login` against unlimited password-guessing attempts, and give Admin basic visibility into account staleness/changes (last login, last update) without building a full audit log.

**Files to read first:**
- `backend/app/models/user.py`
- `backend/app/routers/auth.py`
- `backend/app/schemas/auth.py`
- `backend/alembic/versions/` (current head)

**Files to create:**
- `backend/alembic/versions/<rev>_add_login_tracking_to_users.py`

**Files to modify:**
- `backend/app/models/user.py`
- `backend/app/routers/auth.py`
- `backend/app/schemas/auth.py`

**Implementation notes:**
- New columns on `User`: `updated_at: Mapped[datetime]` (`onupdate=datetime.utcnow`, refreshed automatically by every Section 8/9 update path — no extra code needed at the call sites), `last_login_at: Mapped[datetime | None]`, `failed_login_attempts: Mapped[int] = mapped_column(default=0)`, `locked_until: Mapped[datetime | None]`.
- `POST /auth/login` logic, in order: if `locked_until` is set and still in the future → 401 with a distinct message ("Trop de tentatives — réessayez dans quelques minutes.") rather than the generic credentials error, so a legitimate user understands why they're blocked. Otherwise, check credentials as today; on failure, increment `failed_login_attempts` and, if it reaches 5, set `locked_until = utcnow() + 15min`. On success, reset `failed_login_attempts = 0`, clear `locked_until`, and set `last_login_at = utcnow()`.
- `UserOut` (admin-facing, via `GET /auth/users`) gains `last_login_at` and `updated_at` so Section 12's UI can display them.

**Tests to run before committing:**
- `cd backend && pytest`.
- Add tests: 5 consecutive wrong passwords locks the account; a 6th attempt with the *correct* password is still rejected while locked; a successful login resets the failure counter; `last_login_at` updates on each successful login; `updated_at` changes after a Section 8/9 edit action.

**Commit message:**
```
feat(auth): login lockout and account activity tracking
```

---

## Section 12 — Frontend: User Management UI

**Status:** Done

**Goal:** Surface Sections 8-10 in `UserManagementPanel.tsx` — Admin can edit, deactivate/reactivate, and reset a Commercial's password, and is prompted to reassign prospects when deactivating someone who still has active ones.

**Files to read first:**
- `frontend/src/components/settings/UserManagementPanel.tsx`
- `frontend/src/lib/api/auth.ts`
- `frontend/src/lib/api/index.ts`

**Files to create:**
- None

**Files to modify:**
- `frontend/src/components/settings/UserManagementPanel.tsx`
- `frontend/src/lib/api/auth.ts` (add `updateUser`, `resetPassword`)
- `frontend/src/lib/api/index.ts` (add `prospectsApi.assign`, extend prospect types with `assignedTo`/`assignedToName`)

**Implementation notes:**
- Each row in the Commercials table gets an actions menu: "Modifier" (dialog: full name, email — reuses the same form style as the existing create dialog), "Désactiver"/"Réactiver" (toggles `is_active` via Section 8's endpoint), "Réinitialiser le mot de passe" (calls Section 9's reset endpoint, shows the new temp password once — identical UI pattern to the existing one-time-password display on creation).
- Before confirming a deactivation, check whether that commercial currently has active prospects (cheap count via existing stats/list endpoint filtered by `assigned_to`); if so, show a follow-up step offering "reassign to: [dropdown of other active commercials]" or "leave unassigned," calling Section 10's `PATCH /prospects/{id}/assign` for each affected prospect before finalizing the deactivation.
- Table gains two extra columns/labels using Section 11's data: "Dernière connexion" (`last_login_at`, or "Jamais" if null) and a subtler "Modifié le" (`updated_at`) — helps Admin judge stale/unused accounts at a glance.

**Tests to run before committing:**
- `cd frontend && npm run build` succeeds.
- Manual check (Admin account): edit a commercial's name/email; deactivate one with active prospects → reassignment prompt appears and works; deactivate one with none → no prompt; reactivate; reset password → new temp password displayed once, old password no longer works, new one does.

**Commit message:**
```
feat(ui): admin controls for editing, deactivating, and resetting commercials
```

---

## Section 13 — Frontend: Self-Service Profile & Forced Password Change

**Status:** Done

**Goal:** Block app access until a forced password change is completed, and give every user a way to voluntarily edit their name and change their password afterward.

**Files to read first:**
- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/app/(app)/layout.tsx`
- `frontend/src/components/nav/AppShell.tsx`
- `frontend/src/app/login/page.tsx` (style reference)

**Files to create:**
- `frontend/src/app/change-password/page.tsx` — single screen, reused for both the forced case and the voluntary case.
- `frontend/src/components/settings/ProfileDialog.tsx` — full name display/edit, entry point to the change-password screen.

**Files to modify:**
- `frontend/src/contexts/AuthContext.tsx` (surface `must_change_password` from `/auth/me`, add an `updateProfile(fullName)` action)
- `frontend/src/app/(app)/layout.tsx` (forced redirect: if authenticated but `must_change_password === true`, redirect to `/change-password` and block other `(app)` routes until cleared — mirrors the existing unauthenticated-redirect pattern from `middleware.ts`, just the opposite condition, checked client-side post-auth since it depends on `/auth/me` data the Edge middleware doesn't have)
- `frontend/src/components/nav/AppShell.tsx` (small entry point near the logout button added earlier — opens `ProfileDialog`)

**Implementation notes:**
- `/change-password` is the same form in both cases (current password, new password, confirm new password — client-side min-length check mirroring Section 9's server-side rule). The only difference is presentation: reached via forced redirect, there's no way to navigate elsewhere until it succeeds (no nav rail/close button); reached voluntarily from `ProfileDialog`, it's a normal dismissable dialog/page.
- `ProfileDialog`: shows `full_name` (editable, calls `PATCH /auth/me`) and a button into the change-password flow. No email field, no role display beyond perhaps a read-only badge — matches the access rules decided in Section 9 (email/role are Admin-managed only).

**Tests to run before committing:**
- `cd frontend && npm run build` succeeds.
- Manual check: log in with a freshly admin-reset account → immediately redirected to `/change-password`, no other route reachable until the change succeeds; after success, normal navigation resumes. Voluntary path: from a normal (non-forced) session, open the profile entry, change the password, confirm it works on next login. Edit `full_name` and confirm it persists.

**Commit message:**
```
feat(ui): self-service profile and forced password change
```
