#!/usr/bin/env python3
"""Generate compact gallery thumbnails for every manifest run.

Planetary thumbnails are imported from the FOSMoonEngine gallery. Galaxy and
cosmos thumbnails use the final decoded frame of their HST and gas-density
videos respectively.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_ROOT = REPO_ROOT / "public"
DEFAULT_MANIFEST = PUBLIC_ROOT / "assets" / "local-manifest.json"
DEFAULT_PLANETARY_SOURCE = (
    REPO_ROOT.parent.parent / "FOSMoonEngine" / "public" / "assets" / "planetary"
)
THUMBNAIL_WIDTH = 416
THUMBNAIL_HEIGHT = 360
THUMBNAIL_QUALITY = 76
GALLERY_VIEWS = {"galaxy": "hst", "cosmos": "gas_density"}
SIMULATIONS = ("planetary", "galaxy", "cosmos")


@dataclass(frozen=True)
class ThumbnailJob:
    simulation_id: str
    run_id: str
    source: Path
    destination: Path
    source_is_video: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST,
        help="Local run manifest to read.",
    )
    parser.add_argument(
        "--simulation",
        action="append",
        choices=SIMULATIONS,
        help="Generate one family (repeatable). Defaults to all families.",
    )
    parser.add_argument(
        "--planetary-source",
        type=Path,
        default=DEFAULT_PLANETARY_SOURCE,
        help="Directory containing FOSMoonEngine planetary run directories.",
    )
    parser.add_argument("--force", action="store_true", help="Replace existing thumbnails.")
    parser.add_argument("--dry-run", action="store_true", help="Report work without writing files.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    simulations = tuple(args.simulation or SIMULATIONS)
    manifest_path = args.manifest.expanduser().resolve()
    planetary_source = args.planetary_source.expanduser().resolve()

    if not manifest_path.is_file():
        raise SystemExit(f"ERROR: manifest does not exist: {manifest_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    jobs, missing = build_jobs(manifest, simulations, planetary_source)
    pending = [job for job in jobs if args.force or not job.destination.exists()]
    skipped = len(jobs) - len(pending)

    print(f"Gallery thumbnail jobs: {len(jobs)}")
    print(f"Already present: {skipped}")
    print(f"To generate: {len(pending)}")

    if missing:
        print(f"Missing sources: {len(missing)}", file=sys.stderr)
        for message in missing:
            print(f"  {message}", file=sys.stderr)

    if args.dry_run:
        for job in pending:
            print(f"  WOULD GENERATE {job.destination}")
        if missing:
            raise SystemExit(1)
        return

    require_command("ffmpeg")
    require_command("cwebp")

    generated = 0
    failed: list[str] = []
    for index, job in enumerate(pending, start=1):
        print(f"[{index}/{len(pending)}] {job.simulation_id}/{job.run_id}")
        try:
            generate_thumbnail(job)
            generated += 1
        except (OSError, subprocess.CalledProcessError) as error:
            failed.append(f"{job.simulation_id}/{job.run_id}: {error}")

    print(f"Generated: {generated}")
    print(f"Skipped: {skipped}")
    print(f"Failed: {len(failed)}")
    for message in failed:
        print(f"  {message}", file=sys.stderr)

    if missing or failed:
        raise SystemExit(1)


def build_jobs(
    manifest: dict[str, Any],
    simulations: tuple[str, ...],
    planetary_source: Path,
) -> tuple[list[ThumbnailJob], list[str]]:
    jobs: list[ThumbnailJob] = []
    missing: list[str] = []

    for entry in manifest.get("runs", []):
        simulation_id = str(entry.get("simulationId") or "")
        run_id = str(entry.get("runId") or "")
        if simulation_id not in simulations or not run_id:
            continue

        destination = (
            PUBLIC_ROOT
            / "assets"
            / simulation_id
            / run_id
            / "gallery-thumbnail.webp"
        )
        source_is_video = simulation_id != "planetary"

        if simulation_id == "planetary":
            source = planetary_source / run_id / "gallery-thumbnail.png"
        else:
            view_id = GALLERY_VIEWS[simulation_id]
            view_path = (entry.get("views") or {}).get(view_id)
            if not isinstance(view_path, str) or not view_path:
                missing.append(f"{simulation_id}/{run_id}: missing {view_id} view")
                continue
            source = manifest_path_to_local_file(view_path)

        if not source.is_file():
            missing.append(f"{simulation_id}/{run_id}: {source}")
            continue

        jobs.append(
            ThumbnailJob(
                simulation_id=simulation_id,
                run_id=run_id,
                source=source,
                destination=destination,
                source_is_video=source_is_video,
            )
        )

    return jobs, missing


def manifest_path_to_local_file(path: str) -> Path:
    normalized = path.split("?", 1)[0].lstrip("/")
    return PUBLIC_ROOT / normalized


def require_command(command: str) -> None:
    if shutil.which(command) is None:
        raise SystemExit(f"ERROR: required command is not installed: {command}")


def generate_thumbnail(job: ThumbnailJob) -> None:
    job.destination.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="universe-gallery-") as temp_dir:
        frame_path = Path(temp_dir) / "frame.png"
        encoded_path = Path(temp_dir) / "thumbnail.webp"
        filter_graph = (
            f"scale={THUMBNAIL_WIDTH}:{THUMBNAIL_HEIGHT}:"
            "force_original_aspect_ratio=increase,"
            f"crop={THUMBNAIL_WIDTH}:{THUMBNAIL_HEIGHT}"
        )

        command = ["ffmpeg", "-loglevel", "error"]
        if job.source_is_video:
            command.extend(["-sseof", "-1"])
        command.extend(["-i", str(job.source), "-an", "-vf", filter_graph])
        if job.source_is_video:
            command.extend(["-fps_mode", "vfr", "-update", "1"])
        else:
            command.extend(["-frames:v", "1"])
        command.extend(["-y", str(frame_path)])
        subprocess.run(command, check=True)

        subprocess.run(
            [
                "cwebp",
                "-quiet",
                "-q",
                str(THUMBNAIL_QUALITY),
                str(frame_path),
                "-o",
                str(encoded_path),
            ],
            check=True,
        )
        encoded_path.replace(job.destination)


if __name__ == "__main__":
    main()
