#!/usr/bin/env python3
"""Pull records from wrangler's local D1 into ``local_tracking.db``.

If you run ``wrangler dev`` instead of the normal Vite + tracking-server
setup, run this to pull those records into ``local_tracking.db`` so the
canonical local database stays complete.

Usage::

    python3 scripts/sync_dev_databases.py
"""

from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
LOCAL_DB = REPO_ROOT / "local_tracking.db"
DB_NAME = "universe-engine-db"

COLUMNS = [
    "id", "created_at", "simulation_id", "parameters_json",
    "manifest_source", "matched_run_id", "asset_host_mode", "asset_host_base",
]
COLUMN_LIST = ", ".join(COLUMNS)
PLACEHOLDERS = ", ".join("?" for _ in COLUMNS)

# Migration statements for columns that may be missing in an older local D1.
MIGRATIONS = [
    "ALTER TABLE run_selections ADD COLUMN asset_host_mode TEXT",
    "ALTER TABLE run_selections ADD COLUMN asset_host_base TEXT",
]


def migrate_local_d1() -> None:
    """Apply any missing migrations to wrangler's local D1."""
    for sql in MIGRATIONS:
        result = subprocess.run(
            ["npx", "wrangler", "d1", "execute", DB_NAME,
             "--json", "--command", sql],
            capture_output=True, text=True, cwd=str(REPO_ROOT),
        )
        if result.returncode == 0:
            continue
        # ALTER TABLE ADD COLUMN fails if the column already exists — that's fine.
        error_text = (result.stderr or "") + (result.stdout or "")
        if "duplicate column" in error_text.lower() or "already exists" in error_text.lower():
            continue
        print(f"  Warning: migration may have failed: {error_text.strip()[:200]}", file=sys.stderr)


def run_wrangler_d1(command: str) -> list[dict[str, Any]]:
    """Execute a SQL command on wrangler's local D1 and return parsed JSON rows."""
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", DB_NAME,
         "--json", "--command", command],
        capture_output=True, text=True, cwd=str(REPO_ROOT),
    )

    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []

    if isinstance(output, list) and len(output) > 0:
        results = output[0].get("results", [])
        if output[0].get("error"):
            print(f"  D1 error: {output[0]['error']}", file=sys.stderr)
            return []
        return results
    return output.get("results", [])


def main() -> None:
    # ── 0. Ensure the local D1 schema is up to date ────────────────────
    print("Ensuring local D1 schema is up to date...")
    migrate_local_d1()

    # ── 1. Read from wrangler's local D1 ──────────────────────────────
    print("Querying wrangler's local D1...")
    d1_rows = run_wrangler_d1(
        f"SELECT {COLUMN_LIST} FROM run_selections ORDER BY id ASC"
    )

    if not d1_rows:
        print("  No records found in wrangler's local D1.")
    else:
        print(f"  Found {len(d1_rows)} record(s).")

    # ── 2. Open / create the SQLite file ──────────────────────────────
    sqlite_path = LOCAL_DB.expanduser().resolve()

    if not sqlite_path.is_file():
        print(f"No SQLite database found at {sqlite_path}. Creating one.")
        conn = sqlite3.connect(str(sqlite_path))
        conn.execute("""CREATE TABLE IF NOT EXISTS run_selections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            simulation_id TEXT NOT NULL,
            parameters_json TEXT NOT NULL,
            manifest_source TEXT NOT NULL,
            matched_run_id TEXT,
            asset_host_mode TEXT,
            asset_host_base TEXT
        )""")
        conn.commit()
    else:
        conn = sqlite3.connect(str(sqlite_path))

    sqlite_ids = {
        r[0] for r in conn.execute(
            f"SELECT id FROM run_selections"
        ).fetchall()
    }

    print(f"  Found {len(sqlite_ids)} record(s) in {LOCAL_DB.name}.")

    # ── 3. Pull D1 records not yet in SQLite ──────────────────────────
    to_insert = [r for r in d1_rows if r["id"] not in sqlite_ids]

    if not to_insert:
        print("\nNo new records to sync. Already in sync.")
        conn.close()
        return

    print(f"\nPulling {len(to_insert)} record(s) from D1 → {LOCAL_DB.name}...")
    for row in to_insert:
        conn.execute(
            f"INSERT OR IGNORE INTO run_selections ({COLUMN_LIST}) "
            f"VALUES ({PLACEHOLDERS})",
            (row["id"], row["created_at"], row["simulation_id"],
             row["parameters_json"], row["manifest_source"],
             row.get("matched_run_id"), row.get("asset_host_mode"),
             row.get("asset_host_base")),
        )
    conn.commit()
    conn.close()

    print(f"\nDone. {len(to_insert)} record(s) pulled into {LOCAL_DB.name}.")
    print(f"Run `python3 scripts/sync_tracking_to_d1.py` to push them to production.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
