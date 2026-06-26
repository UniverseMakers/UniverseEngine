#!/usr/bin/env python3
"""Delete Cloudflare R2 objects matching one or more glob patterns.

Examples:

    python3 scripts/delete_r2_objects.py \
        "engine/planetary/*/animations/pressure.mp4" \
        --dry-run

    python3 scripts/delete_r2_objects.py \
        "engine/planetary/*/animations/pressure.mp4"
"""

from __future__ import annotations

import argparse
import fnmatch
import os
import sys
from typing import Any

from generate_run_manifest import _env_or_die, create_r2_client


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "patterns",
        nargs="+",
        help="Glob pattern(s) to match against full R2 object keys.",
    )
    parser.add_argument(
        "--bucket",
        default="",
        help="R2 bucket name (overrides R2_BUCKET env var)",
    )
    parser.add_argument(
        "--prefix",
        default="",
        help="Optional list prefix to reduce scan scope, e.g. engine/planetary/",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print matching keys without deleting them.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    bucket = args.bucket or os.environ.get("R2_BUCKET", "").strip()
    if not bucket:
        raise SystemExit("ERROR: No bucket specified. Set R2_BUCKET or use --bucket.")

    s3 = create_r2_client(
        _env_or_die("R2_ACCOUNT_ID"),
        _env_or_die("R2_ACCESS_KEY_ID"),
        _env_or_die("R2_SECRET_ACCESS_KEY"),
    )

    prefix = args.prefix.strip("/")
    list_prefix = f"{prefix}/" if prefix else ""
    remote_keys = list_remote_keys(s3, bucket, list_prefix)
    matched_keys = sorted(
        key
        for key in remote_keys
        if any(fnmatch.fnmatchcase(key, pattern) for pattern in args.patterns)
    )

    if not matched_keys:
        print("No matching objects found.")
        return

    print(f"Matched {len(matched_keys)} object(s):")
    for key in matched_keys:
        print(f"  {key}")

    if args.dry_run:
        print()
        print("Dry run only; no objects were deleted.")
        return

    deleted = delete_remote_keys(s3, bucket, matched_keys)
    print()
    print(f"Deleted {deleted} object(s).")


def list_remote_keys(s3: Any, bucket: str, prefix: str) -> list[str]:
    keys: list[str] = []
    paginator = s3.get_paginator("list_objects_v2")

    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            keys.append(obj["Key"])

    return keys


def delete_remote_keys(s3: Any, bucket: str, keys: list[str]) -> int:
    deleted = 0

    for index in range(0, len(keys), 1000):
        batch = keys[index : index + 1000]
        s3.delete_objects(
            Bucket=bucket,
            Delete={"Objects": [{"Key": key} for key in batch], "Quiet": True},
        )
        deleted += len(batch)

    return deleted


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
        sys.exit(130)
