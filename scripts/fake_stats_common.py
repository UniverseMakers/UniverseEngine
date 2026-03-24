#!/usr/bin/env python3
"""Generate fake CSV stat streams from ``src/data/simulations.yaml``.

This module exists so each simulation type can have a tiny wrapper script while
all of the shared logic lives in one place. The generated CSV is intentionally
simple: a ``t`` column plus one column per live stat (using ``live_key`` when
present, otherwise the stat id).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import math
import random
import subprocess
from pathlib import Path
from typing import Any

import yaml


REPO_ROOT = Path(__file__).resolve().parent.parent
SIM_CONFIG_PATH = REPO_ROOT / "src" / "data" / "simulations.yaml"


def build_arg_parser(sim_type: str) -> argparse.ArgumentParser:
    """Create the CLI parser for one simulation type.

    Args:
        sim_type: Simulation family id (e.g. "cosmos").

    Returns:
        Configured ArgumentParser instance.
    """
    parser = argparse.ArgumentParser(
        description=f"Generate fake {sim_type} live-stat CSV from an MP4 duration.",
    )
    parser.add_argument("video", help="Path to the MP4 video file")
    parser.add_argument(
        "-o",
        "--output",
        help="Optional output CSV path (defaults next to the video)",
    )
    return parser


def run(sim_type: str) -> None:
    """CLI entrypoint for generating one simulation family's live-stat CSV.

    Args:
        sim_type: Simulation family id (e.g. "galaxy").

    Returns:
        None
    """
    args = build_arg_parser(sim_type).parse_args()
    video_path = Path(args.video).expanduser().resolve()
    if not video_path.exists():
        raise SystemExit(f"Video not found: {video_path}")

    config = load_simulation_config(sim_type)
    duration_seconds = probe_duration_seconds(video_path)
    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else video_path.with_name(f"{video_path.stem}_{sim_type}_stats.csv")
    )

    write_fake_csv(sim_type, config, duration_seconds, output_path, video_path.name)
    print(output_path)


def load_simulation_config(sim_type: str) -> dict[str, Any]:
    """Load one simulation family's YAML config from the repository.

    Args:
        sim_type: Simulation family id.

    Returns:
        Parsed YAML mapping for that simulation family.
    """
    with SIM_CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle)

    if sim_type not in config:
        raise SystemExit(f"Simulation type '{sim_type}' not found in {SIM_CONFIG_PATH}")
    return config[sim_type]


def probe_duration_seconds(video_path: Path) -> float:
    """Read the duration of an MP4 file using ffprobe.

    Args:
        video_path: Path to the MP4 file.

    Returns:
        Duration in seconds (non-negative).
    """
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    return max(float(result.stdout.strip()), 0.0)


def write_fake_csv(
    sim_type: str,
    config: dict[str, Any],
    duration_seconds: float,
    output_path: Path,
    video_name: str,
) -> None:
    """Write a deterministic fake CSV telemetry stream.

    The generated stream contains:
    - a `t` column with timestamps in seconds
    - one column per YAML stat marked `live: true` (keyed by `live_key` or id)

    Args:
        sim_type: Simulation family id.
        config: Simulation family config mapping from YAML.
        duration_seconds: Video duration in seconds.
        output_path: Destination CSV path.
        video_name: Video filename used for deterministic seeding.

    Returns:
        None
    """
    live_stats = [
        stat for stat in config["metadata"].get("liveStats", []) if stat.get("live")
    ]
    stream_keys = [stat.get("live_key") or stat["id"] for stat in live_stats]
    row_count = max(2, min(121, int(math.ceil(duration_seconds * 2)) + 1))
    times = [duration_seconds * i / (row_count - 1) for i in range(row_count)]

    seed_source = f"{sim_type}:{video_name}:{duration_seconds:.3f}"
    rng = random.Random(hashlib.sha256(seed_source.encode("utf-8")).hexdigest())

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["t", *stream_keys])
        writer.writeheader()

        for index, timestamp in enumerate(times):
            progress = 0.0 if duration_seconds <= 0 else timestamp / duration_seconds
            row = {"t": f"{timestamp:.3f}"}
            for stat in live_stats:
                stream_key = stat.get("live_key") or stat["id"]
                row[stream_key] = format_series_value(
                    generate_series_value(
                        sim_type=sim_type,
                        stat=stat,
                        config=config,
                        progress=progress,
                        rng=rng,
                        row_index=index,
                    )
                )
            writer.writerow(row)


def generate_series_value(
    *,
    sim_type: str,
    stat: dict[str, Any],
    config: dict[str, Any],
    progress: float,
    rng: random.Random,
    row_index: int,
) -> float:
    """Generate one numeric value for one stat at a given progress point.

    Args:
        sim_type: Simulation family id.
        stat: YAML stat config mapping.
        config: Full simulation family config mapping.
        progress: Normalized progress through the video (0..1).
        rng: Random generator seeded for deterministic output.
        row_index: Current row index in the output stream.

    Returns:
        Generated numeric value.
    """
    stat_id = stat["id"]
    key = stat.get("live_key") or stat_id
    normalized_key = normalize_key(key)
    base_value = parse_float(stat.get("value"), default=0.0)
    parameters = config.get("parameters", {})
    correct_values = config.get("metadata", {}).get("correctValues", {})

    if normalized_key == "age":
        max_age = 13.8 if sim_type == "cosmos" else 12.6
        return max_age * progress

    if normalized_key == "redshift":
        start = 12.0 if sim_type == "cosmos" else 4.0
        return max(start * (1.0 - progress), 0.0)

    if normalized_key == "size":
        stellar_mass = parameters.get("stellar_mass", {}).get("default", 5.0)
        final_size = 8.0 + stellar_mass * 3.5
        eased = 1.0 - (1.0 - progress) ** 2
        return final_size * eased

    if normalized_key == "time":
        return 48.0 * progress

    if normalized_key == "temperature":
        peak = 1800.0
        baseline = max(base_value, 280.0)
        return baseline + math.sin(progress * math.pi) * (peak - baseline)

    if normalized_key == "earth_mass":
        return 1.0 - 0.08 * math.sin(progress * math.pi * 0.5)

    if normalized_key == "similarity_score":
        distance = mean_normalized_distance(parameters, correct_values)
        base_score = max(0.0, (1.0 - distance) * 100.0)
        wobble = math.sin(progress * math.pi * 2.0) * 2.0
        return max(0.0, min(100.0, base_score + wobble))

    if stat_id in parameters:
        parameter = parameters[stat_id]
        start = float(parameter.get("default", base_value))
        target = float(correct_values.get(stat_id, start))
        wobble = (
            math.sin(progress * math.pi * (row_index % 5 + 1))
            * 0.04
            * max(abs(target), 1.0)
        )
        return start + (target - start) * progress + wobble

    drift = math.sin(progress * math.pi * 2.0 + rng.random()) * max(
        base_value * 0.08, 0.2
    )
    return base_value + drift


def mean_normalized_distance(
    parameters: dict[str, Any], correct_values: dict[str, Any]
) -> float:
    """Compute mean normalized distance between defaults and "correct" values.

    Args:
        parameters: Mapping of parameter id -> parameter config.
        correct_values: Mapping of parameter id -> correct value.

    Returns:
        Mean normalized absolute distance in [0, 1] when ranges are well-formed.
    """
    distances: list[float] = []
    for parameter_id, parameter in parameters.items():
        default = float(parameter.get("default", 0.0))
        correct = float(correct_values.get(parameter_id, default))
        minimum = float(parameter.get("min", default))
        maximum = float(parameter.get("max", default))
        scale = max(maximum - minimum, 1e-9)
        distances.append(abs(default - correct) / scale)
    if not distances:
        return 0.0
    return sum(distances) / len(distances)


def parse_float(raw_value: Any, default: float) -> float:
    """Parse an arbitrary value as float.

    Args:
        raw_value: Any raw value (string/number/etc.).
        default: Default to return when parsing fails.

    Returns:
        Parsed float when possible, otherwise `default`.
    """
    if raw_value is None:
        return default
    try:
        return float(raw_value)
    except (TypeError, ValueError):
        return default


def format_series_value(value: float) -> str:
    """Format a numeric stat value for CSV output.

    Args:
        value: Numeric value.

    Returns:
        Compact string representation.
    """
    return f"{value:.6f}".rstrip("0").rstrip(".")


def normalize_key(key: str) -> str:
    """Normalize a stat key to a consistent snake_case-like identifier.

    Args:
        key: Raw key (may include spaces/case).

    Returns:
        Normalized key.
    """
    return key.strip().lower().replace(" ", "_")
