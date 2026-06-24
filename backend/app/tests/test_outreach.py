"""SP5 — Outreach engine tests."""
import logging
import uuid
from datetime import date, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.models.outreach import OutreachEmail
from app.models.prospect import Prospect

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


# ── tests ────────────────────────────────────────────────────────────────────

async def test_generate_creates_3_variants(client: AsyncClient):
    p = await _create_prospect(client)
    r = await client.post(f"/outreach/{p['id']}/generate")
    assert r.status_code == 201
    emails = r.json()
    assert len(emails) == 3


async def test_variant_a_b_c_all_present(client: AsyncClient):
    p = await _create_prospect(client)
    r = await client.post(f"/outreach/{p['id']}/generate")
    variants = {e["variant"] for e in r.json()}
    assert variants == {"A", "B", "C"}


async def test_email_language_matches_prospect_pays(client: AsyncClient):
    """Prospect in France → langue=fr."""
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

    with caplog.at_level(logging.INFO, logger="app.services.outreach_service"):
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
    """j3 date_envoi_prevu = date_j0 + 3 days."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.database import Base
    from app.models.prospect import Prospect as ProspectModel
    from app.models.outreach import OutreachEmail as OutreachEmailModel
    from app.services.outreach_service import OutreachService

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    import app.models  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        p = ProspectModel(
            nom="Test Hotel",
            type="hotel_riad",
            pays="Maroc",
            ville="Fes",
            adresse_web="https://test-offset.ma",
            email_contact="test@hotel.ma",
            nom_contact="Ali",
            poste_contact="DG",
            commission_standard=10.0,
            commission_plancher=8.0,
            langue="fr",
            date_ajout=date.today(),
        )
        session.add(p)
        await session.commit()
        await session.refresh(p)

        svc = OutreachService()
        emails = await svc.generate_j0_variants(session, p)
        j0_date = emails[0].date_envoi_prevu

        # manually create j3 email via service template
        from app.services.outreach_service import _generate_email
        j3_data = _generate_email(p, "j3", "A", j0_date)
        assert j3_data["date_envoi_prevu"] == j0_date + timedelta(days=3)

    await engine.dispose()


async def test_followup_j3_created_if_j0_not_opened(client: AsyncClient):
    """trigger-followups creates j3 when j0 sent but not opened (past due)."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.database import Base
    from app.models.prospect import Prospect as ProspectModel
    from app.models.outreach import OutreachEmail as OutreachEmailModel
    from app.services.outreach_service import OutreachService

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    import app.models  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        p = ProspectModel(
            nom="Hotel Marrakech",
            type="hotel_riad",
            pays="Maroc",
            ville="Marrakech",
            adresse_web="https://hotel-mksh-followup.ma",
            email_contact="hello@hotel.ma",
            nom_contact="Fatima",
            poste_contact="Manager",
            commission_standard=10.0,
            commission_plancher=8.0,
            langue="fr",
            date_ajout=date.today(),
        )
        session.add(p)
        await session.commit()
        await session.refresh(p)

        svc = OutreachService()
        emails = await svc.generate_j0_variants(session, p)
        j0 = emails[0]

        # simulate: validated + sent + date_envoi_reel 4 days ago
        j0.statut = "sent"
        j0.date_envoi_reel = datetime.utcnow() - timedelta(days=4)
        await session.commit()

        result = await svc.trigger_followups(session)
        assert result["created"] >= 1
        steps_created = [d["step"] for d in result["details"]]
        assert "j3" in steps_created

    await engine.dispose()


async def test_followup_not_created_if_j0_opened(client: AsyncClient):
    """No j3 when j0 is already opened."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.database import Base
    from app.models.prospect import Prospect as ProspectModel
    from app.services.outreach_service import OutreachService

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    import app.models  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        p = ProspectModel(
            nom="Opened Hotel",
            type="hotel_riad",
            pays="Maroc",
            ville="Agadir",
            adresse_web="https://opened-hotel.ma",
            email_contact="open@hotel.ma",
            nom_contact="Karim",
            poste_contact="DG",
            commission_standard=10.0,
            commission_plancher=8.0,
            langue="fr",
            date_ajout=date.today(),
        )
        session.add(p)
        await session.commit()
        await session.refresh(p)

        svc = OutreachService()
        emails = await svc.generate_j0_variants(session, p)
        j0 = emails[0]
        j0.statut = "opened"  # opened — no followup expected from trigger
        j0.date_envoi_reel = datetime.utcnow() - timedelta(days=4)
        await session.commit()

        # trigger-followups only looks at "sent" j0s — opened ones are skipped
        result = await svc.trigger_followups(session)
        steps_created = [d["step"] for d in result["details"] if d["prospect_id"] == str(p.id)]
        assert "j3" not in steps_created

    await engine.dispose()


async def test_j30_reactivation_for_veille_prospects(client: AsyncClient):
    """Prospects in 'veille' stage get j30 email on trigger-followups."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.database import Base
    from app.models.prospect import Prospect as ProspectModel
    from app.services.outreach_service import OutreachService

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    import app.models  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        p = ProspectModel(
            nom="Veille Hotel",
            type="hotel_riad",
            pays="Maroc",
            ville="Tanger",
            adresse_web="https://veille-hotel.ma",
            email_contact="veille@hotel.ma",
            nom_contact="Said",
            poste_contact="DG",
            stage="veille",
            commission_standard=10.0,
            commission_plancher=8.0,
            langue="fr",
            date_ajout=date.today(),
        )
        session.add(p)
        await session.commit()
        await session.refresh(p)

        svc = OutreachService()
        result = await svc.trigger_followups(session)
        steps_created = [d["step"] for d in result["details"] if d["prospect_id"] == str(p.id)]
        assert "j30" in steps_created

    await engine.dispose()


async def test_generate_unknown_prospect_returns_404(client: AsyncClient):
    r = await client.post(f"/outreach/{uuid.uuid4()}/generate")
    assert r.status_code == 404


async def test_send_unknown_email_returns_404(client: AsyncClient):
    r = await client.post(f"/outreach/{uuid.uuid4()}/send")
    assert r.status_code == 404
