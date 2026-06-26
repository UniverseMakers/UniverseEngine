#!/usr/bin/env python3
"""Print a readable summary of a run manifest.

Usage:

    python3 scripts/summarize_manifest.py public/assets/local-manifest.json
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="Path to manifest JSON file")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    manifest_path = args.manifest.expanduser().resolve()
    manifest = load_manifest(manifest_path)
    runs = manifest.get("runs", [])

    if not isinstance(runs, list):
        raise SystemExit("Manifest 'runs' field must be a list")

    scale_counts: Counter[str] = Counter()
    video_counts_by_scale: Counter[str] = Counter()
    video_counts_by_type: Counter[str] = Counter()
    views_per_run: Counter[int] = Counter()
    unique_view_ids_by_scale: dict[str, set[str]] = defaultdict(set)
    parameter_counts: Counter[int] = Counter()
    runs_missing_default_view = 0
    duplicate_run_ids: Counter[str] = Counter()

    total_videos = 0

    for run in runs:
        if not isinstance(run, dict):
            continue

        simulation_id = str(run.get("simulationId", "unknown"))
        run_id = str(run.get("runId", "unknown"))
        parameters = run.get("parameters", {})
        views = run.get("views", {})
        default_view = run.get("defaultView")

        scale_counts[simulation_id] += 1
        duplicate_run_ids[run_id] += 1

        if isinstance(parameters, dict):
            parameter_counts[len(parameters)] += 1

        if not isinstance(views, dict):
            continue

        view_count = len(views)
        total_videos += view_count
        video_counts_by_scale[simulation_id] += view_count
        views_per_run[view_count] += 1

        for view_id in views:
            view_name = str(view_id)
            video_counts_by_type[view_name] += 1
            unique_view_ids_by_scale[simulation_id].add(view_name)

        if default_view not in views:
            runs_missing_default_view += 1

    duplicate_run_ids = Counter(
        {run_id: count for run_id, count in duplicate_run_ids.items() if count > 1}
    )

    print(f"Manifest: {manifest_path}")
    print(f"Version: {manifest.get('version', 'unknown')}")
    print()
    print("Overview")
    print(f"- Total runs: {len(runs):,}")
    print(f"- Total videos: {total_videos:,}")
    print(f"- Average videos per run: {total_videos / max(len(runs), 1):.2f}")
    print(f"- Runs missing valid defaultView: {runs_missing_default_view:,}")
    print()
    print("Runs By Scale")
    for scale, count in sorted(scale_counts.items()):
        print(f"- {scale}: {count:,} runs")
    print()
    print("Videos By Scale")
    for scale, count in sorted(video_counts_by_scale.items()):
        print(f"- {scale}: {count:,} videos")
    print()
    print("Videos By Type")
    for view_id, count in sorted(video_counts_by_type.items()):
        print(f"- {view_id}: {count:,}")
    print()
    print("Views Per Run")
    for view_count, run_count in sorted(views_per_run.items()):
        suffix = "video" if view_count == 1 else "videos"
        print(f"- {run_count:,} runs have {view_count} {suffix}")
    print()
    print("Parameter Count Distribution")
    for param_count, run_count in sorted(parameter_counts.items()):
        suffix = "parameter" if param_count == 1 else "parameters"
        print(f"- {run_count:,} runs have {param_count} {suffix}")
    print()
    print("View Types By Scale")
    for scale, view_ids in sorted(unique_view_ids_by_scale.items()):
        labels = ", ".join(sorted(view_ids)) if view_ids else "(none)"
        print(f"- {scale}: {labels}")

    if duplicate_run_ids:
        print()
        print("Duplicate Run IDs")
        for run_id, count in sorted(duplicate_run_ids.items()):
            print(f"- {run_id}: {count} entries")


def load_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Manifest file does not exist: {path}")

    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, dict):
        raise SystemExit("Manifest root must be a JSON object")

    return data


if __name__ == "__main__":
    main()
