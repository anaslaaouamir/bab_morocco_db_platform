# Deployment Plan — bab.elbahi.ma

> First-ever deployment. Tracked phase by phase — mark a step `[x]` and set its
> **Status** line to `Done` once it's actually verified working, not just attempted.

---

## 0. Reference info (confirmed)

| Item | Value |
|---|---|
| Host | `13.140.187.6` |
| User | `deploy-bab` |
| SSH key | `~/.ssh/bab_deploy` (local machine) |
| Deployment folder | `/var/www/bab` (= home dir of `deploy-bab`) |
| Frontend port | `3010` |
| Backend port | `8010` |
| Public URL | `https://bab.elbahi.ma` (nginx + Let's Encrypt SSL — already configured, don't touch) |
| DB credentials | `/var/www/bab/DB_CREDENTIALS.txt` on the server |
| Process manager | `pm2` (already installed, per-account instance) |
| No `sudo` | anything outside the sandbox → ask Abderrahim |

Connect: `ssh -i ~/.ssh/bab_deploy deploy-bab@13.140.187.6`

---

## Phase A — Get the code onto the server

**Goal:** a working copy of the repo at `/var/www/bab/backend` and `/var/www/bab/frontend`.

> Note: actual path ended up as `/var/www/bab/bab_morocco_db_platform/{backend,frontend}` —
> cloned into a subfolder instead of directly into home, since home already had account files
> (`.bashrc`, `DB_CREDENTIALS.txt`, etc.). Doc's example paths adjusted accordingly for all
> later phases.

- [x] **A.1** — Method: `git clone` via SSH deploy key (repo is private; HTTPS password auth
  doesn't work on GitHub, so a dedicated read-only deploy key was generated on the server —
  `~/.ssh/github_deploy_key` — and added to the repo's Deploy Keys)
  Status: Done
- [x] **A.2** — Code present on server: `backend/`, `frontend/`, `markdowns/` all confirmed via `ls`
  Status: Done

---

## Phase B — Backend (FastAPI)

- [x] **B.1** — Create Python virtual environment (`python3 -m venv venv`)
  Status: Done
- [x] **B.2** — Install dependencies (`pip install -r requirements.txt`) — all 70+ packages installed cleanly
  Status: Done
- [x] **B.3** — Install Playwright's Chromium (`playwright install chromium`)
  Status: Done
- [x] **B.4** — Production `.env`, based on the existing local one (not built from scratch):
  - Copy local `backend/.env` to the server as a starting point (`scp`)
  - Change only: `DATABASE_URL` (→ dedicated server DB from `DB_CREDENTIALS.txt`), `SECRET_KEY`
    (→ freshly generated, not the local `changeme`)
  - Consider strengthening `ADMIN_PASSWORD` (local value is a weak placeholder, and this becomes
    the real production admin login on first startup)
  - Everything else (JWT settings, Resend config, `ENV=production`) reused as-is
  - Note: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_MAPS_API_KEY` are **not** in `.env` —
    they're stored in the DB (`system_settings` table) via the app's own Settings UI, loaded at
    startup (`load_db_api_keys` in `main.py`). Server DB starts empty, so these will need to be
    re-entered through the UI after first login — not a `.env` concern.
  Status: Done — DATABASE_URL points to dedicated `bab_platform` DB (asyncpg driver), SECRET_KEY
  and ADMIN_PASSWORD replaced with fresh random values, rest reused from local `.env`
- [x] **B.5** — Run database migrations (`alembic upgrade head`)
  Status: Done — 21 migrations applied cleanly, full schema built in `bab_platform`
- [ ] **B.6** — Start backend with pm2 on `127.0.0.1:8010`
  Status: Not started

---

## Phase C — Frontend (Next.js)

- [ ] **C.1** — Install dependencies (`npm ci`)
  Status: Not started
- [ ] **C.2** — Set `NEXT_PUBLIC_API_URL=https://bab.elbahi.ma/api` **before building** (baked in at build time, not runtime)
  Status: Not started
- [ ] **C.3** — Build production bundle (`npm run build`)
  Status: Not started
- [ ] **C.4** — Start frontend with pm2 on `127.0.0.1:3010`
  Status: Not started

---

## Phase D — Persist processes

- [ ] **D.1** — `pm2 save` so both processes survive a server reboot
  Status: Not started

---

## Phase E — Verify

- [ ] **E.1** — `curl localhost:8010` and `curl localhost:3010` on the server both respond
  Status: Not started
- [ ] **E.2** — `https://bab.elbahi.ma` loads in a real browser
  Status: Not started
- [ ] **E.3** — Login with the admin account works end-to-end (frontend → backend → DB)
  Status: Not started

---

## Notes / decisions log

- Backend CORS (`app/main.py`) is currently hardcoded to `localhost:3000`/`3001` only. Since frontend and
  backend will share the same public domain via nginx, this shouldn't block same-origin requests — revisit
  only if CORS errors actually show up in the browser console.
- Playwright/Chromium may need system packages only installable via `sudo` — check during B.3, ask
  Abderrahim if needed rather than trying to work around it.
