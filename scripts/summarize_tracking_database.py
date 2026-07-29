#!/usr/bin/env python3
"""Print summary statistics for the Universe Engine tracking database."""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from plot_param_distributions import (  # noqa: E402
    EXPECTED_PARAMS,
    FAMILY_LABELS,
    get_param_info,
    fetch_rows,
    get_param_label,
    get_quali_labels,
    to_plot_space,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--remote", action="store_true", help="Query remote D1 rather than local D1")
    return parser.parse_args()


def parameters_in_range(family: str, params: dict[str, Any]) -> bool:
    for pname, value in params.items():
        labels = get_quali_labels(family, pname)
        info = get_param_info(family, pname)
        if labels:
            if round(value) < 0 or round(value) >= len(labels):
                return False
            continue
        if value < info["min"] or value > info["max"]:
            return False
    return True


def parse_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int, int]:
    parsed: list[dict[str, Any]] = []
    invalid_schema = 0
    out_of_range = 0

    for row in rows:
        family = row["simulation_id"]
        expected = EXPECTED_PARAMS.get(family)
        try:
            params = json.loads(row["parameters_json"])
        except (TypeError, json.JSONDecodeError):
            invalid_schema += 1
            continue

        valid_schema = expected is not None and set(params.keys()) == expected
        if not valid_schema:
            invalid_schema += 1

        in_range = valid_schema and parameters_in_range(family, params)
        if valid_schema and not in_range:
            out_of_range += 1

        parsed.append({
            "ts": datetime.fromisoformat(row["created_at"]).replace(tzinfo=None),
            "family": family,
            "params": params,
            "valid_schema": valid_schema,
            "in_range": in_range,
        })

    return parsed, invalid_schema, out_of_range


def table(headers: list[str], rows: list[list[Any]]) -> str:
    rendered = [[str(value) for value in row] for row in rows]
    widths = [len(header) for header in headers]
    for row in rendered:
        widths = [max(width, len(value)) for width, value in zip(widths, row)]

    def fmt(row: list[str]) -> str:
        return "  ".join(value.ljust(width) for value, width in zip(row, widths))

    lines = [fmt(headers), fmt(["-" * width for width in widths])]
    lines.extend(fmt(row) for row in rendered)
    return "\n".join(lines)


def format_dt(value: datetime | None) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else "-"


def format_number(value: float) -> str:
    if abs(value) >= 1e5 or (value != 0 and abs(value) < 1e-3):
        return f"{value:.3e}"
    return f"{value:.4g}"


def summarize_parameters(entries: list[dict[str, Any]]) -> list[list[str]]:
    rows: list[list[str]] = []
    valid_by_family: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in entries:
        if entry["in_range"]:
            valid_by_family[entry["family"]].append(entry)

    for family in sorted(valid_by_family):
        family_entries = valid_by_family[family]
        param_names = list(family_entries[0]["params"].keys())
        for pname in param_names:
            labels = get_quali_labels(family, pname)
            values = [to_plot_space(family, pname, entry["params"][pname]) for entry in family_entries]
            if labels:
                counts = Counter(int(value) for value in values)
                mode_index, mode_count = counts.most_common(1)[0]
                summary = f"mode={labels[mode_index]} ({mode_count})"
            else:
                summary = (
                    f"min={format_number(min(values))}, "
                    f"median={format_number(statistics.median(values))}, "
                    f"mean={format_number(statistics.fmean(values))}, "
                    f"max={format_number(max(values))}"
                )
            rows.append([FAMILY_LABELS.get(family, family), get_param_label(family, pname), summary])

    return rows


def main() -> None:
    args = parse_args()
    rows = fetch_rows(remote=args.remote)
    entries, invalid_schema_count, out_of_range_count = parse_rows(rows)

    schema_entries = [entry for entry in entries if entry["valid_schema"]]
    in_range_entries = [entry for entry in schema_entries if entry["in_range"]]
    total = len(in_range_entries)
    timestamps = [entry["ts"] for entry in in_range_entries]

    print("\nOverall")
    print(table(
        ["Metric", "Value"],
        [
            ["Total interactions", f"{total:,}"],
            ["First interaction", format_dt(min(timestamps) if timestamps else None)],
            ["Latest interaction", format_dt(max(timestamps) if timestamps else None)],
        ],
    ))

    in_range_by_family = Counter(entry["family"] for entry in in_range_entries)
    family_rows = []
    for family in sorted(in_range_by_family):
        family_rows.append([
            FAMILY_LABELS.get(family, family),
            f"{in_range_by_family[family]:,}",
            f"{100 * in_range_by_family[family] / max(total, 1):.1f}%",
        ])

    print("\nBy Family")
    print(table(["Family", "Interactions", "Share"], family_rows))

    print("\nParameter Summaries (scaled values)")
    print(table(["Family", "Parameter", "Summary"], summarize_parameters(entries)))


if __name__ == "__main__":
    main()
