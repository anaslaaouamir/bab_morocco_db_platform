"""SP5 — Outreach engine tests."""
import logging
import uuid
from datetime import date, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.models.outreach import OutreachEmail
from app.models.prospect import Prospect
from app.services.email_generator import MockEmailGenerator
from app.services.outreach_service import OutreachService

pytestmark = pytest.mark.anyio


# ── helpers ──────────────────────────────────────────────────────────────────

def _prospect_payload(**overrides) -> dict:
    base = {
        "nom": "Riad Atlas",
        "type": "hotel_riad",
        "pays": "Maroc",
        "ville": "Marrakech",
        "adresse_web": f"https://riad-atlas-{uuid.uuid4().hex[:6]}.ma",
        "email_contact": "contact@riad-atlas.ma",
        "nom_contact": "Ahmed Bennani",
        "poste_contact": "Directeur Général",
        "presence_booking": True,
        "note_booking": 9.0,
        "presence_expedia": True,
        "nb_chambres": 60,
    }
    base.update(overrides)
    return base


async def _create_prospect(client: AsyncClient, **overrides) -> dict:
    payload = _prospect_payload(**overrides)
    r = await client.post("/prospects", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def _make_svc() -> OutreachService:
    """Always use MockEmailGenerator in tests."""
    return OutreachService(generator=MockEmailGenerator())


async def _make_db_with_prospect(**kwargs):
    """Spin up an isolated in-memory DB with one prospect. Returns (engine, session, prospect)."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.database import Base
    from app.models.prospect import Prospect as ProspectModel
    import app.models  # noqa

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    defaults = dict(
        nom="Test Hotel",
        type="hotel_riad",
        pays="Maroc",
        ville="Marrakech",
        adresse_web=f"https://test-{uuid.uuid4().hex[:6]}.ma",
        email_contact="test@hotel.ma",
        nom_contact="Ali",
        poste_contact="DG",
        commission_standard=10.0,
        commission_plancher=8.0,
        langue="fr",
        date_ajout=date.today(),
    )
    defaults.update(kwargs)

    session = SessionLocal()
    p = ProspectModel(**defaults)
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return engine, session, p


# ── tests ────────────────────────────────────────────────────────────────────

async def test_generate_creates_3_variants(client: AsyncClient):
    p = await _create_prospect(client)
    r = await client.post(f"/outreach/{p['id']}/generate")
    assert r.status_code == 201
    assert len(r.json()) == 3


async def test_variant_a_b_c_all_present(client: AsyncClient):
    p = await _create_prospect(client)
    r = await client.post(f"/outreach/{p['id']}/generate")
    variants = {e["variant"] for e in r.json()}
    assert variants == {"A", "B", "C"}


async def test_email_language_matches_prospect_pays(client: AsyncClient):
    p = await _create_prospect(
        client,
        pays="France",
        ville="Paris",
        adresse_web=f"https://voyages-fr-{uuid.uuid4().hex[:6]}.fr",
        type="tour_operateur",
    )
    r = await client.post(f"/outreach/{p['id']}/generate")
    assert r.status_code == 201
    langues = {e["langue"] for e in r.json()}
    assert "fr" in langues


async def test_all_generated_emails_are_j0(client: AsyncClient):
    p = await _create_prospect(client)
    r = await client.post(f"/outreach/{p['id']}/generate")
    steps = {e["sequence_step"] for e in r.json()}
    assert steps == {"j0"}


async def test_all_generated_emails_are_draft(client: AsyncClient):
    p = await _create_prospect(client)
    r = await client.post(f"/outreach/{p['id']}/generate")
    statuts = {e["statut"] for e in r.json()}
    assert statuts == {"draft"}


async def test_cannot_send_without_validation(client: AsyncClient):
    p = await _create_prospect(client)
    gen = await client.post(f"/outreach/{p['id']}/generate")
    email_id = gen.json()[0]["id"]
    r = await client.post(f"/outreach/{email_id}/send")
    assert r.status_code == 403


async def test_validate_then_send_succeeds(client: AsyncClient):
    p = await _create_prospect(client)
    gen = await client.post(f"/outreach/{p['id']}/generate")
    email_id = gen.json()[0]["id"]

    val = await client.post(f"/outreach/{email_id}/validate")
    assert val.status_code == 200
    assert val.json()["statut"] == "validated"

    send = await client.post(f"/outreach/{email_id}/send")
    assert send.status_code == 200
    assert send.json()["statut"] == "sent"


async def test_mock_sender_logs_email(client: AsyncClient, caplog):
    p = await _create_prospect(client)
    gen = await client.post(f"/outreach/{p['id']}/generate")
    email_id = gen.json()[0]["id"]
    await client.post(f"/outreach/{email_id}/validate")

    with caplog.at_level(logging.INFO, logger="app.services.email_transport"):
        r = await client.post(f"/outreach/{email_id}/send")
    assert r.status_code == 200
    assert any("[MOCK EMAIL SENT]" in m for m in caplog.messages)


async def test_list_emails_returns_all(client: AsyncClient):
    p = await _create_prospect(client)
    await client.post(f"/outreach/{p['id']}/generate")
    r = await client.get(f"/outreach/{p['id']}")
    assert r.status_code == 200
    assert len(r.json()) == 3


async def test_next_step_j0_before_any_emails(client: AsyncClient):
    p = await _create_prospect(client)
    r = await client.get(f"/outreach/{p['id']}/next-step")
    assert r.status_code == 200
    assert r.json()["next_step"] == "j0"


async def test_sequence_respects_date_offsets(client: AsyncClient):
    """j3 date_envoi_prevu = j0 date + 3 days."""
    engine, session, p = await _make_db_with_prospect()
    try:
        svc = _make_svc()
        emails = await svc.generate_j0_variants(session, p)
        j0_date = emails[0].date_envoi_prevu

        # create j3 via _create_followup and check date
        j3 = await svc._create_followup(session, p, "j3", "A", j0_date)
        assert j3.date_envoi_prevu == j0_date + timedelta(days=3)

        j7 = await svc._create_followup(session, p, "j7", "A", j0_date)
        assert j7.date_envoi_prevu == j0_date + timedelta(days=7)

        j30 = await svc._create_followup(session, p, "j30", "A", j0_date)
        assert j30.date_envoi_prevu == j0_date + timedelta(days=30)
    finally:
        await session.close()
        await engine.dispose()


async def test_followup_j3_created_if_j0_not_opened(client: AsyncClient):
    """trigger-followups creates j3 when j0 sent but not opened and past due."""
    engine, session, p = await _make_db_with_prospect()
    try:
        svc = _make_svc()
        emails = await svc.generate_j0_variants(session, p)
        j0 = emails[0]
        j0.statut = "sent"
        j0.date_envoi_reel = datetime.utcnow() - timedelta(days=4)
        await session.commit()

        result = await svc.trigger_followups(session)
        assert result["created"] >= 1
        assert "j3" in [d["step"] for d in result["details"]]
    finally:
        await session.close()
        await engine.dispose()


async def test_followup_not_created_if_j0_opened(client: AsyncClient):
    """No j3 when j0 status is 'opened'."""
    engine, session, p = await _make_db_with_prospect(adresse_web="https://opened-hotel-unique.ma")
    try:
        svc = _make_svc()
        emails = await svc.generate_j0_variants(session, p)
        j0 = emails[0]
        j0.statut = "opened"
        j0.date_envoi_reel = datetime.utcnow() - timedelta(days=4)
        await session.commit()

        result = await svc.trigger_followups(session)
        steps = [d["step"] for d in result["details"] if d["prospect_id"] == str(p.id)]
        assert "j3" not in steps
    finally:
        await session.close()
        await engine.dispose()


async def test_j30_reactivation_for_veille_prospects(client: AsyncClient):
    """Prospects in 'veille' stage get a j30 email on trigger-followups."""
    engine, session, p = await _make_db_with_prospect(
        stage="veille",
        adresse_web="https://veille-hotel-unique.ma",
    )
    try:
        svc = _make_svc()
        result = await svc.trigger_followups(session)
        steps = [d["step"] for d in result["details"] if d["prospect_id"] == str(p.id)]
        assert "j30" in steps
    finally:
        await session.close()
        await engine.dispose()


async def test_mock_email_contains_prospect_name(client: AsyncClient):
    """Generated email body mentions the prospect name."""
    p = await _create_prospect(client, nom="Riad Specifique")
    r = await client.post(f"/outreach/{p['id']}/generate")
    assert r.status_code == 201
    for email in r.json():
        assert "Riad Specifique" in email["corps"] or "Riad Specifique" in email["sujet"]


async def test_generate_unknown_prospect_returns_404(client: AsyncClient):
    r = await client.post(f"/outreach/{uuid.uuid4()}/generate")
    assert r.status_code == 404


async def test_send_unknown_email_returns_404(client: AsyncClient):
    r = await client.post(f"/outreach/{uuid.uuid4()}/send")
    assert r.status_code == 404
