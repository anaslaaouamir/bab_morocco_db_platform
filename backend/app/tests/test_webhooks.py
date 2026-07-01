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
