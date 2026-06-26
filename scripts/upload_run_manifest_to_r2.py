#!/usr/bin/env python3
"""Upload the generated online run manifest to Cloudflare R2."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from generate_run_manifest import ONLINE_MANIFEST_PATH, _env_or_die, create_r2_client


CACHE_MANIFEST = "no-store, max-age=0"


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments.

    Returns:
        Parsed CLI namespace.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest-path",
        type=Path,
        default=ONLINE_MANIFEST_PATH,
        help=f"Manifest file to upload (default: {ONLINE_MANIFEST_PATH})",
    )
    parser.add_argument(
        "--bucket",
        default="",
        help="R2 bucket name (overrides R2_BUCKET env var)",
    )
    parser.add_argument(
        "--remote-key",
        default="engine/run-manifest.json",
        help="Remote object key for the manifest (default: engine/run-manifest.json)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be uploaded without touching R2",
    )
    return parser.parse_args()


def main() -> None:
    """Upload the selected manifest file to R2."""
    args = parse_args()
    manifest_path = args.manifest_path.expanduser().resolve()
    if not manifest_path.is_file():
        raise SystemExit(f"ERROR: Manifest file does not exist: {manifest_path}")

    validate_manifest_json(manifest_path)

    bucket = args.bucket or os.environ.get("R2_BUCKET", "").strip()
    if not bucket:
        raise SystemExit(
            "ERROR: No bucket specified. Set R2_BUCKET or use --bucket."
        )

    remote_key = args.remote_key.strip("/")
    if not remote_key:
        raise SystemExit("ERROR: --remote-key must not be empty.")

    size = manifest_path.stat().st_size

    if args.dry_run:
        print("DRY-RUN MODE — no files will be modified")
        print(f"  Manifest:     {manifest_path}")
        print(f"  Bucket:       {bucket}")
        print(f"  Remote key:   {remote_key}")
        print(f"  Size:         {format_size(size)}")
        print(f"  Cache-Control:{CACHE_MANIFEST}")
        return

    s3 = create_r2_client(
        _env_or_die("R2_ACCOUNT_ID"),
        _env_or_die("R2_ACCESS_KEY_ID"),
        _env_or_die("R2_SECRET_ACCESS_KEY"),
    )

    print(f"  PUT   {remote_key}  ({format_size(size)})")
    s3.upload_file(
        str(manifest_path),
        bucket,
        remote_key,
        ExtraArgs={
            "ContentType": "application/json",
            "CacheControl": CACHE_MANIFEST,
        },
    )
    print()
    print("  ──────────────────────────────────────────")
    print(f"  Uploaded manifest:    {manifest_path}")
    print(f"  Bucket:               {bucket}")
    print(f"  Remote key:           {remote_key}")
    print(f"  Total bytes uploaded: {format_size(size)}")
    print("  ──────────────────────────────────────────")


def validate_manifest_json(path: Path) -> None:
    """Fail early if a manifest file is not valid run-manifest JSON.

    Args:
        path: Path to the manifest JSON file.
    """
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"ERROR: Invalid JSON manifest: {exc}") from exc

    if not isinstance(payload, dict) or "runs" not in payload:
        raise SystemExit("ERROR: Manifest JSON does not look like a run manifest.")


def format_size(num_bytes: float | int) -> str:
    """Format a byte count for terminal output.

    Args:
        num_bytes: Byte count.

    Returns:
        Human-readable size string.
    """
    value = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(value) < 1024.0:
            return f"{value:.1f} {unit}"
        value /= 1024.0
    return f"{value:.1f} PB"


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
