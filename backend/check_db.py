import asyncio
import sys
sys.path.insert(0, ".")

async def check():
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text
    engine = create_async_engine("sqlite+aiosqlite:///bab_morocco.db")
    async with engine.connect() as conn:
        result = await conn.execute(text(
            "SELECT p.id as pid, oe.sequence_step, oe.variant, oe.statut, "
            "oe.date_envoi_prevu, oe.id as eid "
            "FROM outreach_emails oe "
            "JOIN prospects p ON p.id = oe.prospect_id "
            "WHERE p.nom LIKE '%Hotel Beta%' "
            "ORDER BY oe.date_envoi_prevu, oe.variant"
        ))
        for row in result.fetchall():
            print(dict(row._mapping))

asyncio.run(check())
