#!/usr/bin/env python3
"""Update planetary run summary runtimes from SWIFT restart logs.

Each source run directory contains a ``job_*.txt`` file listing the SLURM job ids
used for that run across restarts. For every job id we read the matching
``swift_<jobid>.out`` log, extract the final summary-table ``Elapsed`` value, sum
those elapsed durations, convert the total to seconds, and write that value into
the corresponding asset run's ``run_summary.yaml`` as ``wallclockSeconds``.

Defaults are set for the current COSMA layout but can be overridden.
"""

from __future__ import annotations

import argparse
import glob
import re
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE_GLOB = "/cosma5/data/dp004/vreke/swift/rssse/pE*/job_*.txt"
DEFAULT_LOGS_DIR = Path("/cosma5/data/dp004/vreke/swift/rssse/outs_and_errs")
DEFAULT_ASSETS_DIR = REPO_ROOT / "public" / "assets" / "planetary"

ELAPSED_TOKEN_RE = re.compile(
    r"^(?:(?P<days>\d+)-)?(?P<hours>\d+):(?P<minutes>\d{2}):(?P<seconds>\d{2})$"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-glob",
        default=DEFAULT_SOURCE_GLOB,
        help="Glob pattern for source run job files.",
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
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    logs_dir = args.logs_dir.expanduser().resolve()
    assets_dir = args.assets_dir.expanduser().resolve()
    job_files = sorted(Path(path).resolve() for path in glob.glob(args.source_glob))

    if not logs_dir.is_dir():
        raise SystemExit(f"ERROR: logs directory does not exist: {logs_dir}")
    if not assets_dir.is_dir():
        raise SystemExit(f"ERROR: assets directory does not exist: {assets_dir}")
    if not job_files:
        raise SystemExit(f"ERROR: no job files matched: {args.source_glob}")

    updated = 0
    skipped = 0

    for job_file in job_files:
        run_id = job_file.parent.name
        summary_path = assets_dir / run_id / "run_summary.yaml"

        if not summary_path.is_file():
            print(f"  [skip] {display_path(summary_path)} - missing run_summary.yaml")
            skipped += 1
            continue

        job_ids = parse_job_ids(job_file)
        if not job_ids:
            print(f"  [skip] {display_path(job_file)} - no job ids found")
            skipped += 1
            continue

        elapsed_seconds = 0
        try:
            for job_id in job_ids:
                elapsed_seconds += load_job_elapsed_seconds(logs_dir, job_id)
        except RuntimeError as exc:
            print(f"  [skip] {display_path(job_file)} - {exc}")
            skipped += 1
            continue

        payload = load_yaml(summary_path)
        payload["wallclockSeconds"] = elapsed_seconds

        if args.dry_run:
            print(
                f"  [dry-run] would update {display_path(summary_path)} "
                f"wallclockSeconds={elapsed_seconds}"
            )
        else:
            summary_path.write_text(
                yaml.safe_dump(payload, sort_keys=False),
                encoding="utf-8",
            )
            print(
                f"  wrote {display_path(summary_path)} "
                f"wallclockSeconds={elapsed_seconds}"
            )
        updated += 1

    print(f"updated={updated} skipped={skipped}")


def parse_job_ids(job_file: Path) -> list[str]:
    job_ids: list[str] = []

    with job_file.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line:
                continue
            job_id = line.split()[0]
            if job_id.isdigit():
                job_ids.append(job_id)

    return job_ids


def load_job_elapsed_seconds(logs_dir: Path, job_id: str) -> int:
    log_path = logs_dir / f"swift_{job_id}.out"
    if not log_path.is_file():
        raise RuntimeError(f"missing log file {display_path(log_path)}")

    elapsed_token = extract_elapsed_token(log_path, job_id)
    if elapsed_token is None:
        raise RuntimeError(f"could not extract elapsed time from {display_path(log_path)}")

    return parse_elapsed_seconds(elapsed_token)


def extract_elapsed_token(log_path: Path, job_id: str) -> str | None:
    with log_path.open("r", encoding="utf-8", errors="replace") as handle:
        lines = handle.readlines()

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


def parse_elapsed_seconds(value: str) -> int:
    match = ELAPSED_TOKEN_RE.fullmatch(value)
    if match is None:
        raise RuntimeError(f"unrecognized elapsed format: {value}")

    days = int(match.group("days") or 0)
    hours = int(match.group("hours"))
    minutes = int(match.group("minutes"))
    seconds = int(match.group("seconds"))

    return (((days * 24) + hours) * 60 + minutes) * 60 + seconds


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
