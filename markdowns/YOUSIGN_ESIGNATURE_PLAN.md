# YOUSIGN_ESIGNATURE_PLAN.md — Migrate Contract Signing to Yousign eIDAS Electronic Signature

> Bab Morocco BD Intelligence Platform — Contract module e-signature integration
> Created: 2026-07-21

**Scope lock:** This migration touches **only** the contract signing mechanism. Nothing else changes — not the clause generation, not the PDF rendering, not the commission logic, not the negotiation flow, not the outreach sequences, not the scoring engine. The mock path (when `YOUSIGN_API_KEY` is unset) keeps working exactly as today.

---

## Workflow

1. Before writing or editing any file, read it first.
2. After finishing each section, check for errors. If no errors, commit immediately and mark the section as done.
3. Do not start the next section until told to.

---

## Section 1 — Yousign Account Setup & API Keys

**Status:** Done

**Goal:** Get the sandbox API key from the Yousign dashboard (Développeurs section). Add the following settings to `backend/app/config.py` alongside the existing Resend keys:

- `YOUSIGN_API_KEY` — sandbox key from the dashboard (empty string default = mock mode)
- `YOUSIGN_SANDBOX` — `true` (default) uses sandbox URL, `false` uses production URL
- `YOUSIGN_WEBHOOK_SECRET` — HMAC secret from the Yousign webhook configuration page
- `YOUSIGN_SIGNER_EMAIL` — the Bab Morocco team email that signs contracts first
- `YOUSIGN_SIGNER_FIRST_NAME` — defaults to "Bab"
- `YOUSIGN_SIGNER_LAST_NAME` — defaults to "Morocco"

Add the corresponding entries to `.env`.

**Commit message:**
```
feat(contract): add Yousign configuration settings
```

---

## Section 2 — Yousign Client Service

**Status:** Done

**Goal:** Create `backend/app/services/yousign_client.py` — a single service file that talks to the Yousign v3 REST API. It does 5 things in one call:

1. Create a signature request (with `ordered_signers: true` so the partner only gets invited after Bab Morocco signs)
2. Upload the generated PDF
3. Add Bab Morocco as signer 1 (signs first)
4. Add the partner as signer 2 (signs second)
5. Activate the signature request (sends the signing invitation)

Also has a `download_signed_pdf()` method to retrieve the certified PDF after signing.

Includes a mock version (`MockYousignClient`) that just logs the call and returns fake IDs when `YOUSIGN_API_KEY` is unset — same toggle pattern as Resend's `email_transport.py`.

Uses `httpx` for API calls (already in the project's dependencies).

**Commit message:**
```
feat(contract): add Yousign e-signature client with mock fallback
```

---

## Section 3 — Contract Model & Send Flow

**Status:** Done

**Goal:** Wire Yousign into the contract lifecycle.

**Model changes** — add fields to `backend/app/models/contract.py`:
- `yousign_signature_request_id` — tracks the Yousign request
- `yousign_document_id` — tracks the uploaded document
- `yousign_signer_bab_id` — tracks signer 1 (Bab Morocco)
- `yousign_signer_partner_id` — tracks signer 2 (partner)
- `yousign_signer_bab_done` — whether Bab Morocco has signed
- `signed_pdf_bytes` — the eIDAS-certified PDF downloaded after both sign

**Schema changes** — add to `ContractResponse` in `backend/app/schemas/contract.py`:
- `yousign_signature_request_id`, `yousign_signer_bab_done`, `has_signed_pdf`
- `signing_method` ("manual" or "yousign") — lets the frontend know which UI to show

**Service changes** — modify `backend/app/services/contract_service.py`:
- Constructor gains a `yousign` client parameter
- `send_to_partner()`: if Yousign client is real → upload to Yousign instead of emailing via Resend. If mock → current Resend email flow unchanged
- `create_from_prospect()` reset: clear the new Yousign fields when re-creating after decline

**Router changes** — modify `backend/app/routers/contracts.py`:
- Wire the Yousign client into `get_contract_service()` via DI
- Add `GET /contracts/{contract_id}/signed-pdf` endpoint to download the eIDAS-certified PDF

**Commit message:**
```
feat(contract): send contracts for e-signing via Yousign with Resend fallback
```

---

## Section 4 — Yousign Webhook

**Status:** Done

**Goal:** Add a `POST /webhooks/yousign` endpoint in `backend/app/routers/webhooks.py` that Yousign calls when signing events happen. Handles:

- `signature_request.done` — both parties signed → auto-mark contract as `signed`, download the certified PDF, move prospect to `activation_ota`, publish notification
- `signature_request.declined` — a signer declined → auto-mark as `declined`, save decline reason, move prospect back to `negociation`, publish notification
- `signer.done` — individual signer completed → if it's Bab Morocco, set `yousign_signer_bab_done = True`, publish notification
- `signature_request.expired` — signing deadline passed → publish notification, leave status unchanged for human decision

Verifies the HMAC-SHA256 webhook signature using `YOUSIGN_WEBHOOK_SECRET`.

Reuses the existing `mark_signed()` and `mark_declined()` service methods — no duplicated logic.

**Local testing:** same ngrok setup as Resend webhooks. Register `https://<ngrok-url>/webhooks/yousign` in the Yousign dashboard.

**Commit message:**
```
feat(contract): auto-sign/decline contracts via Yousign webhooks
```

---

## Section 5 — Frontend Updates

**Status:** Done

**Goal:** Update the contract UI to reflect the Yousign signing flow.

**Contract dialog** (`frontend/src/components/contracts/ContractGenerateDialog.tsx`):
- When `signing_method === "yousign"`:
  - Show signing progress: "En attente de votre signature" → "Vous avez signé — en attente du partenaire" → "Signé par les deux parties"
  - Hide the manual "Marquer comme signé" / "Marquer comme refusé" buttons (webhooks handle it automatically)
  - Show download button for the eIDAS-certified signed PDF when available
- When `signing_method === "manual"`: everything works exactly as today

**Contract list** (`frontend/src/app/(app)/contrats/page.tsx`):
- Show a small chip indicating signing method ("Yousign" vs "Manuel")
- For Yousign contracts: show sub-status ("En attente signature Bab Morocco" / "En attente signature partenaire")

**API types** (`frontend/src/lib/api/index.ts`):
- Update contract response type with the new fields

**Commit message:**
```
feat(contract): show Yousign signing progress in contract UI
```

---

## Section 6 — PDF Signature Block

**Status:** Not started

**Goal:** Adjust the signature area in the generated PDF (`backend/app/services/pdf_generator.py`) so the Yousign signature fields land on the correct positions.

- Update signature block text to mention "Signature électronique via Yousign (certifiée eIDAS)" when Yousign is active
- Ensure the two-column layout (Bab Morocco left, Partner right) coordinates match the `fields` positions configured in the Yousign client
- Add `signing_method` parameter to the PDF generator function so it can adapt without importing config directly
- Keep the current manual-signature layout when Yousign is not active

**Commit message:**
```
feat(contract): update PDF signature block for Yousign placement
```

---

## Section 7 — Sandbox Full Test

**Status:** Not started

**Goal:** End-to-end test in sandbox environment. No code changes — just verification.

1. Set `YOUSIGN_API_KEY` to the sandbox key, `YOUSIGN_SANDBOX=true`
2. Set up ngrok and register the webhook URL in the Yousign dashboard
3. Generate a contract for a test prospect → send via Yousign
4. Open the signing email (arrives at your own inbox in sandbox) → sign as Bab Morocco
5. Open the second signing email → sign as the partner
6. Verify: webhook fires → contract auto-marked as `signed` → signed PDF downloaded and stored → prospect moved to `activation_ota`
7. Test decline: send another contract → decline as a signer → verify auto-declined
8. Test mock fallback: unset `YOUSIGN_API_KEY` → verify the entire manual Resend flow still works

---

## Section 8 — Switch to Production

**Status:** Not started

**Goal:** Go live with real signatures.

1. Set `YOUSIGN_SANDBOX=false`
2. Replace the sandbox API key with the production API key in `.env`
3. Update the webhook URL in the Yousign dashboard to your real server URL (no more ngrok)
4. Update `YOUSIGN_WEBHOOK_SECRET` with the production webhook secret
5. Send a real contract to a real partner email → confirm they receive the Yousign signing invitation → confirm the full flow completes with a legally binding eIDAS signature

---

*Created: 2026-07-21*
*Bab Morocco BD Intelligence Platform — Contract e-Signature Migration*
