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

- [ ] **A.1** — Decide method: `git clone` (if pushed to GitHub/GitLab) vs. direct copy from local machine
  Status: Not started
- [ ] **A.2** — Code present on server, both `backend/` and `frontend/` folders exist
  Status: Not started

---

## Phase B — Backend (FastAPI)

- [ ] **B.1** — Create Python virtual environment (`python3 -m venv venv`)
  Status: Not started
- [ ] **B.2** — Install dependencies (`pip install -r requirements.txt`)
  Status: Not started
- [ ] **B.3** — Install Playwright's Chromium (`playwright install chromium`) — flag if system libs are missing (needs `sudo`, would require asking Abderrahim)
  Status: Not started
- [ ] **B.4** — Create production `.env` (copy from `.env.example` and fill in):
  - `DATABASE_URL` — from `DB_CREDENTIALS.txt`
  - `SECRET_KEY` — generate a fresh random value
  - `ENV=production`
  - `ANTHROPIC_API_KEY`
  - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — creates the first admin account on startup
  - `RESEND_API_KEY` (optional, for real emails — otherwise mock mode)
  Status: Not started
- [ ] **B.5** — Run database migrations (`alembic upgrade head`)
  Status: Not started
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
