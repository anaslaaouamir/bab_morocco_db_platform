# IMPLEMENTATION PLAN — Bab Morocco BD Intelligence Platform
# Batch 7 — Feature Improvements & Migrations
> Created: 2026-06-29 | Status: In Progress

---

## ⚠️ EXECUTION RULES (STRICTLY ENFORCED)

These rules apply to every task in this file, without exception:

1. **Read before you write** — Always review the existing code in the relevant file(s) before making any change. Never modify a file you haven't read in the current session.
2. **Test everything** — After completing any task, manually test the frontend (and backend if applicable) to confirm the feature works correctly. Check the golden path AND edge cases.
3. **Commit changes** — After verifying a task works, commit all related changes to Git with a clear, descriptive commit message.
4. **Update status** — Mark the task as done (`- [x]`) in this file immediately after committing. This file is the source of truth.

---

## PROJECT CONTEXT

### Platform
**Bab Morocco BD Intelligence Platform** — an internal B2B business development tool for Bab Morocco, a 100%-Morocco OTA (Online Travel Agency) currently in active development.

### Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 + TypeScript + MUI v6 (Material Design 3) |
| Backend API | Python FastAPI + PostgreSQL 16 |
| AI Agent | LangGraph + Claude Sonnet 4.6 (Anthropic) |
| Fonts (current) | Roboto via `@fontsource/roboto` |
| State | React `useState`/`useCallback`/`useMemo` (no Redux) |
| Nav | MD3 Navigation Rail (desktop ≥840px) + Navigation Bar (mobile) |

### Key File Map
```
frontend/src/
├── app/
│   ├── layout.tsx                          ← Root layout, font imports
│   ├── page.tsx                            ← Dashboard
│   ├── prospection/page.tsx                ← CRM table + Kanban + FilterBar
│   ├── outreach/page.tsx                   ← Outreach sequences (2-panel)
│   ├── negociation/page.tsx                ← Negotiation page
│   ├── contrats/page.tsx                   ← Contracts page
│   └── globals.css                         ← Global styles (no font refs currently)
├── components/
│   ├── nav/
│   │   ├── AppShell.tsx                    ← Navigation shell (Rail + Bar)
│   │   └── navItems.ts                     ← Nav link definitions
│   ├── kanban/
│   │   └── KanbanBoard.tsx                 ← Kanban board + column config (COLUMNS array)
│   ├── crm/
│   │   ├── ProspectTable.tsx               ← CRM data table
│   │   ├── ScanProspectDialog.tsx          ← Automatic scan dialog
│   │   ├── ProspectionModeDialog.tsx       ← Mode selector dialog
│   │   ├── AddProspectDialog.tsx           ← Manual add dialog
│   │   └── ProspectDrawer.tsx              ← Prospect detail drawer
│   ├── contracts/
│   │   └── ContractGenerateDialog.tsx      ← Contract generation workflow dialog
│   ├── shared/
│   │   ├── FilterBar.tsx                   ← Shared filter bar (type/stage/score/marché)
│   │   └── ConfirmationDialog.tsx          ← Generic confirm dialog
│   └── ThemeRegistry.tsx                   ← MUI ThemeProvider + Emotion SSR
├── lib/
│   ├── theme.ts                            ← MUI theme (fontFamily: '"Roboto", sans-serif' on line 78)
│   ├── api.ts                              ← All API calls (scanApi, prospectsApi, etc.)
│   ├── filters.ts                          ← FilterState type, EMPTY_FILTERS, helpers
│   └── constants/
│       └── geography.ts                    ← COUNTRIES_BY_MARKET, CITIES_BY_COUNTRY
├── types/
│   └── prospect.ts                         ← Prospect type, PipelineStage, PartnerType, labels/helpers
└── contexts/
    └── SnackbarContext.tsx                 ← Global snackbar/toast context
```

### Core Types (from `types/prospect.ts`)
```typescript
type PipelineStage = "prospection" | "qualification" | "outreach" | "negociation" | "closing" | "activation_ota" | "veille" | "perdu";
type PartnerType = "hotel_riad" | "hotel_luxe" | "tour_operateur" | "agence_voyage" | "prestataire_activites" | "transport" | "to_golfe" | "mice";
```

### Filter State (from `lib/filters.ts`)
```typescript
interface FilterState {
  search: string;
  types: PartnerType[];
  stages: PipelineStage[];
  scoreMin: 75 | 85 | null;
  marches: string[];
}
```

---

## TASKS

---

## Task 1 — Pipeline Kanban: Separate "Veille" and "Perdu"

**Status:** `- [x]` ✅ Completed 2026-06-29

### Context
In `frontend/src/components/kanban/KanbanBoard.tsx`, the `COLUMNS` array (line 45–53) has a single entry:
```typescript
{ id: "veille_perdu", label: "Veille / Perdu", stages: ["veille", "perdu"], accent: "#BDBDBD", targetStage: "veille" },
```
Both `veille` and `perdu` prospects are grouped in the same column. Additionally, there is no way to drag a card directly to "Perdu" since `targetStage` is `"veille"`. The `KanbanMobileList` component (line 341+) also iterates `COLUMNS`, so it will automatically reflect the split.

### Plan

- [x] **1.1** Read `frontend/src/components/kanban/KanbanBoard.tsx` in full.
- [x] **1.2** In the `COLUMNS` array, replaced the single `veille_perdu` entry with two separate entries:
  - `"veille"` — label `"Veille"`, accent `"#BDBDBD"` (neutral gray), `targetStage: "veille"`
  - `"perdu"` — label `"Perdu"`, accent `"#EF5350"` (red), `targetStage: "perdu"`
- [x] **1.3** Build passes clean across all routes. Mobile list auto-reflects split (iterates COLUMNS).
- [x] **1.4** Each column has its own `targetStage` — drag to Veille → `"veille"`, drag to Perdu → `"perdu"`.
- [x] **1.5** Build verified clean. Committed: `feat(kanban): separate Veille and Perdu into distinct columns`

### Files
- `frontend/src/components/kanban/KanbanBoard.tsx`

### Impact
Low. Single constant change, one file. No backend changes. The `FilterBar` already treats `veille` and `perdu` as separate stages (line 54–56 of `FilterBar.tsx`).

---

## Task 2 — Export Option for Prospects (PDF / Excel with Filters)

**Status:** `- [x]` ✅ Completed 2026-06-29

### Context
There is currently no export feature anywhere in the codebase. The prospection page (`frontend/src/app/prospection/page.tsx`) holds the filtered list of prospects and already uses `FilterBar`. The `FilterState` type is clean and reusable. Export will be **client-side only** using two npm packages:
- `xlsx` (SheetJS) — for Excel `.xlsx` export
- `jspdf` + `jspdf-autotable` — for PDF export

### Plan

- [x] **2.1** Installed `xlsx`, `jspdf`, `jspdf-autotable` via npm.
- [x] **2.2** Read `frontend/src/app/prospection/page.tsx` — confirmed `filters` state, `allProspects`, `filteredProspects`.
- [x] **2.3** Read `frontend/src/lib/filters.ts` — confirmed `FilterState`, `applyFilters`, `toggleItem`.
- [x] **2.4** Created `frontend/src/components/crm/ExportDialog.tsx` with:
  - `ToggleButtonGroup` for Excel / PDF format selection.
  - Chip-based filter sections for type, stage, marché, and score minimum.
  - Live "X / N prospects inclus" preview count (recalculates on every filter change).
  - Dynamic import of `xlsx` / `jspdf` / `jspdf-autotable` to keep initial bundle small.
  - PDF output: landscape A4 with header (title + date) + purple-themed autoTable.
  - Excel output: auto column widths via `wch` metadata.
- [x] **2.5** Added "Exporter" button (outlined, `FileDownloadOutlinedIcon`) to prospection page header row beside title.
- [x] **2.6** `ExportDialog` opened with `allProspects` and `initialFilters` (current page filter state pre-fills the dialog).
- [x] **2.7** Excel export: `XLSX.utils.json_to_sheet` → `XLSX.writeFile` triggers browser download.
- [x] **2.8** PDF export: `jspdf` + `autoTable` with A4 landscape, header row, alternating row colors.
- [x] **2.9** Build clean across all 9 routes. `/prospection` now 66.2 kB (xlsx/jspdf loaded dynamically, not in initial bundle).
- [x] **2.10** Committed: `feat(export): add PDF and Excel export dialog with filter options`

### Export Columns (French labels)
| Field | Label |
|-------|-------|
| `nom` | Nom |
| `type` | Type de partenaire |
| `ville` | Ville |
| `pays` | Pays |
| `emailContact` | Email |
| `nomContact` | Contact |
| `stage` | Étape pipeline |
| `commissionStandard` | Commission (%) |
| `scoreTotal` | Score /100 |
| `langue` | Langue |
| `dateAjout` | Date d'ajout |

### Files
- `frontend/src/components/crm/ExportDialog.tsx` (new)
- `frontend/src/app/prospection/page.tsx`
- `frontend/src/lib/export.ts` (new utility, optional)
- `frontend/package.json` (new deps)

### Impact
Medium. No backend changes. New npm packages add ~400KB to bundle (xlsx is large — consider dynamic import). No existing code modified except `prospection/page.tsx` to add the button and dialog.

---

## Task 3 — Automatic Scan: Multi-select Partner Type

**Status:** `- [x]` ✅ Completed 2026-06-29

### Context
In `frontend/src/components/crm/ScanProspectDialog.tsx`:
- `form.type` is currently `PartnerType | ""` (single select, line 72).
- The `TYPE_QUERY` map (line 41–50) translates each `PartnerType` to a Google Maps keyword string, e.g. `hotel_riad → "hôtels riads"`.
- `scanApi.start()` accepts one `typePartenaire` at a time.

**Google Maps API behaviour:** The current integration uses the Places Text Search API with a free-text `query` (e.g., `"hôtels riads Marrakech Maroc"`). This API does **not** natively support multi-type queries in a single call. Therefore, multi-type selection requires **one API call per type**, run sequentially.

**Mock data:** The backend mock presumably returns results based on the type string. For multiple types, multiple jobs are launched sequentially, results merged in the UI.

### Plan

- [x] **3.1** Read `frontend/src/components/crm/ScanProspectDialog.tsx` in full.
- [x] **3.2** Read `frontend/src/lib/api/index.ts` — confirmed `scanApi.start()` takes one `typePartenaire`. No backend change needed.
- [x] **3.3** Updated `ScanForm`: `type: PartnerType | ""` → `types: PartnerType[]`. `INITIAL` uses `types: []`.
- [x] **3.4** Replaced single `Select` with `Autocomplete multiple` + `disableCloseOnSelect`, checkbox renderOption, chip renderTags.
- [x] **3.5** Validation updated: `types.length === 0` triggers error.
- [x] **3.6** Query preview joins all selected type queries with " + ".
- [x] **3.7** Multi-job handled via `typeQueue` + `typeQueueIndex` + `accumulated` state. The polling
  `useEffect` accumulates results and launches the next job in-queue when current job finishes.
  Progress panel shows "Scan X / N — [Type Label]". Results show accumulated totals.
- [x] **3.8** `INITIAL` updated: `types: []`. Reset in dialog-open `useEffect`.
- [x] **3.9** Build clean. `/prospection` +2KB (Checkbox + ListItemText). Single-type use fully backward compatible.
- [x] **3.10** Committed: `feat(scan): convert partner type to multi-select with sequential jobs`

### Files
- `frontend/src/components/crm/ScanProspectDialog.tsx`

### Impact
Medium. Only `ScanProspectDialog.tsx` is modified. The `scanApi.start()` call signature does not change (still called once per type). No backend changes. The key complexity is the sequential multi-job state management.

---

## Task 4 — Scheduled Scan: Settings Page & Throttling

**Status:** `- [x]` ✅ Completed 2026-06-29

### Context
Currently, all scans run immediately in the background. There is no settings page and no `/settings` route. The `AppShell.tsx` navigation rail/bar is driven by `navItems.ts` (5 items currently: Dashboard, Prospection, Outreach, Négociation, Contrats).

The **settings** feature needs:
1. A new `/settings` page with a "Scan planifié" toggle + time window config.
2. A settings persistence layer (initially `localStorage`, no backend required).
3. Modified scan launch logic in `ScanProspectDialog.tsx`: when scheduled mode is ON, instead of launching immediately, defer the scan to run within the configured time window, split into batches.

**Scheduling logic (client-side):**
- User configures: window start (default 01:00), window end (default 05:00) → 4 hours = 240 minutes.
- If 100 prospects requested with 1 type: 1 call per batch of 20 → 5 batches spaced 48 minutes apart.
- If 100 prospects with 3 types: 3 × 5 = 15 batches, spaced equally across the 4-hour window.
- Scheduling uses `setTimeout` calculated from "time until window start" + "batch index × interval".
- A scheduled scan is stored in `localStorage` so it persists across tab refreshes. On page load, pending scheduled scans are checked and resumed if within window.

### Plan

- [ ] **4.1** Read `frontend/src/components/nav/navItems.ts` and `AppShell.tsx`.
- [ ] **4.2** Create a settings context/hook `frontend/src/lib/settingsStore.ts`:
  ```typescript
  interface ScheduledScanSettings {
    enabled: boolean;
    windowStartHour: number;   // default 1
    windowEndHour: number;     // default 5
    batchSize: number;         // default 20
  }
  ```
  - `getSettings()` and `saveSettings()` backed by `localStorage`.
  - Export a React hook `useSettings()` for reactive access.
- [ ] **4.3** Create `frontend/src/app/settings/page.tsx`:
  - Page title: "Paramètres" with `SettingsRoundedIcon`.
  - Section: **"Scan planifié"** with:
    - Toggle switch (MUI `Switch`) — Activé / Désactivé. When OFF, scans run immediately (current behavior).
    - When ON, show additional fields:
      - Time window start (hour picker, default 01:00).
      - Time window end (hour picker, default 05:00).
      - Batch size slider (10–50, default 20 prospects per batch).
    - Info alert explaining the feature: "Lorsqu'activé, les scans sont fractionnés et planifiés pendant la fenêtre horaire configurée pour éviter la surcharge des serveurs."
  - Save button applies changes to `localStorage`.
- [ ] **4.4** Add "Paramètres" to `frontend/src/components/nav/navItems.ts`:
  - `href: "/settings"`, icons: `SettingsRoundedIcon` / `SettingsOutlinedIcon`.
  - Add to the bottom of the nav list.
- [ ] **4.5** Read `frontend/src/components/crm/ScanProspectDialog.tsx`.
- [ ] **4.6** In `handleLaunch` of `ScanProspectDialog.tsx`, check `useSettings()`:
  - If `settings.scheduledScan.enabled === false`: run immediately (current behavior, no change).
  - If `enabled === true`:
    - Calculate the next occurrence of the configured time window (e.g., tonight 01:00–05:00, or the next available window).
    - Split the total scan work into batches: `Math.ceil(limite / batchSize)` batches per type, spaced evenly across the window duration.
    - Store the scheduled jobs in `localStorage` as a queue: `{ type, ville, pays, limite: batchSize, scheduledAt: ISO string }[]`.
    - Close the dialog and show a Snackbar: "Scan planifié — X batches seront exécutés entre 01:00 et 05:00."
    - Do NOT show the scan progress panel.
  - On app startup (`layout.tsx` or `AppShell.tsx` effect), check `localStorage` for pending scheduled jobs, and if the current time is within a window, start executing them.
- [ ] **4.7** Show a badge/indicator in the nav or dashboard when scheduled jobs are pending (optional enhancement).
- [ ] **4.8** Test: toggle settings ON, launch a scan, verify the deferred snackbar appears and no immediate progress panel. Toggle OFF, verify immediate scan still works.
- [ ] **4.9** Test the scheduled execution by temporarily setting the window to "current hour" to verify it fires.
- [ ] **4.10** Commit.

### Files
- `frontend/src/app/settings/page.tsx` (new)
- `frontend/src/lib/settingsStore.ts` (new)
- `frontend/src/components/nav/navItems.ts`
- `frontend/src/components/nav/AppShell.tsx` (minor — nav may auto-adapt via navItems)
- `frontend/src/components/crm/ScanProspectDialog.tsx`
- `frontend/src/app/layout.tsx` (optional — startup check for pending jobs)

### Impact
Medium-Hard. The settings page and store are new, self-contained files. The scan dialog modification adds a conditional branch. The scheduling logic is the most complex part. Note: purely client-side scheduling means the browser tab must be open during the window — this is acceptable for the current phase and should be documented in the UI.

---

## Task 5 — Outreach Page: Tab Filter by Step (J0, J+3, J+7, J+30)

**Status:** `- [x]` ✅ Completed 2026-06-29

### Context
The `frontend/src/app/outreach/page.tsx` left panel renders a flat list of all prospects in the `outreach` stage. The `emailsCache` state maps `prospectId → RawOutreachEmail[]`. Each email has a `sequence_step` field (`"j0" | "j3" | "j7" | "j30"`).

The existing `StepSelector` component is inside the **right-side email composer** (per-prospect). The new tabs should filter the **left prospect list** by which step is currently active/actionable for each prospect.

The `SEQ_CONFIG` constant already maps step keys to labels:
```typescript
const SEQ_CONFIG = [
  { key: "j0",  label: "J0",   ... },
  { key: "j3",  label: "J+3",  ... },
  { key: "j7",  label: "J+7",  ... },
  { key: "j30", label: "J+30", ... },
];
```

### Plan

- [x] **5.1** Read `frontend/src/app/outreach/page.tsx` in full.
- [x] **5.2** Added `stepFilter` state (default `"all"`) to `OutreachPage`.
- [x] **5.3** Added MUI `Tabs` above the left panel: "Tous (N)" + one tab per SEQ_CONFIG step.
  Count badges rendered inline in each tab label with dynamic color (active = primary, inactive = action.selected).
- [x] **5.4** Added `filteredProspects` memo — filters by `emailsCache[p.id]` having a matching `sequence_step`.
- [x] **5.5** Added `stepCounts` memo — iterates prospects × emailsCache to count per step.
- [x] **5.6** Left panel now renders `filteredProspects.map(...)` with an empty state for "no prospects at this step".
- [x] **5.7** Added `useEffect` to reset `selectedId` when filtered prospect list no longer includes it.
- [x] **5.8** Build clean (`/outreach` +360B). All 6 routes pass.
- [x] **5.9** Committed: `feat(outreach): add tab filter by sequence step (J0/J+3/J+7/J+30)`

### Files
- `frontend/src/app/outreach/page.tsx`

### Impact
Easy-Medium. Self-contained change to one file. All data is already loaded in `emailsCache`. No backend changes. No existing component logic changes.

---

## Task 6 — Editable Contract Dialog

**Status:** `- [x]` ✅ Completed 2026-06-29

### Context
In `frontend/src/components/contracts/ContractGenerateDialog.tsx`:
- The `DraftPanel` (line 119–236) shows: a partner summary grid, estimated value field, and a **static read-only checklist** of 9 clause names with green checkmarks.
- The `GeneratedPanel` (line 238–315) shows read-only `ClauseAccordion` components with the AI-generated clause text (`contract.clauses` of type `RawContractClauses`).
- Currently, the user sees the clause names but cannot edit their content before PDF generation.

The `CLAUSE_LABELS` map defines all 10 keys:
```typescript
const CLAUSE_LABELS: Record<keyof RawContractClauses, string> = {
  parties, objet, commission_clause, obligations_bab, obligations_partner,
  duree_clause, confidentialite, rgpd_clause, juridiction, post_signature_note
};
```

The goal: in the `DraftPanel`, replace the static checklist with **editable TextFields** so the user can customize clause content before clicking "Générer le PDF". The edited content is passed to the generate API call.

### Plan

- [x] **6.1** Read `frontend/src/components/contracts/ContractGenerateDialog.tsx` in full.
- [x] **6.2** Read `frontend/src/lib/api/index.ts` — `contractsApi.generate()` was `(contractId: string)` with no body.
- [x] **6.3** Added `localClauses` state to `DraftPanel`:
  `const [localClauses, setLocalClauses] = useState<Partial<Record<keyof RawContractClauses, string>>>({})`.
  Empty string = AI generates. Non-empty = user override.
- [x] **6.4** Replaced static 9-clause checklist with editable accordion section:
  - Each clause has a clickable header (label + expand icon) with a `CheckCircle` icon when filled, `AutoAwesome` (AI) when empty.
  - Header border turns `primary.main` when clause has content.
  - Body: `TextField multiline` (3–8 rows), placeholder "Laissez vide pour laisser l'IA générer automatiquement…"
  - Counter chip: "X / 10 personnalisées" or "Toutes générées par l'IA"
- [x] **6.5** `handleGenerate` updated to accept `overrides: Partial<Record<keyof RawContractClauses, string>>`.
  `contractsApi.generate()` updated to send `{ clause_overrides }` in the POST body when non-empty.
  Backend fully supports overrides: `generate_pdf()` merges non-blank user values over AI output.
- [x] **6.6** "Générer le PDF" button remains disabled when `human_review_required`. No change needed.
- [x] **6.7** Build clean. `/contrats` +0.4 kB (accordion replaces static list). All 9 routes pass.
- [x] **6.8** Committed: `feat(contracts): make contract clauses editable before PDF generation`

### Files
- `frontend/src/components/contracts/ContractGenerateDialog.tsx`
- `frontend/src/lib/api.ts` (potentially, if `generate()` needs clause override support)

### Impact
Medium. The dialog already has the `ClauseAccordion` pattern in `GeneratedPanel` — reuse it with an edit mode in `DraftPanel`. The backend `generate` endpoint may need a minor update to accept optional `clause_overrides`. If not updated yet, the feature degrades gracefully (user can still generate with AI content; custom text is shown as a comparison).

---

## Task 7 — Font Migration: Roboto → Google Sans

**Status:** `- [x]` ✅ Completed 2026-06-29

### Context
Current font setup (3 touch points):
1. **`frontend/src/app/layout.tsx` (lines 2–5):** Imports `@fontsource/roboto` CSS for weights 300, 400, 500, 700.
2. **`frontend/src/lib/theme.ts` (line 78):** `fontFamily: '"Roboto", sans-serif'`.
3. **`frontend/package.json`:** `"@fontsource/roboto": "^5.2.10"` as a dependency.

**Google Sans** is a Google proprietary typeface available on Google Fonts (URL: https://fonts.google.com/specimen/Google+Sans). The package name in Next.js `next/font/google` is `Google_Sans`.

**Approach:** Use Next.js `next/font/google` for optimal performance (automatic subsetting, self-hosting, no FOUT). This avoids external CDN requests and respects privacy.

The `frontend/src/app/fonts/` directory already exists (contains `GeistVF.woff`, `GeistMonoVF.woff`), confirming the project supports custom font assets.

### Plan

- [x] **7.1** Read `frontend/src/app/layout.tsx` in full.
- [x] **7.2** Read `frontend/src/lib/theme.ts` in full (to confirm line 78 and full `fontFamily` usage).
- [x] **7.3** Read `frontend/src/app/globals.css` (confirm no Roboto references).
- [ ] **7.4** In `frontend/src/app/layout.tsx`:
  - Remove the 4 `@fontsource/roboto` import lines.
  - Add `next/font/google` import and configure Google Sans:
    ```typescript
    import { Google_Sans } from "next/font/google";
    const googleSans = Google_Sans({
      subsets: ["latin"],
      weight: ["300", "400", "500", "700"],
      variable: "--font-google-sans",
      display: "swap",
    });
    ```
  - Add `className={googleSans.variable}` to the `<html>` element.
- [x] **7.5** In `frontend/src/lib/theme.ts` (line 78):
  - Change:
    ```typescript
    fontFamily: '"Roboto", sans-serif',
    ```
    to:
    ```typescript
    fontFamily: '"Google Sans", var(--font-google-sans), "Roboto", sans-serif',
    ```
    (Roboto retained as fallback in case the variable is not injected in some context.)
- [x] **7.6** In `frontend/src/app/globals.css`, add a fallback CSS custom property:
  ```css
  :root {
    --font-google-sans: "Google Sans", sans-serif;
  }
  ```
- [x] **7.7** Uninstall `@fontsource/roboto`:
  ```bash
  cd frontend && npm uninstall @fontsource/roboto
  ```
- [x] **7.8** Used CDN fallback (as documented in the Note): `next/font/google` does not carry "Google Sans"
  in its font list. Added `<link>` preconnect + stylesheet tags directly in `layout.tsx <head>` block.
  Build verified clean. Dev server confirmed Google Fonts link present in rendered HTML.
- [x] **7.9** Verified no remaining `@fontsource/roboto` imports in source. Roboto remains only as
  a CSS fallback in `theme.ts`. Build output clean across all 6 routes.
- [x] **7.10** Committed: `feat(theme): migrate font from Roboto to Google Sans`

### Files
- `frontend/src/app/layout.tsx`
- `frontend/src/lib/theme.ts`
- `frontend/src/app/globals.css`
- `frontend/package.json` (remove `@fontsource/roboto`)

### Impact
Easy. Three files touched. The `next/font/google` approach is the recommended Next.js 14 pattern. Main risk: the exact export name from `next/font/google` for "Google Sans" — verify before implementing. Fallback (CDN `<link>`) is always available. No component logic changes. Visual-only change, no functional impact.

---

## EXECUTION ORDER

The recommended order to minimize inter-task risk:

| Order | Task | Reason |
|-------|------|--------|
| 1st | Task 7 — Font | Purely visual, no logic, sets foundation |
| 2nd | Task 1 — Kanban split | Trivially small, builds confidence |
| 3rd | Task 5 — Outreach tabs | Self-contained, single file |
| 4th | Task 3 — Scan multi-select | Medium complexity, single file |
| 5th | Task 2 — Export dialog | New file, medium complexity |
| 6th | Task 6 — Editable contracts | Medium, dialog refactor |
| 7th | Task 4 — Settings + scheduled scan | Most complex, depends on scan dialog (Task 3) |

---

## COMMIT CONVENTION

Use the following commit message format:
```
feat(scope): description of change

- Detail 1
- Detail 2

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Examples:
- `feat(kanban): separate Veille and Perdu into distinct columns`
- `feat(export): add PDF and Excel export with filter options`
- `feat(scan): convert partner type to multi-select with sequential jobs`
- `feat(settings): add scheduled scan settings page and throttled batch logic`
- `feat(outreach): add tab filter by sequence step (J0/J+3/J+7/J+30)`
- `feat(contracts): make contract clauses editable before PDF generation`
- `feat(theme): migrate font from Roboto to Google Sans`

---

## PROGRESS SUMMARY

| Task | Description | Status |
|------|-------------|--------|
| T1 | Kanban — Veille/Perdu separation | ✅ Done |
| T2 | Export — PDF/Excel with filters | ✅ Done |
| T3 | Scan — Multi-select partner type | ✅ Done |
| T4 | Settings — Scheduled scan | ✅ Done |
| T5 | Outreach — Step tab filter | ✅ Done |
| T6 | Contracts — Editable clauses | ✅ Done |
| T7 | Font — Roboto → Google Sans | ✅ Done |

---

*Last updated: 2026-06-29*
*Source of truth for all Batch 7 implementation work.*
