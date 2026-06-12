#!/usr/bin/env python3
"""Generate the run manifest consumed by the frontend.

Scans the local asset tree under ``public/assets/<family>/`` and emits a
manifest registry of every available run with its video views, parameter
values, and paths to sidecar data files.

Run ``generate_run_summaries.py`` first to create the per-run
``run_summary.yaml`` files that this script references.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Callable

import yaml


REPO_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_ROOT = REPO_ROOT / "public"
ASSET_ROOT = PUBLIC_ROOT / "assets"
SIM_CONFIG_PATH = REPO_ROOT / "src" / "selection" / "simulation-catalog.yaml"
LOCAL_MANIFEST_PATH = ASSET_ROOT / "local-manifest.json"
ONLINE_MANIFEST_PATH = ASSET_ROOT / "run-manifest.json"

SIMULATION_DIRECTORIES = ("planetary", "galaxy", "cosmos")

SKIP_NAMES = frozenset({".DS_Store", "__pycache__", ".ipynb_checkpoints"})

VIDEO_EXTENSIONS = frozenset({".mp4", ".webm", ".mov", ".mkv"})

METADATA_EXTENSIONS = frozenset({".csv", ".yaml", ".yml", ".json", ".txt", ".html"})

STATIC_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp", ".svg"})

# Filename patterns that should never be uploaded (debug artifacts, build-time
# intermediate files, comparison grids not consumed by the frontend).
_UPLOAD_SKIP_FILENAMES = frozenset(
    {"all_videos_comparison_2x2.mp4", "final_snapshot_summary.csv"}
)
_UPLOAD_SKIP_PATTERNS = (
    "live_data_table_L",  # debug-res HTML/CSV telemetry variants
)

# Legacy fallback for run directories that do not yet have a
# ``parameters.yaml``. When the YAML is present it takes precedence over
# token-based parsing.
RUN_TOKEN_MAP: dict[str, dict[str, str]] = {
    "cosmos": {
        "Fb": "baryon_fraction",
        "Ef": "black_hole_strength",
        "G": "gravity_strength",
    },
}


def discover_runs(
    assets_root: Path | None = None,
    themes: tuple[str, ...] = SIMULATION_DIRECTORIES,
) -> dict[str, list[Path]]:
    """Return theme name -> sorted list of run directory Paths.

    Only directories that contain at least one non-skipped file
    (recursively) are considered runs.

    This function is reused by the R2 upload script to avoid duplicating
    directory-walking logic.

    Args:
        assets_root: Root of the asset tree (defaults to ``public/assets``).
        themes: Simulation family directory names to scan.

    Returns:
        Mapping of theme name to a sorted list of run directory paths.
    """
    if assets_root is None:
        assets_root = ASSET_ROOT

    result: dict[str, list[Path]] = {}

    for theme in themes:
        theme_dir = assets_root / theme
        if not theme_dir.is_dir():
            continue
        runs: list[Path] = []
        for entry in sorted(theme_dir.iterdir()):
            if not entry.is_dir():
                continue
            if entry.name in SKIP_NAMES or entry.name.startswith("."):
                continue
            if any(
                p.is_file() and not _should_skip_file(p)
                for p in entry.rglob("*")
            ):
                runs.append(entry)
        if runs:
            result[theme] = runs

    return result


def discover_files_for_upload(
    assets_root: Path,
    themes: tuple[str, ...] = SIMULATION_DIRECTORIES,
) -> dict[str, dict[str, dict[str, list[Path]]]]:
    """Walk the assets tree and return files grouped for upload.

    Args:
        assets_root: Root of the asset tree.
        themes: Simulation family directory names to scan.

    Returns:
        Nested dict of the form::

            {
                "theme_name": {
                    "run_name": {
                        "animations": [Path, ...],
                        "metadata": [Path, ...],
                    }
                }
            }

        Only files that should be uploaded are included; junk files, hidden
        files, and bare directories are excluded.
    """
    result: dict[str, dict[str, dict[str, list[Path]]]] = {}

    discovered = discover_runs(assets_root, themes)

    for theme, run_dirs in discovered.items():
        theme_entry: dict[str, dict[str, list[Path]]] = {}
        for run_dir in run_dirs:
            animations: list[Path] = []
            metadata: list[Path] = []
            for file_path in sorted(run_dir.rglob("*")):
                if not file_path.is_file():
                    continue
                if _should_skip_file(file_path):
                    continue
                rel = file_path.relative_to(run_dir)
                if rel.parts[0] == "animations":
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


def _should_skip_file(path: Path) -> bool:
    """Return True if the file should not be uploaded or published.

    Args:
        path: File path to check.

    Returns:
        True if the file matches skip patterns or has an unrecognised
        extension.
    """
    name = path.name
    if name in SKIP_NAMES or name.endswith(".pyc") or name.startswith("."):
        return True
    for part in path.parts:
        if part in SKIP_NAMES or part.startswith("."):
            return True
    if name in _UPLOAD_SKIP_FILENAMES:
        return True
    if any(name.startswith(pat) for pat in _UPLOAD_SKIP_PATTERNS):
        return True
    ext = path.suffix.lower()
    return (
        ext not in VIDEO_EXTENSIONS
        and ext not in METADATA_EXTENSIONS
        and ext not in STATIC_EXTENSIONS
    )


def main() -> None:
    """Entry point: scan run directories and write the selected manifest."""
    args = parse_args()
    sim_config = load_simulation_config()
    output_path = resolve_output_path(args)
    path_builder = build_path_builder(args)
    manifest: dict[str, object] = {"version": 1, "runs": []}

    for simulation_id in SIMULATION_DIRECTORIES:
        sim_root = ASSET_ROOT / simulation_id
        if not sim_root.exists():
            continue

        for run_dir in sorted(
            path for path in sim_root.iterdir() if path.is_dir()
        ):
            entry = build_manifest_entry(
                simulation_id, run_dir, sim_config, path_builder
            )
            if entry is not None:
                manifest["runs"].append(entry)  # type: ignore[union-attr]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(output_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--local",
        action="store_true",
        help="Generate a local manifest using public/assets-relative paths.",
    )
    parser.add_argument(
        "--cloudflare-base",
        help="Public base URL used to emit online asset URLs.",
    )
    parser.add_argument(
        "--output",
        help="Optional explicit output path for the generated manifest.",
    )
    return parser.parse_args()


def resolve_output_path(args: argparse.Namespace) -> Path:
    if args.output:
        return Path(args.output).resolve()
    if args.local or not args.cloudflare_base:
        return LOCAL_MANIFEST_PATH
    return ONLINE_MANIFEST_PATH


def build_path_builder(args: argparse.Namespace) -> Callable[[Path], str]:
    if args.local or not args.cloudflare_base:
        return to_public_relative_path

    cloudflare_base = args.cloudflare_base.rstrip("/")

    def to_cloudflare_path(path: Path) -> str:
        return f"{cloudflare_base}/{path.relative_to(ASSET_ROOT).as_posix()}"

    return to_cloudflare_path


def load_simulation_config() -> dict[str, Any]:
    """Load the simulation configuration YAML.

    Returns:
        Parsed config dict, or an empty dict if the file is missing.
    """
    if not SIM_CONFIG_PATH.exists():
        return {}
    with SIM_CONFIG_PATH.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def build_manifest_entry(
    simulation_id: str,
    run_dir: Path,
    sim_config: dict[str, Any],
    path_builder: Callable[[Path], str],
) -> dict[str, Any] | None:
    """Build a single manifest entry for one run directory.

    Args:
        simulation_id: Simulation family name (e.g. "cosmos").
        run_dir: Path to the run's directory.
        sim_config: Parsed simulation configuration.

    Returns:
        Manifest entry dict, or None if the run has no video files.
    """
    animations_dir = run_dir / "animations"
    videos = (
        sorted(animations_dir.glob("*.mp4"))
        if animations_dir.exists()
        else []
    )
    if not videos:
        return None

    live_data_path = run_dir / "live_data_table.csv"
    run_summary_yaml = run_dir / "run_summary.yaml"

    view_paths = {
        infer_view_id(video): path_builder(video)
        for video in videos
    }
    default_view = pick_default_view(view_paths)

    return {
        "simulationId": simulation_id,
        "runId": run_dir.name,
        "parameters": parse_run_parameters(simulation_id, run_dir),
        "liveDataPath": path_builder(live_data_path),
        "summaryPath": path_builder(run_summary_yaml),
        "defaultView": default_view,
        "views": view_paths,
        "availableViews": sorted(view_paths.keys()),
        "parameterDefaults": build_parameter_defaults(
            simulation_id, sim_config
        ),
    }


def build_parameter_defaults(
    simulation_id: str,
    sim_config: dict[str, Any],
) -> dict[str, float]:
    """Extract default parameter values from the simulation config.

    Args:
        simulation_id: Simulation family name.
        sim_config: Parsed simulation configuration.

    Returns:
        Mapping of parameter id -> default value.
    """
    parameter_config = sim_config.get(simulation_id, {}).get("parameters", {})
    return {
        parameter_id: float(config.get("default", 0))
        for parameter_id, config in parameter_config.items()
    }


def parse_run_parameters(
    simulation_id: str, run_dir: Path
) -> dict[str, float]:
    """Read run parameters from ``parameters.yaml`` or parse directory name.

    Args:
        simulation_id: Simulation family name.
        run_dir: Path to the run's directory.

    Returns:
        Mapping of parameter id -> value.
    """
    params_yaml = run_dir / "parameters.yaml"
    if params_yaml.exists():
        with params_yaml.open("r", encoding="utf-8") as handle:
            raw: dict[str, Any] = yaml.safe_load(handle) or {}
        return {str(k): float(v) for k, v in raw.items()}

    return _parse_run_parameters_from_tokens(simulation_id, run_dir.name)


def _parse_run_parameters_from_tokens(
    simulation_id: str, run_id: str
) -> dict[str, float]:
    """Legacy fallback: parse parameters from a tokenised directory name.

    Args:
        simulation_id: Simulation family name (used to look up the token map).
        run_id: Directory name containing tokenised parameters.

    Returns:
        Mapping of parameter id -> value.
    """
    token_map = RUN_TOKEN_MAP.get(simulation_id, {})
    parsed: dict[str, float] = {}

    for token in parse_parameter_tokens(run_id):
        parameter_id = token_map.get(token["prefix"])
        if parameter_id is None:
            continue
        parsed[parameter_id] = token["value"]

    return parsed


def parse_parameter_tokens(run_id: str) -> list[dict[str, str | float]]:
    """Extract parameter tokens from a run directory name.

    Tokens are of the form ``PrefixValue`` (e.g. ``Fb1.5_Ef2.0``).

    Args:
        run_id: Directory name.

    Returns:
        List of dicts with ``prefix`` (str) and ``value`` (float) keys.
    """
    tokens: list[dict[str, str | float]] = []
    for chunk in run_id.split("_"):
        match = re.fullmatch(r"([A-Za-z]+)([-+]?\d+(?:\.\d+)?)", chunk)
        if not match:
            continue
        tokens.append(
            {
                "prefix": match.group(1),
                "value": float(match.group(2)),
            }
        )
    return tokens


def infer_view_id(video_path: Path) -> str:
    """Map a video filename to its frontend view id.

    Args:
        video_path: Path to the video file.

    Returns:
        View id string (e.g. "gas_density").
    """
    name = video_path.stem
    if name == "Gas_Density_-_Viola":
        return "gas_density"
    if name == "Gas_Temperature_-_Pride":
        return "gas_temperature"
    if name == "DM_Density_-_Emergency":
        return "dark_matter_density"
    if name == "Gas_Metallicity_plus_Stellar_Density__inferno":
        return "gas_metallicity_stellar_density"
    return normalize_key(name)


def pick_default_view(view_paths: dict[str, str]) -> str:
    """Pick the default view from a set of available views.

    Prefers ``gas_density`` when available; otherwise returns the first key.

    Args:
        view_paths: Mapping of view id -> relative path.

    Returns:
        The default view id.
    """
    if "gas_density" in view_paths:
        return "gas_density"
    return next(iter(view_paths))


def to_public_relative_path(path: Path) -> str:
    """Convert an absolute path to a path relative to ``public/``.

    Args:
        path: Absolute filesystem path.

    Returns:
        POSIX-style relative path string.
    """
    return path.relative_to(PUBLIC_ROOT).as_posix()


def normalize_key(label: str) -> str:
    """Convert a label string to a lowercase snake_case key.

    Args:
        label: A human-readable label.

    Returns:
        Normalised key.
    """
    normalized = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return re.sub(r"_+", "_", normalized)


if __name__ == "__main__":
    main()
