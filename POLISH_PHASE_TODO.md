# Polish Phase â€” TODO Checklist
# Bab Morocco BD Intelligence Platform

> Generated: 2026-06-26 | Cross-referenced against live codebase â€” every item verified.

---

### Execution Rules for AI

1. **Read Before You Write:** Before implementing ANY item on this list, the AI MUST use its file-reading tools to inspect the actual codebase. If the feature, UI element, or endpoint already exists, check it off the list and skip it to avoid code duplication.
2. **Execution Flow:** Do not work on items without explicit permission. When the user says "Go fix P1-01", the AI must:
   - Read the files to verify.
   - Implement the code changes.
   - Verify and test that it works.
   - Commit the changes to git (e.g., `git commit -m "fix(polish): implement P1-01 â€” delete prospect"`).
   - Update this `POLISH_PHASE_TODO.md` file to check off (`[x]`) the completed item.

---

## Priority Order (work top-to-bottom)

| Priority | Items | Reason |
|----------|-------|--------|
| **Critical bugs** | P6-03, P6-04 | Silent data loss (notes not saved) + API client foundation missing |
| **Core CRM completeness** | P1-01, P1-02 | Platform is incomplete without delete and edit |
| **Contract polish** | P4-01, P4-04 | $50k gate unreachable; review reason invisible |
| **Navigation gaps** | P4-02, P4-03, P3-01 | Users get lost between sections |
| **Dashboard intelligence** | P5-02, P5-01 | High-value, zero backend cost |
| **UX improvements** | P1-03, P2-01, P2-02, P3-02, P3-03, P1-05 | Polish and comfort |
| **Scale prep** | P1-04, P6-01, P6-02 | Needed before real data volume |

---

## AREA 1 â€” CRM / Prospection

- [x] **P1-01 â€” Delete a prospect**
  - **Layer:** Missing Frontend Only
  - **Backend:** `DELETE /prospects/{id}` exists in `backend/app/routers/prospects.py:118`, fully wired to `svc.delete_prospect()`.
  - **Frontend gap:** No delete button in `ProspectDrawer`, no delete icon in `ProspectTable`. Zero UI calls this endpoint.
  - **Fix:** Add a danger-zone section at the bottom of `ProspectDrawer` with a red "Supprimer ce prospect" button behind a `ConfirmationDialog`. On confirm, call `prospectsApi.delete(id)`, close the drawer, remove from `allProspects` state. Also requires P6-04 first (API client method missing).

- [x] **P1-02 â€” Edit a prospect's details**
  - **Layer:** Missing Frontend Only
  - **Backend:** `PUT /prospects/{id}` exists in `backend/app/routers/prospects.py:83`. `ProspectUpdate` schema (`backend/app/schemas/prospect.py:72`) accepts all fields as optional.
  - **Frontend gap:** `ProspectDrawer` is read-only. Only Notes (on blur) and Stage (dropdown) are editable. Name, email, contact, address, commission, capacity, OTA presence â€” none are editable.
  - **Fix:** Add an edit mode toggle (pencil icon in the drawer header). In edit mode, render the same fields as `AddProspectDialog` pre-filled with current values. Call `prospectsApi.update(id, data)` on save. Requires P6-04 first.

- [x] **P1-03 â€” Veille/Perdu prospects are invisible**
  - **Layer:** Missing Frontend Only
  - **Backend:** All data is persisted. `GET /prospects?stage=perdu` works.
  - **Frontend gap:** No dedicated filter, tab, or section for lost prospects. They disappear from all active views once marked `perdu`. No way to review conversion rates or reactivate them.
  - **Fix:** Add a "Perdus" filter chip in `FilterBar` or a separate tab on the Prospection page. Show `stage = perdu` prospects with their last update date and a "RÃ©activer" button that patches stage back to `negociation` or `prospection`.

- [x] **P1-04 â€” No server-side pagination for large pipelines**
  - **Layer:** Missing Frontend Only
  - **Backend:** Full pagination implemented â€” `GET /prospects` returns `page`, `page_size`, `pages`, `total`.
  - **Frontend gap:** `prospectsApi.list({ pageSize: 100 })` hard-loads everything. Will break at 500+ prospects (Phase 1 goal).
  - **Fix:** Implement MUI `TablePagination` in `ProspectTable` with controlled `page`/`rowsPerPage` state calling the real API pagination. Kanban can keep in-memory loading but show a count badge.

- [x] **P1-05 â€” Score breakdown not visible in Table view**
  - **Layer:** Missing Frontend Only
  - **Backend:** All 5 criterion scores are returned in `ProspectResponse`.
  - **Frontend gap:** The 5-criterion breakdown bars only appear inside `ProspectDrawer`. The `ProspectTable` score column shows a number only â€” no way to see why a score is 72 vs 78 without opening the drawer.
  - **Fix:** Add a MUI `Tooltip` on the score cell in `ProspectTable` that renders all 5 criteria with their scores inline on hover.

---

## AREA 2 â€” Outreach

- [x] **P2-01 â€” No empty state on main Outreach panel**
  - **Layer:** Missing Frontend Only
  - **Backend:** No gap.
  - **Frontend gap:** When a prospect is in `outreach` stage but has no generated emails (manually moved to outreach), the main Outreach page right panel shows nothing useful. The "GÃ©nÃ©rer les variantes J0" empty state exists in `ProspectDrawer`'s `OutreachSection` but not on the main outreach page.
  - **Fix:** Mirror the empty state from `ProspectDrawer` into the right panel of `outreach/page.tsx` when the selected prospect has zero emails.

- [x] **P2-02 â€” No inline email body editing before send**
  - **Layer:** Missing Both
  - **Backend:** No `PATCH /outreach/{id}/body` endpoint exists. Email body is set at generation time and immutable.
  - **Frontend gap:** The email body card is read-only; only variant A/B/C selection is possible.
  - **Fix (minimal, frontend-only):** Add an "Ã‰diter" toggle (pencil icon) that switches the body `<Box>` to a `<TextField multiline>`. The locally-edited text is passed to the send action as a modified payload. The `POST /outreach/{email_id}/send` call can carry an optional `body_override` if we add a backend field, or the edit can be purely cosmetic for the mock phase.

- [x] **P2-03 â€” No outreach stats on Dashboard**
  - **Layer:** Missing Frontend Only
  - **Backend:** All email status data is in `outreach_emails` table. The `/prospects/stats` endpoint returns `nb_par_stage` which includes `outreach` count.
  - **Frontend gap:** Dashboard has no outreach funnel metric (emails sent, follow-up steps completed). All data is derivable from `allProspects` already loaded.
  - **Fix:** Add outreach KPI chips on the Dashboard: total prospects in outreach stage, total with at least one email sent. Derivable client-side from `allProspects` â€” no new API endpoint needed.

---

## AREA 3 â€” Negotiation

- [x] **P3-01 â€” No way to view or reactivate `perdu` prospects**
  - **Layer:** Missing Frontend Only
  - **Backend:** `GET /prospects?stage=perdu` works. Negotiation history is preserved in `negotiation_messages` table.
  - **Frontend gap:** `negociation/page.tsx` filters by `stage=negociation` only. Once marked `perdu`, a prospect and their full conversation history are inaccessible from the negotiation page.
  - **Fix:** Add a "Perdus" secondary section or tab on the Negotiation page. Show lost prospects with their last message date and a "RÃ©activer" button (`PATCH /stage â†’ negociation`). Pair with P1-03.

- [x] **P3-02 â€” No inline history in the main negotiation panel**
  - **Layer:** Missing Frontend Only
  - **Backend:** `GET /negotiation/{id}/history` exists and returns full message list.
  - **Frontend gap:** Conversation history is only accessible via the dialog button. The main panel shows no running thread â€” the user must remember what was said from a separate modal.
  - **Fix:** Add a collapsible "Derniers Ã©changes" section between the SubmitMessagePanel and the analysis card, showing the last 2â€“3 messages inline (direction-aware alignment: inbound left, outbound right). Reuses the already-loaded `historyCache`.

- [x] **P3-03 â€” No follow-up timing hint in WaitingForReplyPanel**
  - **Layer:** Missing Frontend Only
  - **Backend:** No gap. Timing logic exists in `outreach_service.py` but not in negotiation.
  - **Frontend gap:** After sending a negotiation response, the `WaitingForReplyPanel` says "En attente de sa rÃ©ponse" but gives no guidance on follow-up timing (CLAUDE.md Â§5 defines a 3â€“7 day window).
  - **Fix:** Add a contextual note in `WaitingForReplyPanel`: "Si pas de rÃ©ponse d'ici [date J+5], envisagez une relance via le bouton ci-dessous." Compute date client-side from `responded.sentAt`.

---

## AREA 4 â€” Contracts

- [x] **P4-01 â€” `estimated_annual_value` never passed from frontend**
  - **Layer:** Missing Frontend Only
  - **Backend:** `ContractCreate` schema has `estimated_annual_value: Optional[float]`. `ContractService._check_human_review()` fires a 403 when this exceeds $50,000. Gate is fully implemented.
  - **Frontend gap:** `ContractGenerateDialog` calls `contractsApi.create({ prospect_id })` with no `estimated_annual_value` â€” always `null`. The $50k human review gate can never trigger from the UI.
  - **Fix:** Add an optional numeric input field in the Step 0 "RÃ©viser" panel: "Valeur annuelle estimÃ©e (USD) â€” optionnel". Pass it to `create()`. Show `human_review_required` badge immediately if threshold exceeded.

- [x] **P4-02 â€” No link from ContractCard back to the prospect**
  - **Layer:** Missing Frontend Only
  - **Backend:** `RawContract` includes `prospect_id`.
  - **Frontend gap:** `ContractCard` in `contrats/page.tsx` shows partner name/country/commission/status but has no navigation back to the prospect's `ProspectDrawer` or the Prospection page.
  - **Fix:** Add a "Voir le prospect" icon button (`OpenInNewRoundedIcon`) on `ContractCard` that navigates to `/prospection` with the prospect highlighted, or opens the `ProspectDrawer` inline if prospection data is available.

- [x] **P4-03 â€” Contracts page may show stale data after Conclure redirect**
  - **Layer:** Missing Frontend Only
  - **Backend:** No gap. Contract is auto-created atomically in `PATCH /stage â†’ closing`.
  - **Frontend gap:** `router.push("/contrats")` in `handleConclude` (`negociation/page.tsx:827`) navigates to the contracts page, but Next.js may serve a cached version that doesn't include the newly created draft contract.
  - **Fix:** Add `router.refresh()` after `router.push("/contrats")` in `handleConclude`, or pass a `?refresh=1` query param that triggers a fresh `useEffect` fetch on the contracts page.

- [x] **P4-04 â€” `human_review_reason` text is never displayed**
  - **Layer:** Missing Frontend Only
  - **Backend:** `human_review_reason` is returned in `ContractResponse` and stored in `RawContract`.
  - **Frontend gap:** The amber warning badge on `ContractCard` and in `ContractGenerateDialog` shows that human review is required but never shows *why* (e.g., "Commission 7% est infÃ©rieure au plancher absolu de 8%").
  - **Fix:** Add a `Tooltip` on the `human_review_required` warning chip showing `contract.human_review_reason`. Also render it as an amber `Alert` inside `ContractGenerateDialog` Step 0 when the flag is set.

---

## AREA 5 â€” Dashboard

- [ ] **P5-01 â€” `perdu` stage not counted; no conversion rate**
  - **Layer:** Missing Frontend Only
  - **Backend:** All data present in `allProspects`.
  - **Frontend gap:** Dashboard funnel only includes `prospection â†’ activation_ota`. Prospects in `perdu` are silently excluded. No stat shows negotiation â†’ conversion vs abandonment rate.
  - **Fix:** Add a "Perdus" counter chip below the funnel showing count + "X% des nÃ©gociations perdues". Derivable from `allProspects` already loaded.

- [ ] **P5-02 â€” No "Actions en attente" section**
  - **Layer:** Missing Frontend Only
  - **Backend:** All necessary data already returned by existing endpoints.
  - **Frontend gap:** Dashboard has no action queue. Users must navigate to each page to find what needs attention â€” pending email validations, negotiations awaiting reply, contracts with human review flags.
  - **Fix:** Add an "Actions en attente" card on the Dashboard with three items (derivable from loaded data): (1) emails in `draft` or `validated` status not yet sent, (2) prospects in `negociation` with recent inbound messages, (3) contracts with `human_review_required = true`. Each item is a clickable link to the relevant page.

---

## AREA 6 â€” General UI / Global Polish

- [ ] **P6-01 â€” No global prospect name search**
  - **Layer:** Missing Frontend Only
  - **Backend:** `GET /prospects` supports filtering by `stage`, `type`, `pays`, `langue`, `score_min` but not by text search on `nom`.
  - **Frontend gap:** `FilterBar` has filter chips (stage, type, country) but no text input. With 200+ prospects, finding one by name requires scrolling.
  - **Fix (client-side only):** Add a search `TextField` in `FilterBar` that filters `allProspects` client-side by `nom.toLowerCase().includes(query)`. No backend change needed since all prospects are already loaded.

- [ ] **P6-02 â€” No backend health indicator in the UI**
  - **Layer:** Missing Frontend Only
  - **Backend:** `GET /health` exists in `routers/health.py` and returns `{ status, version, db }`.
  - **Frontend gap:** If the backend is unreachable, individual pages show their own error alerts. The Dashboard shows a loading skeleton forever. No global banner warns the user the API is down.
  - **Fix:** Add a `useEffect` in `AppShell.tsx` that calls `healthApi.check()` on mount. If it fails, show a persistent MUI `Alert` (severity="error") at the top of the layout: "Backend inaccessible â€” vÃ©rifiez que le serveur est dÃ©marrÃ©."

- [x] **P6-03 â€” Notes are not persisted to the backend (silent data loss)**
  - **Layer:** Missing Frontend Only â€” **CRITICAL BUG**
  - **Backend:** `PUT /prospects/{id}` accepts `notes` in `ProspectUpdate`. Fully implemented.
  - **Frontend gap:** `handleNotesChange` in `prospection/page.tsx:196` updates local React state and shows a snackbar â€” but **never calls the backend**. Notes are lost on every page refresh.
  - **Fix:** In `handleNotesChange`, call `prospectsApi.update(id, { notes })` after updating local state. Requires P6-04 first (method missing from API client).

- [x] **P6-04 â€” `prospectsApi.update()` and `prospectsApi.delete()` missing from API client**
  - **Layer:** Missing Frontend Only â€” **BLOCKS P1-01, P1-02, P6-03**
  - **Backend:** Both `PUT /prospects/{id}` and `DELETE /prospects/{id}` exist and work.
  - **Frontend gap:** `src/lib/api/index.ts` exports `prospectsApi` with only `list`, `create`, `patchStage`, `scorePreview`, `stats`. The `update()` and `delete()` methods are not implemented.
  - **Fix:** Add to `prospectsApi` in `index.ts`:
    ```ts
    update: (id: string, data: Partial<ProspectUpdatePayload>) =>
      apiFetch<RawProspect>(`/prospects/${id}`, { method: "PUT", body: JSON.stringify(prospectToUpdate(data)) }),
    delete: (id: string) =>
      apiFetch<void>(`/prospects/${id}`, { method: "DELETE" }),
    ```

---

*Polish Phase v1.0 â€” 2026-06-26*
*Start with P6-04, then P6-03, then P1-01, then P1-02 â€” in that order.*
