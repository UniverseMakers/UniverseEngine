#!/usr/bin/env python3
"""Upload engine simulation assets to Cloudflare R2.

This script recursively walks a local assets/ directory tree, uploads every
relevant file to Cloudflare R2 (preserving directory structure under a
configurable remote prefix), and can optionally upload an already-generated
frontend manifest as a final publishing step.

Requirements
------------
* Python >= 3.9
* boto3 >= 1.28 (``pip install boto3``)
* PyYAML (``pip install pyyaml``) — required by the manifest generator

Environment Variables
---------------------
* ``R2_ACCOUNT_ID``        — Cloudflare account ID (required)
* ``R2_ACCESS_KEY_ID``     — R2 API access key ID (required)
* ``R2_SECRET_ACCESS_KEY`` — R2 API secret access key (required)
* ``R2_BUCKET``            — default bucket name (overridden by ``--bucket``)

Usage Examples
--------------
.. code-block:: bash

    # Dry-run to see what would happen
    python scripts/upload_engine_assets_to_r2.py \\
        --assets-dir public/assets --prefix engine --dry-run

    # Upload everything (new and changed files only)
    python scripts/upload_engine_assets_to_r2.py \\
        --assets-dir public/assets --prefix engine

    # Upload assets, then publish an already-generated online manifest
    python scripts/upload_engine_assets_to_r2.py \\
        --assets-dir public/assets --prefix engine \\
        --manifest-path public/assets/run-manifest.json

    # Force re-upload every file regardless of remote state
    python scripts/upload_engine_assets_to_r2.py \\
        --assets-dir public/assets --prefix engine --force

    # Delete remote files that no longer exist locally (use with care)
    python scripts/upload_engine_assets_to_r2.py \\
        --assets-dir public/assets --prefix engine --delete-stale
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import sys
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Try to import the shared discovery functions from the sibling manifest
# generator.  If that fails (e.g. missing PyYAML), fall back to our own
# lightweight walker so the upload script can still run standalone.
# ---------------------------------------------------------------------------
try:
    from generate_run_manifest import (
        discover_files_for_upload,
        SIMULATION_DIRECTORIES as DEFAULT_THEMES,
        SKIP_NAMES,
        VIDEO_EXTENSIONS,
        METADATA_EXTENSIONS,
        STATIC_EXTENSIONS,
    )
    _use_shared_discovery = True
except ImportError:
    _use_shared_discovery = False

    SKIP_NAMES = frozenset({".DS_Store", "__pycache__", ".ipynb_checkpoints"})
    VIDEO_EXTENSIONS = frozenset({".mp4", ".webm", ".mov", ".mkv"})
    METADATA_EXTENSIONS = frozenset({".csv", ".yaml", ".yml", ".json", ".txt", ".html"})
    STATIC_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".svg"})
    DEFAULT_THEMES = ("cosmos", "galaxy", "planetary")

    _SKIP_FILENAMES = frozenset({"all_videos_comparison_2x2.mp4", "final_snapshot_summary.csv"})
    _SKIP_PATTERNS = ("live_data_table_L",)


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ASSETS_DIR = REPO_ROOT / "public" / "assets"

# ---------------------------------------------------------------------------
# Content-Type overrides (mimetypes is a fallback)
# ---------------------------------------------------------------------------
CONTENT_TYPE_MAP: dict[str, str] = {
    ".mp4":  "video/mp4",
    ".webm": "video/webm",
    ".mov":  "video/quicktime",
    ".mkv":  "video/x-matroska",
    ".csv":  "text/csv",
    ".yaml": "application/x-yaml",
    ".yml":  "application/x-yaml",
    ".json": "application/json",
    ".txt":  "text/plain",
    ".html": "text/html",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg":  "image/svg+xml",
}

# ---------------------------------------------------------------------------
# Cache-Control headers grouped by asset category
# ---------------------------------------------------------------------------
CACHE_IMMUTABLE = "public, max-age=31536000, immutable"
CACHE_MODERATE  = "public, max-age=3600"
CACHE_MANIFEST  = "public, max-age=300"


# ===========================================================================
# Helpers
# ===========================================================================

def _should_skip_file(path: Path) -> bool:
    """Return True if *path* should not be uploaded."""
    name = path.name
    if name in SKIP_NAMES:
        return True
    if name.endswith(".pyc"):
        return True
    if name.startswith("."):
        return True
    for part in path.parts:
        if part in SKIP_NAMES or part.startswith("."):
            return True
    if name in _SKIP_FILENAMES:
        return True
    if any(name.startswith(pat) for pat in _SKIP_PATTERNS):
        return True
    ext = path.suffix.lower()
    return ext not in VIDEO_EXTENSIONS and ext not in METADATA_EXTENSIONS and ext not in STATIC_EXTENSIONS


def _relative_to_assets_root(file_path: Path, assets_root: Path) -> str:
    """Return the forward-slash path of *file_path* relative to *assets_root*."""
    return file_path.relative_to(assets_root).as_posix()


def _get_content_type(file_path: Path) -> str:
    """Determine the Content-Type header for *file_path*."""
    ext = file_path.suffix.lower()
    if ext in CONTENT_TYPE_MAP:
        return CONTENT_TYPE_MAP[ext]
    guessed, _ = mimetypes.guess_type(str(file_path))
    return guessed or "application/octet-stream"


def _get_cache_control(file_path: Path, remote_key: str) -> str:
    """Return the appropriate Cache-Control value for a remote object."""
    if remote_key.endswith("/manifest.json") or remote_key.endswith("/run-manifest.json"):
        return CACHE_MANIFEST
    ext = file_path.suffix.lower()
    if ext in VIDEO_EXTENSIONS or ext in STATIC_EXTENSIONS:
        return CACHE_IMMUTABLE
    return CACHE_MODERATE


def _normalise_remote_key(prefix: str, rel_path: str) -> str:
    """Build a clean R2 object key: ``<prefix>/<relative-path>``."""
    prefix = prefix.strip("/")
    rel_path = rel_path.strip("/")
    if prefix:
        return f"{prefix}/{rel_path}"
    return rel_path


# ===========================================================================
# Environment / validation
# ===========================================================================

def _env_or_die(name: str) -> str:
    """Read a required env var or exit with a helpful message."""
    value = os.environ.get(name, "").strip()
    if not value:
        print(
            f"ERROR: Environment variable {name} is not set.\n"
            f"Set it before running this script, e.g.:\n"
            f"  export {name}=<value>",
            file=sys.stderr,
        )
        sys.exit(1)
    return value


# ===========================================================================
# Standalone discovery (fallback when the manifest generator is absent)
# ===========================================================================

def _discover_files_local(
    assets_root: Path,
    themes: tuple[str, ...],
) -> dict[str, dict[str, dict[str, list[Path]]]]:
    """Walk *assets_root* and return theme -> run -> {animations, metadata}.

    Used as a fallback when ``generate_run_manifest`` cannot be imported.
    """
    result: dict[str, dict[str, dict[str, list[Path]]]] = {}

    for theme in sorted(themes):
        theme_dir = assets_root / theme
        if not theme_dir.is_dir():
            continue
        theme_entry: dict[str, dict[str, list[Path]]] = {}
        for run_dir in sorted(theme_dir.iterdir()):
            if not run_dir.is_dir():
                continue
            if run_dir.name in SKIP_NAMES or run_dir.name.startswith("."):
                continue
            animations: list[Path] = []
            metadata: list[Path] = []
            for file_path in sorted(run_dir.rglob("*")):
                if not file_path.is_file():
                    continue
                if _should_skip_file(file_path):
                    continue
                if file_path.relative_to(run_dir).parts[0] == "animations":
                    animations.append(file_path)
                else:
                    metadata.append(file_path)
            if animations or metadata:
                theme_entry[run_dir.name] = {
                    "animations": animations,
                    "metadata": metadata,
                }
        if theme_entry:
            result[theme] = theme_entry

    return result


# ===========================================================================
# R2 client
# ===========================================================================

def _create_r2_client(account_id: str, access_key: str, secret_key: str) -> Any:
    """Return a boto3 S3 client pointed at the R2 endpoint."""
    try:
        import boto3
        from botocore.config import Config as BotoConfig
    except ImportError:
        print(
            "ERROR: boto3 is not installed. Install it with:\n"
            "  pip install boto3",
            file=sys.stderr,
        )
        sys.exit(1)

    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=BotoConfig(
            region_name="auto",
            retries={"max_attempts": 3, "mode": "standard"},
            s3={"addressing_style": "path"},
        ),
    )


# ===========================================================================
# Upload operations
# ===========================================================================

def _collect_upload_tasks(
    assets_root: Path,
    prefix: str,
    themes: tuple[str, ...],
) -> list[tuple[Path, str, str, str]]:
    """Return a flat list of (local_path, remote_key, content_type, cache_control)."""
    tasks: list[tuple[Path, str, str, str]] = []

    discovered: dict[str, dict[str, dict[str, list[Path]]]]
    if _use_shared_discovery:
        discovered = discover_files_for_upload(assets_root, themes)
    else:
        discovered = _discover_files_local(assets_root, themes)

    for theme_name in sorted(discovered):
        for run_name in sorted(discovered[theme_name]):
            run = discovered[theme_name][run_name]
            if not run["animations"]:
                continue  # skip runs with no videos
            for category in ("animations", "metadata"):
                for file_path in sorted(run[category]):
                    rel = _relative_to_assets_root(file_path, assets_root)
                    key = _normalise_remote_key(prefix, rel)
                    ct = _get_content_type(file_path)
                    cc = _get_cache_control(file_path, key)
                    tasks.append((file_path, key, ct, cc))

    return tasks


def _resolve_manifest_upload(
    manifest_path: Path | None,
    manifest_key: str,
    prefix: str,
) -> tuple[Path, str] | None:
    """Resolve an optional existing manifest to upload after asset files."""
    if manifest_path is None:
        return None

    resolved_path = manifest_path.expanduser().resolve()
    if not resolved_path.is_file():
        raise SystemExit(f"ERROR: Manifest file does not exist: {resolved_path}")

    remote_key = _normalise_remote_key(prefix, manifest_key)
    return resolved_path, remote_key


def _remote_exists(
    s3: Any,
    bucket: str,
    remote_key: str,
) -> tuple[bool, int]:
    """Check if *remote_key* exists. Returns (exists, size_bytes)."""
    try:
        resp = s3.head_object(Bucket=bucket, Key=remote_key)
        size = resp.get("ContentLength", 0)
        return True, size
    except s3.exceptions.ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey"):
            return False, 0
        raise


def _should_reupload(
    s3: Any,
    bucket: str,
    local_path: Path,
    remote_key: str,
    force: bool,
) -> tuple[bool, int]:
    """Return (should_upload, remote_size)."""
    if force:
        return True, 0
    exists, size = _remote_exists(s3, bucket, remote_key)
    if not exists:
        return True, 0
    if local_path.stat().st_size != size:
        return True, size
    return False, size


def _delete_remote_keys(
    s3: Any,
    bucket: str,
    keys: list[str],
    dry_run: bool,
) -> int:
    """Delete remote objects in batches. Returns count of deleted keys."""
    deleted = 0
    for i in range(0, len(keys), 1000):
        batch = keys[i : i + 1000]
        if not dry_run:
            s3.delete_objects(
                Bucket=bucket,
                Delete={"Objects": [{"Key": k} for k in batch], "Quiet": True},
            )
        deleted += len(batch)
        if dry_run:
            for k in batch:
                print(f"  [dry-run] would delete: {k}")
    return deleted


# ===========================================================================
# Main entry point
# ===========================================================================

def main() -> None:
    """Upload selected engine assets, and optionally the manifest, to R2."""
    parser = argparse.ArgumentParser(
        description="Upload Universe Engine assets to Cloudflare R2.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--assets-dir",
        type=Path,
        default=DEFAULT_ASSETS_DIR,
        help=f"Local assets root directory (default: {DEFAULT_ASSETS_DIR})",
    )
    parser.add_argument(
        "--bucket",
        type=str,
        default="",
        help="R2 bucket name (overrides R2_BUCKET env var)",
    )
    parser.add_argument(
        "--prefix",
        type=str,
        default="engine",
        help="Remote key prefix (default: engine)",
    )
    parser.add_argument(
        "--manifest-path",
        type=Path,
        default=None,
        help="Optional existing manifest file to upload after the assets.",
    )
    parser.add_argument(
        "--manifest-key",
        type=str,
        default="run-manifest.json",
        help="Remote manifest object key relative to --prefix (default: run-manifest.json)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be uploaded without touching R2",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-upload every file, ignoring remote state",
    )
    parser.add_argument(
        "--delete-stale",
        action="store_true",
        help="Delete remote objects under the prefix that no longer exist locally (DANGER: opt-in only)",
    )
    parser.add_argument(
        "--themes",
        type=str,
        nargs="*",
        default=None,
        help="Restrict upload to specific themes (e.g. cosmos galaxy). Default: auto-detect.",
    )

    args = parser.parse_args()

    # -----------------------------------------------------------------------
    # 1. Validate local inputs
    # -----------------------------------------------------------------------
    assets_root = args.assets_dir.resolve()
    if not assets_root.is_dir():
        print(
            f"ERROR: Assets directory does not exist: {assets_root}",
            file=sys.stderr,
        )
        sys.exit(1)

    prefix = args.prefix.strip("/")
    if not prefix:
        print("ERROR: --prefix must not be empty.", file=sys.stderr)
        sys.exit(1)

    themes: tuple[str, ...]
    if args.themes:
        themes = tuple(args.themes)
    else:
        # Auto-detect themes present in the assets directory
        detected: list[str] = []
        for d in sorted(assets_root.iterdir()):
            if d.is_dir() and d.name not in SKIP_NAMES and not d.name.startswith("."):
                detected.append(d.name)
        themes = tuple(detected) if detected else DEFAULT_THEMES

    manifest_upload = _resolve_manifest_upload(
        args.manifest_path,
        args.manifest_key,
        prefix,
    )

    # -----------------------------------------------------------------------
    # 2. Dry-run: print everything and exit
    # -----------------------------------------------------------------------
    if args.dry_run:
        _print_dry_run(args, themes, manifest_upload)
        return

    # -----------------------------------------------------------------------
    # 3. Validate bucket and credentials (required for real uploads)
    # -----------------------------------------------------------------------
    bucket = args.bucket or os.environ.get("R2_BUCKET", "").strip()
    if not bucket:
        print(
            "ERROR: No bucket specified. Set R2_BUCKET env var or use --bucket.",
            file=sys.stderr,
        )
        sys.exit(1)

    account_id = _env_or_die("R2_ACCOUNT_ID")
    access_key = _env_or_die("R2_ACCESS_KEY_ID")
    secret_key = _env_or_die("R2_SECRET_ACCESS_KEY")

    s3 = _create_r2_client(account_id, access_key, secret_key)

    # -----------------------------------------------------------------------
    # 4. Collect upload tasks
    # -----------------------------------------------------------------------
    tasks = _collect_upload_tasks(assets_root, prefix, themes)

    # -----------------------------------------------------------------------
    # 5. Upload assets
    # -----------------------------------------------------------------------
    stats = {
        "scanned": len(tasks),
        "uploaded": 0,
        "skipped": 0,
        "deleted": 0,
        "bytes_uploaded": 0,
        "errors": 0,
    }

    for local_path, remote_key, content_type, cache_control in tasks:
        try:
            should_up, remote_size = _should_reupload(
                s3, bucket, local_path, remote_key, args.force
            )
            if not should_up:
                stats["skipped"] += 1
                print(f"  SKIP  {remote_key}  (unchanged)")
                continue

            print(f"  PUT   {remote_key}  ({_format_size(local_path.stat().st_size)})")
            s3.upload_file(
                str(local_path),
                bucket,
                remote_key,
                ExtraArgs={
                    "ContentType":  content_type,
                    "CacheControl": cache_control,
                },
            )
            stats["uploaded"] += 1
            stats["bytes_uploaded"] += local_path.stat().st_size

        except Exception as exc:
            stats["errors"] += 1
            print(f"  ERROR {remote_key}: {exc}", file=sys.stderr)

    # -----------------------------------------------------------------------
    # 6. Upload manifest
    # -----------------------------------------------------------------------
    manifest_key: str | None = None
    if manifest_upload is not None:
        manifest_path, manifest_key = manifest_upload
        try:
            print(f"  PUT   {manifest_key}  ({_format_size(manifest_path.stat().st_size)})")
            s3.upload_file(
                str(manifest_path),
                bucket,
                manifest_key,
                ExtraArgs={
                    "ContentType": "application/json",
                    "CacheControl": CACHE_MANIFEST,
                },
            )
            stats["uploaded"] += 1
            stats["bytes_uploaded"] += manifest_path.stat().st_size
        except Exception as exc:
            stats["errors"] += 1
            print(f"  ERROR {manifest_key}: {exc}", file=sys.stderr)

    # -----------------------------------------------------------------------
    # 7. Delete stale remote objects (opt-in)
    # -----------------------------------------------------------------------
    if args.delete_stale:
        print()
        print("  *** --delete-stale is enabled ***")
        print("  Scanning for remote objects that no longer exist locally...")

        local_keys: set[str] = {t[1] for t in tasks}
        if manifest_key is not None:
            local_keys.add(manifest_key)
        remote_keys: set[str] = set()

        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=f"{prefix}/"):
            for obj in page.get("Contents", []):
                remote_keys.add(obj["Key"])

        stale = sorted(remote_keys - local_keys)
        if stale:
            print(f"  Found {len(stale)} stale remote files:")
            for k in stale[:20]:
                print(f"    {k}")
            if len(stale) > 20:
                print(f"    ... and {len(stale) - 20} more")
            stats["deleted"] = _delete_remote_keys(s3, bucket, stale, dry_run=False)
        else:
            print("  No stale remote files found.")

    # -----------------------------------------------------------------------
    # 8. Summary
    # -----------------------------------------------------------------------
    print()
    print("  ──────────────────────────────────────────")
    print(f"  Files scanned:        {stats['scanned']}")
    print(f"  Files uploaded:       {stats['uploaded']}")
    print(f"  Files skipped:        {stats['skipped']}")
    if args.delete_stale:
        print(f"  Files deleted:        {stats['deleted']}")
    if stats["errors"]:
        print(f"  Errors:               {stats['errors']}")
    print(f"  Total bytes uploaded: {_format_size(stats['bytes_uploaded'])}")
    if manifest_key is not None:
        print(f"  Manifest path:        {manifest_key}")
    print(f"  Bucket:               {bucket}")
    print(f"  Remote prefix:        {prefix}/")
    print("  ──────────────────────────────────────────")

    if stats["errors"]:
        sys.exit(1)


# ===========================================================================
# Dry-run output
# ===========================================================================

def _print_dry_run(
    args: argparse.Namespace,
    themes: tuple[str, ...],
    manifest_upload: tuple[Path, str] | None,
) -> None:
    """Pretty-print what would happen in a real run.

    Args:
        args: Parsed CLI arguments.
        themes: Theme ids included in the upload.
        manifest_upload: Optional manifest path and remote key pair.
    """
    print(f"DRY-RUN MODE — no files will be modified\n")
    print(f"  Assets dir:  {args.assets_dir}")
    print(f"  Prefix:      {args.prefix}/")
    print(f"  Themes:      {', '.join(themes)}")
    if args.force:
        print(f"  Mode:        --force (all files re-uploaded)")
    if args.delete_stale:
        print(f"  Mode:        --delete-stale (stale remote files would be deleted)")
    if args.manifest_path:
        print(f"  Manifest path: {args.manifest_path}")
        print(f"  Manifest key:  {_normalise_remote_key(args.prefix, args.manifest_key)}")
    print()

    tasks = _collect_upload_tasks(args.assets_dir, args.prefix, themes)

    extra_files = 1 if manifest_upload is not None else 0
    print(f"  Files to upload ({len(tasks) + extra_files}):")
    print(f"  {'─' * 72}")

    total_bytes = 0
    for local_path, remote_key, content_type, _cache_control in tasks:
        try:
            size = local_path.stat().st_size
            total_bytes += size
        except OSError:
            size = 0
        print(f"  {_format_size(size):>8}  {content_type:<24}  {remote_key}")

    if manifest_upload is not None:
        manifest_path, manifest_key = manifest_upload
        manifest_size = manifest_path.stat().st_size
        print(f"  {'─' * 72}")
        print(f"  {_format_size(manifest_size):>8}  application/json         {manifest_key}  (manifest)")
        total_bytes += manifest_size

    print(f"  {'─' * 72}")
    print(f"  {_format_size(total_bytes):>8}  TOTAL across {len(tasks) + extra_files} files")


def _format_size(num_bytes: float | int) -> str:
    """Format a byte count for terminal output.

    Args:
        num_bytes: Byte count.

    Returns:
        Human-readable size string.
    """
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num_bytes) < 1024.0:
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} PB"


if __name__ == "__main__":
    main()
