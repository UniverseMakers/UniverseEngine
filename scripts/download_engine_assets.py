#!/usr/bin/env python3
"""Download all simulation assets referenced in an online run manifest.

Reads ``run-manifest.json`` (the online manifest with R2 public URLs) and
downloads every referenced file into the local ``public/assets/`` directory
tree, mirroring the per-run layout the app expects:

::

    public/assets/<simulation>/<run>/run_summary.yaml
    public/assets/<simulation>/<run>/live_data_table.csv
    public/assets/<simulation>/<run>/animations/<view>.mp4

Usage::

    # Download everything for all three simulation families
    python scripts/download_engine_assets.py

    # Download only cosmos assets
    python scripts/download_engine_assets.py --simulation cosmos

    # Dry-run — show what would be downloaded
    python scripts/download_engine_assets.py --dry-run

    # Download from a specific manifest path
    python scripts/download_engine_assets.py --manifest public/assets/run-manifest.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import urlopen


PUBLIC_ASSETS = Path("public/assets")
DEFAULT_MANIFEST = PUBLIC_ASSETS / "run-manifest.json"
CHUNK_SIZE = 8 * 1024 * 1024  # 8 MiB


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST,
        help=f"Path to the online run manifest (default: {DEFAULT_MANIFEST})",
    )
    parser.add_argument(
        "--simulation",
        choices=("cosmos", "galaxy", "planetary"),
        help="Only download assets for this simulation family",
    )
    parser.add_argument(
        "--assets-dir",
        type=Path,
        default=PUBLIC_ASSETS,
        help=f"Local assets root (default: {PUBLIC_ASSETS})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be downloaded without touching disk",
    )
    return parser.parse_args()


def load_manifest(path: Path) -> dict[str, Any]:
    """Load and validate the run manifest."""
    if not path.is_file():
        raise SystemExit(f"ERROR: Manifest not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict) or "runs" not in payload:
        raise SystemExit("ERROR: Manifest does not contain a 'runs' key.")
    return payload


def run_output_path(entry: dict[str, Any], assets_dir: Path) -> Path:
    """Return the local output directory for a run entry."""
    return assets_dir / entry["simulationId"] / entry["runId"]


def collect_downloads(
    manifest: dict[str, Any], simulation: str | None, assets_dir: Path
) -> list[dict[str, str]]:
    """Build an ordered list of {url, dest_path} download tasks."""
    tasks: list[dict[str, str]] = []

    for entry in manifest["runs"]:
        sim = entry.get("simulationId", "")
        if simulation and sim != simulation:
            continue

        run = entry.get("runId", "")
        if not run:
            continue

        base = run_output_path(entry, assets_dir)

        # ── summary YAML ───────────────────────────────────────────────
        summary_url = entry.get("summaryPath", "")
        if summary_url:
            tasks.append({
                "url": summary_url,
                "dest": str(base / "run_summary.yaml"),
            })

        # ── live data CSV ──────────────────────────────────────────────
        live_url = entry.get("liveDataPath", "")
        if live_url:
            tasks.append({
                "url": live_url,
                "dest": str(base / "live_data_table.csv"),
            })

        # ── parameter YAML (if present) ────────────────────────────────
        params_url = entry.get("paramsPath", "")
        if params_url:
            tasks.append({
                "url": params_url,
                "dest": str(base / "parameters.yaml"),
            })

        # ── view videos ────────────────────────────────────────────────
        for view_id, video_url in entry.get("views", {}).items():
            filename = urlparse(video_url).path.rsplit("/", 1)[-1]
            tasks.append({
                "url": video_url,
                "dest": str(base / "animations" / filename),
            })

    return tasks


def format_size(num_bytes: int) -> str:
    """Format a byte count for terminal output."""
    for unit in ("B", "KB", "MB", "GB"):
        if abs(num_bytes) < 1024:
            return f"{num_bytes:.0f} {unit}"
        num_bytes /= 1024
    return f"{num_bytes:.1f} TB"


def download_file(url: str, dest: str, dry_run: bool) -> bool:
    """Download one file.  Returns True on success (or dry-run)."""
    dest_path = Path(dest)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    if dry_run:
        print(f"  [DRY-RUN] {url}")
        return True

    # Skip if the file already exists and is non-empty.
    if dest_path.exists() and dest_path.stat().st_size > 0:
        return True

    try:
        with urlopen(url) as response:
            length = response.headers.get("Content-Length")
            total = int(length) if length else None
            downloaded = 0
            start = time.monotonic()

            with dest_path.open("wb") as out:
                while True:
                    chunk = response.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    out.write(chunk)
                    downloaded += len(chunk)

            elapsed = time.monotonic() - start
            rate = (downloaded / elapsed / 1_048_576) if elapsed > 0 else 0
            msg = f"  {format_size(downloaded)}"
            if total and total > 0:
                msg += f" / {format_size(total)}"
            print(f"{msg}  {rate:.0f} MiB/s  {url.rsplit('/', 1)[-1]}")
            return True
    except Exception as exc:
        print(f"  FAILED  {url}  ({exc})", file=sys.stderr)
        return False


def main() -> None:
    args = parse_args()
    manifest = load_manifest(args.manifest.expanduser().resolve())
    assets_dir = args.assets_dir.expanduser().resolve()

    tasks = collect_downloads(manifest, args.simulation, assets_dir)

    if not tasks:
        sim_msg = f" for '{args.simulation}'" if args.simulation else ""
        print(f"No download tasks found{sim_msg} in {args.manifest}")
        return

    print(f"Downloading {len(tasks)} files to {assets_dir}")
    if args.dry_run:
        print("DRY-RUN MODE — no files will be written\n")
    else:
        print()

    succeeded = 0
    failed = 0

    for task in tasks:
        ok = download_file(task["url"], task["dest"], args.dry_run)
        if ok:
            succeeded += 1
        else:
            failed += 1

    print()
    print(f"Done. {succeeded} succeeded, {failed} failed.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
