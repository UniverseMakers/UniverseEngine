#!/usr/bin/env python3
"""Animate parameter distribution diagnostics from D1 tracking data.

Each valid row in ``run_selections`` maps to one animation frame.  The script
uses the same YAML parameter metadata and D1 query path as
``plot_param_distributions.py``.

Usage:
    python3 scripts/animate_param_distributions.py --remote
    python3 scripts/animate_param_distributions.py --remote --fps 30
    python3 scripts/animate_param_distributions.py --remote --max-frames 120
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import shutil
import subprocess
import sys
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterable

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LogNorm

try:
    from tqdm import tqdm
except ImportError:  # pragma: no cover - optional CLI nicety
    tqdm = None

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from plot_param_distributions import (  # noqa: E402
    EXPECTED_PARAMS,
    FAMILY_CMAP,
    FAMILY_COLORS,
    FAMILY_LABELS,
    configure_axis,
    fetch_rows,
    get_parameter_edges,
    get_param_label,
    get_quali_labels,
    is_log_param,
    remove_axis_frame,
    hide_overlapping_corner_x_tick_labels,
    set_parameter_ylim,
    to_plot_space,
)


Entry = dict[str, Any]
FrameState = dict[str, Any]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Animate parameter distribution diagnostics from D1")
    parser.add_argument("--remote", action="store_true", help="Query the remote D1 database")
    parser.add_argument("--out", type=Path, default=Path("animations"), help="Output directory")
    parser.add_argument("--fps", type=int, default=60, help="Animation frame rate (default: 60)")
    parser.add_argument("--dpi", type=int, default=120, help="Output DPI (default: 120)")
    parser.add_argument("--duration", type=float, default=30.0,
                        help="Animation runtime in seconds for time mode (default: 30)")
    parser.add_argument("--jobs", type=int, default=1,
                        help="Number of animations to render in parallel (default: 1)")
    parser.add_argument("--frame-jobs", type=int, default=1,
                        help="Number of frames to render in parallel inside supported animations (default: 1)")
    parser.add_argument(
        "--frame-mode",
        choices=("count", "time", "rows"),
        default="count",
        help=(
            "Frame scheduling: count splits ordered rows evenly across fps*duration; "
            "time samples uniformly in wall-clock time; rows uses one frame per row "
            "(default: count)"
        ),
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=None,
        help="Cap rendered frames; useful for smoke tests",
    )
    parser.add_argument(
        "--families",
        nargs="+",
        choices=sorted(FAMILY_LABELS.keys()),
        default=sorted(FAMILY_LABELS.keys()),
        help="Simulation families to animate",
    )
    parser.add_argument(
        "--plots",
        nargs="+",
        choices=("corners", "histograms", "run-activity", "timeseries"),
        default=("corners", "histograms", "run-activity", "timeseries"),
        help="Animation groups to render",
    )
    return parser.parse_args()


def parse_entries(rows: list[dict[str, Any]]) -> list[Entry]:
    entries: list[Entry] = []
    discarded = 0

    for row in rows:
        family = row["simulation_id"]
        expected = EXPECTED_PARAMS.get(family)
        if expected is None:
            discarded += 1
            continue
        try:
            params = json.loads(row["parameters_json"])
        except (json.JSONDecodeError, TypeError):
            discarded += 1
            continue

        if expected is not None and set(params.keys()) != expected:
            discarded += 1
            continue

        entries.append({
            "ts": datetime.fromisoformat(row["created_at"]).replace(tzinfo=None),
            "family": family,
            "params": params,
        })

    entries.sort(key=lambda e: e["ts"])

    if discarded:
        print(f"  Discarded {discarded} outdated/invalid record(s).")
    print(f"  Loaded {len(entries)} valid row(s).")
    return entries


def timestamp_text(entry: Entry) -> str:
    return entry["ts"].strftime("%Y-%m-%d %H:%M:%S")


def timestamp_label(entry: Entry) -> str:
    return timestamp_text(entry)


def build_frame_states(
    entries: list[Entry],
    fps: int,
    duration: float,
    frame_mode: str,
    max_frames: int | None,
) -> list[FrameState]:
    if frame_mode == "rows":
        row_indices = list(range(len(entries)))
    elif frame_mode == "count":
        frame_count = max(1, round(fps * duration))
        row_indices = np.linspace(0, len(entries) - 1, frame_count, dtype=int).tolist()
    else:
        frame_count = max(1, round(fps * duration))
        start = entries[0]["ts"]
        end = entries[-1]["ts"]
        span = (end - start).total_seconds()
        row_indices = []
        cursor = 0

        for frame in range(frame_count):
            fraction = frame / max(frame_count - 1, 1)
            cutoff = start + timedelta(seconds=span * fraction)
            while cursor + 1 < len(entries) and entries[cursor + 1]["ts"] <= cutoff:
                cursor += 1
            row_indices.append(cursor)

    if max_frames is not None:
        row_indices = row_indices[:max_frames]

    states = [{"row_index": index, "entry": entries[index]} for index in row_indices]
    print(f"  Rendering {len(states)} frame(s).")
    return states


def frame_entries(entries: list[Entry], state: FrameState, family: str | None = None) -> list[Entry]:
    subset = entries[:state["row_index"] + 1]
    if family is None:
        return subset
    return [entry for entry in subset if entry["family"] == family]


def stitch_frames(frame_dir: Path, output_path: Path, fps: int) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pattern = frame_dir / "frame_%06d.png"
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(fps),
        "-i", str(pattern),
        "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")
    print(f"  saved {output_path}")


def render_frames_parallel(
    output_path: Path,
    tasks: list[dict[str, Any]],
    fps: int,
    frame_jobs: int,
    render_frame,
) -> None:
    frame_dir = output_path.with_suffix("")
    frame_dir = frame_dir.parent / f".{frame_dir.name}_frames"
    if frame_dir.exists():
        shutil.rmtree(frame_dir)
    frame_dir.mkdir(parents=True)

    for index, task in enumerate(tasks):
        task["frame_path"] = frame_dir / f"frame_{index:06d}.png"

    if tqdm is None:
        iterator = tasks
    else:
        iterator = tqdm(total=len(tasks), desc=f"{output_path.name} frames", unit="frame")

    try:
        if frame_jobs <= 1:
            if tqdm is None:
                for task in iterator:
                    render_frame(task)
            else:
                with iterator as progress:
                    for task in tasks:
                        render_frame(task)
                        progress.update(1)
        else:
            with concurrent.futures.ProcessPoolExecutor(max_workers=frame_jobs) as executor:
                futures = [executor.submit(render_frame, task) for task in tasks]
                if tqdm is None:
                    for future in concurrent.futures.as_completed(futures):
                        future.result()
                else:
                    with iterator as progress:
                        for future in concurrent.futures.as_completed(futures):
                            future.result()
                            progress.update(1)
        stitch_frames(frame_dir, output_path, fps)
    finally:
        shutil.rmtree(frame_dir, ignore_errors=True)


def add_timestamp(fig: plt.Figure) -> plt.Text:
    return fig.text(
        0.985,
        0.985,
        "",
        ha="right",
        va="top",
        fontsize=9,
        color="#111827",
        family="monospace",
        fontweight="semibold",
        bbox=timestamp_bbox(),
    )


def timestamp_bbox() -> dict[str, Any]:
    return {
        "facecolor": "#f8fafc",
        "edgecolor": "#111827",
        "linewidth": 0.6,
        "boxstyle": "round,pad=0.45,rounding_size=0.15",
        "alpha": 0.88,
    }


def draw_histogram_grid(ax: plt.Axes) -> None:
    ax.grid(True, which="major", axis="both", linestyle="--", linewidth=0.6, alpha=0.35)
    ax.set_axisbelow(True)


def histogram_ymax(values: list[float], bins: np.ndarray) -> float:
    if not values:
        return 1.0
    counts, _ = np.histogram(values, bins=bins)
    return max(float(counts.max()), 1.0)


def animate_corners(
    entries: list[Entry],
    states: list[FrameState],
    family: str,
    out_dir: Path,
    fps: int,
    dpi: int,
    frame_jobs: int,
) -> None:
    param_names = list(EXPECTED_PARAMS[family])
    # Preserve YAML order by using the first valid entry when available.
    first_family_entries = [entry for entry in entries if entry["family"] == family]
    if not first_family_entries:
        return
    param_names = list(first_family_entries[0]["params"].keys())

    n = len(param_names)
    values_final = {
        pname: [to_plot_space(family, pname, e["params"][pname]) for e in first_family_entries]
        for pname in param_names
    }
    edges = {pname: get_parameter_edges(family, pname) for pname in param_names}
    quali = {pname: get_quali_labels(family, pname) for pname in param_names}
    diag_ymax = {
        pname: histogram_ymax(values_final[pname], edges[pname]) * 1.08
        for pname in param_names
    }

    global_max = 1
    for i in range(n):
        for j in range(i):
            xvals = values_final[param_names[j]]
            yvals = values_final[param_names[i]]
            if quali[param_names[j]] and quali[param_names[i]]:
                global_max = max(global_max, max(Counter(zip(xvals, yvals)).values(), default=1))
            else:
                hist, _, _ = np.histogram2d(xvals, yvals, bins=[edges[param_names[j]], edges[param_names[i]]])
                global_max = max(global_max, int(hist.max()))

    output_path = out_dir / f"corner_{family}.mp4"
    tasks = [
        {
            "entries": entries,
            "state": state,
            "family": family,
            "param_names": param_names,
            "edges": edges,
            "quali": quali,
            "diag_ymax": diag_ymax,
            "global_max": global_max,
            "dpi": dpi,
        }
        for state in states
    ]
    render_frames_parallel(output_path, tasks, fps, frame_jobs, render_corner_frame)


def animate_histograms(
    entries: list[Entry],
    states: list[FrameState],
    family: str,
    out_dir: Path,
    fps: int,
    dpi: int,
    frame_jobs: int,
) -> None:
    family_entries = [entry for entry in entries if entry["family"] == family]
    if not family_entries:
        return
    param_names = list(family_entries[0]["params"].keys())
    bins_by_param = {pname: get_parameter_edges(family, pname) for pname in param_names}
    ymax_by_param: dict[str, float] = {}

    for pname in param_names:
        final_values = [
            to_plot_space(family, pname, entry["params"][pname])
            for entry in family_entries
        ]
        ymax_by_param[pname] = histogram_ymax(final_values, bins_by_param[pname]) * 1.08

    output_path = out_dir / f"parameter_histograms_{family}.mp4"
    tasks = [
        {
            "entries": entries,
            "state": state,
            "family": family,
            "param_names": param_names,
            "bins_by_param": bins_by_param,
            "ymax_by_param": ymax_by_param,
            "dpi": dpi,
        }
        for state in states
    ]
    render_frames_parallel(output_path, tasks, fps, frame_jobs, render_histogram_frame)


def padded_time_xlim(ax: plt.Axes, timestamps: list[datetime]) -> None:
    if not timestamps:
        return
    start = min(timestamps)
    end = max(timestamps)
    if start == end:
        end = start + timedelta(minutes=1)
    pad = (end - start) * 0.04
    ax.set_xlim(start - pad, end + pad)


def configure_animation_date_axis(
    ax: plt.Axes,
    timestamps: list[datetime],
    maxticks: int,
) -> None:
    if not timestamps:
        return

    start = min(timestamps)
    end = max(timestamps)
    span_seconds = max((end - start).total_seconds(), 60)

    if span_seconds <= 2 * 3600:
        interval = max(1, math.ceil((span_seconds / 60) / maxticks))
        locator = mdates.MinuteLocator(interval=interval)
    elif span_seconds <= 3 * 24 * 3600:
        interval = max(1, math.ceil((span_seconds / 3600) / maxticks))
        locator = mdates.HourLocator(interval=interval)
    elif span_seconds <= 120 * 24 * 3600:
        interval = max(1, math.ceil((span_seconds / (24 * 3600)) / maxticks))
        locator = mdates.DayLocator(interval=interval)
    else:
        locator = mdates.AutoDateLocator(maxticks=maxticks)

    ax.xaxis.set_major_locator(locator)
    ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator, show_offset=False))


def latest_marker(ax: plt.Axes, x: datetime, y: float, family: str, color: str) -> None:
    markers = {"planetary": "o", "galaxy": "s", "cosmos": "^"}
    ax.scatter(
        [x],
        [y],
        marker=markers.get(family, "o"),
        s=58,
        facecolor=color,
        edgecolor="white",
        linewidth=0.9,
        zorder=5,
    )


def render_run_activity_frame(task: dict[str, Any]) -> None:
    entries = task["entries"]
    state = task["state"]
    frame_path = task["frame_path"]
    dpi = task["dpi"]

    fig, ax = plt.subplots(figsize=(12, 4.8))
    current = frame_entries(entries, state)
    all_ts = [entry["ts"] for entry in current]

    for family in sorted(FAMILY_LABELS.keys()):
        family_current = [entry for entry in current if entry["family"] == family]
        if not family_current:
            continue
        color = FAMILY_COLORS.get(family, "#333333")
        label = FAMILY_LABELS.get(family, family)
        family_ts = sorted(entry["ts"] for entry in family_current)
        cumulative_counts = list(range(1, len(family_ts) + 1))
        ax.step(family_ts, cumulative_counts, where="post", color=color, linewidth=1.8, label=label)
        latest_marker(ax, family_ts[-1], cumulative_counts[-1], family, color)

    ax.set_ylabel("Runs")
    ax.set_xlabel("Date")
    ax.grid(True, which="major", linestyle="--", linewidth=0.6, alpha=0.35)
    ax.set_axisbelow(True)
    padded_time_xlim(ax, all_ts)
    ax.legend(fontsize=9, frameon=False)
    configure_animation_date_axis(ax, all_ts, maxticks=24)
    plt.setp(ax.get_xticklabels(), rotation=30, ha="right")
    fig.tight_layout()
    fig.savefig(frame_path, dpi=dpi)
    plt.close(fig)


def render_timeseries_frame(task: dict[str, Any]) -> None:
    entries = task["entries"]
    state = task["state"]
    family = task["family"]
    param_names = task["param_names"]
    hist_xmax = task["hist_xmax"]
    frame_path = task["frame_path"]
    dpi = task["dpi"]
    color = FAMILY_COLORS.get(family, "#333333")

    current = frame_entries(entries, state, family)
    all_ts = [entry["ts"] for entry in current]
    fig, axes = plt.subplots(
        len(param_names),
        2,
        figsize=(11.5, 2.6 * len(param_names)),
        sharex="col",
        gridspec_kw={"width_ratios": [6, 1], "wspace": 0},
    )
    if len(param_names) == 1:
        axes = np.array([axes])

    for row, pname in enumerate(param_names):
        ax = axes[row, 0]
        hist_ax = axes[row, 1]
        pairs = [
            (entry["ts"], to_plot_space(family, pname, entry["params"][pname]))
            for entry in current
        ]
        if pairs:
            t_vals = [pair[0] for pair in pairs]
            values = [pair[1] for pair in pairs]
            ax.scatter(t_vals, values, s=9, color=color, alpha=0.28, edgecolors="none")
            ax.scatter([t_vals[-1]], [values[-1]], color=color, s=24, zorder=3)
            configure_axis(ax, family, pname, "y")
            if not get_quali_labels(family, pname):
                set_parameter_ylim(ax, family, pname)
            y_limits = ax.get_ylim()
            hist_ax.hist(values, bins=get_parameter_edges(family, pname), orientation="horizontal",
                         color=color, edgecolor="white", linewidth=0.5, alpha=0.85)
        else:
            configure_axis(ax, family, pname, "y")
            y_limits = ax.get_ylim()
            hist_ax.hist([], bins=get_parameter_edges(family, pname), orientation="horizontal",
                         color=color, edgecolor="white", linewidth=0.5, alpha=0.85)
        ax.set_ylabel(get_param_label(family, pname), fontsize=9)
        ax.grid(True, which="major", linestyle="--", linewidth=0.6, alpha=0.35)
        ax.set_axisbelow(True)
        padded_time_xlim(ax, all_ts)
        configure_axis(hist_ax, family, pname, "y", show_label=False)
        hist_ax.set_ylim(y_limits)
        hist_ax.set_xlim(0, hist_xmax[pname])
        hist_ax.tick_params(axis="y", left=False, labelleft=False)
        hist_ax.tick_params(axis="x", bottom=False, labelbottom=False)
        hist_ax.grid(True, which="major", axis="y", linestyle="--", linewidth=0.6, alpha=0.35)
        hist_ax.set_axisbelow(True)
        remove_axis_frame(hist_ax)

    axes[-1, 0].set_xlabel("Date")
    configure_animation_date_axis(axes[-1, 0], all_ts, maxticks=7)
    plt.setp(axes[-1, 0].get_xticklabels(), rotation=30, ha="right")
    for ax in axes[:-1, 0]:
        ax.tick_params(axis="x", labelbottom=False)
    fig.tight_layout()
    fig.savefig(frame_path, dpi=dpi)
    plt.close(fig)


def render_corner_frame(task: dict[str, Any]) -> None:
    entries = task["entries"]
    state = task["state"]
    family = task["family"]
    param_names = task["param_names"]
    edges = task["edges"]
    quali = task["quali"]
    diag_ymax = task["diag_ymax"]
    global_max = task["global_max"]
    frame_path = task["frame_path"]
    dpi = task["dpi"]

    n = len(param_names)
    color = FAMILY_COLORS.get(family, "#333333")
    cmap_name = FAMILY_CMAP.get(family, "viridis")
    norm = LogNorm(vmin=1, vmax=max(global_max, 1))
    current = frame_entries(entries, state, family)
    values = {
        pname: [to_plot_space(family, pname, entry["params"][pname]) for entry in current]
        for pname in param_names
    }

    fig, axes = plt.subplots(n, n, figsize=(3 * n + 1, 3 * n), sharex="col",
                             constrained_layout=False, gridspec_kw={"wspace": 0, "hspace": 0})

    for i in range(n):
        for j in range(n):
            ax = axes[i, j]
            pname_i = param_names[i]
            pname_j = param_names[j]

            if i == j:
                if quali[pname_i]:
                    counts = Counter(values[pname_i])
                    x = list(range(len(quali[pname_i])))
                    y = [counts.get(k, 0) for k in x]
                    ax.bar(x, y, width=1, color=color, edgecolor="white", linewidth=0.5, alpha=0.85)
                else:
                    ax.hist(values[pname_i], bins=edges[pname_i], color=color,
                            edgecolor="white", linewidth=0.5, alpha=0.85)
                draw_histogram_grid(ax)
                configure_axis(ax, family, pname_i, "x", show_label=False)
                ax.set_ylim(0, diag_ymax[pname_i])
                ax.tick_params(axis="y", left=False, labelleft=False)
                if i == 0 and j == 0:
                    ax.text(
                        0.04, 0.94, timestamp_label(state["entry"]), transform=ax.transAxes,
                        ha="left", va="top", fontsize=9, color="#111827",
                        family="monospace", fontweight="semibold", bbox=timestamp_bbox(),
                    )
            elif i > j:
                xvals = values[pname_j]
                yvals = values[pname_i]
                if quali[pname_j] and quali[pname_i]:
                    nx, ny = len(quali[pname_j]), len(quali[pname_i])
                    grid = np.zeros((ny, nx))
                    for (xi, yi), count in Counter(zip(xvals, yvals)).items():
                        grid[int(yi), int(xi)] = count
                    masked_grid = np.ma.masked_where(grid <= 0, grid)
                    ax.imshow(masked_grid, origin="lower", aspect="auto", cmap=cmap_name, norm=norm)
                    if family == "galaxy":
                        for yi in range(ny):
                            for xi in range(nx):
                                if grid[yi, xi] > 0:
                                    ax.text(
                                        xi,
                                        yi,
                                        int(grid[yi, xi]),
                                        ha="center",
                                        va="center",
                                        fontsize=7,
                                    )
                else:
                    hist, _, _ = np.histogram2d(xvals, yvals, bins=[edges[pname_j], edges[pname_i]])
                    masked_hist = np.ma.masked_where(hist.T <= 0, hist.T)
                    ax.pcolormesh(edges[pname_j], edges[pname_i], masked_hist, cmap=cmap_name,
                                  norm=norm, edgecolors="white", linewidth=0.3)
                configure_axis(ax, family, pname_j, "x", show_label=False)
                configure_axis(ax, family, pname_i, "y", show_label=False)
            else:
                ax.set_visible(False)
                continue

            if j > 0:
                ax.tick_params(axis="y", labelleft=False)
            if i < n - 1:
                ax.tick_params(axis="x", labelbottom=False)
            if j == 0 and i > j:
                configure_axis(
                    ax,
                    family,
                    pname_i,
                    "y",
                    show_label=True,
                )
            if i == n - 1:
                configure_axis(
                    ax,
                    family,
                    pname_j,
                    "x",
                    show_label=True,
                )

    fig.subplots_adjust(right=0.85)
    br_pos = axes[n - 1, n - 1].get_position()
    cbar_ax = fig.add_axes([0.88, br_pos.y0, 0.02, br_pos.height])
    colorbar = fig.colorbar(plt.cm.ScalarMappable(norm=norm, cmap=cmap_name), cax=cbar_ax)
    colorbar.set_label("Count", fontsize=8)
    hide_overlapping_corner_x_tick_labels(fig, axes)
    fig.savefig(frame_path, dpi=dpi)
    plt.close(fig)


def render_histogram_frame(task: dict[str, Any]) -> None:
    entries = task["entries"]
    state = task["state"]
    family = task["family"]
    param_names = task["param_names"]
    bins_by_param = task["bins_by_param"]
    ymax_by_param = task["ymax_by_param"]
    frame_path = task["frame_path"]
    dpi = task["dpi"]

    color = FAMILY_COLORS.get(family, "#333333")
    current = frame_entries(entries, state, family)
    fig, axes = plt.subplots(1, len(param_names), figsize=(5 * len(param_names), 4.5))
    if len(param_names) == 1:
        axes = [axes]
    timestamp_ax = axes[0]

    for ax, pname in zip(axes, param_names):
        values = [to_plot_space(family, pname, entry["params"][pname]) for entry in current]
        ax.hist(values, bins=bins_by_param[pname], color=color,
                edgecolor="white", linewidth=0.5, alpha=0.85)
        configure_axis(ax, family, pname, "x")
        ax.set_ylim(0, ymax_by_param[pname])
        ax.set_ylabel("Count", fontsize=8)
        draw_histogram_grid(ax)

    timestamp_ax.text(
        0.04, 0.95, timestamp_label(state["entry"]), transform=timestamp_ax.transAxes,
        ha="left", va="top", fontsize=9, color="#111827",
        family="monospace", fontweight="semibold", bbox=timestamp_bbox(),
    )
    fig.tight_layout()
    fig.savefig(frame_path, dpi=dpi)
    plt.close(fig)


def animate_run_activity(
    entries: list[Entry],
    states: list[FrameState],
    out_dir: Path,
    fps: int,
    dpi: int,
    frame_jobs: int,
) -> None:
    output_path = out_dir / "run_activity.mp4"
    tasks = [
        {"entries": entries, "state": state, "dpi": dpi}
        for state in states
    ]
    render_frames_parallel(output_path, tasks, fps, frame_jobs, render_run_activity_frame)


def animate_timeseries(
    entries: list[Entry],
    states: list[FrameState],
    family: str,
    out_dir: Path,
    fps: int,
    dpi: int,
    frame_jobs: int,
) -> None:
    family_entries = [entry for entry in entries if entry["family"] == family]
    if not family_entries:
        return
    param_names = list(family_entries[0]["params"].keys())
    output_path = out_dir / f"timeseries_{family}.mp4"
    hist_xmax = {}
    for pname in param_names:
        values = [to_plot_space(family, pname, entry["params"][pname]) for entry in family_entries]
        hist_xmax[pname] = histogram_ymax(values, get_parameter_edges(family, pname)) * 1.08
    tasks = [
        {
            "entries": entries,
            "state": state,
            "family": family,
            "param_names": param_names,
            "hist_xmax": hist_xmax,
            "dpi": dpi,
        }
        for state in states
    ]
    render_frames_parallel(output_path, tasks, fps, frame_jobs, render_timeseries_frame)


def render_job(job: dict[str, Any]) -> None:
    kind = job["kind"]
    entries = job["entries"]
    states = job["states"]
    out_dir = job["out_dir"]
    fps = job["fps"]
    dpi = job["dpi"]
    frame_jobs = job["frame_jobs"]
    family = job.get("family")

    if kind == "corners":
        print(f"\nAnimating corner plot for {family}...")
        animate_corners(entries, states, family, out_dir, fps, dpi, frame_jobs)
    elif kind == "histograms":
        print(f"\nAnimating parameter histograms for {family}...")
        animate_histograms(entries, states, family, out_dir, fps, dpi, frame_jobs)
    elif kind == "timeseries":
        print(f"\nAnimating time series for {family}...")
        animate_timeseries(entries, states, family, out_dir, fps, dpi, frame_jobs)
    elif kind == "run-activity":
        print("\nAnimating run activity...")
        animate_run_activity(entries, states, out_dir, fps, dpi, frame_jobs)
    else:
        raise ValueError(f"Unknown animation kind: {kind}")


def main() -> None:
    args = parse_args()
    print(f"Querying {'remote' if args.remote else 'local'} D1 database...")
    rows = fetch_rows(remote=args.remote)
    entries = parse_entries(rows)
    if not entries:
        print("No valid rows to animate.", file=sys.stderr)
        sys.exit(1)

    states = build_frame_states(
        entries,
        fps=args.fps,
        duration=args.duration,
        frame_mode=args.frame_mode,
        max_frames=args.max_frames,
    )
    if not states:
        print("No animation frames to render.", file=sys.stderr)
        sys.exit(1)

    args.out.mkdir(parents=True, exist_ok=True)

    jobs: list[dict[str, Any]] = []
    for family in args.families:
        if "corners" in args.plots:
            jobs.append({"kind": "corners", "family": family})
        if "histograms" in args.plots:
            jobs.append({"kind": "histograms", "family": family})
        if "timeseries" in args.plots:
            jobs.append({"kind": "timeseries", "family": family})

    if "run-activity" in args.plots:
        jobs.append({"kind": "run-activity"})

    for job in jobs:
        job.update({
            "entries": entries,
            "states": states,
            "out_dir": args.out,
            "fps": args.fps,
            "dpi": args.dpi,
            "frame_jobs": args.frame_jobs,
        })

    if args.jobs <= 1 or len(jobs) <= 1:
        for job in jobs:
            render_job(job)
    else:
        print(f"\nRendering {len(jobs)} animation(s) with {args.jobs} parallel job(s)...")
        with concurrent.futures.ProcessPoolExecutor(max_workers=args.jobs) as executor:
            futures = [executor.submit(render_job, job) for job in jobs]
            for future in concurrent.futures.as_completed(futures):
                future.result()

    print(f"\nDone. Animations saved to {args.out.resolve()}/")


if __name__ == "__main__":
    main()
