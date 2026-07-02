# BACKEND_PHASE2_SCAN_PLAN.md — Real Scan Pipeline (Google Maps + Apify)

> Bab Morocco BD Intelligence Platform — Phase 2, Scan sub-system only
> Replaces `MockGoogleMapsProvider` and `MockEnrichmentService` with real data.
> Created: 2026-07-02

---

## Required credentials

Only two keys are needed for this task — nothing else:

| Variable | Source |
|---|---|
| `GOOGLE_MAPS_API_KEY` | Google Cloud Console → APIs & Services → Credentials → enable **Places API (New)** |
| `APIFY_API_TOKEN` | apify.com → Settings → Integrations → API token (free tier is enough to build/test) |

Both go in `backend/.env`. No YouSign, no email provider, no other config touched.

---

## Workflow

1. Before writing or editing any file, read it first.
2. After finishing a section's code changes, run the tests/checks listed for that section.
3. Only after tests pass, commit the changes for that section with the suggested commit message (or an adjusted one if scope changed).
4. Mark the section's **Status** as `Done` in this file once committed.
5. Do not start the next section until told to.

---

## Guiding principles

- Same dict shape in, same dict shape out — real providers must match `MockGoogleMapsProvider` / `MockEnrichmentService` output exactly so `scan_pipeline.py`'s scoring/dedup/insert logic (lines 56–113) is never touched.
- Same DI activation gate already used for the three Claude generators: `ENV=production` + both keys set → real providers; otherwise → mocks. Dev and the test suite are unaffected.
- No new DB models, no new migrations. `ScanJob` and `Prospect` are already complete.
- All 103+ existing tests must remain green — they run on mocks via SQLite in-memory and never instantiate real providers.

---

## Summary Table

| # | Section | New files | Modified files |
|---|---------|-----------|-----------------|
| 1 | Config + dependency | — | `config.py`, `requirements.txt` |
| 2 | Real Google Maps provider | `services/real_providers.py` | — |
| 3 | Real enrichment service (Apify + website + Booking/Expedia) | — (same file) | — |
| 4 | Provider factory + pipeline wiring | — | `services/scan_pipeline.py` |
| 5 | End-to-end manual test | — | — |

---

## Section 1 — Config + dependency

**Status:** Done

**Goal:** Add the two new settings fields and the `httpx` dependency so later sections have what they need.

**Files to read first:**
- `backend/app/config.py`
- `backend/requirements.txt`

**Files to modify:**
- `backend/app/config.py` — add `APIFY_API_TOKEN: str = ""` (next to the existing `GOOGLE_MAPS_API_KEY: str = ""`)
- `backend/requirements.txt` — add `httpx>=0.27.0` (async HTTP client, used for Google Maps + Apify + presence checks)

**Tests to run before committing:**
- `cd backend && pip install -r requirements.txt` installs cleanly.
- `cd backend && pytest` — existing suite still green (no behavior change yet).

**Commit message:**
```
chore(scan): add Apify token setting and httpx dependency
```

---

## Section 2 — `RealGoogleMapsProvider`

**Status:** Done

**Deviation from original plan:** Uses the **legacy** Google Places Text Search + Place Details
endpoints (`maps.googleapis.com/maps/api/place/...`), not "Places API (New)" — the user's
existing API key is restricted to the legacy API only. Website is fetched via a Place Details
call per result since legacy Text Search doesn't return it.

**Known external quirk:** Google's legacy Text Search endpoint is non-deterministic under this
key — the identical request intermittently returns a truncated result set (e.g. 1 result instead
of 20) even with a fresh connection, seen in ~30-40% of calls. Mitigated with a retry loop
(`_search_page_with_retry`, up to 6 attempts) that keeps the best (longest) response.

**Goal:** Implement a real Google Maps Places API (Text Search, New) provider matching `MockGoogleMapsProvider.search()`'s exact output shape.

**Files to read first:**
- `backend/app/services/mock_providers.py` (the contract this must match)
- `backend/app/services/scan_pipeline.py` (the caller)
- `backend/app/config.py` (as modified in Section 1)

**Files to create:**
- `backend/app/services/real_providers.py` — add `RealGoogleMapsProvider` class only (enrichment comes in Section 3)

**Implementation notes:**
- Method signature: `search(self, ville: str, pays: str, type_partenaire: str, limite: int) -> list[dict]` — identical to the mock.
- Endpoint: `POST https://places.googleapis.com/v1/places:searchText`, header `X-Goog-Api-Key`, header `X-Goog-FieldMask: places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.userRatingCount,places.id`.
- Query string built per `type_partenaire` (mapping table in the original research — e.g. `"riad hotel {ville} {pays}"` for `hotel_riad`, `"tour operator travel agency {ville} {pays}"` for `tour_operateur`, etc.).
- Pagination via `nextPageToken` if `limite > 20`.
- Output dict per place must include the same keys as the mock (`nom`, `adresse_web`, `email_contact` (empty, filled at enrichment), `ville`, `pays`, `type`, `_index`) plus extra passthrough keys the enrichment step needs (`place_id`, `note_google`, `nb_avis_google`).
- On HTTP error / quota exceeded → raise `RuntimeError` with a clear message (caught by the existing `try/except` in `scan_pipeline.py`, which already sets `job.statut = "error"`).
- Use `httpx.AsyncClient` for the call (this method must be `async def search(...)` — note this changes the call signature from the sync mock; Section 4 updates the pipeline call site accordingly).

**Tests to run before committing:**
- `cd backend && pytest` — existing suite still green (new class not yet wired in).
- Manual: a small standalone script or Python REPL call to `RealGoogleMapsProvider().search(ville="Marrakech", pays="Maroc", type_partenaire="hotel_riad", limite=5)` with a real `GOOGLE_MAPS_API_KEY` returns 5 real place dicts.

**Commit message:**
```
feat(scan): add RealGoogleMapsProvider (Places API Text Search)
```

---

## Section 3 — `RealEnrichmentService`

**Status:** Not started

**Goal:** Implement real enrichment (Apify Google Maps Scraper + website email scraping + Booking/Expedia presence heuristic) matching `MockEnrichmentService.enrich()`'s exact output shape.

**Files to read first:**
- `backend/app/services/mock_providers.py` (the contract this must match)
- `backend/app/services/real_providers.py` (as created in Section 2)
- `backend/app/config.py`

**Files to modify:**
- `backend/app/services/real_providers.py` — add `RealEnrichmentService` class

**Implementation notes:**
- Method signature: `async def enrich(self, raw: dict) -> dict` — same contract as the mock's `enrich()`, now async (Section 4 updates the call site).
- **Stage 1 (Apify Maps Scraper):** actor `compass/google-maps-scraper`. Trigger run via `POST https://api.apify.com/v2/acts/compass~google-maps-scraper/runs?token=...`, poll `GET .../actor-runs/{runId}` every 3s until `SUCCEEDED` (60s timeout), fetch `GET .../actor-runs/{runId}/dataset/items`. Extract `website`, `email`, `totalScore`, `reviewsCount`, `categories`, `phoneNumber`.
- **Stage 2 (website email scrape):** only if `email_contact` still empty after Stage 1 and `adresse_web` is non-empty. Actor `apify/website-content-crawler` against `{adresse_web}/contact`, regex-extract first valid email (excluding `noreply`/`example`/`test`).
- **Booking/Expedia presence:** lightweight `httpx.AsyncClient.head()` checks against Booking.com/Expedia search URLs for the place name; `presence_booking` / `presence_expedia` set `True` only on a confident redirect match, `False` on any block/ambiguity (safe fallback).
- Final output dict must match the mock's exact keys: `nom`, `adresse_web`, `email_contact`, `ville`, `pays`, `type`, `presence_booking`, `note_booking`, `presence_expedia`, `nb_chambres`, `linkedin_contact`, `nom_contact`, `poste_contact`, `capacite_description`.
- `linkedin_contact`, `nom_contact` (`"Responsable"`), `poste_contact` (`"DG"`) stay at mock defaults for now — LinkedIn scraping is explicitly out of scope for this plan (Phase 2.2).
- Any Apify failure/timeout must not crash the pipeline — fall back to partial data (raw Google Maps fields only), matching the "Error & Fallback Strategy" behavior: job still completes with `statut = "done"`.

**Tests to run before committing:**
- `cd backend && pytest` — existing suite still green (new class not yet wired in).
- Manual: call `RealEnrichmentService().enrich(raw)` on one real raw dict from Section 2's manual test; confirm all required keys are present with correct types.

**Commit message:**
```
feat(scan): add RealEnrichmentService (Apify scraper + email + OTA presence)
```

---

## Section 4 — Provider factory + pipeline wiring

**Status:** Not started

**Goal:** Wire the real providers behind the same activation gate used for Claude generators, and switch `scan_pipeline.py` to use it — with zero changes to scoring/dedup/insert logic.

**Files to read first:**
- `backend/app/services/scan_pipeline.py` (full file — this is the only file being modified)
- `backend/app/services/email_generator.py` (reference for the `get_*()` DI gate pattern — see `get_email_generator()`)
- `backend/app/services/real_providers.py` (as built in Sections 2–3)
- `backend/app/config.py`

**Files to modify:**
- `backend/app/services/real_providers.py` — add `get_scan_providers()` factory function:
  ```python
  def get_scan_providers():
      if settings.ENV == "production" and settings.GOOGLE_MAPS_API_KEY and settings.APIFY_API_TOKEN:
          return RealGoogleMapsProvider(), RealEnrichmentService()
      return MockGoogleMapsProvider(), MockEnrichmentService()
  ```
- `backend/app/services/scan_pipeline.py`:
  - Replace the mock import + module-level singletons (current lines 18–21) with `from app.services.real_providers import get_scan_providers` and `_maps_provider, _enrichment_svc = get_scan_providers()`.
  - Update the two call sites (`_maps_provider.search(...)` and `_enrichment_svc.enrich(raw)`) to `await` them, since the real implementations are async (the mocks can either stay sync — call via `await` won't work on a sync mock, so **also convert `MockGoogleMapsProvider.search()` and `MockEnrichmentService.enrich()` to `async def`** in `mock_providers.py` for interface parity; the bodies stay identical, just add `async`/no internal `await` needed).

**Files to modify (small, interface parity only):**
- `backend/app/services/mock_providers.py` — make `search()` and `enrich()` `async def` (no other behavior change).

**Tests to run before committing:**
- `cd backend && pytest` — full suite green, including `test_scan.py` (mocks now async but behave identically).
- Manual, with `ENV=development` (no keys or keys unset): trigger a scan via `POST /scan/start` → confirm mock data still returned (regression check).
- Manual, with `ENV=production` + both keys set in `.env`: trigger a scan for Marrakech / `hotel_riad` / `limite=5` → confirm real prospects appear in the `prospects` table with real `adresse_web` / `email_contact` values.

**Commit message:**
```
feat(scan): wire real providers behind ENV=production gate
```

---

## Section 5 — End-to-end manual verification

**Status:** Not started

**Goal:** Confirm the full real scan pipeline works through the actual UI, not just the API.

**Files to read first:**
- None (verification only, no code changes expected unless a bug surfaces)

**Steps:**
1. Set `ENV=production`, `GOOGLE_MAPS_API_KEY`, `APIFY_API_TOKEN` in `backend/.env`.
2. Start backend + frontend.
3. From the Prospection page, launch a scan (small `limite`, e.g. 5) for a real city/type combination.
4. Poll progress in the UI until `done`.
5. Open 2–3 resulting prospects and confirm: real name, real website, a real or empty email, plausible score breakdown, correct stage assignment (`outreach` vs `veille`).
6. Re-run the same scan once more — confirm dedup (`nb_doublons`) works correctly against real `adresse_web` values.
7. Set `ENV` back to `development` — confirm the scan falls back to mock data with no errors.

**Tests to run before marking done:**
- No automated test added here — this section is manual QA on top of Sections 1–4's automated coverage.

**Commit message:**
_None — verification only, no commit unless a fix is needed (in which case it gets its own small commit)._

---

## Out of scope for this plan

- LinkedIn scraping (`linkedin_contact`, real `nom_contact`/`poste_contact`) — Phase 2.2
- Email sending / n8n (already handled separately)
- YouSign / contract signature (deferred, own plan later)
- OTA webhook, S3 migration — unrelated to scan

---

*Backend Phase 2 — Scan Plan*
*Bab Morocco BD Intelligence Platform*
