"""Generate galaxy run metadata from the final live-data CSV row.

This script scans either a galaxy family directory such as
``public/assets/galaxy`` or a single galaxy run directory. For each run it:

* reads the final row of ``live_data_table.csv``
* writes ``parameters.yaml`` with the scored comparison parameters
* writes ``run_summary.yaml`` with display-friendly summary metrics

The three scored galaxy parameters are derived from these CSV columns:

* ``StellarMassWithinR200_Msun`` -> ``stellar_mass`` (x10^10 Msun)
* ``BHSubgridMassWithinR200_Msun`` -> ``black_hole_mass`` (x10^6 Msun)
* ``StellarMassWeightedAge_yr`` -> ``galaxy_age`` (Gyr)
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GALAXY_ROOT = REPO_ROOT / "public" / "assets" / "galaxy"
SKIP_NAMES = frozenset({".DS_Store", "__pycache__", ".ipynb_checkpoints"})

CSV_COLUMNS = {
    "stellar_mass": "StellarMassWithinR200_Msun",
    "black_hole_mass": "BHSubgridMassWithinR200_Msun",
    "galaxy_age": "StellarMassWeightedAge_yr",
    "track_id": "TrackId",
    "frame_num": "FrameNum",
    "redshift": "Redshift",
    "cosmic_time_gyr": "CosmicTime_Gyr",
    "halo_mass_msun": "M200_Msun",
    "stellar_half_mass_radius_kpc": "StellarHalfMassRadius_kpc",
    "dark_matter_mass_msun": "DMMassWithinR200_Msun",
    "gas_mass_msun": "GasMassWithinR200_Msun",
    "star_formation_rate_msun_per_yr": "StarFormationRateWithinR200_Msun_per_yr",
    "gas_metal_mass_fraction": "GasMetalMassFractionWithinR200",
    "gas_metal_mass_msun": "GasMetalMassWithinR200_Msun",
    "molecular_hydrogen_mass_msun": "MolecularHydrogenMassWithinR200_Msun",
    "atomic_hydrogen_mass_msun": "AtomicHydrogenMassWithinR200_Msun",
}

SUMMARY_LABELS = {
    "stellar_mass": "Stellar mass (x10^10 Msun)",
    "stellar_mass_msun": "Stellar mass (Msun)",
    "black_hole_mass": "Black hole mass (x10^6 Msun)",
    "black_hole_mass_msun": "Black hole mass (Msun)",
    "galaxy_age": "Galaxy age (Gyr)",
    "stellar_size_kpc": "Stellar size (kpc)",
    "star_formation_rate_msun_per_yr": "Star formation rate (Msun/yr)",
    "halo_mass_msun": "Halo mass (Msun)",
    "dark_matter_mass_msun": "Dark matter mass (Msun)",
    "gas_mass_msun": "Gas mass (Msun)",
    "gas_metal_mass_fraction": "Gas metal mass fraction",
    "gas_metal_mass_msun": "Gas metal mass (Msun)",
    "molecular_hydrogen_mass_msun": "Molecular hydrogen mass (Msun)",
    "atomic_hydrogen_mass_msun": "Atomic hydrogen mass (Msun)",
    "redshift": "Redshift",
    "cosmic_time_gyr": "Cosmic time (Gyr)",
    "track_id": "Track ID",
    "frame_num": "Final frame",
}


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments.

    Returns:
        Parsed CLI namespace.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "path",
        nargs="?",
        default=str(DEFAULT_GALAXY_ROOT),
        help="Galaxy theme directory or individual run directory.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be written without changing files.",
    )
    return parser.parse_args()


def main() -> None:
    """Run the metadata generation workflow."""
    args = parse_args()
    target = Path(args.path).expanduser().resolve()
    run_dirs = discover_run_dirs(target)

    if not run_dirs:
        raise SystemExit(f"No galaxy runs found under {target}")

    for run_dir in run_dirs:
        process_run(run_dir, dry_run=args.dry_run)


def discover_run_dirs(target: Path) -> list[Path]:
    """Resolve one or more galaxy run directories from a user path.

    Args:
        target: Either a family directory or a single run directory.

    Returns:
        Sorted list of galaxy run directories.
    """
    if not target.exists():
        raise SystemExit(f"Path does not exist: {target}")

    if (target / "live_data_table.csv").exists():
        return [target]

    if not target.is_dir():
        raise SystemExit(f"Path is not a directory: {target}")

    run_dirs: list[Path] = []
    for entry in sorted(target.iterdir()):
        if not entry.is_dir() or entry.name.startswith(".") or entry.name in SKIP_NAMES:
            continue
        if (entry / "live_data_table.csv").exists():
            run_dirs.append(entry)
    return run_dirs


def process_run(run_dir: Path, *, dry_run: bool) -> None:
    """Generate metadata files for one run directory.

    Args:
        run_dir: Galaxy run directory to process.
        dry_run: When ``True``, only report what would be written.
    """
    live_data_path = run_dir / "live_data_table.csv"
    parameters_path = run_dir / "parameters.yaml"
    summary_path = run_dir / "run_summary.yaml"

    last_row = read_last_live_data_row(live_data_path)
    if not last_row:
        print(f"  [skip] {run_dir.relative_to(REPO_ROOT)} - empty live_data_table.csv")
        return

    parameters = build_parameters(last_row)
    resource_metrics = load_existing_resource_metrics(summary_path)
    summary_metrics = build_summary_metrics(last_row, parameters)
    payload = {
        **resource_metrics,
        "summaryMetrics": summary_metrics,
    }

    if dry_run:
        print(f"  [dry-run] would write {parameters_path.relative_to(REPO_ROOT)}")
        print(f"  [dry-run] would write {summary_path.relative_to(REPO_ROOT)}")
        return

    write_yaml(parameters_path, parameters)
    write_yaml(summary_path, payload)
    print(f"  wrote {parameters_path.relative_to(REPO_ROOT)}")
    print(f"  wrote {summary_path.relative_to(REPO_ROOT)}")


def read_last_live_data_row(path: Path) -> dict[str, str]:
    """Read the final telemetry row from a live-data CSV.

    Args:
        path: Path to ``live_data_table.csv``.

    Returns:
        Final row keyed by CSV column name, or an empty mapping when the file is
        empty.
    """
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        last_row: dict[str, str] | None = None
        for row in reader:
            last_row = dict(row)
    return last_row or {}


def build_parameters(last_row: dict[str, str]) -> dict[str, float]:
    """Extract the scored galaxy parameters from the final telemetry row.

    Args:
        last_row: Final CSV row keyed by column name.

    Returns:
        Parameter mapping written to ``parameters.yaml``.
    """
    return {
        "stellar_mass": scaled_value(last_row, CSV_COLUMNS["stellar_mass"], 1.0e10),
        "black_hole_mass": scaled_value(
            last_row, CSV_COLUMNS["black_hole_mass"], 1.0e6
        ),
        "galaxy_age": scaled_value(last_row, CSV_COLUMNS["galaxy_age"], 1.0e9),
    }


def load_existing_resource_metrics(summary_path: Path) -> dict[str, float | int]:
    """Preserve existing resource totals from an existing summary file.

    Args:
        summary_path: Path to ``run_summary.yaml``.

    Returns:
        Resource metric mapping with sensible zeros when the file does not yet
        exist.
    """
    if not summary_path.exists():
        return {
            "wallclockSeconds": 0,
            "computeUsed": 0.0,
            "memoryUsed": 0.0,
            "carbonBurnt": 0.0,
            "particlesUpdated": 0,
        }

    with summary_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}

    return {
        "wallclockSeconds": int(raw.get("wallclockSeconds", 0) or 0),
        "computeUsed": float(raw.get("computeUsed", 0.0) or 0.0),
        "memoryUsed": float(raw.get("memoryUsed", 0.0) or 0.0),
        "carbonBurnt": float(raw.get("carbonBurnt", 0.0) or 0.0),
        "particlesUpdated": int(raw.get("particlesUpdated", 0) or 0),
    }


def build_summary_metrics(
    last_row: dict[str, str], parameters: dict[str, float]
) -> dict[str, dict[str, str]]:
    """Build display-ready galaxy summary metrics.

    Args:
        last_row: Final CSV row keyed by column name.
        parameters: Derived scored parameter values.

    Returns:
        Mapping of summary metric id to ``label`` and ``value`` strings.
    """
    metrics: dict[str, dict[str, str]] = {
        "stellar_mass": metric("stellar_mass", format_decimal(parameters["stellar_mass"])),
        "stellar_mass_msun": metric(
            "stellar_mass_msun", format_scientific(raw_value(last_row, CSV_COLUMNS["stellar_mass"]))
        ),
        "black_hole_mass": metric(
            "black_hole_mass", format_decimal(parameters["black_hole_mass"])
        ),
        "black_hole_mass_msun": metric(
            "black_hole_mass_msun",
            format_scientific(raw_value(last_row, CSV_COLUMNS["black_hole_mass"])),
        ),
        "galaxy_age": metric("galaxy_age", format_decimal(parameters["galaxy_age"])),
        "stellar_size_kpc": metric(
            "stellar_size_kpc",
            format_decimal(raw_value(last_row, CSV_COLUMNS["stellar_half_mass_radius_kpc"])),
        ),
        "star_formation_rate_msun_per_yr": metric(
            "star_formation_rate_msun_per_yr",
            format_decimal(raw_value(last_row, CSV_COLUMNS["star_formation_rate_msun_per_yr"])),
        ),
        "halo_mass_msun": metric(
            "halo_mass_msun", format_scientific(raw_value(last_row, CSV_COLUMNS["halo_mass_msun"]))
        ),
        "dark_matter_mass_msun": metric(
            "dark_matter_mass_msun",
            format_scientific(raw_value(last_row, CSV_COLUMNS["dark_matter_mass_msun"])),
        ),
        "gas_mass_msun": metric(
            "gas_mass_msun", format_scientific(raw_value(last_row, CSV_COLUMNS["gas_mass_msun"]))
        ),
        "gas_metal_mass_fraction": metric(
            "gas_metal_mass_fraction",
            format_decimal(raw_value(last_row, CSV_COLUMNS["gas_metal_mass_fraction"])),
        ),
        "gas_metal_mass_msun": metric(
            "gas_metal_mass_msun",
            format_scientific(raw_value(last_row, CSV_COLUMNS["gas_metal_mass_msun"])),
        ),
        "molecular_hydrogen_mass_msun": metric(
            "molecular_hydrogen_mass_msun",
            format_scientific(raw_value(last_row, CSV_COLUMNS["molecular_hydrogen_mass_msun"])),
        ),
        "atomic_hydrogen_mass_msun": metric(
            "atomic_hydrogen_mass_msun",
            format_scientific(raw_value(last_row, CSV_COLUMNS["atomic_hydrogen_mass_msun"])),
        ),
        "redshift": metric(
            "redshift", format_decimal(raw_value(last_row, CSV_COLUMNS["redshift"]))
        ),
        "cosmic_time_gyr": metric(
            "cosmic_time_gyr",
            format_decimal(raw_value(last_row, CSV_COLUMNS["cosmic_time_gyr"])),
        ),
        "track_id": metric("track_id", format_integer(raw_value(last_row, CSV_COLUMNS["track_id"]))),
        "frame_num": metric(
            "frame_num", format_integer(raw_value(last_row, CSV_COLUMNS["frame_num"]))
        ),
    }
    return metrics


def scaled_value(last_row: dict[str, str], column: str, divisor: float) -> float:
    """Read one raw value and scale it into display units.

    Args:
        last_row: Final CSV row keyed by column name.
        column: Source CSV column name.
        divisor: Scaling factor converting raw units into display units.

    Returns:
        Scaled numeric value.
    """
    return raw_value(last_row, column) / divisor


def raw_value(last_row: dict[str, str], column: str) -> float:
    """Read one required numeric value from the final CSV row.

    Args:
        last_row: Final CSV row keyed by column name.
        column: Required source column name.

    Returns:
        Parsed float value.
    """
    raw = (last_row.get(column) or "").strip()
    if not raw:
        raise SystemExit(f"Missing required column value: {column}")
    return float(raw)


def metric(metric_id: str, value: str) -> dict[str, str]:
    """Build one summary metric payload row.

    Args:
        metric_id: Stable metric identifier.
        value: Display-ready metric value.

    Returns:
        Mapping with ``label`` and ``value`` keys.
    """
    return {
        "label": SUMMARY_LABELS[metric_id],
        "value": value,
    }


def format_decimal(value: float) -> str:
    """Format a decimal value for YAML output.

    Args:
        value: Numeric value.

    Returns:
        Decimal string without redundant trailing zeros.
    """
    return f"{value:.6f}".rstrip("0").rstrip(".")


def format_scientific(value: float) -> str:
    """Format a value in scientific notation.

    Args:
        value: Numeric value.

    Returns:
        Scientific-notation string.
    """
    return f"{value:.6e}"


def format_integer(value: float) -> str:
    """Format a value as a rounded integer string.

    Args:
        value: Numeric value.

    Returns:
        Rounded integer string.
    """
    return str(int(round(value)))


def write_yaml(path: Path, payload: dict[str, Any]) -> None:
    """Write a YAML payload with stable key ordering.

    Args:
        path: Destination YAML path.
        payload: Mapping to serialize.
    """
    path.write_text(
        yaml.safe_dump(payload, sort_keys=False, allow_unicode=False),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
