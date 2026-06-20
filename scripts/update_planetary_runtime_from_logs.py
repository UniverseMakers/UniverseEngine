#!/usr/bin/env python3
"""Update planetary run summary runtimes from SWIFT restart logs.

The script iterates over local planetary asset run directories that already have
videos, then looks up matching SWIFT job files in a source root. Each source run
directory contains one or more ``job_*.txt`` files listing the SLURM job ids used
for that run across restarts. For every job id we read the matching
``swift_<jobid>.out`` log, extract the final summary-table ``Elapsed`` value, sum
those elapsed durations, convert the total to seconds, and write that value into
the corresponding asset run's ``run_summary.yaml`` as ``wallclockSeconds``.

Defaults are set for the current COSMA layout but can be overridden.

Derived resource metrics:

* ``wallclockSeconds``: summed elapsed time across all restart jobs
* ``computeUsed``: core-hours assuming 16 threads per run
* ``memoryUsed``: proportional node memory assuming a 256-core node with 1.54 TB RAM
* ``carbonBurnt``: approximate kgCO2e derived from core-hours using COSMA support's
  cosma7 power figure plus a facility-overhead uplift
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import deque
import os
import re
from pathlib import Path
from typing import Any

import yaml

from planetary_assets import list_planetary_run_dirs_with_videos

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE_ROOT = Path("/cosma5/data/dp004/vreke/swift/rssse")
DEFAULT_LOGS_DIR = Path("/cosma5/data/dp004/vreke/swift/rssse/outs_and_errs")
DEFAULT_ASSETS_DIR = REPO_ROOT / "public" / "assets" / "planetary"
DEFAULT_TAIL_LINES = 8
THREADS_PER_RUN = 16
NODE_CORES = 256
NODE_MEMORY_GB = 1540.0
COSMA7_NODE_POWER_KW = 0.175
FACILITY_OVERHEAD_MULTIPLIER = 489.0 / 341.0
NORTH_EAST_GRID_CARBON_KG_PER_KWH = 43.1 / 1000.0
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

ELAPSED_TOKEN_RE = re.compile(
    r"^(?:(?P<days>\d+)-)?(?P<hours>\d+):(?P<minutes>\d{2}):(?P<seconds>\d{2})$"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-root",
        type=Path,
        default=DEFAULT_SOURCE_ROOT,
        help="Directory containing per-run SWIFT source directories.",
    )
    parser.add_argument(
        "--logs-dir",
        type=Path,
        default=DEFAULT_LOGS_DIR,
        help="Directory containing swift_<jobid>.out log files.",
    )
    parser.add_argument(
        "--assets-dir",
        type=Path,
        default=DEFAULT_ASSETS_DIR,
        help="Directory containing per-run planetary asset subdirectories.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report changes without writing summary files.",
    )
    parser.add_argument(
        "--jobs",
        type=int,
        default=max(1, min(8, os.cpu_count() or 1)),
        help="Maximum concurrent run updates (default: min(8, CPU count)).",
    )
    parser.add_argument(
        "--tail-lines",
        type=int,
        default=DEFAULT_TAIL_LINES,
        help="Number of lines to read from the end of each log file (default: 8).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_root = args.source_root.expanduser().resolve()
    logs_dir = args.logs_dir.expanduser().resolve()
    assets_dir = args.assets_dir.expanduser().resolve()
    run_dirs = list_planetary_run_dirs_with_videos(assets_dir)

    if not source_root.is_dir():
        raise SystemExit(f"ERROR: source root does not exist: {source_root}")
    if not logs_dir.is_dir():
        raise SystemExit(f"ERROR: logs directory does not exist: {logs_dir}")
    if not assets_dir.is_dir():
        raise SystemExit(f"ERROR: assets directory does not exist: {assets_dir}")
    if not run_dirs:
        raise SystemExit(f"ERROR: no planetary asset runs with videos found in: {assets_dir}")
    if args.jobs <= 0:
        raise SystemExit("ERROR: --jobs must be a positive integer")
    if args.tail_lines <= 0:
        raise SystemExit("ERROR: --tail-lines must be a positive integer")

    updated = 0
    skipped = 0

    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        futures = {
            executor.submit(
                process_job_file,
                run_dir,
                source_root=source_root,
                logs_dir=logs_dir,
                dry_run=args.dry_run,
                tail_lines=args.tail_lines,
            ): run_dir
            for run_dir in run_dirs
        }

        for future in as_completed(futures):
            status, message = future.result()
            print(message)
            if status == "updated":
                updated += 1
            else:
                skipped += 1

    print(f"updated={updated} skipped={skipped}")


def process_job_file(
    run_dir: Path,
    *,
    source_root: Path,
    logs_dir: Path,
    dry_run: bool,
    tail_lines: int,
) -> tuple[str, str]:
    source_run_dir = source_root / run_dir.name
    summary_path = run_dir / "run_summary.yaml"

    if not summary_path.is_file():
        return "skipped", f"  [skip] {display_path(summary_path)} - missing run_summary.yaml"

    job_files = sorted(source_run_dir.glob("job_*.txt")) if source_run_dir.is_dir() else []
    if not job_files:
        return "skipped", f"  [skip] {display_path(run_dir)} - no matching job_*.txt files"

    job_ids = parse_job_ids(job_files)
    if not job_ids:
        return "skipped", f"  [skip] {display_path(source_run_dir)} - no job ids found"

    elapsed_seconds = 0
    try:
        for job_id in job_ids:
            elapsed_seconds += load_job_elapsed_seconds(
                logs_dir,
                job_id,
                tail_lines=tail_lines,
            )
    except RuntimeError as exc:
        return "skipped", f"  [skip] {display_path(source_run_dir)} - {exc}"

    existing_payload = load_yaml(summary_path)
    particles_updated = extract_particles_updated(existing_payload)
    summary_metrics = extract_summary_metrics(existing_payload)
    compute_used = round(elapsed_seconds * THREADS_PER_RUN / 3600.0, 2)
    memory_used = round(NODE_MEMORY_GB * THREADS_PER_RUN / NODE_CORES, 2)
    carbon_burnt = round(compute_used * carbon_kg_per_core_hour(), 4)
    payload = {
        "wallclockSeconds": elapsed_seconds,
        "computeUsed": compute_used,
        "memoryUsed": memory_used,
        "carbonBurnt": carbon_burnt,
        "particlesUpdated": particles_updated,
        "summaryMetrics": summary_metrics,
    }

    if dry_run:
        return (
            "updated",
            (
                f"  [dry-run] would update {display_path(summary_path)} "
                f"wallclockSeconds={elapsed_seconds} "
                f"computeUsed={compute_used} "
                f"memoryUsed={memory_used} "
                f"carbonBurnt={carbon_burnt} "
                f"particlesUpdated={particles_updated}"
            ),
        )

    summary_path.write_text(
        yaml.safe_dump(payload, sort_keys=False),
        encoding="utf-8",
    )
    return (
        "updated",
        (
            f"  wrote {display_path(summary_path)} "
            f"wallclockSeconds={elapsed_seconds} "
            f"computeUsed={compute_used} "
            f"memoryUsed={memory_used} "
            f"carbonBurnt={carbon_burnt} "
            f"particlesUpdated={particles_updated}"
        ),
    )


def extract_particles_updated(payload: dict[str, Any]) -> int:
    if "particlesUpdated" in payload:
        return to_int(payload.get("particlesUpdated"))

    legacy_stats = extract_legacy_summary_stats(payload)
    return to_int(legacy_stats.get("particlesUpdated", {}).get("value"))


def extract_summary_metrics(payload: dict[str, Any]) -> dict[str, dict[str, str]]:
    raw_metrics = payload.get("summaryMetrics")
    if isinstance(raw_metrics, dict):
        normalized: dict[str, dict[str, str]] = {}
        for key, metric in raw_metrics.items():
            if not isinstance(metric, dict):
                continue
            value = metric.get("value")
            if value is None:
                continue
            normalized[str(key)] = {
                "label": str(metric.get("label") or key),
                "value": str(value),
            }
        if normalized:
            return normalized

    legacy_stats = extract_legacy_summary_stats(payload)
    summary_metrics: dict[str, dict[str, str]] = {}
    for stat_id, stat in legacy_stats.items():
        if stat_id in RESOURCE_IDS:
            continue
        value = stat.get("value")
        if value is None:
            continue
        summary_metrics[stat_id] = {
            "label": str(stat.get("label") or stat_id),
            "value": str(value),
        }
    return summary_metrics


def extract_legacy_summary_stats(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    summary_stats = payload.get("summaryStats")
    if isinstance(summary_stats, list):
        return index_summary_stats(summary_stats)

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


def carbon_kg_per_core_hour() -> float:
    """Approximate kgCO2e emitted per core-hour on cosma7.

    Derived from the email figures:

    - 175 W/node on cosma7 for compute nodes
    - uplift by 489/341 to include approximate cooling/network/storage overheads
    - 43.1 gCO2/kWh average North East grid intensity

    The result is applied to core-hours, assuming a 256-core node.
    """
    effective_node_power_kw = COSMA7_NODE_POWER_KW * FACILITY_OVERHEAD_MULTIPLIER
    return effective_node_power_kw * NORTH_EAST_GRID_CARBON_KG_PER_KWH / NODE_CORES


def parse_job_ids(job_files: list[Path]) -> list[str]:
    job_ids: list[str] = []

    for job_file in job_files:
        with job_file.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    continue
                job_id = line.split()[0]
                if job_id.isdigit():
                    job_ids.append(job_id)

    return job_ids


def load_job_elapsed_seconds(logs_dir: Path, job_id: str, *, tail_lines: int) -> int:
    log_path = logs_dir / f"swift_{job_id}.out"
    if not log_path.is_file():
        raise RuntimeError(f"missing log file {display_path(log_path)}")

    elapsed_token = extract_elapsed_token(log_path, job_id, tail_lines=tail_lines)
    if elapsed_token is None:
        raise RuntimeError(f"could not extract elapsed time from {display_path(log_path)}")

    return parse_elapsed_seconds(elapsed_token)


def extract_elapsed_token(log_path: Path, job_id: str, *, tail_lines: int) -> str | None:
    lines = read_log_tail_lines(log_path, tail_lines)

    for raw_line in reversed(lines):
        line = raw_line.strip()
        if not line or line.startswith("---") or line.startswith("JobID"):
            continue
        if not line.startswith(job_id):
            continue

        fields = line.split()
        if len(fields) < 2:
            continue

        # The final token is ExitCode, so Elapsed is the token immediately before it.
        candidate = fields[-2]
        if ELAPSED_TOKEN_RE.fullmatch(candidate):
            return candidate

    return None


def read_log_tail_lines(log_path: Path, tail_lines: int) -> list[str]:
    with log_path.open("r", encoding="utf-8", errors="replace") as handle:
        return list(deque(handle, maxlen=tail_lines))


def parse_elapsed_seconds(value: str) -> int:
    match = ELAPSED_TOKEN_RE.fullmatch(value)
    if match is None:
        raise RuntimeError(f"unrecognized elapsed format: {value}")

    days = int(match.group("days") or 0)
    hours = int(match.group("hours"))
    minutes = int(match.group("minutes"))
    seconds = int(match.group("seconds"))

    return (((days * 24) + hours) * 60 + minutes) * 60 + seconds


def to_int(value: Any) -> int:
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return 0


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}
    return raw if isinstance(raw, dict) else {}


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    main()
