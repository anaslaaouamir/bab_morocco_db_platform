# RESEND_MIGRATION.md — Replace Mock Email Sending/Receiving with Resend

> Bab Morocco BD Intelligence Platform — Outreach / Negotiation / Contract email transport migration
> Created: 2026-07-01

**Scope lock:** This migration touches **only** the mechanism that sends and receives emails. Nothing else changes — not the scoring engine, not the escalation rules, not the scenario generation, not the sequencing timing (J0/J+3/J+7/J+30), not the contract lifecycle rules, not the human-in-the-loop gates (commission floor, $50k threshold, legal/exclusivity keywords), not the PDF/clause generation, not any DB status value or transition rule. Every place a mock `logger.info(...)` currently stands in for "email sent," that line is replaced by a real Resend API call. Every place a `[DEV] Simulate...` button currently stands in for "partner replied," a real inbound webhook produces the same downstream call the mock already makes. The mock paths are never deleted — they keep working exactly as today when `RESEND_API_KEY` is unset.

---

## Workflow

1. Before writing or editing any file, read it first.
2. After finishing a section's code changes, run the tests/checks listed for that section.
3. Only after tests pass, commit the changes for that section with the suggested commit message (or an adjusted one if scope changed).
4. Do not start the next section until told to.
5. The mock version must keep working throughout the entire migration — never break it. Every section must be verifiable with `RESEND_API_KEY` unset (mock path, identical to current behavior) before it is considered done.

---

## Architecture Note

### The toggle

A single environment variable decides the path for **every** send in the app: **`RESEND_API_KEY`**.

- Set → real Resend send.
- Unset (empty string, the `Settings` default) → mock send, byte-for-byte the same log-and-return behavior that exists today.

This is deliberately **not** the same gate as `get_email_generator()` / `get_negotiation_generator()` / `get_contract_generator()` (`backend/app/services/email_generator.py:194-197` and siblings), which require both an API key **and** `ENV == "production"`. Those gates protect against accidentally burning Claude API credits in dev. Resend's gate only needs the key, because Resend itself is safe to hit from dev (free tier, sandboxed to your own inbox until a domain is verified) and because you explicitly asked for a single-variable toggle with no `ENV` coupling. Keep these two gating patterns distinct — do not unify them.

### Where the toggle lives

One new file: **`backend/app/services/email_transport.py`**. It is the single abstraction layer for every outbound email in the app, and the single place inbound-reply routing addresses are constructed. No other file gets an `if settings.RESEND_API_KEY` check — every service asks this module for a transport object and calls `.send(...)` on it, never branching on the env var itself.

```python
class EmailTransportProtocol(Protocol):
    async def send(
        self, *, to: str, subject: str, html: str,
        reply_to: str, attachments: Optional[list[dict]] = None,
    ) -> str: ...          # returns a provider message id (mock or real)

class MockEmailTransport:
    async def send(self, *, to, subject, html, reply_to, attachments=None) -> str:
        logger.info("[MOCK EMAIL SENT] → %s | %s | reply_to=%s%s", to, subject, reply_to,
                    f" | {len(attachments)} attachment(s)" if attachments else "")
        return f"mock-{uuid.uuid4()}"

class ResendEmailTransport:
    async def send(self, *, to, subject, html, reply_to, attachments=None) -> str:
        result = resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "html": html,
            "reply_to": reply_to,
            **({"attachments": attachments} if attachments else {}),
        })
        return result["id"]

def get_email_transport() -> EmailTransportProtocol:
    if settings.RESEND_API_KEY:
        resend.api_key = settings.RESEND_API_KEY
        return ResendEmailTransport()
    return MockEmailTransport()
```

This one factory consolidates three things that are currently separate and inconsistent:
- `outreach_service.py`'s standalone `MockEmailSender` class (`backend/app/services/outreach_service.py:21-29`)
- `contract_service.py`'s bare `logger.info(...)` line with no class at all (`backend/app/services/contract_service.py:229-235`)
- `negotiation_service.py`'s **complete absence** of any send step in `respond()` (`backend/app/services/negotiation_service.py:142-179`) — today a negotiation "send" is only a DB write, nothing is sent anywhere, mock or real. This migration adds the first send call negotiation has ever had.

Both paths (`MockEmailTransport` / `ResendEmailTransport`) stay alive forever, side by side, selected purely by `get_email_transport()`. Deleting the mock path is never in scope.

### Reply-to addressing — how inbound replies get routed without new DB columns

Resend's inbound webhook (`email.received`) gives you `to`, `from`, and `subject` as metadata, plus an `email_id` you must use to fetch the full body via the Receiving API (the webhook payload itself does **not** contain the body — confirmed against current Resend docs). Resend does not correlate an inbound reply to the outbound message it replies to; there is no built-in threading. This app needs three separate downstream handlers (outreach reply → move to negotiation; negotiation reply → append to history; contract reply → record partner_reply), so the webhook must know which one to call and for which prospect/contract, from the `to` address alone.

Solution: every outbound email sets a **flow-tagged `reply_to`** address of the form:

```
outreach-<prospect_id>@<RESEND_INBOUND_DOMAIN>
negotiation-<prospect_id>@<RESEND_INBOUND_DOMAIN>
contract-<contract_id>@<RESEND_INBOUND_DOMAIN>
```

`RESEND_INBOUND_DOMAIN` is the Resend-managed subdomain assigned to your account (e.g. `abc123.resend.app`) — no custom domain or DNS work needed, per your free-account setup. When the inbound webhook fires, the single endpoint `POST /webhooks/resend/inbound` parses the local-part prefix of the `to` address, extracts the UUID, and dispatches to the matching service method. No new DB columns, no fuzzy matching, no `Message-ID`/`References` header parsing.

### Webhook endpoint — always on, not env-gated

`backend/app/routers/webhooks.py` registers `POST /webhooks/resend/inbound` unconditionally in `main.py`, unlike the `[DEV]`-gated simulate endpoints. It doesn't need an `ENV == "production"` guard because it's simply unreachable in dev unless you deliberately send email to your `resend.app` address — there's nothing to protect against. It verifies the Svix signature (`svix-id`, `svix-timestamp`, `svix-signature` headers) against `RESEND_WEBHOOK_SECRET` before processing anything.

### Local development — exposing the webhook with ngrok

Resend's `email.received` webhook is delivered by Resend's servers over the public internet — it cannot reach a backend running on `localhost`. Before Section 1.2 can be exercised with a real inbound email (not just a synthetic curl payload), you need a tunnel:

1. Run the backend locally as usual (`uvicorn app.main:app --reload`, typically port 8000).
2. In a separate terminal: `ngrok http 8000`. Keep this running for the duration of testing — the forwarding URL changes every time you restart ngrok on the free tier.
3. Take the generated `https://<random>.ngrok-free.app` URL and register `https://<random>.ngrok-free.app/webhooks/resend/inbound` as the endpoint in the Resend dashboard's Webhooks page.
4. Resend generates a signing secret for that webhook at registration time — copy it into `RESEND_WEBHOOK_SECRET`.
5. If ngrok is restarted, the URL changes and the webhook endpoint must be updated in the Resend dashboard again (free-tier ngrok URLs are not stable across restarts).

This is a local-dev-only concern — in a real deployment the backend has a stable public URL and no tunnel is needed. Needed starting in Section 1.2 (first section that creates the webhook endpoint) and required for every subsequent inbound test in 2.2 and 3.2.

### New settings (`backend/app/config.py`)

```python
RESEND_API_KEY: str = ""
RESEND_FROM_EMAIL: str = "onboarding@resend.dev"
RESEND_INBOUND_DOMAIN: str = ""       # e.g. "abc123.resend.app"
RESEND_WEBHOOK_SECRET: str = ""       # signing secret from the Resend webhook dashboard page
```

`MAILGUN_API_KEY` / `MAILGUN_DOMAIN` (currently unused leftovers from the original Phase-1 plan, see `BACKEND_PHASE1_PLAN.md`) are left untouched — not removed, not used. Out of scope.

### New dependency

`backend/requirements.txt` gets one new line: `resend>=2.5.0` (official Python SDK — handles both the send call and Svix webhook verification via `resend.Webhook.verify()`). Added in Section 1.1, used through the rest of the plan.

### Summary table

| # | Section | New files | Modified files |
|---|---------|-----------|-----------------|
| 1.1 | Send outreach email | `services/email_transport.py` | `outreach_service.py`, `routers/outreach.py`, `config.py`, `requirements.txt` |
| 1.2 | Receive outreach reply | `routers/webhooks.py` | `main.py`, `negotiation_service.py` (helper only, see notes) |
| 2.1 | Send negotiation message | — | `negotiation_service.py`, `routers/negotiation.py` |
| 2.2 | Receive negotiation reply | — | `routers/webhooks.py` |
| 3.1 | Send contract PDF | — | `contract_service.py`, `routers/contracts.py` |
| 3.2 | Receive contract response | — | `routers/webhooks.py` |

---

## Section 1 — Outreach

### Section 1.1 — Send Outreach Email

**Status:** Done

**Goal:** Replace `MockEmailSender` with the shared `EmailTransportProtocol` abstraction, keeping mock as the default fallback.

**Files to read first:**
- `backend/app/services/outreach_service.py` (`MockEmailSender` at lines 21-29; `OutreachService.__init__` at 32-39; `send()` at 197-213)
- `backend/app/routers/outreach.py` (`get_outreach_service` DI at lines 19-22; `send_email` endpoint at 84-97)
- `backend/app/models/outreach.py` (`OutreachEmail.corps`, `.sujet`, `.statut`, `.prospect_id`)
- `backend/app/models/prospect.py` (`Prospect.email_contact`, `.id`)
- `backend/app/services/email_generator.py` (existing dual-mode DI factory pattern to mirror stylistically — `get_email_generator()` at lines 194-197)
- `backend/app/config.py` (current `Settings` fields and `Config` class)
- This file's Architecture Note section above

**Files to create:**
- `backend/app/services/email_transport.py` (`EmailTransportProtocol`, `MockEmailTransport`, `ResendEmailTransport`, `get_email_transport()` — full content specified in the Architecture Note)

**Files to modify:**
- `backend/app/services/outreach_service.py` — delete the standalone `MockEmailSender` class; `OutreachService.__init__` takes `sender: Optional[EmailTransportProtocol] = None` defaulting to `MockEmailTransport()`; `send()` calls `self._sender.send(to=prospect.email_contact, subject=email.sujet, html=email.corps.replace("\n", "<br>"), reply_to=f"outreach-{prospect.id}@{settings.RESEND_INBOUND_DOMAIN}")` instead of `self._sender.send(email)`. Everything else in `send()` — the `statut != "validated"` guard, setting `statut = "sent"` and `date_envoi_reel`, calling `auto_trigger_followup` — is untouched.
- `backend/app/routers/outreach.py` — `get_outreach_service` gains `sender: Annotated[EmailTransportProtocol, Depends(get_email_transport)]` and passes it to `OutreachService(generator=generator, sender=sender)`.
- `backend/app/config.py` — add the four `RESEND_*` settings from the Architecture Note.
- `backend/requirements.txt` — add `resend>=2.5.0`.

**Implementation notes:**
- Trigger, data, and DB writes are identical to today: a human clicks "Envoyer" in the outreach UI (`frontend/src/app/(app)/outreach/page.tsx`, `handleSend()`) → `POST /outreach/{email_id}/send` → `OutreachService.send()` — none of that changes. Only the body of `send()` changes what it calls to actually deliver the email.
- The Resend call: `to` = `prospect.email_contact` (unchanged field, already used today); `from` = `settings.RESEND_FROM_EMAIL` (on the free/no-domain tier this is `onboarding@resend.dev`, and Resend will only actually deliver to the email address tied to the Resend account until a domain is verified — expected and fine for testing); `subject` = `email.sujet`; `html` = `email.corps` with `\n` converted to `<br>` (presentation-only transform at send time — the stored `corps` text in the DB is never modified, so the outreach composer UI still shows the exact plain-text content it shows today).
- `reply_to` = `outreach-{prospect.id}@{RESEND_INBOUND_DOMAIN}`. This is the critical piece for Section 1.2: when the prospect hits "Reply" in their inbox, their mail client sends the reply to this address, not to `onboarding@resend.dev`. Resend receives it at your `resend.app` subdomain and fires the inbound webhook with this exact `to` address in the payload — that's how Section 1.2 knows which prospect the reply belongs to, with zero new DB lookups.
- Toggle: none of this file checks `RESEND_API_KEY` directly. `OutreachService` just calls `self._sender.send(...)`; which class `self._sender` actually is was already decided by `get_email_transport()` in the router's DI chain.

**Tests to run before committing:**
- `cd backend && pytest` (no test failures / no import errors — no outreach tests exist yet, this just confirms nothing broke at collection time).
- With `RESEND_API_KEY` unset: run the app (`uvicorn app.main:app --reload`), generate + validate + send a J0 email for a test prospect via the UI or `curl`, confirm the server log shows `[MOCK EMAIL SENT] → ... | reply_to=outreach-<uuid>@...` exactly as before (same log level, same triggering conditions) and the email's `statut` becomes `sent` in the DB (`python backend/check_db.py` or equivalent query).
- With `RESEND_API_KEY` set to your real free-tier key and `RESEND_FROM_EMAIL`/`RESEND_INBOUND_DOMAIN` configured: repeat the send, confirm the email actually arrives in your inbox (the one tied to your Resend account) with the correct subject/body and that the `Reply-To` header shows the `outreach-<uuid>@...` address.

**Commit message:**
```
feat(outreach): send via Resend with mock fallback through shared email transport
```

---

### Section 1.2 — Receive Outreach Reply & Move Prospect to Negotiation

**Status:** Not started

**Goal:** A real inbound webhook triggers the exact same transition the `[DEV] Simuler réponse partenaire` button triggers today — moving the prospect to `negociation` and running the first negotiation analysis on the real reply text.

**Files to read first:**
- `backend/app/routers/negotiation.py` (`simulate_reply` at lines 81-121 — this is the logic to mirror exactly: `prospect.stage = "negociation"`, commit, then `svc.submit_message(db, prospect, text)`)
- `backend/app/services/negotiation_service.py` (`submit_message()` at lines 54-104 — what the webhook must call)
- `backend/app/services/email_transport.py` (created in 1.1 — reply-to scheme)
- `backend/app/main.py` (router registration pattern)
- `backend/app/config.py` (`RESEND_WEBHOOK_SECRET`, `RESEND_INBOUND_DOMAIN`)
- `backend/app/database.py` (`get_session` dependency, `AsyncSessionLocal` for use outside request scope if needed)
- `backend/app/models/prospect.py` (`Prospect.id`, `.stage`, `.email_contact`)
- `frontend/src/app/(app)/outreach/page.tsx` (`handleSimulateReply` at lines 1043-1064 — confirms the mock's exact user-visible contract: prospect disappears from the outreach list, no other UI change required)

**Files to create:**
- `backend/app/routers/webhooks.py` (new router: `POST /webhooks/resend/inbound`, Svix signature verification, payload parsing, dispatch-by-prefix logic — outreach branch only in this section; negotiation/contract branches added in 2.2/3.2)

**Files to modify:**
- `backend/app/main.py` — `app.include_router(webhooks.router)`, registered unconditionally alongside the other routers.

**Implementation notes:**
- **Inbound flow, end to end:** Resend receives mail at `outreach-<prospect_id>@<RESEND_INBOUND_DOMAIN>` → POSTs an `email.received` event to `/webhooks/resend/inbound` with `{type: "email.received", data: {email_id, from, to, subject, ...}}` (metadata only, no body) → handler verifies the Svix signature via `resend.Webhook.verify(payload, headers, RESEND_WEBHOOK_SECRET)` → handler calls the Resend Receiving API (`resend.Emails.receiving.get(email_id)` per the current SDK — **re-check the exact method name/casing against whatever `resend` package version lands in `requirements.txt`, since inbound receiving is a newer SDK surface and naming may have shifted between versions**) to fetch the full `text`/`html` body → handler parses the `to` address local-part (`outreach-<uuid>`), extracts the UUID, loads the `Prospect` by id.
- **Guard:** only proceed if `prospect.stage == "outreach"` (a defensive check the mock button doesn't need, because the button is only ever rendered when `hasSentEmail` is true and the prospect is already in the outreach list — a real webhook has no such UI guarantee and could in theory fire for a prospect that already moved on).
- **Mirror the mock exactly from here:** `prospect.stage = "negociation"`, `await db.commit()`, `await db.refresh(prospect)`, then `await negotiation_service.submit_message(db, prospect, <real reply body>)` — this is verbatim what `simulate_reply` does in `negotiation.py:102-108`, just with the real extracted email text instead of the hardcoded French template.
- **Storage:** identical to mock — `submit_message()` persists the reply as a `NegotiationMessage` row with `direction="inbound"` (`negotiation_service.py:78-93`). No new table, no new column.
- **Webhook security:** every request must pass Svix verification before any DB write. Reject with `400` on signature failure. This is the one genuinely new piece of security surface introduced by this migration (the app previously had no public unauthenticated endpoint at all — every other route sits behind `get_current_user`).
- **Mock fallback for this sub-section:** `POST /negotiation/{prospect_id}/simulate-reply` (`negotiation.py:81-121`) is untouched — still gated by `if ENV == "production": 403`, still fully usable in dev regardless of whether `RESEND_API_KEY`/webhook settings are configured. The `[DEV] Simuler réponse partenaire` chip in `outreach/page.tsx` keeps working exactly as today.
- **Known limitation to flag, not solve here:** Resend/Svix webhooks can retry on transient failures, so this endpoint is not strictly idempotent — a retried delivery would call `submit_message()` a second time and create a duplicate inbound `NegotiationMessage` row. No new DB column or dedup table is introduced to solve this in this migration (out of scope — mirror-the-mock, don't extend the schema); note it here so it's a known, accepted risk rather than a surprise.
- **Prerequisite — flag to the user before this section goes live:** the Resend dashboard's inbound receiving beta must actually be provisioning your `<id>.resend.app` subdomain (confirm this is unlocked on your account, not just waitlisted) before `RESEND_INBOUND_DOMAIN` can be set to a real value. Until then this section can be fully coded and reviewed but only exercised with a manually-crafted test payload against the webhook endpoint, not a real inbound email.
- **Prerequisite — ngrok tunnel:** this is the section that first creates `/webhooks/resend/inbound`, so it's also the first point a real inbound email test needs a public URL. See the Architecture Note's "Local development — exposing the webhook with ngrok" subsection: run `ngrok http 8000` alongside the backend, register the forwarding URL + `/webhooks/resend/inbound` in the Resend dashboard, and copy the generated signing secret into `RESEND_WEBHOOK_SECRET`. The synthetic-curl-payload tests don't need this; only the real-email round trip does.

**Tests to run before committing:**
- `cd backend && pytest` (import/collection sanity).
- With `RESEND_API_KEY`/webhook settings unset: confirm `[DEV] Simuler réponse partenaire` still works end to end exactly as before (prospect moves from Outreach to Négociation, analysis appears).
- Manually POST a synthetic, correctly-signed `email.received` payload (`to: "outreach-<real-prospect-uuid>@..."`) to `/webhooks/resend/inbound` with `curl`, confirm: (a) an unsigned/badly-signed request is rejected with 400 and no DB write occurs, (b) a validly-signed request moves the prospect to `negociation` and creates the inbound `NegotiationMessage`.
- If your Resend inbound subdomain is live: send a real email from your personal inbox to `outreach-<uuid>@<id>.resend.app`, confirm the full round trip (webhook fires → prospect moves stage → negotiation analysis appears in the UI) with no manual intervention.

**Commit message:**
```
feat(outreach): receive real inbound replies via Resend webhook, mirror simulate-reply transition
```

---

## Section 2 — Negotiation

### Section 2.1 — Send Negotiation Message

**Status:** Not started

**Goal:** `NegotiationService.respond()` currently only writes a DB row and sends nothing — add the first real (or mock) email send negotiation has ever had, using the same transport abstraction as outreach.

**Files to read first:**
- `backend/app/services/negotiation_service.py` (`respond()` at lines 142-179 — confirm there is genuinely no send call today, only the `NegotiationMessage(direction="outbound", ...)` DB write)
- `backend/app/routers/negotiation.py` (`get_negotiation_service` DI at lines 22-25; `respond` endpoint at 124-137)
- `backend/app/services/email_transport.py` (from Section 1.1)
- `backend/app/models/negotiation.py` (`NegotiationMessage.corps`, `.prospect_id`)
- `backend/app/models/prospect.py` (`Prospect.email_contact`, `.nom_contact`)
- `frontend/src/app/(app)/negociation/page.tsx` (`handleConfirm` at ~970-986 and `handleEscaladeConfirm` at ~990-1006 — confirm the frontend already treats `respond()`'s return value as "message sent," so no frontend change is needed once the backend actually sends it)

**Files to create:**
- None.

**Files to modify:**
- `backend/app/services/negotiation_service.py` — `NegotiationService.__init__` takes `sender: Optional[EmailTransportProtocol] = None` defaulting to `MockEmailTransport()`, matching the `OutreachService` constructor shape from 1.1. In `respond()`, after computing `response_text` and before/after building the `NegotiationMessage` row, call `await self._sender.send(to=prospect.email_contact, subject=f"Re: Partenariat Bab Morocco — {prospect.nom}", html=response_text.replace("\n", "<br>"), reply_to=f"negotiation-{prospect.id}@{settings.RESEND_INBOUND_DOMAIN}")`. Nothing about the scenario validation (`requires_human` / scenario `C` override), the `PermissionError` guard, or the `NegotiationMessage` fields changes.
- `backend/app/routers/negotiation.py` — `get_negotiation_service` gains `sender: Annotated[EmailTransportProtocol, Depends(get_email_transport)]` and passes it to `NegotiationService(generator=generator, sender=sender)`.

**Implementation notes:**
- Trigger is unchanged: the human picks a scenario (A/B) or writes/edits a custom escalation message (C) in the negotiation UI, which calls `POST /negotiation/{prospect_id}/respond` → `NegotiationService.respond()`. The only new behavior inside `respond()` is the actual send call; the DB write, the `requires_human` gate, and the scenario-C-always-allowed rule are byte-for-byte the same as today.
- Subject line: negotiation has never sent an email, so there is no existing subject convention to mirror — using a generic `Re: Partenariat Bab Morocco — {prospect.nom}` is a reasonable default; adjust here if you want something more specific, this is the one place in the whole plan where there's no prior mock behavior to copy verbatim.
- `reply_to` uses the `negotiation-` prefix (not `outreach-`), so that when the partner replies to this specific message, the webhook (Section 2.2) routes it to `NegotiationService.submit_message()` and appends to negotiation history, rather than re-triggering the outreach→negotiation transition from Section 1.2. This is what makes the flow-tagged reply-to scheme necessary — a plain `reply_to = prospect.email_contact` would give the webhook no way to distinguish "first outreach reply" from "mid-negotiation reply."
- Toggle: identical pattern to 1.1 — `NegotiationService` never checks `RESEND_API_KEY`; it just calls `self._sender.send(...)`, and `get_email_transport()` already decided which implementation that is.

**Tests to run before committing:**
- `cd backend && pytest`.
- With `RESEND_API_KEY` unset: submit a message, pick scenario A/B, confirm the response is recorded as before (`GET /negotiation/{prospect_id}/history` shows the new outbound row) and the server log now additionally shows `[MOCK EMAIL SENT] → ... | reply_to=negotiation-<uuid>@...` where previously there was no send log at all for this action.
- With `RESEND_API_KEY` set: repeat, confirm the response email actually arrives in your inbox with the scenario's `message_propose` text and the correct `Reply-To` header.
- Escalation path (scenario C): confirm the human-edited message from `EscaladeDialog` is what gets sent (not the AI draft), matching `respond()`'s existing `custom_message` precedence logic.

**Commit message:**
```
feat(negotiation): send responses via Resend, negotiation's first real send path
```

---

### Section 2.2 — Receive Negotiation Reply & Update Message History

**Status:** Not started

**Goal:** Extend the webhook from Section 1.2 with a negotiation branch — an inbound reply during an active negotiation is appended to history and triggers a fresh AI analysis/scenario set, exactly like clicking `[DEV] Simuler réponse suivante du partenaire` does today.

**Files to read first:**
- `backend/app/routers/webhooks.py` (created in 1.2 — the dispatch-by-prefix structure to extend)
- `frontend/src/app/(app)/negociation/page.tsx` (`WaitingForReplyPanel.handleSimulateFollowup` at lines 386-402 — the mock this section must mirror: it just calls `negotiationApi.submitMessage(prospect.id, text)`, nothing else; also read `handleAnalysisReady` at 880-887 and the analysis-fetch `useEffect` at 817-853 to see how the frontend already picks up a new analysis with **no polling** — see notes below)
- `backend/app/services/negotiation_service.py` (`submit_message()` again — same method Section 1.2 already calls, now called from a different branch)
- `backend/app/models/negotiation.py` (`NegotiationMessage` — confirms history is 100% DB-backed via `get_history()`, not frontend state, so no special "push" mechanism is needed for the UI to see the new message)

**Files to create:**
- None.

**Files to modify:**
- `backend/app/routers/webhooks.py` — add the `negotiation-` branch: parse `negotiation-<prospect_id>` from `to`, load the `Prospect`, guard `prospect.stage == "negociation"`, fetch the full inbound body via the Receiving API (same call pattern as 1.2), call `await negotiation_service.submit_message(db, prospect, body_text)`.

**Implementation notes:**
- **Distinguishing a negotiation reply from an outreach reply at the webhook level:** purely by the `to` address prefix set in Sections 1.1/2.1. `outreach-<uuid>@...` → Section 1.2's branch (stage transition + first analysis). `negotiation-<uuid>@...` → this section's branch (no stage change, just another analysis). Because every outbound send from `NegotiationService.respond()` (2.1) sets `reply_to` to the `negotiation-` address, every subsequent reply in that thread naturally lands in this branch, not 1.2's. `contract-<uuid>@...` will be added in 3.2. One endpoint, one `if/elif` on the parsed prefix, no ambiguity.
- **Full inbound mapping logic:** identical shape to 1.2 — verify Svix signature → parse `to` → extract UUID → fetch full body via `resend.Emails.receiving.get(email_id)` → call the same `submit_message()` used by both the mock button and Section 1.2's webhook branch. This is the exact method the mock's `handleSimulateFollowup` triggers via `POST /negotiation/{prospect_id}/message` → `submit_message()`; the webhook branch calls the service method directly rather than going through the HTTP route, but the effect (AI analysis, hard escalation rules, scenario generation, DB persistence) is 100% identical.
- **Where message history is stored / how the UI sees it:** `get_history()` (`negotiation_service.py:132-140`) reads `NegotiationMessage` rows ordered by `date_message` — already confirmed 100% DB-backed, no frontend cache is authoritative. The negotiation page's `useEffect` (lines 817-853) fetches `analysis` + `history` **once per prospect selection** (`if (analysisCache[selectedId] !== undefined) return`) — there is no polling and no websocket. This means a webhook-triggered reply is not pushed to an already-open negotiation page in real time; the human sees it the next time they select that prospect (or refresh). **This is out of scope to change** — the mock button works the same way today (the UI updates because the button's own click handler calls `onAnalysisReady` directly, not because of any polling), so a real inbound reply arriving passively is a genuinely new UX gap the mock never had to cover. Flag this to the user as a known behavior difference, not a bug to fix silently in this migration — introducing polling/websockets would be new scope beyond "replace mock with Resend."
- **What triggers the negotiation → contract transition, and confirmation it's untouched:** `handleConclude()` in `negociation/page.tsx` (lines 916-940) calls `prospectsApi.patchStage(selectedId, "closing")`, entirely independent of any email flow — it's a human clicking "Conclure" after reviewing the conversation, not something a webhook or scenario analysis triggers automatically. This section does not touch that button, that endpoint, or the automatic draft-contract creation it causes.
- **Mock fallback:** `handleSimulateFollowup` (`negociation/page.tsx:386-402`) and its backing endpoint (`POST /negotiation/{prospect_id}/message` via `submitMessage`, not gated by `ENV` at all — it's a normal always-on endpoint, since "submit message" is itself a legitimate human-paste-reply workflow, not a dev-only shortcut) keep working exactly as today, independent of Resend configuration.

**Tests to run before committing:**
- `cd backend && pytest`.
- With `RESEND_API_KEY`/webhook settings unset: confirm `[DEV] Simuler réponse suivante du partenaire →` still works exactly as before.
- Manually POST a synthetic signed `email.received` payload with `to: "negotiation-<uuid>@..."` for a prospect already in `negociation` stage; confirm a new inbound `NegotiationMessage` is created with fresh `scenarios_json`, and `prospect.stage` is unchanged (still `negociation`).
- Confirm a payload with `to: "outreach-<uuid>@..."` still correctly routes to the 1.2 branch (stage transition) and not this one — i.e. the prefix dispatch doesn't cross-wire.
- If inbound is live: reply to a real negotiation email from your test inbox, refresh the negotiation page for that prospect, confirm the new message + scenarios appear in "Historique des échanges."

**Commit message:**
```
feat(negotiation): receive real inbound replies via Resend webhook, extend inbound router
```

---

## Section 3 — Contract

### Section 3.1 — Send Contract PDF via Email

**Status:** Not started

**Goal:** Replace `ContractService.send_to_partner()`'s bare `logger.info(...)` with a real Resend send carrying the actual generated PDF as an attachment — today's mock doesn't even reference `contract.pdf_bytes`, so this section also fixes that (the mock's own gap, not new scope).

**Files to read first:**
- `backend/app/services/contract_service.py` (`send_to_partner()` at lines 219-242 — confirm it currently never touches `contract.pdf_bytes`; `generate_pdf()` at 163-215 for where `pdf_bytes` is populated)
- `backend/app/services/pdf_generator.py` (`generate_contract_pdf()` — confirms the PDF is already fully rendered and stored as raw `bytes` on the `Contract` row before `send_to_partner()` ever runs)
- `backend/app/models/contract.py` (`Contract.pdf_bytes`, `.partner_email`, `.partner_name`, `.commission`, `.status`)
- `backend/app/routers/contracts.py` (`send_to_partner` endpoint at lines 145-158)
- `backend/app/services/email_transport.py` (the `attachments` parameter shape — Resend expects `[{"filename": ..., "content": <base64 string>}]`)
- `frontend/src/components/contracts/ContractGenerateDialog.tsx` (`GeneratedPanel` around lines 404-441 — confirms the UI copy already says "Le PDF va être envoyé... avec une demande de signature," i.e. no frontend text needs to change)

**Files to create:**
- None.

**Files to modify:**
- `backend/app/services/contract_service.py` — `ContractService.__init__` takes `sender: Optional[EmailTransportProtocol] = None` defaulting to `MockEmailTransport()`. In `send_to_partner()`, replace the `logger.info(...)` block with `await self._sender.send(to=contract.partner_email, subject=f"Contrat de partenariat Bab Morocco — {contract.partner_name}", html=<body text, see notes>, reply_to=f"contract-{contract.id}@{settings.RESEND_INBOUND_DOMAIN}", attachments=[{"filename": f"contrat_{contract.partner_name.replace(' ', '_')}.pdf", "content": base64.b64encode(contract.pdf_bytes).decode()}])`. The surrounding guards (`status != "generated"` → `ValueError`, `pdf_bytes is None` → `ValueError`) and the post-send state changes (`status = "sent_to_partner"`, `sent_at = utcnow()`) are untouched.
- `backend/app/routers/contracts.py` — `get_contract_service` gains `sender: Annotated[EmailTransportProtocol, Depends(get_email_transport)]` and passes it to `ContractService(generator=generator, sender=sender)`.

**Implementation notes:**
- **Where the PDF lives at send time:** `generate_pdf()` (already-existing, untouched) sets `contract.pdf_bytes` and `contract.status = "generated"` before `send_to_partner()` can ever run (`send_to_partner()` raises `ValueError` if `status != "generated"` or `pdf_bytes is None`). So by the time this section's code runs, the real ReportLab-rendered PDF bytes are already sitting on the `Contract` row — this section only has to read them, base64-encode them, and attach them.
- **Resend attachment format:** `attachments` is a list of `{"filename": str, "content": <base64-encoded string>}`. No content-type field is required for a PDF (Resend infers it from the filename extension).
- **Email body:** mirror the same tone/content the mock's `simulate_partner_reply()` implies the partner received (mentions of "contrat de partenariat," commission %, signature request) — since the mock never actually wrote a body (it only logged a one-line summary), there's no exact text to copy verbatim here; write a short body along the lines of: partner name, reference to the attached PDF, the agreed commission, and a request to reply with their decision. Keep it short — the PDF is the actual content.
- `reply_to` = `contract-{contract.id}@{RESEND_INBOUND_DOMAIN}` — note this is keyed by `contract.id`, not `prospect.id` (unlike outreach/negotiation), because `Contract` already has a 1:1 relationship with `Prospect` (`prospect_id` is `unique=True` on the `contracts` table, `contract_service.py` model at `backend/app/models/contract.py:16-18`) and the webhook handler in 3.2 needs the contract row directly to update `partner_reply`/`status`, not the prospect.
- Toggle: same pattern as 1.1/2.1 — no `RESEND_API_KEY` check inside `contract_service.py` itself.

**Tests to run before committing:**
- `cd backend && pytest`.
- With `RESEND_API_KEY` unset: generate a PDF, send it, confirm `contract.status` becomes `sent_to_partner`, `sent_at` is set, and the mock log line still fires (now additionally reflecting the attachment, e.g. `| 1 attachment(s)` per the shared `MockEmailTransport` format from the Architecture Note).
- With `RESEND_API_KEY` set: repeat, confirm the email arrives in your inbox with a working PDF attachment that opens correctly and matches what `GET /contracts/{id}/pdf` would download directly.

**Commit message:**
```
feat(contracts): send contract PDF as real Resend attachment, mock fallback preserved
```

---

### Section 3.2 — Receive Contract Response (Signed / Rejected)

**Status:** Not started

**Goal:** Extend the webhook with a contract branch — an inbound reply to the contract email is recorded via `submit_reply()`, exactly like `[DEV] Simuler réponse du partenaire` does today. The human still makes the signed/declined decision manually (this rule is unchanged — see notes).

**Files to read first:**
- `backend/app/routers/webhooks.py` (from 1.2/2.2 — the dispatch structure to extend with a third branch)
- `backend/app/services/contract_service.py` (`submit_reply()` at lines 293-310; `simulate_partner_reply()` at 312-329 — the mock text this webhook branch replaces with real content; `mark_signed()` at 246-268 and `mark_declined()` at 272-291 — confirm neither is called automatically by this section)
- `backend/app/routers/contracts.py` (`submit_partner_reply`, `mark_signed`, `mark_declined`, `simulate_partner_reply` endpoints at lines 161-237)
- `frontend/src/components/contracts/ContractGenerateDialog.tsx` (`SentPanel` at lines 447-609 — confirms the UI already renders `contract.partner_reply` as a message bubble the moment it's non-null, with "Marquer comme signé" / "Marquer comme refusé" buttons appearing only once a reply exists — no frontend change needed, same reasoning as 2.2's DB-backed-history point)

**Files to create:**
- None.

**Files to modify:**
- `backend/app/routers/webhooks.py` — add the `contract-` branch: parse `contract-<contract_id>` from `to`, load the `Contract` by id, guard `contract.status == "sent_to_partner"`, fetch the full inbound body via the Receiving API, call `await contract_service.submit_reply(db, contract, body_text)`.

**Implementation notes:**
- **Distinguishing a contract reply at the webhook:** same prefix-dispatch mechanism as 1.2/2.2 — `contract-<uuid>@...` routes here. This completes the three-way `if/elif/elif` in `webhooks.py` (`outreach-` / `negotiation-` / `contract-`).
- **What the current mock checks and updates, mirrored exactly:** `submit_reply()` (lines 293-310) requires `contract.status == "sent_to_partner"` (raises `ValueError` otherwise), then sets `contract.partner_reply = reply_text.strip()` and `contract.partner_replied_at = datetime.utcnow()`. **It does not change `contract.status`, and it does not decide signed vs. declined.** That decision is made by a human reading the reply and clicking one of two buttons in `SentPanel` (`ContractGenerateDialog.tsx:549-569`), which call `mark_signed()` or `mark_declined()` respectively (`contract_service.py:246-291`). This webhook branch calls **only** `submit_reply()` — it must not call `mark_signed`/`mark_declined` itself, even though the frontend's `hasPdfMention` heuristic (`ContractGenerateDialog.tsx:462`, a naive regex for "pdf"/"pièce jointe"/"joint"/"attachm") might make it tempting to auto-decide. This is a hard boundary: mirror the mock's restraint exactly, do not add auto-detection of signed/declined from reply content — that would be new scope, and CLAUDE.md §9 requires human validation before any contract-value-bearing state change.
- **Downstream effects, confirmed untouched:** `mark_signed()` moves `prospect.stage = "activation_ota"` and logs `[WEBHOOK_PLACEHOLDER] → babmorocco.com` (`contract_service.py:264-267`) — this is the OTA activation webhook referenced in CLAUDE.md §7 ("Contrat signé → webhook → babmorocco.com API → partenaire actif... dans l'heure"). It is a **separate, not-yet-implemented** integration (a future outbound webhook to babmorocco.com, unrelated to Resend) and stays exactly as a log placeholder — implementing it is explicitly out of scope for this migration, which only replaces email transport.
- **Attachment handling:** unlike Section 3.1 (outbound, PDF attached), an inbound signed-PDF attachment from the partner is not parsed or stored anywhere by this section — `submit_reply()` only ever stored `reply_text`, and the mock's `simulate_partner_reply()` only ever faked a text mention of an attachment ("Veuillez trouver en pièce jointe..."), never an actual file. If the real partner reply has a real signed PDF attached, the Resend Attachments API could fetch it, but doing so would be new functionality beyond what the mock does — flagged here as a gap, not implemented in this migration.

**Tests to run before committing:**
- `cd backend && pytest`.
- With `RESEND_API_KEY`/webhook settings unset: confirm `[DEV] Simuler réponse du partenaire →` in `SentPanel` still works exactly as before, and "Marquer comme signé"/"Marquer comme refusé" still function as manual human actions afterward.
- Manually POST a synthetic signed `email.received` payload with `to: "contract-<uuid>@..."` for a contract in `sent_to_partner` status; confirm `contract.partner_reply` and `contract.partner_replied_at` are set, and `contract.status` is **unchanged** (still `sent_to_partner`) — then confirm `mark_signed`/`mark_declined` still work manually afterward exactly as before.
- Confirm `outreach-`/`negotiation-`/`contract-` prefixes all route to their correct, distinct branches with no cross-wiring (send three synthetic payloads, one per prefix, assert only the expected DB row changes for each).
- If inbound is live: reply to a real contract email from your test inbox, confirm the reply appears in `SentPanel`'s message bubble, then manually click "Marquer comme signé" and confirm the prospect moves to `activation_ota`.

**Commit message:**
```
feat(contracts): receive real inbound partner replies via Resend webhook
```
