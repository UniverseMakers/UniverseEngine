from __future__ import annotations

import importlib.util
import sqlite3
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "sync_tracking_to_d1.py"
sys.path.insert(0, str(SCRIPT.parent))
spec = importlib.util.spec_from_file_location("sync_tracking_to_d1", SCRIPT)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

COLUMNS = ("id", "created_at", "simulation_id", "parameters_json", "manifest_source",
           "matched_run_id", "asset_host_mode", "asset_host_base")


def make_row(**overrides):
    values = {
        "id": 1, "created_at": "2026-07-01T12:00:00+00:00", "simulation_id": "cosmos",
        "parameters_json": '{"a": 1.5}', "manifest_source": "local",
        "matched_run_id": "run1", "asset_host_mode": "local", "asset_host_base": None,
    } | overrides
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    return conn.execute(f"SELECT {', '.join('? AS ' + c for c in COLUMNS)}",
                        [values[c] for c in COLUMNS]).fetchone()


class SyncTrackingTests(unittest.TestCase):
    def test_sql_literal_escapes_quotes(self) -> None:
        self.assertEqual(sync.sql_literal("x'); DROP TABLE t; --"), "'x''); DROP TABLE t; --'")
        self.assertEqual(sync.sql_literal(None), "NULL")

    def test_row_error(self) -> None:
        self.assertIsNone(sync.row_error(make_row()))
        self.assertIsNone(sync.row_error(make_row(asset_host_mode=None)))
        self.assertIsNotNone(sync.row_error(make_row(simulation_id="x'; DROP TABLE t; --")))
        self.assertIsNotNone(sync.row_error(make_row(parameters_json='{"a": "1"}')))
        self.assertIsNotNone(sync.row_error(make_row(created_at="'); DROP")))


if __name__ == "__main__":
    unittest.main()
