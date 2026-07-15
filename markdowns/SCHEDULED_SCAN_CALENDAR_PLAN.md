# SCHEDULED_SCAN_CALENDAR_PLAN.md — Server-Side Scheduled Scans + Calendar View

> Bab Morocco BD Intelligence Platform — replaces the current client-side (browser-must-stay-open)
> scheduled-scan mechanism with real backend scheduling, and adds a Calendar page to plan and
> visualize scans by date.
> Created: 2026-07-06

---

## Why this plan exists

The "Scan planifié" section in Paramètres lets an Admin define a daily time window (e.g. 01:00–05:00)
during which automatic scans should run in small batches instead of all at once. Today that
scheduling is entirely client-side: a list of pending scan batches sits in the browser's
`localStorage`, and a timer running inside an open browser tab checks once a minute whether it's
time to fire one. This has a real correctness problem: an overnight window like 01:00–05:00 is
exactly the time nobody has a laptop open, so on a real unattended night the scheduled scans simply
never fire. The mechanism only ever worked by coincidence, when someone happened to have the app
open during the window.

This plan moves the "is it time yet?" decision to the backend, which runs continuously, and adds a
Calendar page so an Admin can see what's scheduled/completed/failed on any given day, and can
actively pick a future date to schedule a scan for — not just "the next time the window comes
around."

### Three scenarios this plan must satisfy

- **S1 — Schedule OFF:** Admin launches a scan → it runs immediately, results appear in the same
  session. (Already works today; must keep working unchanged.)
- **S2 — Schedule ON, scan launched from the normal Prospection screen:** the scan is queued for the
  next occurrence of the configured window (today if the window hasn't started yet, otherwise
  tomorrow) — but now the *backend* fires it when the time comes, with no dependency on any browser
  being open.
- **S3 — Schedule ON, Admin uses the Calendar instead:** clicking a specific future day (e.g.
  08/07/2026) opens the same scan form, but this time the resulting scan(s) are anchored to that
  exact day's window rather than "the next occurrence." The calendar shows that day as scheduled
  ("waiting") immediately, then updates to completed/failed once the backend actually runs it.

---

## Current state (as of this plan)

- Settings (`enabled`, `windowStartHour`, `windowEndHour`, `batchSize`) live in the browser's
  `localStorage`, managed by `frontend/src/lib/settingsStore.ts`.
- When a scan is launched with the schedule enabled, `buildScheduledJobs()`
  (`frontend/src/lib/settingsStore.ts`) computes a list of batches spread across "the next
  occurrence" of the window and appends them to a second `localStorage` queue
  (`ScheduledScanJob[]`), each entry carrying a `scheduledAt` timestamp and a `fired` flag.
- `frontend/src/components/nav/AppShell.tsx` runs a `setInterval` (every 60s, Admin-only) that reads
  that queue, checks whether the current time is inside the configured window, and fires any job
  whose `scheduledAt` has passed by calling the scan-start endpoint — but only while that browser tab
  is open.
- The backend (`backend/app/models/scan_job.py`, `backend/app/routers/scan.py`) has no concept of a
  future-dated scan at all: every `ScanJob` is created and immediately queued to run. There is no
  `scheduled_at` column, no background scheduler process, no cron/APScheduler/Celery anywhere in the
  backend.
- Status colors already used elsewhere in the app (`frontend/src/components/crm/ProspectTable.tsx`)
  follow MUI's semantic palette: success = green, error = red, info = blue, warning = orange. The
  calendar should reuse these rather than invent a new palette.

---

## Summary Table

| Phase | Layer | Goal |
|-------|-------|------|
| A | Backend | Give a scan a "run later" timestamp and a `scheduled` state, distinct from "run now" |
| B | Backend | Add a real server-side scheduler that fires due scans on its own, independent of any browser |
| C | Frontend | Let the existing "spread batches across the window" logic target an arbitrary date, not just "next occurrence" |
| D | Frontend | Build the Calendar page: color-coded days, click-to-inspect, click-to-schedule |

---

## Phase A — Backend: distinguish "run now" from "run later"

**Goal:** today a scan job only ever means "start immediately." This phase adds the missing
distinction: a job can now carry a future timestamp meaning "don't start until then," and a new
status value meaning "waiting for that time," separate from "currently running" or "already
finished."

**Logic:**
- A scan request may optionally carry a target date/time. If it's absent (or already due), nothing
  changes — the job is created and started immediately exactly as today.
- If a future time is given, the job is stored with that timestamp and a `scheduled` status, and is
  **not** started yet. It just sits there, inert, until Phase B's scheduler picks it up.
- A way to cancel a not-yet-fired scheduled job is added too (needed so the Calendar can let someone
  remove a day they scheduled by mistake).

**Files to read first:**
- `backend/app/models/scan_job.py`
- `backend/app/schemas/scan.py`
- `backend/app/routers/scan.py`

**Files to modify:**
- `backend/app/models/scan_job.py` — add a nullable `scheduled_at` timestamp column.
- `backend/alembic/versions/` — new migration for that column.
- `backend/app/schemas/scan.py` — add `scheduled_at` to the request/response shapes; extend the
  status values with `scheduled`.
- `backend/app/routers/scan.py` — branch on whether `scheduled_at` is present/due: immediate path
  unchanged; future path creates the row without starting it. Add a cancel/delete endpoint for a
  not-yet-fired scheduled job.

---

## Phase B — Backend: a real clock that doesn't need a browser open

**Goal:** replace the browser's `setInterval` poll with the backend checking its own clock. This is
the actual fix for the bug this plan exists to solve.

**Logic:**
- The backend process (which is meant to run continuously, per the project's infrastructure)
  wakes itself up roughly once a minute and looks through every job marked `scheduled`.
- Anything whose target time has arrived gets started right then, the same way an immediate scan
  would — no human, no open tab, no dependency on which device anyone last used.
- This is a straightforward in-process interval job, not a heavyweight task queue — appropriate for
  this platform's current scale and phase.

**Files to read first:**
- `backend/app/main.py`
- `backend/app/services/scan_pipeline.py`

**Files to modify:**
- `backend/requirements.txt` — add a lightweight scheduling library.
- `backend/app/main.py` — start the interval job when the backend process starts, stop it cleanly on
  shutdown.

---

## Phase C — Frontend: point the existing scheduling math at a specific date

**Goal:** the logic that spreads scan batches evenly across a time window already exists and already
works (used by S2). It just only knows how to answer "when is the next occurrence of this window,"
never "put this specifically on day X." This phase teaches it the second question, without changing
how the first one behaves.

**Logic:**
- The batch-spreading calculation (how many batches, how far apart, respecting the configured
  window hours) stays exactly as it is today.
- It gains one new, optional piece of input: a specific calendar date. When given, the batches are
  anchored to that date's window instead of "whichever occurrence comes next."
- When not given (the normal Prospection-screen flow, S2), behavior is unchanged from today.
- Once batches are computed, instead of writing them into the browser's local queue (which Phase B
  makes obsolete), they get sent to the backend as real scheduled jobs from Phase A.

**Files to read first:**
- `frontend/src/lib/settingsStore.ts`
- `frontend/src/components/crm/ScanProspectDialog.tsx`

**Files to modify:**
- `frontend/src/lib/settingsStore.ts` — extend the batch-building function with the optional target
  date; retire the browser-side job queue and its localStorage helpers once nothing reads them
  anymore.
- `frontend/src/components/crm/ScanProspectDialog.tsx` — scheduled-mode submission now calls the
  backend directly per batch (carrying each batch's computed time) instead of saving to
  `localStorage`.
- `frontend/src/components/nav/AppShell.tsx` — remove the now-redundant browser poll loop.

---

## Phase D — Frontend: the Calendar page

**Goal:** a new screen where an Admin can see, at a glance, what's scheduled, what succeeded, and
what failed on any given day — and can click a future day to schedule a new scan for exactly that
day.

**Logic:**
- Every scan job (past, running, or scheduled) is grouped onto a calendar by its relevant date —
  the target date for scheduled ones, the date it actually ran for everything else.
- Each day is colored using the app's existing status palette: blue for something waiting to run,
  green for a completed success, red for a failure. A day with several jobs shows the most notable
  status.
- Clicking a day that already has activity shows what ran there and its results (how many prospects
  found/added/etc.).
- Clicking an empty future day opens the same scan form used everywhere else in the app, except this
  time whatever gets submitted is anchored to that exact day (via Phase C), and the calendar
  reflects it as "scheduled" immediately.

**Files to read first:**
- `frontend/src/components/nav/navItems.ts`
- `frontend/src/app/(app)/settings/page.tsx` (for the Admin-only page-gating pattern to reuse)

**Files to create:**
- `frontend/src/app/(app)/calendrier/page.tsx`

**Files to modify:**
- `frontend/src/components/nav/navItems.ts` — add the "Calendrier" nav entry, Admin-only.

---

## Open decision — not yet resolved

Should clicking a future calendar day always schedule a scan (an explicit act, independent of the
global "Scan planifié" on/off toggle), or should it only be possible while the toggle is on? The
toggle currently only controls the default behavior of the ordinary Prospection-screen scan button.
Confirm before Phase D locks this in.

---

## Scenario coverage recap

| Scenario | What triggers it | What decides the timing | What fires it |
|----------|-------------------|--------------------------|----------------|
| S1 | Schedule OFF, scan from Prospection screen | N/A — immediate | Backend, right now |
| S2 | Schedule ON, scan from Prospection screen | "Next occurrence of the window" (Phase C, no target date) | Backend scheduler (Phase B) |
| S3 | Schedule ON, day picked on the Calendar | That exact picked day's window (Phase C, with target date) | Backend scheduler (Phase B) |

---

*Scheduled Scan Calendar Plan — 2026-07-06*
*Bab Morocco BD Intelligence Platform*
