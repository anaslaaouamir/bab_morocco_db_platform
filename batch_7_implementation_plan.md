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

**Status:** `- [ ]`

### Context
In `frontend/src/components/kanban/KanbanBoard.tsx`, the `COLUMNS` array (line 45–53) has a single entry:
```typescript
{ id: "veille_perdu", label: "Veille / Perdu", stages: ["veille", "perdu"], accent: "#BDBDBD", targetStage: "veille" },
```
Both `veille` and `perdu` prospects are grouped in the same column. Additionally, there is no way to drag a card directly to "Perdu" since `targetStage` is `"veille"`. The `KanbanMobileList` component (line 341+) also iterates `COLUMNS`, so it will automatically reflect the split.

### Plan

- [ ] **1.1** Read `frontend/src/components/kanban/KanbanBoard.tsx` in full.
- [ ] **1.2** In the `COLUMNS` array, replace the single `veille_perdu` entry with two separate entries:
  - `"veille"` — label `"Veille"`, accent `"#BDBDBD"` (neutral gray), `targetStage: "veille"`
  - `"perdu"` — label `"Perdu"`, accent `"#EF5350"` (red), `targetStage: "perdu"`
- [ ] **1.3** Verify both columns render correctly on desktop (drag-and-drop board) and mobile (collapsible list).
- [ ] **1.4** Verify that dragging a card to "Veille" sets stage to `"veille"` and dragging to "Perdu" sets stage to `"perdu"`.
- [ ] **1.5** Test frontend. Commit.

### Files
- `frontend/src/components/kanban/KanbanBoard.tsx`

### Impact
Low. Single constant change, one file. No backend changes. The `FilterBar` already treats `veille` and `perdu` as separate stages (line 54–56 of `FilterBar.tsx`).

---

## Task 2 — Export Option for Prospects (PDF / Excel with Filters)

**Status:** `- [ ]`

### Context
There is currently no export feature anywhere in the codebase. The prospection page (`frontend/src/app/prospection/page.tsx`) holds the filtered list of prospects and already uses `FilterBar`. The `FilterState` type is clean and reusable. Export will be **client-side only** using two npm packages:
- `xlsx` (SheetJS) — for Excel `.xlsx` export
- `jspdf` + `jspdf-autotable` — for PDF export

### Plan

- [ ] **2.1** Install npm packages:
  ```bash
  cd frontend && npm install xlsx jspdf jspdf-autotable
  ```
- [ ] **2.2** Read `frontend/src/app/prospection/page.tsx` to understand how `FilterBar`, `FilterState`, and the prospect list are wired together.
- [ ] **2.3** Read `frontend/src/components/shared/FilterBar.tsx` to understand the filter chips and `FilterState` structure.
- [ ] **2.4** Create `frontend/src/components/crm/ExportDialog.tsx` with:
  - **Format selector** — PDF or Excel (MUI `ToggleButtonGroup` or radio buttons).
  - **Filter section** — embed the same filter chip groups as `FilterBar` (type, stage, score, marché + search field), backed by a local `FilterState` copy initialized from the current active filters passed as a prop.
  - **Result preview** — show "X prospects will be exported" based on the applied filters.
  - **"Télécharger" button** — triggers the export and closes the dialog.
- [ ] **2.5** Add an "Exporter" button (`FileDownloadRoundedIcon`) in the prospection page toolbar (next to the existing FAB or in the FilterBar trigger row).
- [ ] **2.6** Wire the button to open `ExportDialog`, passing the current `FilterState` and the full `prospects` array.
- [ ] **2.7** Implement Excel export logic (in the dialog or a `lib/export.ts` utility):
  - Apply selected filters to the prospects array.
  - Map each prospect to a flat row object with French column headers.
  - Generate and trigger download using `xlsx.utils.json_to_sheet` + `xlsx.writeFile`.
- [ ] **2.8** Implement PDF export logic:
  - Apply selected filters.
  - Use `jspdf` + `autoTable` to generate a table with the same columns.
  - Include a header with "Bab Morocco — Export Prospects" + date.
  - Trigger download.
- [ ] **2.9** Test both PDF and Excel exports with active and empty filters.
- [ ] **2.10** Commit.

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

**Status:** `- [ ]`

### Context
In `frontend/src/components/crm/ScanProspectDialog.tsx`:
- `form.type` is currently `PartnerType | ""` (single select, line 72).
- The `TYPE_QUERY` map (line 41–50) translates each `PartnerType` to a Google Maps keyword string, e.g. `hotel_riad → "hôtels riads"`.
- `scanApi.start()` accepts one `typePartenaire` at a time.

**Google Maps API behaviour:** The current integration uses the Places Text Search API with a free-text `query` (e.g., `"hôtels riads Marrakech Maroc"`). This API does **not** natively support multi-type queries in a single call. Therefore, multi-type selection requires **one API call per type**, run sequentially.

**Mock data:** The backend mock presumably returns results based on the type string. For multiple types, multiple jobs are launched sequentially, results merged in the UI.

### Plan

- [ ] **3.1** Read `frontend/src/components/crm/ScanProspectDialog.tsx` in full.
- [ ] **3.2** Read `frontend/src/lib/api.ts` to understand `scanApi.start()` signature.
- [ ] **3.3** Update `ScanForm` type:
  ```typescript
  // Before
  interface ScanForm { pays: string; ville: string; type: PartnerType | ""; limite: number; }
  // After
  interface ScanForm { pays: string; ville: string; types: PartnerType[]; limite: number; }
  ```
- [ ] **3.4** Replace the single `Select` (step ②) with a MUI `Autocomplete` with `multiple={true}` and `disableCloseOnSelect`, listing all 8 partner types as options with checkboxes. Show selected types as chips inside the input.
- [ ] **3.5** Update validation: require `types.length >= 1` instead of `type !== ""`.
- [ ] **3.6** Update the query preview to show all selected type queries:
  ```
  Requêtes Google Maps : "hôtels riads Marrakech Maroc" + "hôtels luxe 5 étoiles Marrakech Maroc"
  ```
- [ ] **3.7** Update `handleLaunch` to:
  - If single type selected: behave exactly as before (one job, current progress UI).
  - If multiple types selected: launch jobs sequentially (`for...of` loop over `form.types`), each calling `scanApi.start({ ville, pays, typePartenaire: type, limite })`.
  - Track a combined progress using a multi-job state: `{ current: number, total: number, jobs: RawScanJob[] }`.
  - The progress panel shows "Scan 1/3 — Hôtels & Riads", "Scan 2/3 — Hôtels Luxe", etc.
  - Aggregate results: sum `nb_ajoutes`, `nb_veille`, `nb_doublons`, `nb_trouves` across all jobs.
- [ ] **3.8** Update INITIAL state: `types: []` instead of `type: ""`.
- [ ] **3.9** Test with single type selection (backward compatible) and multi-type (2–3 types).
- [ ] **3.10** Commit.

### Files
- `frontend/src/components/crm/ScanProspectDialog.tsx`

### Impact
Medium. Only `ScanProspectDialog.tsx` is modified. The `scanApi.start()` call signature does not change (still called once per type). No backend changes. The key complexity is the sequential multi-job state management.

---

## Task 4 — Scheduled Scan: Settings Page & Throttling

**Status:** `- [ ]`

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

**Status:** `- [ ]`

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

- [ ] **5.1** Read `frontend/src/app/outreach/page.tsx` in full.
- [ ] **5.2** Add a `stepFilter` state to `OutreachPage`:
  ```typescript
  const [stepFilter, setStepFilter] = useState<string>("all");
  ```
- [ ] **5.3** Add a MUI `Tabs` component above the left prospect list (below the stats chips, above the prospect cards):
  - Tab 0: "Tous" (`value="all"`) — no filter.
  - Tab 1: "J0" (`value="j0"`).
  - Tab 2: "J+3" (`value="j3"`).
  - Tab 3: "J+7" (`value="j7"`).
  - Tab 4: "J+30" (`value="j30"`).
  - Each tab except "Tous" shows a `Badge` with the count of prospects having emails at that step.
- [ ] **5.4** Compute the filtered prospect list based on `stepFilter`:
  ```typescript
  const filteredProspects = useMemo(() => {
    if (stepFilter === "all") return prospects;
    return prospects.filter((p) =>
      (emailsCache[p.id] ?? []).some((e) => e.sequence_step === stepFilter)
    );
  }, [prospects, emailsCache, stepFilter]);
  ```
- [ ] **5.5** Compute per-tab counts for badges:
  ```typescript
  const stepCounts = useMemo(() => {
    const counts: Record<string, number> = { j0: 0, j3: 0, j7: 0, j30: 0 };
    for (const [id, emails] of Object.entries(emailsCache)) {
      if (!prospects.find((p) => p.id === id)) continue;
      for (const step of Object.keys(counts)) {
        if (emails.some((e) => e.sequence_step === step)) counts[step]++;
      }
    }
    return counts;
  }, [emailsCache, prospects]);
  ```
- [ ] **5.6** Replace `prospects.map(...)` in the left panel with `filteredProspects.map(...)`.
- [ ] **5.7** When `selectedId` belongs to a prospect filtered out by the active tab, reset `selectedId` to `null`.
- [ ] **5.8** Test: click each tab and verify only relevant prospects appear. Verify "Tous" shows all.
- [ ] **5.9** Commit.

### Files
- `frontend/src/app/outreach/page.tsx`

### Impact
Easy-Medium. Self-contained change to one file. All data is already loaded in `emailsCache`. No backend changes. No existing component logic changes.

---

## Task 6 — Editable Contract Dialog

**Status:** `- [ ]`

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

- [ ] **6.1** Read `frontend/src/components/contracts/ContractGenerateDialog.tsx` in full.
- [ ] **6.2** Read `frontend/src/lib/api.ts` — specifically `contractsApi.generate()` to understand its current signature.
- [ ] **6.3** Add `localClauses` state to `DraftPanel` (or lift to parent if needed):
  ```typescript
  const [localClauses, setLocalClauses] = useState<Partial<Record<keyof RawContractClauses, string>>>({});
  ```
  - Pre-populated as empty strings (the AI will fill what the user leaves blank).
  - If the contract already has `contract.clauses` (re-opened draft), pre-populate with existing values.
- [ ] **6.4** Replace the static 9-clause checklist in `DraftPanel` with an editable accordion section:
  - Keep the section heading "Structure du contrat (9 clauses)" + "Éditable avant génération".
  - Each clause is a `MUI Accordion` (or the existing `ClauseAccordion` pattern made editable) with:
    - Header: clause label (e.g., "1. Parties contractantes") + an expand icon.
    - Body (when expanded): a `TextField` `multiline` pre-filled with `localClauses[key] ?? ""`.
    - Placeholder text: `"Laissez vide pour laisser l'IA générer automatiquement…"`.
  - A chip below the section header showing "X / 10 clauses personnalisées" as the user fills them.
- [ ] **6.5** Pass `localClauses` to `handleGenerate`:
  - If `contractsApi.generate()` does not currently accept clause overrides, update the API call to include them in the request body: `{ clause_overrides: localClauses }`.
  - Check `frontend/src/lib/api.ts` — if the backend doesn't support this yet, store `localClauses` in a way that can be added later (i.e., still send the generate call but log/save the overrides locally as a note).
  - For now, if the backend doesn't accept overrides: save the edited text into `contract.notes` or display it in the `GeneratedPanel` so the user can compare. Document this as a Phase 2 backend task.
- [ ] **6.6** Ensure the "Générer le PDF" button is disabled if any required field is empty (i.e., `human_review_required` flag, already implemented).
- [ ] **6.7** Test: open a contract in draft state, expand clauses, type in a clause, click generate. Verify the flow completes.
- [ ] **6.8** Commit.

### Files
- `frontend/src/components/contracts/ContractGenerateDialog.tsx`
- `frontend/src/lib/api.ts` (potentially, if `generate()` needs clause override support)

### Impact
Medium. The dialog already has the `ClauseAccordion` pattern in `GeneratedPanel` — reuse it with an edit mode in `DraftPanel`. The backend `generate` endpoint may need a minor update to accept optional `clause_overrides`. If not updated yet, the feature degrades gracefully (user can still generate with AI content; custom text is shown as a comparison).

---

## Task 7 — Font Migration: Roboto → Google Sans

**Status:** `- [ ]`

### Context
Current font setup (3 touch points):
1. **`frontend/src/app/layout.tsx` (lines 2–5):** Imports `@fontsource/roboto` CSS for weights 300, 400, 500, 700.
2. **`frontend/src/lib/theme.ts` (line 78):** `fontFamily: '"Roboto", sans-serif'`.
3. **`frontend/package.json`:** `"@fontsource/roboto": "^5.2.10"` as a dependency.

**Google Sans** is a Google proprietary typeface available on Google Fonts (URL: https://fonts.google.com/specimen/Google+Sans). The package name in Next.js `next/font/google` is `Google_Sans`.

**Approach:** Use Next.js `next/font/google` for optimal performance (automatic subsetting, self-hosting, no FOUT). This avoids external CDN requests and respects privacy.

The `frontend/src/app/fonts/` directory already exists (contains `GeistVF.woff`, `GeistMonoVF.woff`), confirming the project supports custom font assets.

### Plan

- [ ] **7.1** Read `frontend/src/app/layout.tsx` in full.
- [ ] **7.2** Read `frontend/src/lib/theme.ts` in full (to confirm line 78 and full `fontFamily` usage).
- [ ] **7.3** Read `frontend/src/app/globals.css` (confirm no Roboto references).
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
- [ ] **7.5** In `frontend/src/lib/theme.ts` (line 78):
  - Change:
    ```typescript
    fontFamily: '"Roboto", sans-serif',
    ```
    to:
    ```typescript
    fontFamily: '"Google Sans", var(--font-google-sans), "Roboto", sans-serif',
    ```
    (Roboto retained as fallback in case the variable is not injected in some context.)
- [ ] **7.6** In `frontend/src/app/globals.css`, add a fallback CSS custom property:
  ```css
  :root {
    --font-google-sans: "Google Sans", sans-serif;
  }
  ```
- [ ] **7.7** Uninstall `@fontsource/roboto`:
  ```bash
  cd frontend && npm uninstall @fontsource/roboto
  ```
- [ ] **7.8** Restart the dev server and visually verify font change across all pages (Dashboard, Prospection, Outreach, Négociation, Contrats).
  - **Note:** If `next/font/google` does not resolve `Google_Sans` (the name may differ — confirm at https://fonts.google.com/specimen/Google+Sans), use the CDN fallback:
    - In `layout.tsx`, add `<link>` tags in `<head>` via a `metadata` export or a `<head>` block pointing to `https://fonts.googleapis.com/css2?family=Google+Sans:wght@300;400;500;700&display=swap`.
    - This is the fallback approach only if `next/font` fails.
- [ ] **7.9** Check all text renders in Google Sans — pay attention to MUI Typography components (they use the theme's `fontFamily`), icon sizes, and line heights.
- [ ] **7.10** Commit.

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
| T1 | Kanban — Veille/Perdu separation | ⬜ Not started |
| T2 | Export — PDF/Excel with filters | ⬜ Not started |
| T3 | Scan — Multi-select partner type | ⬜ Not started |
| T4 | Settings — Scheduled scan | ⬜ Not started |
| T5 | Outreach — Step tab filter | ⬜ Not started |
| T6 | Contracts — Editable clauses | ⬜ Not started |
| T7 | Font — Roboto → Google Sans | ⬜ Not started |

---

*Last updated: 2026-06-29*
*Source of truth for all Batch 7 implementation work.*
