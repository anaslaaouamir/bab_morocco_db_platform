# SCORING_LOGIC_SHIFT_PLAN.md — Google-Data-Based Scoring Revision

> Bab Morocco BD Intelligence Platform — shift scoring to rely only on data the real scan
> pipeline can actually source (Google Places), after Sections 6-10 of
> [BACKEND_PHASE2_SCAN_PLAN.md](BACKEND_PHASE2_SCAN_PLAN.md) proved Booking.com/Expedia
> presence, real Booking rating, room count, and LinkedIn are not obtainable for free.
> Created: 2026-07-02

---

## Why this plan exists

The current scoring formula (CLAUDE.md §4) spends real weight on signals the real scan
pipeline cannot produce:
- `presence_booking` / `presence_expedia` → always `False` (both platforms block scraping —
  BACKEND_PHASE2_SCAN_PLAN.md Section 8)
- `note_booking` → always `None` (same reason)
- `nb_chambres` → always `None` (data-shape problem, not access — Section 9)
- `linkedin_contact` → always `None` (dismissed entirely, out of scope)

Result: every real Maroc prospect today scores **either exactly 58 or exactly 66** — no real
differentiation, ~29 of 100 points permanently dead. Meanwhile the scan pipeline already
receives (and in one case discards) real, free, reliable signal from Google Places:
`note_google` (rating), `nb_avis_google` (review count), `phone`, and `business_status`
(confirmed present in Google's raw response, unused today).

This plan redesigns scoring to run on what's actually available, and updates every layer that
touches the affected fields — DB, backend schemas/services, and every frontend surface on the
`/prospection` page that displays or edits them.

---

## Workflow

1. Before writing or editing any file, read it first.
2. After finishing a section's code changes, run the tests/checks listed for that section.
3. Only after tests pass, commit the changes for that section with the suggested commit message.
4. Mark the section's **Status** as `Done` in this file once committed.
5. Do not start the next section until told to.

---

## Guiding principles

- **Legacy columns are not deleted.** `nb_chambres`, `presence_booking`, `note_booking`,
  `presence_expedia`, `linkedin_contact` stay in the `Prospect` model and DB — existing
  prospects (scanned or manually entered before this change) keep their data, and manual
  prospect creation can still optionally record real Booking/Expedia info if a Commercial
  happens to know it firsthand. They are simply **removed from the scoring formula** and
  **removed from the primary UI surfaces** (table columns, drawer sections, add-form fields)
  in favor of the new Google-sourced fields.
- **New columns are additive and nullable.** `note_google`, `nb_avis_google`, `telephone`,
  `business_status` — no backfill migration for existing rows, they simply stay `NULL` until
  a prospect is re-scanned or manually edited.
- **No retroactive rescoring.** Existing prospects keep their currently-stored `score_*`
  values. Only new scans (post-deployment) and manual edits that trigger score recomputation
  use the new formula.
- **Real Google data already flows partway through the pipeline today and is discarded** —
  `real_providers.py`'s `RealGoogleMapsProvider.search()` already fetches `note_google`,
  `nb_avis_google`, and `phone`; `RealEnrichmentService.enrich()` currently pops all three
  before returning. This plan stops discarding them.
- Same test discipline as `BACKEND_PHASE2_SCAN_PLAN.md`: full backend suite green after every
  section, manual verification against real data where relevant.

---

## Summary Table

| # | Section | Layer | New files | Modified files |
|---|---------|-------|-----------|-----------------|
| 1 | DB schema — new columns | Backend DB | 1 migration | `models/prospect.py` |
| 2 | Backend schemas | Backend | — | `schemas/prospect.py` |
| 3 | Scoring engine rewrite | Backend | — | `services/scoring.py` |
| 4 | Real scan wiring | Backend | — | `services/real_providers.py` |
| 5 | Scan pipeline insert wiring | Backend | — | `services/scan_pipeline.py` |
| 6 | Frontend types + mappers | Frontend | — | `types/prospect.ts`, `lib/api/types.ts`, `lib/api/mappers.ts` |
| 7 | Prospection table column | Frontend | — | `ProspectTable.tsx` |
| 8 | Prospect drawer sections | Frontend | — | `ProspectDrawer.tsx` |
| 9 | Add-prospect form + score preview | Frontend | — | `AddProspectDialog.tsx` |

---

## Section 1 — DB schema: new Google-sourced columns

**Status:** Not started

**Goal:** Add 4 new nullable columns to `prospects` for the data the real scan already fetches
(or could easily fetch) but currently discards.

**Files to read first:**
- `backend/app/models/prospect.py`
- `backend/alembic/versions/` (find current head revision, check naming/style of an existing
  migration file before writing a new one)
- `backend/alembic.ini`

**Files to create:**
- `backend/alembic/versions/<rev>_add_google_scan_fields_to_prospects.py`

**Files to modify:**
- `backend/app/models/prospect.py` — add:
  - `note_google: Mapped[float | None] = mapped_column(Float, nullable=True)` — Google Maps
    rating, 0-5 scale (distinct from the legacy `note_booking`, which stays 0-10/Booking-scale
    in name/intent even though unpopulated today).
  - `nb_avis_google: Mapped[int | None] = mapped_column(Integer, nullable=True)` — Google
    review count. (Note: `capacite_description` currently free-texts this as `"{n} avis
    Google"` — keep that column too for now, it's harmless, but the new integer column is what
    scoring will read.)
  - `telephone: Mapped[str | None] = mapped_column(String(50), nullable=True)` — international
    phone number, already fetched in `RealGoogleMapsProvider._fetch_details` and currently
    discarded in `enrich()`.
  - `business_status: Mapped[str | None] = mapped_column(String(30), nullable=True)` — Google's
    own status field (`OPERATIONAL` / `CLOSED_TEMPORARILY` / `CLOSED_PERMANENTLY`), confirmed
    present in the raw Places response during Section 2 testing but never mapped through.
- Do not touch/remove `nb_chambres`, `presence_booking`, `note_booking`, `presence_expedia`,
  `linkedin_contact` — see Guiding Principles.

**Tests to run before committing:**
- `cd backend && alembic upgrade head` runs cleanly.
- `cd backend && alembic downgrade -1` then `alembic upgrade head` again — confirms the
  migration reverses cleanly.
- `cd backend && pytest` — full suite green (new nullable columns must not break any existing
  fixture/test).

**Commit message:**
```
feat(db): add note_google, nb_avis_google, telephone, business_status to prospects
```

---

## Section 2 — Backend schemas

**Status:** Not started

**Goal:** Expose the 4 new fields through `ProspectCreate` / `ProspectUpdate` / `ProspectResponse`
/ `ScorePreviewRequest` / `ScorePreviewResponse`, without removing the legacy fields from the
same schemas (manual entry keeps the option).

**Files to read first:**
- `backend/app/schemas/prospect.py` (full file — this is the only file touched in this section)

**Files to modify:**
- `backend/app/schemas/prospect.py`:
  - `ProspectCreate` / `ProspectUpdate` / `ProspectResponse` — add `note_google: Optional[float]`,
    `nb_avis_google: Optional[int]`, `telephone: Optional[str]`, `business_status:
    Optional[str]`, alongside (not replacing) the existing legacy fields.
  - `ScorePreviewRequest` — add the same 4 fields so the live score-preview form (used by
    `AddProspectDialog`) can reflect the new formula before submission.
  - `ScorePreviewResponse` — no field changes needed (still returns the same 5 named
    breakdown scores + total — only what feeds into each score changes, not the response
    shape).

**Tests to run before committing:**
- `cd backend && pytest` — full suite green.
- `app/tests/test_prospects.py` in particular — confirms `ProspectCreate`/`ProspectResponse`
  still round-trip correctly with the added optional fields.

**Commit message:**
```
feat(schemas): add Google-sourced fields to prospect schemas
```

---

## Section 3 — Scoring engine rewrite

**Status:** Not started

**Goal:** Redefine the 5 CLAUDE.md §4 scoring categories (same names, same point totals:
25/25/20/15/15 = 100) around the fields that are actually reliably available, per the proposal
agreed in conversation on 2026-07-02.

**Files to read first:**
- `backend/app/services/scoring.py` (full file)
- `backend/app/tests/test_scoring.py` (existing test expectations — will need updates to match
  the new formula)

**Files to modify:**
- `backend/app/services/scoring.py`:
  - `_score_activite` (25 pts, was: website 8 + booking 7 + note>8.0 5 + expedia 5) → new:
    - website present: **10 pts**
    - `note_google` ≥ 4.5: **10 pts** / 4.0–4.49: **6 pts** / 3.5–3.99: **3 pts** / below or
      `None`: **0 pts**
    - `business_status == "OPERATIONAL"`: **5 pts** (treat `None`/missing as neutral-pass for
      manually-created prospects that never went through a scan — see note below)
  - `_score_coherence` (25 pts) — **unchanged**, already fully reliable (pure `pays` lookup).
  - `_score_taille` (20 pts, was: `nb_chambres` thresholds / `capacite_description` fallback /
    5 default) → new, based on `nb_avis_google`:
    - ≥ 300: **20 pts** / 100–299: **15 pts** / 30–99: **10 pts** / 10–29: **5 pts** / below
      10 or `None`: **0 pts**
  - `_score_contact` (15 pts, was: email 8 + linkedin 7) → new:
    - `email_contact` present: **10 pts**
    - `telephone` present: **5 pts**
  - `_score_liberte` (15 pts, was: booking/expedia count-based) → **kept as a flat 15** for now
    (no real signal available — see BACKEND_PHASE2_SCAN_PLAN.md Section 8's open decision).
    Document clearly in the docstring that this is a placeholder constant, not a real
    computation, pending a future decision on paid OTA enrichment.
  - **Manual-entry edge case:** for prospects created manually (not via scan) where
    `business_status` was never set, treat missing `business_status` as passing the check
    (award the 5 pts) rather than failing it — a human-vetted manual entry shouldn't be
    penalized for a field the Add-Prospect form doesn't ask about (see Section 9).

**Tests to run before committing:**
- `cd backend && pytest` — will require updating `app/tests/test_scoring.py`'s existing
  assertions to match the new sub-check values (the old tests assert booking/expedia/nb_chambres
  behavior that no longer exists in the formula).
- Manual: recompute the score for the real Fès/Marrakech prospects gathered during
  BACKEND_PHASE2_SCAN_PLAN.md testing using the new formula (by hand or a quick script) to sanity
  check the new spread looks reasonable (e.g. a well-reviewed, highly-rated riad with email+phone
  should now score meaningfully higher than a low-review, unrated one — unlike today's fixed
  58/66 split).

**Commit message:**
```
refactor(scoring): shift scoring formula to Google-sourced signals

CLAUDE.md §4 categories/weights unchanged (25/25/20/15/15). Sub-checks
redefined: activité digitale now uses Google rating + business_status
instead of Booking/Expedia; taille & capacité uses Google review count
instead of nb_chambres; contact décideur uses phone instead of LinkedIn.
Liberté OTA stays a flat 15 (documented placeholder) pending a future
decision on paid OTA enrichment.
```

---

## Section 4 — Real scan wiring: stop discarding Google data

**Status:** Not started

**Goal:** Make `RealEnrichmentService.enrich()` populate the 4 new fields instead of popping
them, using data `RealGoogleMapsProvider.search()` already fetches.

**Files to read first:**
- `backend/app/services/real_providers.py` (full file — `RealGoogleMapsProvider.search()` and
  `RealEnrichmentService.enrich()` specifically)

**Files to modify:**
- `backend/app/services/real_providers.py`:
  - `RealGoogleMapsProvider.search()` — add `"business_status"` to the requested field mask in
    `_fetch_details` (currently only `website,international_phone_number`) and include it in
    the raw dict returned per place (alongside existing `note_google`/`nb_avis_google`/`phone`).
  - `RealEnrichmentService.enrich()`:
    - Stop popping `phone` — map it to the new `telephone` output field instead.
    - Stop popping `note_google`/`nb_avis_google` — map them to the new `note_google` /
      `nb_avis_google` output fields (in addition to keeping the existing
      `capacite_description` free-text derived from `nb_avis_google`, unchanged).
    - Add `business_status` to the output dict, sourced from the raw dict.
    - Legacy fields (`nb_chambres`, `linkedin_contact`, `note_booking`, `presence_booking`,
      `presence_expedia`) stay exactly as they are today (`None`/`False`, per
      BACKEND_PHASE2_SCAN_PLAN.md Sections 8-9) — this section does not touch them.

**Tests to run before committing:**
- `cd backend && pytest app/tests/test_scan.py` — mocks unaffected (mock provider doesn't need
  these new fields; `MockEnrichmentService.enrich()` can optionally be extended to also populate
  fake values for dev-mode consistency, but is not required for tests to pass).
- Manual: re-run a live scan (Marrakech/hotel_riad) and confirm the new fields
  (`note_google`, `nb_avis_google`, `telephone`, `business_status`) are populated with real
  values in `enrich()`'s output — same style of verification used throughout
  BACKEND_PHASE2_SCAN_PLAN.md.

**Commit message:**
```
feat(scan): stop discarding Google rating/reviews/phone/status data

RealEnrichmentService.enrich() previously fetched note_google,
nb_avis_google, and phone via RealGoogleMapsProvider but discarded all
three. They're now mapped to new Prospect fields (Section 1) so the
revised scoring formula (Section 3) can use them. business_status
added to the Place Details field mask — confirmed present in Google's
response but previously unrequested.
```

---

## Section 5 — Scan pipeline insert wiring

**Status:** Not started

**Goal:** Wire the 4 new `enriched` dict keys into the `Prospect` row created in
`run_scan_pipeline`.

**Files to read first:**
- `backend/app/services/scan_pipeline.py` (full file — the `Prospect(...)` construction block)

**Files to modify:**
- `backend/app/services/scan_pipeline.py` — add `note_google=enriched.get("note_google")`,
  `nb_avis_google=enriched.get("nb_avis_google")`, `telephone=enriched.get("telephone")`,
  `business_status=enriched.get("business_status")` to the `Prospect(...)` constructor call,
  alongside the existing fields. No changes to scoring/dedup logic (unchanged from
  BACKEND_PHASE2_SCAN_PLAN.md Section 4).

**Tests to run before committing:**
- `cd backend && pytest app/tests/test_scan.py app/tests/test_prospects.py app/tests/test_scoring.py`
- Manual: full live scan → confirm inserted `Prospect` rows in the DB have the new columns
  populated (spot-check via the `/prospects` API response).

**Commit message:**
```
feat(scan): insert Google-sourced fields into new Prospect rows
```

---

## Section 6 — Frontend types + API mapping layer

**Status:** Not started

**Goal:** Add the 4 new fields to the frontend's type system and snake↔camel mapping layer,
matching the backend schema changes from Section 2.

**Files to read first:**
- `frontend/src/types/prospect.ts` (full file)
- `frontend/src/lib/api/types.ts` (the `RawProspect` type / equivalent)
- `frontend/src/lib/api/mappers.ts` (full file — `rawToProspect`, `prospectToCreate`,
  `prospectToUpdate`)

**Files to modify:**
- `frontend/src/types/prospect.ts` — add to the `Prospect` interface:
  `noteGoogle?: number`, `nbAvisGoogle?: number`, `telephone?: string`,
  `businessStatus?: string`. Keep `nbChambres`, `noteBooking`, `presenceBooking`,
  `presenceExpedia`, `linkedinContact` in the interface (legacy, still valid API fields — see
  Guiding Principles) but they'll no longer be rendered/edited on the primary surfaces
  (Sections 7-9).
- `frontend/src/lib/api/types.ts` — add `note_google: number | null`,
  `nb_avis_google: number | null`, `telephone: string | null`, `business_status: string | null`
  to the raw backend-shape type.
- `frontend/src/lib/api/mappers.ts`:
  - `rawToProspect` — map the 4 new snake_case fields to camelCase.
  - `prospectToCreate` / `prospectToUpdate` — pass the 4 new fields through symmetrically to
    how the legacy fields are handled today.

**Tests to run before committing:**
- `cd frontend && npm run build` (or `tsc --noEmit`) — confirms no type errors introduced.
- No automated frontend test suite exists in this repo (confirmed — Phase 1 doc doesn't
  reference one); rely on the build/typecheck plus manual verification in Sections 7-9.

**Commit message:**
```
feat(types): add Google-sourced fields to frontend Prospect type + mappers
```

---

## Section 7 — Prospection table: replace the "OTAs" column

**Status:** Not started

**Goal:** Replace `ProspectTable.tsx`'s "OTAs" column (currently shows Booking/Expedia presence,
always empty for real-scanned data) with a "Google" column showing rating + review count —
the signal that's actually populated.

**Files to read first:**
- `frontend/src/components/crm/ProspectTable.tsx` (full file — the `COLUMNS` array, header
  row, and the OTA `TableCell` block specifically)

**Files to modify:**
- `frontend/src/components/crm/ProspectTable.tsx`:
  - Replace the non-sortable "OTAs" header (in the `isAdmin ? [...] : [...]` header array) with
    "Google".
  - Replace the OTA presence `TableCell` (currently maps over
    `presenceBooking`/`presenceExpedia`) with a cell showing `★ {noteGoogle}` and
    `{nbAvisGoogle} avis` (French label, consistent with the rest of the UI), with a sensible
    "—" fallback when both are `null` (e.g. manually-created prospects that predate this
    change).
  - Score tooltip (`ScoreCell`'s breakdown, lines ~102-120) — labels stay the same (CLAUDE.md
    category names unchanged per Section 3), only the underlying values differ — no change
    needed here beyond what Section 3's backend change already produces.

**Tests to run before committing:**
- Manual: load `/prospection`, confirm the table renders the new "Google" column correctly for
  both real-scanned prospects (rating/reviews populated) and legacy/manual prospects (graceful
  "—" fallback).

**Commit message:**
```
feat(prospection): replace OTAs table column with Google rating/reviews
```

---

## Section 8 — Prospect drawer: replace OTA + capacité sections

**Status:** Not started

**Goal:** Update `ProspectDrawer.tsx`'s read-only view and edit form to show/edit the new
fields instead of the now-dead OTA/room-count/LinkedIn ones.

**Files to read first:**
- `frontend/src/components/crm/ProspectDrawer.tsx` (full file — this is a large file; focus on
  the "Présence OTA concurrentes" block, the "Capacité" `InfoRow`, the LinkedIn `InfoRow`, and
  the `EditProspectForm`/`EditForm`/`prospectToEditForm` sections)

**Files to modify:**
- `frontend/src/components/crm/ProspectDrawer.tsx`:
  - Read-only "Informations établissement" section — replace the "Présence OTA concurrentes"
    block (booking/expedia check icons) with a "Présence Google Maps" block showing rating,
    review count, and `business_status` (e.g. a small chip: "Actif" for `OPERATIONAL`, warning
    styling for `CLOSED_TEMPORARILY`/`CLOSED_PERMANENTLY`, neutral/hidden if `null`).
  - Read-only "Capacité" `InfoRow` (currently `nb_chambres` + `capacite_description`) — keep
    `capacite_description` (still populated, still useful as free text) but drop the
    `nb_chambres` half of the conditional/label since it's permanently `None` for scanned
    prospects; a manually-entered prospect that does set `nb_chambres` can still show it if
    present (don't hide legitimate manual data, just stop presenting it as expected).
  - Read-only Contact section — add a phone `InfoRow` (new `PhoneOutlinedIcon` or similar,
    `tel:` href) below the email row. Keep the LinkedIn `InfoRow` (it's conditional on
    `linkedinContact` being set — harmless to leave for the rare manually-entered case, just
    won't render for scanned prospects since it's always `null`).
  - `EditForm` interface / `prospectToEditForm` / `EditProspectForm` component — add
    `telephone` as an editable field (Contact section) and `noteGoogle`/`nbAvisGoogle` as
    editable fields (Établissement section, replacing/alongside the existing
    `nbChambres`/`noteBooking` inputs — keep the legacy inputs present but clearly not the
    primary/default fields, per Guiding Principles).
  - `handleSaveEdit`'s `prospectsApi.update(...)` payload — add the 3 new editable fields.

**Tests to run before committing:**
- Manual: open the drawer for a real scanned prospect, confirm Google rating/reviews/status/
  phone display correctly; open Edit mode, confirm the new fields are editable and save
  correctly via `PUT /prospects/{id}`.

**Commit message:**
```
feat(prospection): show Google rating/reviews/status/phone in prospect drawer
```

---

## Section 9 — Add-prospect form + live score preview

**Status:** Not started

**Goal:** Update the manual "Add Prospect" dialog's form fields and score-preview payload to
match the new scoring formula, so the live preview shown while typing reflects reality.

**Files to read first:**
- `frontend/src/components/crm/AddProspectDialog.tsx` (full file — the form state, the
  `presenceBooking`/`noteBooking`/`presenceExpedia`/`nbChambres`/`linkedinContact` fields
  specifically, and wherever `score-preview` is called)

**Files to modify:**
- `frontend/src/components/crm/AddProspectDialog.tsx`:
  - Form state — add `noteGoogle`, `nbAvisGoogle`, `telephone` fields alongside the existing
    ones (don't remove the legacy inputs outright — a Commercial manually adding a known
    partner may still have real Booking/Expedia/LinkedIn/room-count info worth recording — but
    de-emphasize them visually, e.g. move under a collapsed "Informations complémentaires
    (optionnel)" section, with the new Google fields promoted to the primary/visible form).
  - `score-preview` request payload — include the 4 new fields so the live-updating score
    shown to the Commercial while filling the form matches Section 3's actual formula.
  - Submission payload (`prospectsApi.create(...)`) — include the 4 new fields.

**Tests to run before committing:**
- Manual: open "Ajouter un prospect", fill in a Google rating/review count/phone, confirm the
  live score preview updates using the new formula (compare against Section 3's manual hand-
  calculation); submit and confirm the created prospect's stored scores match.

**Commit message:**
```
feat(prospection): add Google fields to manual add-prospect form + score preview
```

---

## Open items not covered by this plan

- **Liberté OTA (15 pts)** stays a flat placeholder — no real signal source identified. Revisit
  only if BACKEND_PHASE2_SCAN_PLAN.md Section 8's deferred decision (paid OTA actor vs. drop
  from scoring) is made.
- **No retroactive rescoring** of prospects created before this change — their stored
  `score_*` values are untouched. A future bulk "rescan"/"rescore" admin action is out of scope
  here.
- **CLAUDE.md §4 itself is not edited by this plan** — the document still describes the
  original Booking/LinkedIn/room-count-based sub-checks. Whether to update CLAUDE.md's
  canonical text to match this implementation is a separate decision for whoever owns that
  document.

---

*Scoring Logic Shift Plan — 2026-07-02*
*Bab Morocco BD Intelligence Platform*
