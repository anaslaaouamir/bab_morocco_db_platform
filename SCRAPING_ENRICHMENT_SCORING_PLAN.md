# SCRAPING_ENRICHMENT_SCORING_PLAN.md — httpx+Playwright Enrichment & Type-Agnostic Scoring

> Bab Morocco BD Intelligence Platform — replaces `SCORING_LOGIC_SHIFT_PLAN.md` in full.
> That file is deleted once this one is committed (Section 12) — its scoring-logic reasoning
> (CLAUDE.md §4 categories/weights, why Booking/Expedia/nb_chambres/LinkedIn don't work) is
> preserved here where still valid, and superseded here where real testing changed the answer.
> Created: 2026-07-03, after live testing of httpx-only vs httpx+Playwright scraping across
> 10 real prospect websites spanning 5 of the 8 partner types.

---

## Why this plan exists

`SCORING_LOGIC_SHIFT_PLAN.md` (2026-07-02) proposed scoring off Google Places data
(`note_google`, `nb_avis_google`, `business_status`) after confirming Booking/Expedia presence,
real Booking ratings, room counts, and LinkedIn are unobtainable for free
(`BACKEND_PHASE2_SCAN_PLAN.md` Sections 8-9). That reasoning still holds and is carried forward
here unchanged (Section 5).

What's new: real testing (2026-07-03) on 10 live prospect sites across `hotel_luxe`,
`hotel_riad`, `agence_voyage`, `transport`, and `prestataire_activites` showed:

1. **Plain `httpx` GET is not always enough**, even for fields already in production
   (`_scrape_email_from_website` in `real_providers.py`). One transport-company site returned a
   10KB JS-shell via `httpx` — CTA text, social links, and the contact form were all invisible to
   it — while a headless-browser render of the same URL returned 178KB with all three present.
   `httpx`'s existing "email empty → give up" contract silently produces **false negatives**, not
   just missing data.
2. **A working, type-agnostic signal set exists** — tested successfully across every partner type
   in the sample, unlike `nb_chambres` (hotel-only) or `booking_engine_tech` keywords (also
   hotel-only): social media links, published language versions, a booking/quote call-to-action,
   HTTPS presence, and contact-form presence. These generalize to `transport` and
   `prestataire_activites` exactly as well as to `hotel_riad`, closing the gap the old plan never
   addressed (it only ever validated against hotels/riads).
3. **Playwright costs ~3.6x the wall-clock time of `httpx`** (13.2s vs 3.7s average per site,
   measured) and still fails outright on some sites (3/10 in testing — bot walls, heavy JS that
   never settles). It is not a universal upgrade; it's a targeted fallback.
4. **Two real regex false-positive bugs** were found in the existing `_EMAIL_REGEX`/phone
   matching during testing: a Wix site's Sentry error-tracking beacon URLs matched as "emails",
   and GPS coordinates embedded in a map widget matched the phone regex. (A third, unrelated
   instance — an image filename matching as an email — was already found in production data and
   spun off as its own fix; not part of this plan's scope, but the same regex-tightening work
   item applies here too.)

---

## What to install on this machine (already done once, documented for reproducibility)

No paid tooling. Everything below is free:

```
pip install playwright
playwright install chromium
```

`pip install` alone is not enough — `playwright install chromium` is a separate step that
downloads the actual Chromium binary (~150-300MB) into `%LOCALAPPDATA%\ms-playwright`. No Node.js
is required (Python has native Playwright bindings). No API key, no per-request cost — the only
cost is CPU/RAM/wall-clock time per page render, not money.

---

## Workflow

1. Before writing or editing any file, read it first.
2. After finishing a section's code changes, run the tests/checks listed for that section.
3. Only after tests pass, commit the changes for that section with the suggested commit message
   (or an adjusted one if scope changed).
4. Mark the section's **Status** as `Done` in this file once committed.
5. Do not start the next section until told to.

---

## Guiding principles

- **Legacy columns are not deleted** (carried from the superseded plan): `nb_chambres`,
  `presence_booking`, `note_booking`, `presence_expedia`, `linkedin_contact` stay in the
  `Prospect` model and DB. They're removed from the scoring formula and primary UI surfaces, but
  a manual prospect entry can still optionally record them.
- **New columns are additive and nullable.** No backfill migration for existing rows.
- **`None` means "not checked," `False`/`True` means "checked, confirmed absent/present."** This
  distinction matters for the new boolean signals (`https_actif`, `cta_reservation_present`,
  `formulaire_contact_present`) — a manually-created prospect that never went through a scan must
  not be scored as if the check failed. Use `Boolean, nullable=True`, not `Boolean, default=False`,
  for every new boolean field in this plan.
- **No retroactive rescoring.** Existing prospects keep their currently-stored `score_*` values.
- **`httpx` runs first on every site, always.** Playwright is a conditional fallback, not a
  parallel or default path — see Section 4 for the exact trigger conditions.
- Same test discipline as prior plans: full backend suite green after every section, manual
  verification against real data where relevant.

---

## Summary Table

| # | Section | Layer | New files | Modified files |
|---|---------|-------|-----------|-----------------|
| 1 | DB schema — new columns | Backend DB | 1 migration | `models/prospect.py` |
| 2 | Backend schemas | Backend | — | `schemas/prospect.py` |
| 3 | Playwright dependency | Backend | — | `requirements.txt` |
| 4 | Scraping/enrichment rewrite | Backend | — | `services/real_providers.py` |
| 5 | Scoring engine rewrite | Backend | — | `services/scoring.py`, `services/prospect_service.py` |
| 6 | Scan pipeline wiring | Backend | — | `services/scan_pipeline.py` |
| 7 | Frontend types + mappers | Frontend | — | `types/prospect.ts`, `lib/api/types.ts`, `lib/api/mappers.ts` |
| 8 | Prospection table column | Frontend | — | `ProspectTable.tsx` |
| 9 | Prospect drawer sections | Frontend | — | `ProspectDrawer.tsx` |
| 10 | Add-prospect form + score preview | Frontend | — | `AddProspectDialog.tsx` |
| 11 | CLAUDE.md §4/§8 sync (optional, ask first) | Docs | — | `CLAUDE.md` |
| 12 | Retire the superseded plan | Docs | — | delete `SCORING_LOGIC_SHIFT_PLAN.md` |

---

## Section 1 — DB schema: new columns

**Status:** Done — committed 2026-07-03.

**Goal:** Add 9 nullable columns to `prospects` — 4 carried over from the superseded plan
(Google Places data the scan already fetches and discards) + 5 new ones for the scraped
type-agnostic signals validated in this plan's research.

**Files to read first:**
- `backend/app/models/prospect.py`
- `backend/alembic/versions/` (confirmed via `alembic heads` the actual current head is
  `d3e4f5a6b7c8_add_partner_reply_pdf_to_contracts.py`, not `f6a3b4c5d9e2` as first assumed —
  `f6a3b4c5d9e2` is mid-chain, several contract/user migrations landed after it)
- `backend/alembic.ini`

**Files created:**
- `backend/alembic/versions/a2b4c6d8e0f1_add_scraping_enrichment_fields_to_prospects.py`

**Files to modify:**
- `backend/app/models/prospect.py` — add:
  - `note_google: Mapped[float | None]` (Float, nullable) — Google Maps rating, 0-5 scale.
  - `nb_avis_google: Mapped[int | None]` (Integer, nullable) — Google review count.
  - `telephone: Mapped[str | None]` (String(50), nullable) — prefer Google Places
    `international_phone_number` when present (already fetched in `_fetch_details`, structured
    and reliable); fall back to the regex-scraped phone from the website only if Google has none
    (avoids the GPS-coordinate false-positive found in testing — Google's own phone field never
    has that failure mode).
  - `business_status: Mapped[str | None]` (String(30), nullable) — `OPERATIONAL` /
    `CLOSED_TEMPORARILY` / `CLOSED_PERMANENTLY`.
  - `https_actif: Mapped[bool | None]` (Boolean, nullable — **not** `default=False`) — whether
    the site's declared URL uses HTTPS.
  - `cta_reservation_present: Mapped[bool | None]` (Boolean, nullable) — a booking/quote
    call-to-action found on the site (`"book now"`, `"réserver"`, `"demander un devis"`, etc. —
    see Section 4 for the exact word list).
  - `formulaire_contact_present: Mapped[bool | None]` (Boolean, nullable) — a `<form>` referencing
    contact/email found on the site.
  - `reseaux_sociaux: Mapped[str | None]` (String(255), nullable) — comma-separated list of
    social platforms detected (e.g. `"instagram,facebook,whatsapp"`), free-text like the existing
    `capacite_description` pattern.
  - `langues_disponibles: Mapped[str | None]` (String(100), nullable) — comma-separated language
    codes detected on the site (e.g. `"fr,en,es"`), via `hreflang`/URL-path hints.
- Do not touch/remove `nb_chambres`, `presence_booking`, `note_booking`, `presence_expedia`,
  `linkedin_contact` — see Guiding Principles.

**Tests to run before committing:**
- `cd backend && alembic upgrade head` runs cleanly.
- `cd backend && alembic downgrade -1` then `alembic upgrade head` again.
- `cd backend && pytest` — full suite green.

**Commit message:**
```
feat(db): add Google/scrape-sourced enrichment fields to prospects
```

---

## Section 2 — Backend schemas

**Status:** Done — committed 2026-07-03.

**Note for Section 5:** `prospect_service.py`'s `update_prospect()` rebuilds a hardcoded `current`
dict (lines ~190-201) to feed the scoring engine on edit — it currently only lists legacy fields
and will need the 9 new ones added when Section 5 rewrites `scoring.py` to actually read them,
otherwise editing a prospect's `telephone`/`note_google`/etc. via the drawer won't trigger
correct re-scoring. Not a Section 2 concern (current scoring engine doesn't read these fields
yet), but flagged here so Section 5 doesn't miss this file — it wasn't in the original files-to-
modify list for that section.

**Goal:** Expose the 9 new fields through `ProspectCreate` / `ProspectUpdate` / `ProspectResponse`
/ `ScorePreviewRequest`, preserving the `None` vs `False` distinction from Section 1's Guiding
Principles (Pydantic `Optional[bool] = None`, not `bool = False`).

**Files to read first:**
- `backend/app/schemas/prospect.py` (full file)

**Files to modify:**
- `backend/app/schemas/prospect.py`:
  - `ProspectCreate` / `ProspectUpdate` / `ProspectResponse` — add `note_google: Optional[float]`,
    `nb_avis_google: Optional[int]`, `telephone: Optional[str]`, `business_status: Optional[str]`,
    `https_actif: Optional[bool] = None`, `cta_reservation_present: Optional[bool] = None`,
    `formulaire_contact_present: Optional[bool] = None`, `reseaux_sociaux: Optional[str] = None`,
    `langues_disponibles: Optional[str] = None`.
  - `ScorePreviewRequest` — add `note_google`, `nb_avis_google`, `telephone`, `business_status`,
    `langues_disponibles` (the fields a Commercial could plausibly know and type manually — see
    Section 10 for why `https_actif`/`cta_reservation_present`/`formulaire_contact_present`/
    `reseaux_sociaux` are **not** added here: they're scan-only signals, not something a human
    fills in by hand).
  - `ScorePreviewResponse` — no field changes.

**Tests to run before committing:**
- `cd backend && pytest app/tests/test_prospects.py` — confirms round-trip with new optional
  fields.

**Commit message:**
```
feat(schemas): add enrichment fields to prospect schemas
```

---

## Section 3 — Playwright dependency

**Status:** Done — committed 2026-07-03. No backend README/setup doc existed to document the
`playwright install chromium` post-install step in, so it's documented as a comment directly
above the dependency line in `requirements.txt` instead.

**Goal:** Add Playwright to the backend's declared dependencies so a fresh environment setup
matches what's already installed on this machine.

**Files to modify:**
- `backend/requirements.txt` — add `playwright>=1.61.0`.
- Document in a comment or `README`/setup note (wherever backend setup steps are currently
  documented — check for one before adding a new one) that `playwright install chromium` must
  run once after `pip install -r requirements.txt`, since pip alone does not fetch the browser
  binary.

**Tests to run before committing:**
- `cd backend && pip install -r requirements.txt` installs cleanly.
- `cd backend && pytest` — unaffected (Playwright not yet called anywhere).

**Commit message:**
```
chore(scan): add Playwright dependency for enrichment fallback
```

---

## Section 4 — Scraping/enrichment rewrite: httpx-first, Playwright-fallback

**Status:** Done — committed 2026-07-03.

**Corrections made during implementation:**
- The "Sentry/Wixpress false-positive" described in this plan's research turned out to already
  be blocked by the existing `_EMAIL_BLOCKLIST` (it already contained `"sentry"`, which is a
  substring of `sentry.wixpress.com`) — the false positive only showed up in the throwaway test
  script's own incomplete filter, not in production code. Added `"wixpress"` to the blocklist
  defensively anyway (cheap, no downside), but the real, previously-unfixed bug was the missing
  image-extension check (`Logo-Cyan-Gradient@0.75x.png`-style matches) — that one is now fixed via
  `_EMAIL_BAD_EXTENSIONS`, and the standalone task flagged for it earlier is superseded/dismissed.
- There was no phone-scraping regex in production before this section (phone previously came only
  from Google Places). The new `_PHONE_REGEX` + `_valid_phone` combination was tuned live against
  `riadfleurdesable.com` (the real GPS-coordinate false-positive site from testing) — the first
  version (8-digit floor) still let a garbage `"00000080"` match through; raising the digit floor
  to 10 fixed it and produced a correct `+212 808 662 133` instead. Verified against 3 real sites
  post-fix (see below).
- Playwright fallback timing is genuinely variable run-to-run on the same site (confirmed:
  `marrakechtravelandtransfer.com` took 20.0s and 14.1s and 6.4s across three consecutive runs,
  sometimes completing well within the 8s cap, sometimes hitting it) — this is real network/render
  variance, not a bug; the graceful-degradation design (keep httpx's values when the fallback
  doesn't return in time) already handles it correctly.

**Manual verification performed:** re-ran `RealEnrichmentService.enrich()` directly (not the mock)
against 3 real cases from this plan's original research — `riadfleurdesable.com` (known
email/phone false-positive site, now clean), `marrakechtravelandtransfer.com` (known thin-shell
site, confirmed fallback fires and recovers CTA/social/contact-form data httpx alone misses), and
`galaxyvoyage.ma` (known-good site, confirmed fallback does NOT fire when httpx already found
email+phone on a normal-sized page).

**Goal:** Rewrite `RealEnrichmentService.enrich()` to (a) extract the full type-agnostic signal
set from a single `httpx` fetch, (b) fall back to Playwright only when the `httpx` result looks
untrustworthy, and (c) fix the two regex false-positive bugs found in testing.

**Files to read first:**
- `backend/app/services/real_providers.py` (full file — this section rewrites most of
  `RealEnrichmentService`)
- `backend/app/services/mock_providers.py` (the contract shape `enrich()` must still match, plus
  new keys)

**Files to modify:**
- `backend/app/services/real_providers.py`:

  **Regex fixes (do first — these are bugs regardless of the rest of this section):**
  - `_EMAIL_REGEX` matches / `_EMAIL_BLOCKLIST` — extend the blocklist to exclude tracking-beacon
    domains (`sentry`, `wixpress`, already partially covered by `sentry` but confirm `wixpress`
    is also excluded) and image-file extensions (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`,
    `.gif`, `.ico`) — found live on `riadfleurdesable.com` (fake `@sentry.wixpress.com` matches).
  - New `_PHONE_REGEX` — must not match GPS coordinate pairs embedded in map widgets (found live
    on the same site: `+0102-0103`-shaped garbage from lat/long text). Anchor on plausible
    international phone shapes (`+` or `00` prefix, 8-15 digits total, not two decimal-looking
    segments) — validate against real captured HTML in this section's manual test, same rigor as
    the original regex was tuned (`BACKEND_PHASE2_SCAN_PLAN.md` Section 7).

  **New unified extraction function** (replaces piecemeal signal-by-signal checks):
  - `_extract_signals(html: str, url: str) -> dict` — given one page's HTML, returns email,
    phone, `https_actif` (from `url.startswith("https://")`), `cta_reservation_present` (any of:
    `"book now"`, `"réserver"`, `"reserver"`, `"réservation en ligne"`, `"request a quote"`,
    `"demander un devis"`, `"check availability"`, `"vérifier la disponibilité"`, `"get a quote"`
    — case-insensitive substring match), `formulaire_contact_present` (`<form` tag present AND
    `email` or `contact` nearby in the same page), `reseaux_sociaux` (comma-joined list from:
    `instagram.com`, `facebook.com`, `linkedin.com/company`, `tiktok.com`, `wa.me`,
    `whatsapp.com`, `youtube.com`), `langues_disponibles` (comma-joined language codes detected
    via `/en/`, `/fr/`, `/es/`, `/de/`, `/ar/` path segments or `hreflang="xx"` attributes).
  - Run this once per fetched page — do not re-fetch separately for each signal (the existing
    `_scrape_email_from_website` loop over `_EMAIL_CANDIDATE_PATHS` already fetches these pages
    for email; reuse the same responses for every other signal instead of issuing new requests).

  **Fallback trigger + Playwright fetch:**
  - After the `httpx` pass across `_EMAIL_CANDIDATE_PATHS`, decide whether to re-fetch the
    homepage with Playwright: trigger if **either** (a) no email AND no phone were found across
    all candidate pages, **or** (b) the homepage response body was under ~15,000 characters
    (thin-shell heuristic — calibrated from testing: a real JS-shell failure measured 10,123
    chars while every legitimate content-bearing page in the sample measured 29,939+ chars; this
    threshold should be sanity-checked against a larger sample during this section's manual
    testing, not treated as final).
  - `_fetch_with_playwright(url: str) -> str` — launch Chromium headless, `page.goto(url,
    timeout=8000, wait_until="load")` (**not** `"networkidle"` — confirmed in testing that many
    real sites never go network-idle due to chat widgets/analytics beacons, causing false
    timeouts), then `page.wait_for_timeout(1000)` to let lazy-loaded content settle, then
    `page.content()`. Any exception (timeout, crash, block) → return `""` and keep the `httpx`
    result; never let a Playwright failure crash the pipeline (same graceful-degradation contract
    as every other stage in this file).
  - When the fallback fires and returns non-empty HTML, **re-run `_extract_signals` on the
    Playwright HTML and prefer those results** over the `httpx` ones for every field (not just
    email/phone) — the Playwright render is a strict superset of the same page, so there's no
    reason to keep the thinner `httpx` extraction once you've already paid for the fuller one.

  **Browser lifecycle:** do not launch a new Chromium instance per prospect — that's Section 6's
  concern (one shared `Browser` instance per scan job, passed into `RealEnrichmentService` or
  held module-level, closed when the job finishes). Launching Chromium per-prospect at 50-100
  prospects/scan is the difference between a few seconds and several minutes of pure browser
  startup overhead.

  **Fields unaffected by this section** (carried forward from `BACKEND_PHASE2_SCAN_PLAN.md`,
  unchanged, no reason to revisit): `_check_ota_presence` stays hardcoded `False`
  (Booking.com/Expedia still block direct scraping — not retested here, no new evidence),
  `nb_chambres` stays `None` (Section 9 finding — data-shape problem, not access problem, not
  retested here), `linkedin_contact` stays `None` (dismissed).

  **`RealGoogleMapsProvider._fetch_details`** — extend the field mask to also request
  `business_status` (carried forward from the superseded plan's Section 4 — confirmed present in
  the raw Places response, never mapped through).

**Tests to run before committing:**
- `cd backend && pytest` — full suite green (mocks unaffected).
- Manual: re-run the same 10-site comparison used in this plan's research (or a fresh sample) via
  a throwaway script — confirm: (1) the two regex bugs no longer reproduce, (2) the Playwright
  fallback fires on a thin-shell site and does NOT fire on a normal-sized page that already has
  an email, (3) total wall-clock time for a batch stays reasonable (most sites should skip
  Playwright entirely).

**Commit message:**
```
feat(scan): httpx-first scraping with Playwright fallback, fix regex false positives

Unified signal extraction (email, phone, https, booking CTA, social
links, language versions, contact form) from a single httpx fetch.
Falls back to a Playwright-rendered page only when httpx returns no
contact info or a suspiciously thin response (JS-shell sites). Fixes
two false-positive bugs found in testing: Wix Sentry beacon URLs
matching as emails, GPS coordinates matching as phone numbers.
```

---

## Section 5 — Scoring engine rewrite

**Status:** Done — committed 2026-07-03.

**Scope note:** also touched `prospect_service.py`'s `update_prospect()` re-scoring dict (flagged
in Section 2) since it's a hard dependency for scoring to actually read the new fields on edit.
**Also pulled forward part of Section 6's scope out of necessity**: the full backend suite broke
after this rewrite (`test_scan.py::test_high_score_goes_to_outreach` and two `test_prospects.py`
tests) because `scan_pipeline.py` and `MockEnrichmentService` didn't yet wire the 9 new fields
into scanned `Prospect` rows — every mock-scanned prospect scored identically under the new
formula (no more even/odd differentiation), so none reached the outreach threshold. Fixed by
wiring `Prospect(...)`'s constructor (the exact change Section 6 already specified) and extending
`MockEnrichmentService.enrich()` with deterministic even/odd fake values for the new fields (also
already anticipated in Section 6's text). **Section 6 now only has the shared-browser-per-scan-job
optimization left** — the field-wiring half is done.

**Design note surfaced during implementation (flagging for visibility, not changing the plan
unilaterally):** the manual-entry neutral-pass rule, applied consistently across
`https_actif`/`cta_reservation_present`/`formulaire_contact_present`/`business_status`, means an
entirely unscanned/manual prospect now scores 63 (see `test_score_total_always_computed`) versus
~41 under the old formula — meaningfully closer to the 75 outreach threshold on pure absence of
negative signal. This is the direct, intended consequence of the neutral-pass design already
agreed for this plan (extending the old plan's `business_status` precedent to more fields), not a
bug — but it's a bigger behavior shift than the plan text made obvious, so noting it here in case
it's worth revisiting once real data is observed post-launch.

**Real-data sanity check:** re-scored 3 real prospects from Section 4's live testing (Riad Fleur
de Sable, Marrakech Travel & Transfer, Galaxy Voyage) — spread was 80/85/85, all differentiated
sub-scores, none hitting the old fixed 58/66 ceiling.

**Goal:** Redefine the 5 CLAUDE.md §4 categories (same names, same point totals: 25/25/20/15/15)
around the fields validated in Sections 1-4 — combining the Google-Places-sourced fields carried
from the superseded plan with the new type-agnostic scrape signals.

**Files to read first:**
- `backend/app/services/scoring.py` (full file)
- `backend/app/tests/test_scoring.py` (will need updating)

**Files to modify:**
- `backend/app/services/scoring.py`:

  **`_score_activite` (25 pts)** — was: website 8 + booking 7 + note>8.0 5 + expedia 5 (all
  Booking/Expedia-dependent, always 0 in practice). New:
  - website present: **3 pts**
  - `note_google` ≥ 4.5: **8 pts** / 4.0-4.49: **5 pts** / 3.5-3.99: **2 pts** / below or `None`:
    **0 pts**
  - `business_status == "OPERATIONAL"`: **3 pts** (treat `None` as neutral-pass for manual
    entries, per the superseded plan's original rule — carried forward unchanged)
  - `https_actif is True`: **2 pts** (`None`/not-scanned → 0, but see manual-entry note below)
  - `cta_reservation_present is True`: **4 pts**
  - `reseaux_sociaux` non-empty: **5 pts**
  - **Manual-entry rule:** for prospects created manually where `https_actif` /
    `cta_reservation_present` / `reseaux_sociaux` were never set (`None`/empty because the
    Add-Prospect form doesn't ask about them — Section 10), treat these three sub-checks as
    neutral-pass (award full points) rather than 0, same logic as the existing
    `business_status` rule — a human-vetted manual entry shouldn't be penalized for fields the
    manual form structurally can't populate.

  **`_score_coherence` (25 pts)** — was: pure `pays` lookup, up to 25 pts. New: rescale the
  geography table to a **20-pt cap** (×0.8 of current values, rounded) + a **5-pt bonus** for
  published language versions matching ≥2 of Bab Morocco's target markets (fr/en/es/de/ar) — this
  is a direct, site-declared signal of the exact thing this category measures ("clientèle alignée
  avec la cible Bab Morocco"), stronger evidence than geography alone. Rescaled table (compute
  exact values during implementation by `round(current_value * 0.8)`; "hors cible" floor stays at
  **4** instead of 5): Maroc/Morocco 20, France 18, UAE/Dubai/Abu Dhabi/Sharjah 16, UK 12, Espagne
  10, Allemagne/Autriche 10, Arabie Saoudite/Qatar/Koweit/Bahrain/Belgique/Suisse/Pays-Bas 8,
  Italie/Portugal 6.
  - `langues_disponibles` split by comma, count how many are in `{fr, en, es, de, ar}` — if ≥2:
    **+5 pts** (capped so total never exceeds 25).

  **`_score_taille` (20 pts)** — carried forward unchanged from the superseded plan's design
  (already correctly identified `nb_avis_google` as the right type-agnostic proxy — this plan's
  testing didn't find a better one, and review count genuinely applies to a transport company or
  activity provider exactly as well as a hotel, unlike `nb_chambres`):
  - ≥ 300: **20 pts** / 100-299: **15 pts** / 30-99: **10 pts** / 10-29: **5 pts** / below 10 or
    `None`: **0 pts**

  **`_score_contact` (15 pts)** — was: email 8 + linkedin 7. New:
  - `email_contact` present: **8 pts**
  - `telephone` present: **4 pts**
  - `formulaire_contact_present is True`: **3 pts** (manual-entry neutral-pass rule applies here
    too, same as `_score_activite`'s three scan-only booleans)

  **`_score_liberte` (15 pts)** — **unchanged, flat 15** (carried forward — no viable free signal
  found; the "does the partner's own site embed a Booking.com/GetYourGuide widget" idea explored
  during this plan's research got 0/10 hits in the test sample, too small to validate either way
  — documented as an open item, not promoted into scoring here).

**Tests to run before committing:**
- `cd backend && pytest` — update `test_scoring.py`'s assertions to match every new sub-check.
- Manual: hand-recompute scores for a few real prospects using the new formula (mix of hotel,
  agency, transport, activity types) and sanity-check the spread looks reasonable and that no
  partner type is structurally capped low the way the old formula capped everything at 58/66.

**Commit message:**
```
refactor(scoring): rebuild scoring formula on type-agnostic scrape + Google signals

CLAUDE.md §4 categories/weights unchanged (25/25/20/15/15). All
sub-checks now use fields validated to generalize across every
partner type (hotels, riads, agencies, transport, activities) instead
of hotel-only signals (nb_chambres, booking-engine keywords) or
permanently-unreachable ones (Booking/Expedia presence). Liberté OTA
stays a flat 15 placeholder pending a larger validation of the
OTA-badge-on-own-site idea.
```

---

## Section 6 — Scan pipeline wiring

**Status:** Done — committed 2026-07-03 (field wiring was completed early, during Section 5; this
commit finishes the shared-browser-per-scan-job optimization).

**Manual verification performed:** live scan (`ENV=production`, `GOOGLE_MAPS_API_KEY` set,
Essaouira / `prestataire_activites` / `limite=3`) run directly against `run_scan_pipeline` (not
just the mocks). Job completed in 21.5s for 3 real prospects, all three inserted with every new
field populated (`note_google`, `nb_avis_google`, `https_actif`, `cta_reservation_present`,
`formulaire_contact_present`, `reseaux_sociaux`, `langues_disponibles`) and correctly scored
(86-90, all above the outreach threshold — Lou's Rides, Quad Adventure Essaouira, Essaouira Yoga
& Experiences). Confirmed via `wmic`/`tasklist` that no Playwright-launched Chromium process was
left running after the job finished — the shared browser closes cleanly in the `finally` block
even though this run's job completed successfully (crash-path release wasn't separately exercised,
lower risk since `finally` always runs regardless of which branch raised).

**Goal:** Manage a single shared Playwright `Browser` instance per scan job instead of launching
one per prospect (the field-wiring half of this section's original goal is already done).

**Files to read first:**
- `backend/app/services/scan_pipeline.py` (full file)
- `backend/app/services/real_providers.py` (as rewritten in Section 4)

**Already done (during Section 5):**
- `Prospect(...)` constructor call in `run_scan_pipeline` now passes all 9 new fields from
  `enriched`.
- `MockEnrichmentService.enrich()` (`mock_providers.py`) now populates deterministic even/odd
  fake values for the 9 new keys, matching the existing quality-split pattern.

**Files still to modify:**
- `backend/app/services/scan_pipeline.py`:
  - Launch one Playwright `Browser` at the start of `run_scan_pipeline` (only if the real
    enrichment service is active — mocks never touch Playwright) and pass it into
    `_enrichment_svc.enrich(raw, browser)` (signature already accepts an optional `browser` param
    from Section 4 — this section just needs to actually supply one) or hold it as an attribute the
    service reads — pick whichever fits the existing DI pattern (`get_scan_providers()`) with the
    least disruption; close the browser in a `finally` block alongside the existing
    try/except/job-status-update logic so a mid-scan crash still releases it.

**Tests to run before committing:**
- `cd backend && pytest app/tests/test_scan.py app/tests/test_prospects.py app/tests/test_scoring.py`
- Manual: `ENV=production` + `GOOGLE_MAPS_API_KEY` set, small live scan (`limite=5`) across 2-3
  different partner types (include at least one non-hotel type — `transport` or
  `prestataire_activites` — to confirm the pipeline doesn't regress on the types the superseded
  plan never actually tested). Confirm the new columns populate, confirm Playwright only fires on
  the sites that need it (spot-check timing), confirm the browser closes cleanly after the job.
- Set `ENV` back to `development` after verification.

**Commit message:**
```
feat(scan): wire enrichment fields into Prospect rows, share one browser per scan job
```

---

## Section 7 — Frontend types + API mapping layer

**Status:** Done — committed 2026-07-03. `prospectToCreate`/`prospectToUpdate` map all 9 new
fields symmetrically to the legacy fields (not just the 4 Section 10 will expose on the manual
add-form) — the human-editable-subset restriction is a Section 10 UI concern, not a mapper-layer
one. `npx tsc --noEmit` clean. No UI surface changed yet (Sections 8-10 add the actual
display/edit surfaces), so nothing to verify in a browser preview for this section.

**Goal:** Add the 9 new fields to the frontend's type system and snake↔camel mapping layer.

**Files to read first:**
- `frontend/src/types/prospect.ts` (full file)
- `frontend/src/lib/api/types.ts` (`RawProspect`)
- `frontend/src/lib/api/mappers.ts` (full file)

**Files to modify:**
- `frontend/src/types/prospect.ts` — add to `Prospect`: `noteGoogle?: number`,
  `nbAvisGoogle?: number`, `telephone?: string`, `businessStatus?: string`,
  `httpsActif?: boolean`, `ctaReservationPresent?: boolean`, `formulaireContactPresent?: boolean`,
  `reseauxSociaux?: string`, `languesDisponibles?: string`. Keep legacy fields
  (`nbChambres`, `noteBooking`, `presenceBooking`, `presenceExpedia`, `linkedinContact`) in the
  interface per Guiding Principles.
- `frontend/src/lib/api/types.ts` — matching snake_case fields on `RawProspect`, all
  `T | null`.
- `frontend/src/lib/api/mappers.ts` — `rawToProspect` / `prospectToCreate` / `prospectToUpdate`:
  map the 9 new fields symmetrically to how legacy fields are handled.

**Tests to run before committing:**
- `cd frontend && npm run build` (or `tsc --noEmit`).

**Commit message:**
```
feat(types): add enrichment fields to frontend Prospect type + mappers
```

---

## Section 8 — Prospection table: replace the "OTAs" column

**Status:** Done (code) — committed 2026-07-03. **Manual browser verification not performed** —
ports 3000/8000 were already occupied by processes outside this tool's tracked preview servers
(likely the user's own running dev instances), and the user didn't respond to the port-reuse
question, so touching them was avoided per the "don't take risky/destructive actions without
confirmation" rule. Confirmed only via `curl` that both ports respond (200/307 — alive, plausibly
this exact app) and via `npx tsc --noEmit` (clean). **Recommend an actual visual check next time a
preview server is available**, since a table layout/rendering issue wouldn't show up in a
type-check.

**Goal:** Replace `ProspectTable.tsx`'s "OTAs" column (line ~286 header, ~431-436 cell — currently
Booking/Expedia presence, always empty on real data) with a column reflecting what's actually
populated now.

**Files to read first:**
- `frontend/src/components/crm/ProspectTable.tsx` (full file, focus lines 286, 431-436)

**Files to modify:**
- `frontend/src/components/crm/ProspectTable.tsx`:
  - Replace "OTAs" header with "Signaux digitaux" (or similarly short French label consistent
    with the rest of the UI).
  - Replace the OTA presence cell with: Google rating/reviews (`★ {noteGoogle} · {nbAvisGoogle}
    avis`) plus a compact indicator for how many of the 3 boolean signals
    (`httpsActif`/`ctaReservationPresent`/`reseauxSociaux` non-empty) are confirmed present —
    e.g. a small chip like `"3/3"` or individual small icons if space allows. Sensible "—"
    fallback when `noteGoogle` is `null` (manual/legacy prospects).
  - Score tooltip (`ScoreCell` breakdown) — labels unchanged (category names unchanged per
    Section 5), values reflect the new formula automatically.

**Tests to run before committing:**
- Manual: load `/prospection`, confirm the new column renders correctly for real-scanned
  prospects (values populated) and legacy/manual prospects ("—" fallback).

**Commit message:**
```
feat(prospection): replace OTAs column with Google + digital-signal indicators
```

---

## Section 9 — Prospect drawer: replace OTA + capacité sections

**Status:** Not started

**Goal:** Update the drawer's read-only view and edit form to reflect the new signal set.

**Files to read first:**
- `frontend/src/components/crm/ProspectDrawer.tsx` (full file — focus on the "Présence OTA
  concurrentes" block ~line 1278, the "Capacité" `InfoRow` ~line 1249, `EditForm`/
  `prospectToEditForm`/`EditProspectForm` ~lines 695-840)

**Files to modify:**
- `frontend/src/components/crm/ProspectDrawer.tsx`:
  - Replace "Présence OTA concurrentes" (~line 1278) with "Présence digitale" showing Google
    rating/reviews/`business_status` (as the superseded plan proposed) **plus** the new scrape
    signals: HTTPS (small lock icon or "—"), booking/quote CTA present (yes/no), social platforms
    detected (`reseauxSociaux`, rendered as small icons per platform if parseable, otherwise the
    raw comma list), languages published (`languesDisponibles`).
  - "Capacité" `InfoRow` (~line 1249) — same as the superseded plan: keep `capacite_description`,
    drop the `nb_chambres` half of the conditional as the expected default (still show it for a
    manual prospect that explicitly set it).
  - Contact section — add `telephone` `InfoRow` (`tel:` href), add `formulaireContactPresent`
    indicator. Keep the LinkedIn `InfoRow` (harmless, conditional on the legacy field).
  - `EditForm`/`prospectToEditForm`/`EditProspectForm` — add `telephone`, `noteGoogle`,
    `nbAvisGoogle`, `languesDisponibles` as editable fields (these are things a Commercial could
    plausibly know and correct by hand). Do **not** add `httpsActif`/`cta_reservation_present`/
    `formulaireContactPresent`/`reseauxSociaux` as editable — they're scan-derived observations
    about the site's code, not facts a human should be typing in as true/false; keep them
    read-only, populated only by a scan or left `null`.
  - `handleSaveEdit`'s `prospectsApi.update(...)` payload — add the 4 human-editable new fields.

**Tests to run before committing:**
- Manual: open the drawer for a real scanned prospect (include a non-hotel type), confirm all new
  read-only fields render; open Edit mode, confirm only the 4 human-editable fields are editable
  and save correctly via `PUT /prospects/{id}`.

**Commit message:**
```
feat(prospection): show digital-signal data in prospect drawer, editable subset
```

---

## Section 10 — Add-prospect form + live score preview

**Status:** Not started

**Goal:** Update the manual "Add Prospect" dialog to match the new scoring formula, adding only
the fields a human can meaningfully type in.

**Files to read first:**
- `frontend/src/components/crm/AddProspectDialog.tsx` (full file)

**Files to modify:**
- `frontend/src/components/crm/AddProspectDialog.tsx`:
  - Form state — add `noteGoogle`, `nbAvisGoogle`, `telephone`, `languesDisponibles` (the 4
    human-editable fields from Section 9). Legacy Booking/Expedia/LinkedIn/room-count fields stay
    de-emphasized under "Informations complémentaires (optionnel)" per the superseded plan's
    design (still valid — not revisited here).
  - **Do not** add `httpsActif`/`ctaReservationPresent`/`formulaireContactPresent`/
    `reseauxSociaux` to this form — see Section 5's manual-entry neutral-pass rule; these fields
    stay `null` for manually-created prospects by design, and the scoring engine already treats
    that as a pass, not a penalty.
  - `score-preview` request payload — include the 4 new human-editable fields.
  - Submission payload (`prospectsApi.create(...)`) — same 4 fields.

**Tests to run before committing:**
- Manual: fill in Google rating/reviews/phone/languages, confirm the live score preview matches
  Section 5's formula by hand-calculation; submit and confirm stored scores match.

**Commit message:**
```
feat(prospection): add human-editable enrichment fields to add-prospect form
```

---

## Section 11 — CLAUDE.md sync (optional — confirm with the doc owner first)

**Status:** Not started

**Goal:** CLAUDE.md §4 still describes the original Booking/LinkedIn/room-count sub-checks, and
§8's tech stack lists Playwright as already in use when in fact it was only added by this plan.
Both are now factually out of date. This section is **not automatically in scope** — check with
whoever owns CLAUDE.md before editing it, same as the superseded plan noted.

**Files to modify (if approved):**
- `CLAUDE.md` §4 — update sub-check descriptions to match Section 5's new formula (keep category
  names/weights — those are unchanged and still the canonical source of truth).
- `CLAUDE.md` §8 — no change needed; Playwright was already listed, this plan makes it actually
  true rather than aspirational.

**Commit message (if done):**
```
docs: sync CLAUDE.md §4 scoring sub-checks with implemented formula
```

---

## Section 12 — Retire the superseded plan

**Status:** Done — `SCORING_LOGIC_SHIFT_PLAN.md` deleted 2026-07-03 when this plan was created
(confirmed via repo-wide grep that no other file referenced it before deletion).

**Goal:** Delete `SCORING_LOGIC_SHIFT_PLAN.md` now that this plan fully replaces its scope (its
DB/schema/scoring/frontend sections are all re-specified here, either carried forward unchanged
or explicitly revised).

**Files to delete:**
- `SCORING_LOGIC_SHIFT_PLAN.md`

**Tests to run before committing:**
- None — doc-only change. Confirm no other file references it (`grep -r
  SCORING_LOGIC_SHIFT_PLAN` across the repo) before deleting.

**Commit message:**
```
docs(scoring): remove SCORING_LOGIC_SHIFT_PLAN.md, superseded by SCRAPING_ENRICHMENT_SCORING_PLAN.md
```

---

## Open items not covered by this plan

- **Liberté OTA (15 pts)** stays a flat placeholder. The "OTA badge embedded on the partner's own
  site" idea (checking the partner's page for a Booking.com/GetYourGuide/Viator link or widget —
  which sidesteps Booking.com's own WAF block since you never touch their servers) got 0/10 hits
  in this plan's 10-site test sample — too small to conclude either way. Worth a larger validation
  pass (30-50 real sites) before promoting it into scoring.
- **Booking.com/Expedia direct presence detection** — still blocked (WAF/bot-wall), not retested
  in this plan, no new evidence it's become viable.
- **`nb_chambres`** — still infeasible (data-shape problem per `BACKEND_PHASE2_SCAN_PLAN.md`
  Section 9, not a scraping-access problem), not retested here.
- **LinkedIn scraping** — still dismissed, not revisited.
- **No retroactive rescoring** of prospects created before this change.
- **Thin-shell HTML length threshold (~15,000 chars, Section 4)** is calibrated off a single real
  failure case — validate against a larger sample during Section 4's implementation before
  treating it as final.

---

*Scraping Enrichment & Scoring Plan — 2026-07-03*
*Bab Morocco BD Intelligence Platform*
