#!/usr/bin/env python3
"""Translate legacy planetary run summaries into runtime metadata YAML.

Legacy planetary assets currently ship a config-shaped ``run_summary.yaml`` that
looks like the authored contents of ``src/summaries/summary-stats-config.yaml``.
The frontend instead expects each run directory to contain a runtime metadata
payload with resource totals plus an optional ``summaryMetrics`` mapping.

This script rewrites those legacy per-run files in-place.

Usage::

    python3 scripts/translate_planetary_run_summaries.py
    python3 scripts/translate_planetary_run_summaries.py --dry-run
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
PLANETARY_ROOT = REPO_ROOT / "public" / "assets" / "planetary"

RESOURCE_IDS = frozenset(
    {
        "runtime",
        "carbonBurnt",
        "computeUsed",
        "memoryUsed",
        "particlesUpdated",
        "similarityScore",
    }
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report which files would be rewritten without modifying them.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not PLANETARY_ROOT.is_dir():
        raise SystemExit(f"ERROR: directory does not exist: {PLANETARY_ROOT}")

    converted = 0
    skipped = 0

    for run_dir in sorted(path for path in PLANETARY_ROOT.iterdir() if path.is_dir()):
        summary_path = run_dir / "run_summary.yaml"
        if not summary_path.exists():
            print(f"  [skip] {run_dir.relative_to(REPO_ROOT)} - missing run_summary.yaml")
            skipped += 1
            continue

        payload = load_yaml(summary_path)
        if is_runtime_metadata(payload):
            print(f"  [skip] {summary_path.relative_to(REPO_ROOT)} - already converted")
            skipped += 1
            continue

        translated = translate_legacy_summary(payload)
        if translated is None:
            print(f"  [skip] {summary_path.relative_to(REPO_ROOT)} - unrecognised legacy format")
            skipped += 1
            continue

        if args.dry_run:
            print(f"  [dry-run] would write {summary_path.relative_to(REPO_ROOT)}")
        else:
            summary_path.write_text(
                yaml.safe_dump(translated, sort_keys=False),
                encoding="utf-8",
            )
            print(f"  wrote {summary_path.relative_to(REPO_ROOT)}")
        converted += 1

    print(f"converted={converted} skipped={skipped}")


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}
    return raw if isinstance(raw, dict) else {}


def is_runtime_metadata(payload: dict[str, Any]) -> bool:
    required_keys = {
        "wallclockSeconds",
        "computeUsed",
        "memoryUsed",
        "carbonBurnt",
        "particlesUpdated",
    }
    return required_keys.issubset(payload.keys())


def translate_legacy_summary(payload: dict[str, Any]) -> dict[str, Any] | None:
    stats = extract_legacy_summary_stats(payload)
    if not stats:
        return None

    runtime_value = stats.get("runtime", {}).get("value")
    runtime_unit = stats.get("runtime", {}).get("unit")
    wallclock_seconds = to_seconds(runtime_value, runtime_unit)

    summary_metrics: dict[str, dict[str, str]] = {}
    for stat_id, stat in stats.items():
        if stat_id in RESOURCE_IDS:
            continue

        value = stat.get("value")
        if value is None:
            continue

        label = stat.get("label") or stat_id
        summary_metrics[stat_id] = {
            "label": str(label),
            "value": str(value),
        }

    return {
        "wallclockSeconds": wallclock_seconds,
        "computeUsed": to_float(stats.get("computeUsed", {}).get("value")),
        "memoryUsed": to_float(stats.get("memoryUsed", {}).get("value")),
        "carbonBurnt": to_float(stats.get("carbonBurnt", {}).get("value")),
        "particlesUpdated": to_int(stats.get("particlesUpdated", {}).get("value")),
        "summaryMetrics": summary_metrics,
    }


def extract_legacy_summary_stats(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    if "summaryStats" in payload and isinstance(payload["summaryStats"], list):
        return index_summary_stats(payload["summaryStats"])

    for value in payload.values():
        if not isinstance(value, dict):
            continue
        summary_stats = value.get("summaryStats")
        if isinstance(summary_stats, list):
            return index_summary_stats(summary_stats)

    return {}


def index_summary_stats(summary_stats: list[Any]) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}

    for item in summary_stats:
        if not isinstance(item, dict):
            continue
        stat_id = item.get("id")
        if not isinstance(stat_id, str) or not stat_id:
            continue
        indexed[stat_id] = item

    return indexed


def to_seconds(value: Any, unit: Any) -> int:
    numeric = to_float(value)
    normalized_unit = str(unit or "seconds").strip().lower()

    if normalized_unit in {"day", "days"}:
        factor = 86400
    elif normalized_unit in {"hour", "hours"}:
        factor = 3600
    elif normalized_unit in {"minute", "minutes", "min", "mins"}:
        factor = 60
    else:
        factor = 1

    return int(round(numeric * factor))


def to_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def to_int(value: Any) -> int:
    return int(round(to_float(value)))


if __name__ == "__main__":
    main()
