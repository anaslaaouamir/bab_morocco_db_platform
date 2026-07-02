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

**Status:** Done

**Deviation from original plan:** The actual Apify actor name is `compass/crawler-google-places`,
not `compass/google-maps-scraper` as originally assumed — verified against the Apify API before
writing code. `apify/website-content-crawler` was confirmed correct as planned.

**Manual verification results:**
- Stage 1 (Apify Maps scraper) confirmed returning real `website`, `totalScore`, `reviewsCount`
  for "Riad Fleur de Sable" (Marrakech) — no `email` for this particular business (legitimate,
  not all businesses list one).
- Stage 2 (website email scrape) confirmed working — extracted `ohlala@woyago.com` from a real
  tour operator site (woyago.com); returned empty string (not an error) when a site has no
  visible email, matching the required graceful-fallback behavior.
- Full `enrich()` output verified to contain all 14 required keys matching
  `MockEnrichmentService.enrich()`'s exact shape.
- Booking/Expedia presence heuristic returns `False` safely when no confident match — not yet
  verified against a business with a true Booking.com listing (acceptable per plan's documented
  fallback strategy).

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

**Status:** Done

**Manual verification results:**
- Dev regression (`ENV=development`): scan job for Marrakech/hotel_riad/limite=3 completed
  instantly (`statut=done` in milliseconds), inserted mock-pattern prospects (`Riad Dar Nadia`,
  deterministic seeded names) — confirms mocks still activate correctly by default.
- Production (`ENV=production`, both keys set): scan job for Marrakech/hotel_riad/limite=3 took
  ~3 minutes (real Apify enrichment), completed with `statut=done`, `nb_trouves=3`,
  `nb_ajoutes=3`. Inserted prospects were the exact real riads found in Section 2/3 manual
  tests — **Riad Fleur de Sable** (real website, rating 4.1, empty email — correct, none found),
  **Riad Mazaj** (rating 4.7), **Hotel Sherazade** (rating 4.4) — all correctly scored and staged
  (`veille`, score 58, below the 75 outreach threshold).
- `.env` reverted to `ENV=development` after verification.

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

# Revision — Switch to Free Self-Scraping (post Section 5 findings)

> Added: 2026-07-02, after manual QA on real data (Rabat/hotel_riad) showed scores capped
> around 58-66 and revealed two problems: (1) `note_booking` was populated from the Google
> rating instead of a real Booking.com rating — a 0-5 vs 0-10 scale mismatch that made the
> 5-point bonus in `_score_activite` structurally unreachable; (2) the paid Apify Maps actor
> (`compass/crawler-google-places`) was mostly re-fetching data (`website`, rating, reviews)
> already available for free via Google Places API (Section 2), so its cost bought little beyond
> an occasional email.
>
> Decision: drop `linkedin_contact` entirely (LinkedIn scraping is effectively free-infeasible
> and expensive/fragile even paid — see cost/success analysis in conversation). Replace the
> Apify-dependent enrichment stages with free self-scraping (`httpx` + regex/HTML parsing) for
> the remaining fields. No Apify actor calls remain in the default path after this revision.

## Section 6 — Drop the redundant Apify Maps actor call

**Status:** Done

**Finding confirmed:** Google Places Details does not expose a business email field — only
`website` and `international_phone_number` beyond what Text Search already returns. Extended
`_fetch_details` (renamed from `_fetch_website`) to also fetch phone, stored transiently on the
raw dict and stripped in `enrich()` (not yet used — no `phone` column on `Prospect` — kept for a
future field addition, not wired further here).

**Manual verification:** Ran `RealGoogleMapsProvider.search()` + `RealEnrichmentService.enrich()`
against live APIs for Marrakech/hotel_riad — confirmed `phone` correctly captured
(`+212 6 38 37 89 01`) and correctly absent from the final enriched output; `website`/
`note_booking`/`capacite_description` still populate correctly from the free Google data with
no Apify Maps actor call (noticeably faster — no ~60s Apify poll wait). Output shape unchanged.
`app/tests/test_scan.py` (10 tests) + `app/tests/test_prospects.py` (21 tests) — 31 passed,
~18s.

**Goal:** Remove `_run_maps_scraper()` (the `compass/crawler-google-places` call) since it mostly
duplicates data already fetched for free by `RealGoogleMapsProvider` (Section 2). Keep only its
one unique value — an occasional `email`/`phone` on the Google listing itself — by checking the
Google Places Details response for those fields instead (still free, same API already in use).

**Files to read first:**
- `backend/app/services/real_providers.py` (`RealGoogleMapsProvider._fetch_website`,
  `RealEnrichmentService._run_maps_scraper`, `RealEnrichmentService.enrich`)

**Files to modify:**
- `backend/app/services/real_providers.py`:
  - `RealGoogleMapsProvider._fetch_website` (or a new `_fetch_details` helper) — extend the
    Place Details `fields` param to also request `international_phone_number` (Google Places
    Details does not expose a business email field — confirm this during implementation and
    document the finding here).
  - `RealEnrichmentService.enrich` — remove the `_run_maps_scraper` call and the Apify run
    entirely; `website`, `note` (from Google rating, correctly labeled — see Section 8), and
    `reviews_count` now come straight from the raw dict already produced by
    `RealGoogleMapsProvider`.
  - Remove `_run_maps_scraper`, `_run_apify_actor`, `_get_dataset_items`, `_APIFY_MAPS_ACTOR`
    if nothing else in the file still uses them after Section 7 also moves off Apify.

**Tests to run before committing:**
- `cd backend && pytest` — full suite green.
- Manual: re-run `enrich()` on a couple of raw dicts from a live `RealGoogleMapsProvider.search()`
  call, confirm output shape unchanged and no Apify calls are made (check Apify dashboard usage
  stays flat).

**Commit message:**
```
refactor(scan): drop redundant Apify Maps actor, reuse free Google data
```

---

## Section 7 — Free email scraping (replace Apify website-content-crawler)

**Status:** Done

**Manual verification results:**
- `_scrape_email_from_website` rewritten to plain `httpx.AsyncClient.get()` against 5 candidate
  paths (homepage, `/contact`, `/contact-us`, `/about`, `/a-propos`) with a normal browser
  `User-Agent`, regex-matched independently per page — one page's failure never blocks the rest.
- Tested against 6 real Paris tour operators from a live scan:
  **4/6 (67%) hit rate** — `info@emitravel.net`, `booking@paris-trip.com`,
  `contact@myprivateparis.com`, `infoamsterdam@whiteumbrellatours.com` all correctly extracted.
  Better than the original ~40-55% estimate.
- The one known regression case: `woyago.com` (Section 3's original Apify success case) returns
  no email via free scraping. Investigated directly — the email is not present anywhere in the
  raw HTML of the homepage or any candidate contact page (confirmed no Cloudflare email
  obfuscation markers either), meaning it's rendered client-side via JavaScript. This is the
  expected free/paid gap: Apify's actor uses a real headless browser that executes JS; a plain
  `httpx` GET cannot. Accepted as a known limitation, not a bug — matches the documented
  free-vs-paid tradeoff.
- `_run_apify_actor` / `_get_dataset_items` / `_APIFY_CRAWLER_ACTOR` are now unused but left in
  place per plan sequencing — actual removal is Section 10's scope.
- `app/tests/test_scan.py` + `app/tests/test_prospects.py` — 31 passed, ~21s (ENV=development,
  mocks active). Full suite run separately to confirm no wider regressions.

**Goal:** Replace `_scrape_email_from_website` (currently an Apify `website-content-crawler` run)
with a plain `httpx` GET + regex scraper — no Apify cost.

**Files to read first:**
- `backend/app/services/real_providers.py` (`RealEnrichmentService._scrape_email_from_website`)

**Files to modify:**
- `backend/app/services/real_providers.py`:
  - Rewrite `_scrape_email_from_website` to `httpx.AsyncClient.get()` a short list of candidate
    pages (homepage, `/contact`, `/contact-us`, `/about`, `/a-propos`) with a short timeout and
    a normal browser `User-Agent` header, and regex-match `_EMAIL_REGEX` against the raw HTML
    text of each. Stop at the first valid match (still excluding `_EMAIL_BLOCKLIST` entries).
  - Any request failure (timeout, 403, DNS error) for one candidate page must not abort the
    others — try each page independently, return `""` only if all fail or none contain an email.
  - Remove `_APIFY_CRAWLER_ACTOR` usage from this method.

**Tests to run before committing:**
- `cd backend && pytest` — full suite green.
- Manual: re-run against the known-good case from Section 3 (`woyago.com` → expect
  `ohlala@woyago.com`) and confirm it still resolves without Apify. Test 3-5 more real sites from
  a fresh scan and record the free-scrape hit rate for comparison against the ~40-55% estimate.

**Commit message:**
```
refactor(scan): replace Apify email crawler with free httpx scraping
```

---

## Section 8 — Free Booking.com / Expedia presence + real rating

**Status:** Not started

**Goal:** Replace the current HEAD-request heuristic (`_check_ota_presence`) with a real GET +
HTML-parse against Booking.com and Expedia search result pages, and — for Booking.com — extract
the actual listing rating (0-10 scale) instead of mislabeling the Google rating as `note_booking`.

**Files to read first:**
- `backend/app/services/real_providers.py` (`RealEnrichmentService._check_ota_presence`,
  `RealEnrichmentService.enrich`)

**Files to modify:**
- `backend/app/services/real_providers.py`:
  - Rewrite `_check_ota_presence` (or split into `_check_booking` / `_check_expedia`) to
    `GET` the OTA's search results page for the business name + city, and parse the HTML
    for a matching listing (fuzzy name match against the prospect's `nom`) rather than relying
    on a redirect URL pattern.
  - For Booking.com specifically: when a matching listing is found, also extract its real rating
    (0-10 scale) from the search result HTML and return it alongside the boolean — this becomes
    the correctly-scaled `note_booking`.
  - `enrich()`: set `note_booking` from this real Booking rating (or `None` if no match), not
    from the Google rating. Google's rating can still be kept internally on the raw dict for
    reference/logging but must not be written to `note_booking`.
  - Document in code that OTA search-page HTML structure changes periodically — this scraper
    should fail soft (return `False`/`None`) on any parse error, never raise.

**Tests to run before committing:**
- `cd backend && pytest` — full suite green.
- Manual: run against 5-10 real prospects, spot-check at least one known-listed hotel/riad
  manually on Booking.com/Expedia to confirm the presence detection and rating extraction are
  actually correct (not just non-crashing).

**Commit message:**
```
fix(scan): scrape real Booking/Expedia presence and correct note_booking scale
```

---

## Section 9 — Best-effort `nb_chambres` extraction

**Status:** Not started

**Goal:** Attempt to extract a room count from crawled page text (the same pages fetched in
Section 7) via keyword/regex patterns (e.g. "12 chambres", "20 rooms", "suites: 8"). Low
expected yield (~10-20%, per the earlier estimate) — this is a best-effort pass, not a
guaranteed field.

**Files to read first:**
- `backend/app/services/real_providers.py` (as modified by Section 7)

**Files to modify:**
- `backend/app/services/real_providers.py`:
  - Add a small regex set (French + English patterns: `(\d+)\s*(chambres|rooms|suites)`) run
    against the same page text already fetched during email scraping (Section 7) — no extra
    HTTP requests needed, reuse the fetched text.
  - `enrich()`: set `nb_chambres` from the first confident match, else keep `None` (current
    behavior — this is strictly additive, never a regression).

**Tests to run before committing:**
- `cd backend && pytest` — full suite green.
- Manual: check whether any of the previously-tested real sites (Section 2/3/7 examples) yield
  a room count; record the actual hit rate against the ~10-20% estimate.

**Commit message:**
```
feat(scan): best-effort nb_chambres extraction from scraped page text
```

---

## Section 10 — Remove Apify dependency from the default path

**Status:** Not started

**Goal:** After Sections 6-9 replace every Apify-dependent stage with free scraping, remove the
now-unused Apify plumbing so the scan pipeline no longer makes any paid calls by default, and
keep `APIFY_API_TOKEN` as a dormant/optional setting for future reintroduction (e.g. a future
Booking.com-specific paid actor per the earlier cost analysis) rather than deleting it outright.

**Files to read first:**
- `backend/app/services/real_providers.py` (full file, post Sections 6-9)
- `backend/.env`, `backend/.env.example`

**Files to modify:**
- `backend/app/services/real_providers.py` — remove `_run_apify_actor`, `_get_dataset_items`,
  `_APIFY_BASE_URL`, `_APIFY_MAPS_ACTOR`, `_APIFY_CRAWLER_ACTOR`, `_APIFY_POLL_INTERVAL_S`,
  `_APIFY_RUN_TIMEOUT_S` if nothing references them anymore.
- `backend/app/config.py` — keep `APIFY_API_TOKEN` field (no removal; dormant for future use).
- `backend/.env.example` — update the scraping comment block to reflect that Apify is optional/
  unused by default post-revision.

**Tests to run before committing:**
- `cd backend && pytest` — full suite green.
- Manual: run a real scan end-to-end (`ENV=production`, `GOOGLE_MAPS_API_KEY` set,
  `APIFY_API_TOKEN` empty or unset) and confirm it completes successfully with zero Apify usage,
  producing better-populated scores than the Section 5 baseline (58-66 ceiling).

**Commit message:**
```
chore(scan): remove unused Apify actor plumbing from default scan path
```

---

## Updated field coverage after this revision

| Field | Source after revision | Cost |
|---|---|---|
| `adresse_web` | Google Places API (unchanged) | Free |
| `email_contact` | Free httpx scrape (Section 7) | Free |
| `presence_booking` | Free Booking.com scrape (Section 8) | Free |
| `note_booking` | Free Booking.com scrape, correct 0-10 scale (Section 8) | Free |
| `presence_expedia` | Free Expedia scrape (Section 8) | Free |
| `nb_chambres` | Free best-effort text extraction (Section 9) | Free, low yield |
| `linkedin_contact` | **Dismissed — stays `None` permanently** | N/A |

---

## Out of scope for this plan

- LinkedIn scraping (`linkedin_contact`, real `nom_contact`/`poste_contact`) — dismissed
  permanently per the cost/success analysis (see Revision above), not deferred to a later phase
- Email sending / n8n (already handled separately)
- YouSign / contract signature (deferred, own plan later)
- OTA webhook, S3 migration — unrelated to scan

---

*Backend Phase 2 — Scan Plan*
*Bab Morocco BD Intelligence Platform*
