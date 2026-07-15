"""
Migrate all data from SQLite (bab_morocco.db) to PostgreSQL.

Usage:
    cd backend
    python scripts/migrate_sqlite_to_postgres.py

Prerequisites:
    - PostgreSQL database 'bab_morocco' must exist and be accessible
    - pip install psycopg2-binary  (already in requirements.txt)
    - Tables must already exist in PostgreSQL (run: alembic upgrade head)

The script:
    1. Reads every row from every table in SQLite
    2. Inserts them into PostgreSQL using ON CONFLICT DO NOTHING (safe to re-run)
    3. Prints row counts for both databases as verification
"""

import sqlite3
import uuid
import psycopg2
import psycopg2.extras
import sys
import os

psycopg2.extras.register_uuid()

SQLITE_PATH = os.path.join(os.path.dirname(__file__), "..", "bab_morocco.db")

PG_DSN = os.environ.get(
    "PG_DSN",
    "dbname=bab_morocco user=postgres password=anas host=localhost port=5432",
)

TABLES_IN_ORDER = [
    "users",
    "prospects",
    "scan_jobs",
    "outreach_emails",
    "negotiation_messages",
    "contracts",
    "api_usage_logs",
    "system_settings",
]


def get_sqlite_tables(cur):
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'alembic%' AND name NOT LIKE 'sqlite_%'")
    return [r[0] for r in cur.fetchall()]


def get_columns(cur, table):
    cur.execute(f"PRAGMA table_info({table})")
    return [row[1] for row in cur.fetchall()]


def get_pg_column_types(pg_cur, table):
    pg_cur.execute(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = %s",
        (table,),
    )
    return {row[0]: row[1] for row in pg_cur.fetchall()}


def convert_value(val, pg_type):
    if val is None:
        return None
    if pg_type == "boolean":
        return bool(int(val))
    if pg_type == "uuid":
        s = str(val).replace("-", "")
        if len(s) == 32:
            return uuid.UUID(s)
        return val
    if isinstance(val, bytes):
        return val.hex()
    return val


def migrate():
    if not os.path.exists(SQLITE_PATH):
        print(f"ERROR: SQLite database not found at {os.path.abspath(SQLITE_PATH)}")
        sys.exit(1)

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cur = sqlite_conn.cursor()

    pg_conn = psycopg2.connect(PG_DSN)
    pg_conn.autocommit = False
    pg_cur = pg_conn.cursor()

    sqlite_tables = get_sqlite_tables(sqlite_cur)
    print(f"SQLite tables found: {sqlite_tables}")
    print()

    pg_cur.execute("SET session_replication_role = 'replica'")
    pg_conn.commit()

    for table in TABLES_IN_ORDER:
        if table not in sqlite_tables:
            print(f"  SKIP {table} — not in SQLite")
            continue

        columns = get_columns(sqlite_cur, table)
        pg_types = get_pg_column_types(pg_cur, table)
        sqlite_cur.execute(f"SELECT * FROM {table}")
        rows = sqlite_cur.fetchall()

        if not rows:
            print(f"  {table}: 0 rows (empty)")
            continue

        col_list = ", ".join(columns)
        placeholders = ", ".join(["%s"] * len(columns))
        insert_sql = (
            f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) "
            f"ON CONFLICT DO NOTHING"
        )

        inserted = 0
        for row in rows:
            values = [
                convert_value(row[i], pg_types.get(col, ""))
                for i, col in enumerate(columns)
            ]
            try:
                pg_cur.execute(insert_sql, values)
                if pg_cur.rowcount > 0:
                    inserted += 1
            except Exception as e:
                pg_conn.rollback()
                print(f"  ERROR inserting into {table}: {e}")
                print(f"    Row: {dict(zip(columns, values))}")
                raise

        pg_conn.commit()
        print(f"  {table}: {len(rows)} rows in SQLite, {inserted} newly inserted into PG")

    pg_cur.execute("SET session_replication_role = 'origin'")
    pg_conn.commit()

    print()
    print("=== Verification: row counts ===")
    print(f"{'Table':<30} {'SQLite':>8} {'PostgreSQL':>12}")
    print("-" * 52)

    all_ok = True
    for table in TABLES_IN_ORDER:
        if table not in sqlite_tables:
            continue
        sqlite_cur.execute(f"SELECT COUNT(*) FROM {table}")
        s_count = sqlite_cur.fetchone()[0]

        try:
            pg_cur.execute(f"SELECT COUNT(*) FROM {table}")
            p_count = pg_cur.fetchone()[0]
        except Exception:
            pg_conn.rollback()
            p_count = "ERROR"

        match = "OK" if s_count == p_count else "MISMATCH"
        if match == "MISMATCH":
            all_ok = False
        print(f"  {table:<28} {s_count:>8} {p_count:>12}  {match}")

    print()
    if all_ok:
        print("All tables match. Migration successful!")
    else:
        print("WARNING: Some tables have mismatched counts. Investigate before proceeding.")

    sqlite_conn.close()
    pg_conn.close()


if __name__ == "__main__":
    migrate()
