"""Section 1.2 — Resend inbound webhook tests."""
import base64
import hmac
import json
import time
import uuid
from hashlib import sha256

import pytest
from httpx import AsyncClient

from app.config import settings
from app.routers import webhooks as webhooks_module
from app.routers.webhooks import strip_quoted_reply
from app.services.email_transport import MockEmailTransport

pytestmark = pytest.mark.anyio

_TEST_SECRET_RAW = b"unit-test-signing-secret-32bytes!"
_TEST_SECRET = "whsec_" + base64.b64encode(_TEST_SECRET_RAW).decode()


def _sign(svix_id: str, timestamp: str, payload: str) -> str:
    signed_content = f"{svix_id}.{timestamp}.{payload}"
    h = hmac.new(_TEST_SECRET_RAW, signed_content.encode(), sha256)
    return f"v1,{base64.b64encode(h.digest()).decode()}"


async def _create_prospect(client: AsyncClient, **overrides) -> dict:
    payload = {
        "nom": "Riad Atlas",
        "type": "hotel_riad",
        "pays": "Maroc",
        "ville": "Marrakech",
        "adresse_web": f"https://riad-atlas-{uuid.uuid4().hex[:6]}.ma",
        "email_contact": "contact@riad-atlas.ma",
        "nom_contact": "Ahmed Bennani",
        "poste_contact": "Directeur Général",
    }
    payload.update(overrides)
    r = await client.post("/prospects", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


# ── strip_quoted_reply — unit tests ───────────────────────────────────────────

def test_strip_quoted_reply_english_header():
    raw = (
        "do you agree on 12%?\n\n"
        "On Wed, 1 Jul 2026 at 14:11, bro bri <brobri668@gmail.com> wrote:\n\n"
        "> ok we want 12%\n"
        ">\n"
        "> On Wed, 1 Jul 2026 at 13:22, <onboarding@resend.dev> wrote:\n"
        ">\n"
        ">> Hello Riad El Bilal,\n"
    )
    assert strip_quoted_reply(raw) == "do you agree on 12%?"


def test_strip_quoted_reply_french_header():
    raw = "Merci, ça nous va.\n\nLe mer. 1 juil. 2026 à 13:22, Bab Morocco a écrit :\n> Bonjour,\n"
    assert strip_quoted_reply(raw) == "Merci, ça nous va."


def test_strip_quoted_reply_leading_gt_lines_only():
    raw = "Deal.\n> quoted line one\n> quoted line two\n"
    assert strip_quoted_reply(raw) == "Deal."


def test_strip_quoted_reply_no_quote_passthrough():
    raw = "Just a plain reply with no quoted history."
    assert strip_quoted_reply(raw) == raw


# ── full webhook round trip ───────────────────────────────────────────────────

async def test_bad_signature_rejected_no_db_write(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", _TEST_SECRET)
    prospect = await _create_prospect(client)
    await client.patch(f"/prospects/{prospect['id']}/stage", json={"stage": "outreach"})

    payload = json.dumps({
        "type": "email.received",
        "data": {
            "email_id": "fake-email-id",
            "from": "contact@riad-atlas.ma",
            "to": [f"outreach-{prospect['id']}@eodiirii.resend.app"],
            "subject": "Re: test",
        },
    })
    r = await client.post(
        "/webhooks/resend/inbound",
        content=payload,
        headers={"svix-id": "msg_1", "svix-timestamp": str(int(time.time())), "svix-signature": "v1,bogus"},
    )
    assert r.status_code == 400

    history = await client.get(f"/negotiation/{prospect['id']}/history")
    assert history.json() == []


async def test_valid_webhook_strips_quote_and_moves_to_negociation(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", _TEST_SECRET)
    prospect = await _create_prospect(client)
    await client.patch(f"/prospects/{prospect['id']}/stage", json={"stage": "outreach"})

    raw_body = (
        "do you agree on 12%?\n\n"
        "On Wed, 1 Jul 2026 at 14:11, bro bri <brobri668@gmail.com> wrote:\n\n"
        "> ok we want 12%\n"
    )

    class FakeReceiving:
        @staticmethod
        def get(email_id):
            assert email_id == "fake-email-id"
            return {"text": raw_body, "html": None}

    monkeypatch.setattr(webhooks_module.resend.Emails, "Receiving", FakeReceiving)

    svix_id = "msg_2"
    timestamp = str(int(time.time()))
    payload = json.dumps({
        "type": "email.received",
        "data": {
            "email_id": "fake-email-id",
            "from": "contact@riad-atlas.ma",
            "to": [f"outreach-{prospect['id']}@eodiirii.resend.app"],
            "subject": "Re: test",
        },
    })
    r = await client.post(
        "/webhooks/resend/inbound",
        content=payload,
        headers={"svix-id": svix_id, "svix-timestamp": timestamp, "svix-signature": _sign(svix_id, timestamp, payload)},
    )
    assert r.status_code == 200

    updated = await client.get(f"/prospects/{prospect['id']}")
    assert updated.json()["stage"] == "negociation"

    history = await client.get(f"/negotiation/{prospect['id']}/history")
    messages = history.json()
    assert len(messages) == 1
    assert messages[0]["direction"] == "inbound"
    assert messages[0]["corps"] == "do you agree on 12%?"
    assert "wrote:" not in messages[0]["corps"]


# ── Section 2.1 — outbound reply threading (In-Reply-To / References) ────────

async def test_respond_threads_reply_under_real_inbound_message(client: AsyncClient, monkeypatch, caplog):
    """A response to a real (webhook-originated) inbound reply must carry
    In-Reply-To/References pointing at that email's real Message-ID, so it
    lands in the same Gmail/Outlook thread instead of a fresh email."""
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", _TEST_SECRET)
    prospect = await _create_prospect(client)
    await client.patch(f"/prospects/{prospect['id']}/stage", json={"stage": "outreach"})

    class FakeReceiving:
        @staticmethod
        def get(email_id):
            return {"text": "Nous acceptons 10% de commission.", "html": None, "message_id": "CAB1234@mail.gmail.com"}

    monkeypatch.setattr(webhooks_module.resend.Emails, "Receiving", FakeReceiving)

    svix_id = "msg_thread"
    timestamp = str(int(time.time()))
    payload = json.dumps({
        "type": "email.received",
        "data": {
            "email_id": "fake-email-id",
            "from": "contact@riad-atlas.ma",
            "to": [f"outreach-{prospect['id']}@eodiirii.resend.app"],
            "subject": "Re: [J0-A] Partnership opportunity for Riad Atlas",
        },
    })
    r = await client.post(
        "/webhooks/resend/inbound",
        content=payload,
        headers={"svix-id": svix_id, "svix-timestamp": timestamp, "svix-signature": _sign(svix_id, timestamp, payload)},
    )
    assert r.status_code == 200

    with caplog.at_level("INFO", logger="app.services.email_transport"):
        r2 = await client.post(f"/negotiation/{prospect['id']}/respond", json={"scenario": "B"})
    assert r2.status_code == 200, r2.text

    mock_log_lines = [rec.message for rec in caplog.records if "[MOCK EMAIL SENT]" in rec.message]
    assert len(mock_log_lines) == 1
    assert "reply_to=negotiation-" in mock_log_lines[0]
    assert "In-Reply-To" in mock_log_lines[0]
    assert "<CAB1234@mail.gmail.com>" in mock_log_lines[0]
    assert "Re: [J0-A] Partnership opportunity for Riad Atlas" in mock_log_lines[0]


async def test_respond_without_prior_real_inbound_sends_no_threading_headers(client: AsyncClient, caplog):
    """A response to a mock/manually-pasted message (no email_message_id) must
    still send normally, just without In-Reply-To/References — matches how
    `submit_message()` behaves when called from the manual /message endpoint."""
    prospect = await _create_prospect(client)
    submit = await client.post(f"/negotiation/{prospect['id']}/message", json={"corps": "Nous acceptons 10% de commission."})
    assert submit.status_code == 201

    with caplog.at_level("INFO", logger="app.services.email_transport"):
        r = await client.post(f"/negotiation/{prospect['id']}/respond", json={"scenario": "B"})
    assert r.status_code == 200, r.text

    mock_log_lines = [rec.message for rec in caplog.records if "[MOCK EMAIL SENT]" in rec.message]
    assert len(mock_log_lines) == 1
    assert "headers=" not in mock_log_lines[0]


# ── Section 2.2 — receive negotiation reply via webhook ──────────────────────

async def test_negotiation_webhook_appends_message_and_reanalyzes(client: AsyncClient, monkeypatch):
    """A reply to the negotiation- address, while the prospect is already in
    'negociation', must append a new inbound message with fresh scenarios and
    NOT change the prospect's stage."""
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", _TEST_SECRET)
    prospect = await _create_prospect(client)
    await client.patch(f"/prospects/{prospect['id']}/stage", json={"stage": "outreach"})

    class FakeReceiving:
        @staticmethod
        def get(email_id):
            return {"text": "i dont accept unless having 15%", "html": None, "message_id": "CAFIRST@mail.gmail.com"}

    monkeypatch.setattr(webhooks_module.resend.Emails, "Receiving", FakeReceiving)

    svix_id = "msg_first"
    timestamp = str(int(time.time()))
    payload = json.dumps({
        "type": "email.received",
        "data": {
            "email_id": "fake-email-id-1",
            "from": "contact@riad-atlas.ma",
            "to": [f"outreach-{prospect['id']}@eodiirii.resend.app"],
            "subject": "Re: [J0-A] Partnership opportunity for Riad Atlas",
        },
    })
    r = await client.post(
        "/webhooks/resend/inbound",
        content=payload,
        headers={"svix-id": svix_id, "svix-timestamp": timestamp, "svix-signature": _sign(svix_id, timestamp, payload)},
    )
    assert r.status_code == 200

    updated = await client.get(f"/prospects/{prospect['id']}")
    assert updated.json()["stage"] == "negociation"

    class FakeReceiving2:
        @staticmethod
        def get(email_id):
            return {"text": "ok deal at 12%, send the contract", "html": None, "message_id": "CASECOND@mail.gmail.com"}

    monkeypatch.setattr(webhooks_module.resend.Emails, "Receiving", FakeReceiving2)

    svix_id2 = "msg_second"
    timestamp2 = str(int(time.time()))
    payload2 = json.dumps({
        "type": "email.received",
        "data": {
            "email_id": "fake-email-id-2",
            "from": "contact@riad-atlas.ma",
            "to": [f"negotiation-{prospect['id']}@eodiirii.resend.app"],
            "subject": "Re: [J0-A] Partnership opportunity for Riad Atlas",
        },
    })
    r2 = await client.post(
        "/webhooks/resend/inbound",
        content=payload2,
        headers={"svix-id": svix_id2, "svix-timestamp": timestamp2, "svix-signature": _sign(svix_id2, timestamp2, payload2)},
    )
    assert r2.status_code == 200

    # Stage unchanged — a negotiation reply never re-triggers the outreach transition.
    still_negociation = await client.get(f"/prospects/{prospect['id']}")
    assert still_negociation.json()["stage"] == "negociation"

    history = await client.get(f"/negotiation/{prospect['id']}/history")
    messages = history.json()
    inbound = [m for m in messages if m["direction"] == "inbound"]
    assert len(inbound) == 2
    assert inbound[-1]["corps"] == "ok deal at 12%, send the contract"

    analysis = await client.get(f"/negotiation/{prospect['id']}/analysis")
    assert analysis.status_code == 200
    assert analysis.json()["taux_demande"] == 12.0


async def test_negotiation_webhook_ignored_when_not_in_negociation_stage(client: AsyncClient, monkeypatch):
    """A negotiation- reply for a prospect still in 'outreach' (never moved to
    negociation) must be ignored — no message written, no stage change."""
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", _TEST_SECRET)
    prospect = await _create_prospect(client)
    await client.patch(f"/prospects/{prospect['id']}/stage", json={"stage": "outreach"})

    class FakeReceiving:
        @staticmethod
        def get(email_id):
            return {"text": "some early reply", "html": None, "message_id": "CASTRAY@mail.gmail.com"}

    monkeypatch.setattr(webhooks_module.resend.Emails, "Receiving", FakeReceiving)

    svix_id = "msg_stray"
    timestamp = str(int(time.time()))
    payload = json.dumps({
        "type": "email.received",
        "data": {
            "email_id": "fake-email-id",
            "from": "contact@riad-atlas.ma",
            "to": [f"negotiation-{prospect['id']}@eodiirii.resend.app"],
            "subject": "Re: test",
        },
    })
    r = await client.post(
        "/webhooks/resend/inbound",
        content=payload,
        headers={"svix-id": svix_id, "svix-timestamp": timestamp, "svix-signature": _sign(svix_id, timestamp, payload)},
    )
    assert r.status_code == 200

    unchanged = await client.get(f"/prospects/{prospect['id']}")
    assert unchanged.json()["stage"] == "outreach"

    history = await client.get(f"/negotiation/{prospect['id']}/history")
    assert history.json() == []


# ── Section 3.2 — receive contract reply via webhook ─────────────────────────

async def _create_contract_sent_to_partner(client: AsyncClient) -> dict:
    prospect = await _create_prospect(client)
    await client.patch(f"/prospects/{prospect['id']}/stage", json={"stage": "closing"})
    r_create = await client.post("/contracts", json={"prospect_id": prospect["id"]})
    assert r_create.status_code == 201, r_create.text
    contract_id = r_create.json()["id"]
    r_gen = await client.post(f"/contracts/{contract_id}/generate")
    assert r_gen.status_code == 200, r_gen.text
    r_send = await client.post(f"/contracts/{contract_id}/send")
    assert r_send.status_code == 200, r_send.text
    return r_send.json()


async def test_contract_webhook_records_reply_without_changing_status(client: AsyncClient, monkeypatch):
    """A reply to the contract- address must record partner_reply/partner_replied_at
    but must NOT change contract.status — signed/declined stays a human decision."""
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", _TEST_SECRET)
    contract = await _create_contract_sent_to_partner(client)

    class FakeReceiving:
        @staticmethod
        def get(email_id):
            return {
                "text": "Nous acceptons les conditions, veuillez trouver le contrat signé en pièce jointe.",
                "html": None,
                "message_id": "CACONTRACT@mail.gmail.com",
            }

    monkeypatch.setattr(webhooks_module.resend.Emails, "Receiving", FakeReceiving)

    svix_id = "msg_contract"
    timestamp = str(int(time.time()))
    payload = json.dumps({
        "type": "email.received",
        "data": {
            "email_id": "fake-email-id",
            "from": "contact@riad-atlas.ma",
            "to": [f"contract-{contract['id']}@eodiirii.resend.app"],
            "subject": "Re: Contrat de partenariat Bab Morocco",
        },
    })
    r = await client.post(
        "/webhooks/resend/inbound",
        content=payload,
        headers={"svix-id": svix_id, "svix-timestamp": timestamp, "svix-signature": _sign(svix_id, timestamp, payload)},
    )
    assert r.status_code == 200

    updated = await client.get(f"/contracts/{contract['id']}")
    body = updated.json()
    assert body["status"] == "sent_to_partner"
    assert body["partner_reply"] == "Nous acceptons les conditions, veuillez trouver le contrat signé en pièce jointe."
    assert body["partner_replied_at"] is not None

    # The human decision still works exactly as before, untouched by the webhook.
    signed = await client.post(f"/contracts/{contract['id']}/mark-signed")
    assert signed.status_code == 200
    assert signed.json()["status"] == "signed"


async def test_contract_webhook_ignored_when_not_sent_to_partner(client: AsyncClient, monkeypatch):
    """A contract- reply for a contract still in 'draft'/'generated' (never sent)
    must be ignored — no reply recorded."""
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", _TEST_SECRET)
    prospect = await _create_prospect(client)
    await client.patch(f"/prospects/{prospect['id']}/stage", json={"stage": "closing"})
    r_create = await client.post("/contracts", json={"prospect_id": prospect["id"]})
    contract_id = r_create.json()["id"]
    await client.post(f"/contracts/{contract_id}/generate")  # status: generated, not sent

    class FakeReceiving:
        @staticmethod
        def get(email_id):
            return {"text": "too early reply", "html": None, "message_id": "CAEARLY@mail.gmail.com"}

    monkeypatch.setattr(webhooks_module.resend.Emails, "Receiving", FakeReceiving)

    svix_id = "msg_early"
    timestamp = str(int(time.time()))
    payload = json.dumps({
        "type": "email.received",
        "data": {
            "email_id": "fake-email-id",
            "from": "contact@riad-atlas.ma",
            "to": [f"contract-{contract_id}@eodiirii.resend.app"],
            "subject": "Re: test",
        },
    })
    r = await client.post(
        "/webhooks/resend/inbound",
        content=payload,
        headers={"svix-id": svix_id, "svix-timestamp": timestamp, "svix-signature": _sign(svix_id, timestamp, payload)},
    )
    assert r.status_code == 200

    unchanged = await client.get(f"/contracts/{contract_id}")
    body = unchanged.json()
    assert body["status"] == "generated"
    assert body["partner_reply"] is None


async def test_contract_webhook_stores_reply_pdf_attachment(client: AsyncClient, monkeypatch):
    """When the partner's reply has a PDF attached (e.g. a signed copy), the
    webhook must download and store it — the two-hop Resend attachment fetch
    (metadata → signed download_url → HTTP GET) — without ever deciding
    signed/declined from its presence."""
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", _TEST_SECRET)
    contract = await _create_contract_sent_to_partner(client)

    fake_pdf_bytes = b"%PDF-1.4 fake signed contract bytes"

    class FakeAttachments:
        @staticmethod
        def get(email_id, attachment_id):
            assert email_id == "fake-email-id"
            assert attachment_id == "att_1"
            return {"download_url": "https://fake-resend-cdn.example/att_1"}

    class FakeReceiving:
        Attachments = FakeAttachments

        @staticmethod
        def get(email_id):
            return {
                "text": "Contrat accepté, voir pièce jointe.",
                "html": None,
                "message_id": "CACONTRACTPDF@mail.gmail.com",
                "attachments": [
                    {"id": "att_1", "filename": "contrat_signe.pdf", "content_type": "application/pdf", "size": 1234},
                ],
            }

    monkeypatch.setattr(webhooks_module.resend.Emails, "Receiving", FakeReceiving)

    class FakeResponse:
        content = fake_pdf_bytes

        def raise_for_status(self):
            pass

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            assert url == "https://fake-resend-cdn.example/att_1"
            return FakeResponse()

    monkeypatch.setattr(webhooks_module.httpx, "AsyncClient", FakeAsyncClient)

    svix_id = "msg_contract_pdf"
    timestamp = str(int(time.time()))
    payload = json.dumps({
        "type": "email.received",
        "data": {
            "email_id": "fake-email-id",
            "from": "contact@riad-atlas.ma",
            "to": [f"contract-{contract['id']}@eodiirii.resend.app"],
            "subject": "Re: Contrat de partenariat Bab Morocco",
        },
    })
    r = await client.post(
        "/webhooks/resend/inbound",
        content=payload,
        headers={"svix-id": svix_id, "svix-timestamp": timestamp, "svix-signature": _sign(svix_id, timestamp, payload)},
    )
    assert r.status_code == 200

    updated = await client.get(f"/contracts/{contract['id']}")
    body = updated.json()
    assert body["partner_reply"] == "Contrat accepté, voir pièce jointe."
    assert body["has_reply_pdf"] is True
    assert body["partner_reply_pdf_filename"] == "contrat_signe.pdf"

    pdf_resp = await client.get(f"/contracts/{contract['id']}/reply-pdf")
    assert pdf_resp.status_code == 200
    assert pdf_resp.content == fake_pdf_bytes
    assert pdf_resp.headers["content-type"] == "application/pdf"


async def test_contract_webhook_pdf_fetch_failure_still_records_reply_text(client: AsyncClient, monkeypatch):
    """If fetching the PDF attachment fails (network error, bad download_url,
    etc.), the reply text must still be recorded — a flaky download must
    never lose the partner's reply (this is the resilience fix for the crash
    seen when a real reply arrived with a PDF attached)."""
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", _TEST_SECRET)
    contract = await _create_contract_sent_to_partner(client)

    class FakeAttachments:
        @staticmethod
        def get(email_id, attachment_id):
            raise RuntimeError("simulated network failure")

    class FakeReceiving:
        Attachments = FakeAttachments

        @staticmethod
        def get(email_id):
            return {
                "text": "Accord, contrat signé joint.",
                "html": None,
                "message_id": "CAFAIL@mail.gmail.com",
                "attachments": [
                    {"id": "att_1", "filename": "contrat_signe.pdf", "content_type": "application/pdf", "size": 1234},
                ],
            }

    monkeypatch.setattr(webhooks_module.resend.Emails, "Receiving", FakeReceiving)

    svix_id = "msg_contract_pdf_fail"
    timestamp = str(int(time.time()))
    payload = json.dumps({
        "type": "email.received",
        "data": {
            "email_id": "fake-email-id",
            "from": "contact@riad-atlas.ma",
            "to": [f"contract-{contract['id']}@eodiirii.resend.app"],
            "subject": "Re: Contrat de partenariat Bab Morocco",
        },
    })
    r = await client.post(
        "/webhooks/resend/inbound",
        content=payload,
        headers={"svix-id": svix_id, "svix-timestamp": timestamp, "svix-signature": _sign(svix_id, timestamp, payload)},
    )
    assert r.status_code == 200

    updated = await client.get(f"/contracts/{contract['id']}")
    body = updated.json()
    assert body["partner_reply"] == "Accord, contrat signé joint."
    assert body["has_reply_pdf"] is False


# ── email.opened — open tracking ──────────────────────────────────────────────

def _opened_payload(email_id: str) -> str:
    return json.dumps({"type": "email.opened", "data": {"email_id": email_id}})


async def test_email_opened_marks_negotiation_message(client: AsyncClient, monkeypatch):
    """An email.opened event whose email_id matches an outbound negotiation
    message's resend_email_id must stamp that message's opened_at — nothing
    else about the row (or the prospect/contract state) changes."""
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", _TEST_SECRET)
    prospect = await _create_prospect(client)
    submit = await client.post(f"/negotiation/{prospect['id']}/message", json={"corps": "Nous acceptons 10%."})
    assert submit.status_code == 201

    async def fake_send(self, **kwargs):
        return "mock-negotiation-known-id"

    monkeypatch.setattr(MockEmailTransport, "send", fake_send)

    r = await client.post(f"/negotiation/{prospect['id']}/respond", json={"scenario": "B"})
    assert r.status_code == 200, r.text

    history_before = (await client.get(f"/negotiation/{prospect['id']}/history")).json()
    outbound_before = [m for m in history_before if m["direction"] == "outbound"]
    assert len(outbound_before) == 1
    assert outbound_before[0]["opened_at"] is None

    svix_id = "msg_opened_1"
    timestamp = str(int(time.time()))
    payload = _opened_payload("mock-negotiation-known-id")
    r2 = await client.post(
        "/webhooks/resend/inbound",
        content=payload,
        headers={"svix-id": svix_id, "svix-timestamp": timestamp, "svix-signature": _sign(svix_id, timestamp, payload)},
    )
    assert r2.status_code == 200

    history_after = (await client.get(f"/negotiation/{prospect['id']}/history")).json()
    outbound_after = [m for m in history_after if m["direction"] == "outbound"]
    assert outbound_after[0]["opened_at"] is not None


async def test_email_opened_marks_contract(client: AsyncClient, monkeypatch):
    """An email.opened event whose email_id matches a contract's
    resend_email_id (the send_to_partner email) must stamp contract.opened_at,
    and must NOT touch contract.status or trigger signed/declined."""
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", _TEST_SECRET)

    async def fake_send(self, **kwargs):
        return "mock-contract-known-id"

    monkeypatch.setattr(MockEmailTransport, "send", fake_send)

    contract = await _create_contract_sent_to_partner(client)

    before = (await client.get(f"/contracts/{contract['id']}")).json()
    assert before["opened_at"] is None

    svix_id = "msg_opened_2"
    timestamp = str(int(time.time()))
    payload = _opened_payload("mock-contract-known-id")
    r = await client.post(
        "/webhooks/resend/inbound",
        content=payload,
        headers={"svix-id": svix_id, "svix-timestamp": timestamp, "svix-signature": _sign(svix_id, timestamp, payload)},
    )
    assert r.status_code == 200

    after = (await client.get(f"/contracts/{contract['id']}")).json()
    assert after["opened_at"] is not None
    assert after["status"] == "sent_to_partner"


async def test_email_opened_unknown_id_ignored(client: AsyncClient, monkeypatch):
    """An email.opened event for an id that matches no row must be a no-op —
    not an error."""
    monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", _TEST_SECRET)

    svix_id = "msg_opened_unknown"
    timestamp = str(int(time.time()))
    payload = _opened_payload("mock-does-not-exist")
    r = await client.post(
        "/webhooks/resend/inbound",
        content=payload,
        headers={"svix-id": svix_id, "svix-timestamp": timestamp, "svix-signature": _sign(svix_id, timestamp, payload)},
    )
    assert r.status_code == 200
    assert r.json() == {"status": "processed"}
