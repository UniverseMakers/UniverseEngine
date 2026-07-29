#!/usr/bin/env python3
"""Plot parameter distribution diagnostics from D1 tracking data.

Queries the run_selections table and generates:

a) Histogram grids — one figure per simulation family, each parameter in its
   own subplot showing how often each value was selected.
b) Time-series diagnostics — one figure per family with daily distribution
   evolution per parameter plus a runs-per-day bar chart.

Usage:
    python3 scripts/plot_param_distributions.py
    python3 scripts/plot_param_distributions.py --remote
    python3 scripts/plot_param_distributions.py --out plots/
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import matplotlib.ticker as mticker
from matplotlib.colors import LogNorm
import numpy as np
from collections import Counter
from yaml import safe_load

# ── Configuration ───────────────────────────────────────────────────────────

DB_NAME = "universe-engine-db"
QUERY = "SELECT created_at, simulation_id, parameters_json FROM run_selections ORDER BY created_at ASC"

PARAM_INFO_PATH = Path(__file__).resolve().parent.parent / "src" / "selection" / "parameter-info.yaml"
_PARAM_INFO_CACHE: dict[str, Any] | None = None


def _load_param_info() -> dict[str, Any]:
    global _PARAM_INFO_CACHE
    if _PARAM_INFO_CACHE is None:
        with open(PARAM_INFO_PATH) as f:
            _PARAM_INFO_CACHE = safe_load(f)
    return _PARAM_INFO_CACHE


def get_quali_labels(family: str, param_name: str) -> list[str] | None:
    info = _load_param_info().get(family, {}).get(param_name, {})
    labels = info.get("quali_labels")
    return list(labels) if labels else None


def get_param_info(family: str, param_name: str) -> dict[str, Any]:
    return _load_param_info().get(family, {}).get(param_name, {})


def get_param_label(family: str, param_name: str) -> str:
    info = get_param_info(family, param_name)
    label = info.get("label", param_name.replace("_", " "))
    unit = info.get("unit")
    if unit:
        return f"{label} [{unit}]"
    return str(label)


def is_log_param(family: str, param_name: str) -> bool:
    return bool(get_param_info(family, param_name).get("log_scale"))


def get_value_scale(family: str, param_name: str) -> float:
    return float(get_param_info(family, param_name).get("value_scale", 1.0) or 1.0)


def scale_parameter_value(family: str, param_name: str, value: float) -> float:
    if get_quali_labels(family, param_name):
        return float(round(value))
    return float(value) * get_value_scale(family, param_name)


def scaled_parameter_range(family: str, param_name: str) -> tuple[float, float]:
    info = get_param_info(family, param_name)
    scale = get_value_scale(family, param_name)
    return float(info["min"]) * scale, float(info["max"]) * scale


def get_parameter_edges(family: str, param_name: str) -> np.ndarray:
    labels = get_quali_labels(family, param_name)
    if labels:
        return np.arange(-0.5, len(labels) + 0.5, 1)

    info = get_param_info(family, param_name)
    min_value, max_value = scaled_parameter_range(family, param_name)

    if is_log_param(family, param_name):
        return np.geomspace(min_value, max_value, 21)

    return np.linspace(min_value, max_value, 21)


def to_plot_space(family: str, param_name: str, value: float) -> float:
    return scale_parameter_value(family, param_name, value)


def configure_axis(
    ax: plt.Axes,
    family: str,
    param_name: str,
    axis: str,
    show_label: bool = True,
) -> None:
    labels = get_quali_labels(family, param_name)
    if labels:
        setter = ax.set_xticks if axis == "x" else ax.set_yticks
        label_setter = ax.set_xticklabels if axis == "x" else ax.set_yticklabels
        setter(range(len(labels)))
        label_setter(labels, fontsize=7, rotation=45 if axis == "x" else 0,
                     ha="right" if axis == "x" else "right")
        if axis == "x":
            ax.set_xlim(-0.5, len(labels) - 0.5)
        else:
            ax.set_ylim(-0.5, len(labels) - 0.5)
    elif is_log_param(family, param_name):
        min_value, max_value = scaled_parameter_range(family, param_name)
        tick_min = int(np.ceil(np.log10(min_value)))
        tick_max = int(np.floor(np.log10(max_value)))
        ticks = [10 ** exponent for exponent in range(tick_min, tick_max + 1)]
        if min_value not in ticks:
            ticks.insert(0, min_value)

        if axis == "x":
            ax.set_xscale("log")
            ax.set_xlim(min_value, max_value)
            ax.xaxis.set_major_locator(mticker.FixedLocator(ticks))
            ax.xaxis.set_major_formatter(mticker.LogFormatterMathtext())
            ax.xaxis.set_minor_formatter(mticker.NullFormatter())
        else:
            ax.set_yscale("log")
            ax.set_ylim(min_value, max_value)
            ax.yaxis.set_major_locator(mticker.FixedLocator(ticks))
            ax.yaxis.set_major_formatter(mticker.LogFormatterMathtext())
            ax.yaxis.set_minor_formatter(mticker.NullFormatter())
    else:
        locator = mticker.MaxNLocator(nbins=5)
        if axis == "x":
            ax.xaxis.set_major_locator(locator)
        else:
            ax.yaxis.set_major_locator(locator)

    ax.tick_params(axis=axis, labelsize=7)

    if show_label:
        label = get_param_label(family, param_name)
        if axis == "x":
            ax.set_xlabel(label, fontsize=8)
        else:
            ax.set_ylabel(label, fontsize=8)


def set_parameter_ylim(ax: plt.Axes, family: str, param_name: str) -> None:
    if get_quali_labels(family, param_name):
        return
    min_value, max_value = scaled_parameter_range(family, param_name)
    if is_log_param(family, param_name):
        log_min = np.log10(min_value)
        log_max = np.log10(max_value)
        pad = 0.04 * (log_max - log_min)
        ax.set_ylim(10 ** (log_min - pad), 10 ** (log_max + pad))
        return
    pad = 0.04 * (max_value - min_value)
    ax.set_ylim(min_value - pad, max_value + pad)


def format_count(count: int) -> str:
    return f"{count:,}"


def add_histogram_grid(ax: plt.Axes) -> None:
    ax.grid(True, which="major", axis="both", linestyle="--", linewidth=0.6, alpha=0.35)
    ax.set_axisbelow(True)


def remove_axis_frame(ax: plt.Axes) -> None:
    for spine in ax.spines.values():
        spine.set_visible(False)


def hide_overlapping_corner_x_tick_labels(fig: plt.Figure, axes: np.ndarray, padding_px: float = 6) -> None:
    """Hide only lower-bound x labels that overlap or crowd an adjacent upper bound."""
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    bottom_axes = axes[-1]

    for left_ax, right_ax in zip(bottom_axes[:-1], bottom_axes[1:]):
        left_labels = [label for label in left_ax.get_xticklabels() if label.get_visible() and label.get_text()]
        right_labels = [label for label in right_ax.get_xticklabels() if label.get_visible() and label.get_text()]
        if not left_labels or not right_labels:
            continue

        left_label = left_labels[-1]
        right_label = right_labels[0]
        left_bbox = left_label.get_window_extent(renderer)
        right_bbox = right_label.get_window_extent(renderer)
        y_overlaps = left_bbox.y0 <= right_bbox.y1 and right_bbox.y0 <= left_bbox.y1
        x_crowded = left_bbox.x1 + padding_px >= right_bbox.x0
        if y_overlaps and x_crowded:
            # The right label is the minimum of the next panel; keep the upper
            # limit from the previous panel visible.
            right_label.set_visible(False)


FAMILY_LABELS: dict[str, str] = {
    "planetary": "Planetary",
    "galaxy": "Galaxy",
    "cosmos": "Cosmos",
}

FAMILY_COLORS: dict[str, str] = {
    "planetary": "#2ecc71",
    "galaxy": "#3498db",
    "cosmos": "#e74c3c",
}

FAMILY_CMAP: dict[str, str] = {
    "planetary": "Greens",
    "galaxy": "Blues",
    "cosmos": "Reds",
}

# Current expected parameter keys per family — entries with outdated
# parameter sets are filtered out so distributions stay meaningful.
EXPECTED_PARAMS: dict[str, frozenset[str]] = {
    "planetary": frozenset({"impactor_mass", "impactor_velocity", "impactor_angle"}),
    "galaxy": frozenset({"crowding", "mass_rank"}),
    "cosmos": frozenset({"baryon_fraction", "black_hole_strength", "gravity_strength"}),
}

# ── Data fetching ───────────────────────────────────────────────────────────


def fetch_rows(remote: bool) -> list[dict[str, Any]]:
    """Execute the D1 query via wrangler and return parsed rows."""
    cmd = [
        "npx", "wrangler", "d1", "execute", DB_NAME,
        "--json", "--command", QUERY,
    ]
    if remote:
        cmd.append("--remote")

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"wrangler failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)

    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError:
        print("Failed to parse wrangler output as JSON", file=sys.stderr)
        sys.exit(1)

    results = output[0].get("results", []) if isinstance(output, list) else output.get("results", [])

    if not results:
        print("No rows returned from D1. Has anyone clicked Run yet?", file=sys.stderr)
        sys.exit(1)

    return results


def parse_rows(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Group rows by simulation family, parse JSON parameters and timestamps."""
    by_family: dict[str, list[dict[str, Any]]] = defaultdict(list)
    discarded = 0

    for row in rows:
        family = row["simulation_id"]
        try:
            params = json.loads(row["parameters_json"])
        except (json.JSONDecodeError, TypeError):
            continue

        expected = EXPECTED_PARAMS.get(family)
        if expected is not None and set(params.keys()) != expected:
            discarded += 1
            continue

        ts = datetime.fromisoformat(row["created_at"]).replace(tzinfo=None)
        by_family[family].append({"ts": ts, "params": params})

    if discarded:
        print(f"  Discarded {discarded} record(s) with outdated parameter sets.")

    return dict(by_family)


# ── Plotting helpers ────────────────────────────────────────────────────────


def setup_figure(n_params: int) -> tuple[plt.Figure, list[plt.Axes]]:
    """Create a figure with one subplot per parameter in a horizontal row."""
    fig, axes = plt.subplots(1, n_params, figsize=(5 * n_params, 4.5))
    if n_params == 1:
        axes = [axes]
    return fig, axes


def save_figure(fig: plt.Figure, out_dir: Path, name: str) -> None:
    """Save figure to disk and close it."""
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / name
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  saved {path}")


# ── a) Corner plots (histograms on diagonal, 2-D histograms off-diagonal) ─


def plot_corner(
    by_family: dict[str, list[dict[str, Any]]],
    out_dir: Path,
) -> None:
    """One corner plot per simulation family with 1-D histograms on
    the diagonal and 2-D histograms in the lower triangle.  Bins use a
    shared per-parameter edge array so 1-D bars literally sit above the
    2-D cells they summarise.  All 2-D cells share a single colour scale
    per figure."""
    print("\nGenerating corner plots...")

    for family, entries in sorted(by_family.items()):
        if not entries:
            continue

        param_names = list(entries[0]["params"].keys())
        n = len(param_names)
        if n < 2:
            fallback_histogram(family, entries, param_names, out_dir)
            continue

        color = FAMILY_COLORS.get(family, "#333333")
        cmap_name = FAMILY_CMAP.get(family, "viridis")

        # ── Extract selected slider values and YAML-defined parameter bins ──
        values: dict[str, list[float]] = {}
        quali: dict[str, list[str] | None] = {}
        edges: dict[str, np.ndarray] = {}

        for pname in param_names:
            pv = [
                to_plot_space(family, pname, e["params"][pname])
                for e in entries
                if pname in e["params"]
            ]
            values[pname] = pv
            lbls = get_quali_labels(family, pname)
            quali[pname] = lbls
            edges[pname] = get_parameter_edges(family, pname)

        # ── Figure with tight subplots — share x within each column ──
        fig, axes = plt.subplots(n, n, figsize=(3 * n + 1, 3 * n),
                                 sharex="col",
                                 constrained_layout=False,
                                 gridspec_kw={"wspace": 0, "hspace": 0})

        # ── Compute global 2-D max for a shared colour scale ─────────
        global_max = 0
        for i in range(n):
            for j in range(i):
                pname_i = param_names[i]
                pname_j = param_names[j]
                pairs = [
                    (
                        to_plot_space(family, param_names[j], e["params"][param_names[j]]),
                        to_plot_space(family, param_names[i], e["params"][param_names[i]]),
                    )
                    for e in entries
                    if param_names[j] in e["params"] and param_names[i] in e["params"]
                ]
                if not pairs:
                    continue
                xv, yv = zip(*pairs)
                if quali[param_names[j]] and quali[param_names[i]]:
                    # Qualitative-qualitative: just record the max cell count.
                    max_in_cell = max(Counter(zip(xv, yv)).values(), default=0)
                    global_max = max(global_max, max_in_cell)
                else:
                    hist, _, _ = np.histogram2d(
                        list(xv), list(yv),
                        bins=[edges[param_names[j]], edges[param_names[i]]],
                    )
                    global_max = max(global_max, hist.max())

        norm = LogNorm(vmin=1, vmax=max(global_max, 1))

        # ── Build each cell ──────────────────────────────────────────
        for i in range(n):
            for j in range(n):
                ax = axes[i, j]
                pname_i = param_names[i]
                pname_j = param_names[j]

                if i == j:
                    # Diagonal: 1-D histogram, y-axis on the right.
                    lbls = quali[pname_i]
                    e = edges[pname_i]
                    if lbls:
                        counts = Counter(values[pname_i])
                        x = list(range(len(lbls)))
                        y = [counts.get(k, 0) for k in x]
                        ax.bar(x, y, width=1, color=color,
                               edgecolor="white", linewidth=0.5, alpha=0.85)
                    else:
                        ax.hist(values[pname_i], bins=e, color=color,
                                edgecolor="white", linewidth=0.5, alpha=0.85)
                        ax.margins(x=0)
                    add_histogram_grid(ax)
                    configure_axis(ax, family, pname_i, "x", show_label=False)
                    ax.tick_params(axis="y", left=False, labelleft=False)
                elif i > j:
                    # Lower triangle: 2-D histogram.
                    pairs = [
                        (
                            to_plot_space(family, param_names[j], e["params"][param_names[j]]),
                            to_plot_space(family, param_names[i], e["params"][param_names[i]]),
                        )
                        for e in entries
                        if param_names[j] in e["params"] and param_names[i] in e["params"]
                    ]
                    if not pairs:
                        continue
                    xv, yv = zip(*pairs)
                    x_lbls = quali[param_names[j]]
                    y_lbls = quali[param_names[i]]
                    x_e = edges[param_names[j]]
                    y_e = edges[param_names[i]]

                    if x_lbls and y_lbls:
                        counts = Counter(zip(xv, yv))
                        nx, ny = len(x_lbls), len(y_lbls)
                        grid = np.zeros((ny, nx))
                        for (xi, yi), c in counts.items():
                            grid[int(yi), int(xi)] = c
                        masked_grid = np.ma.masked_where(grid <= 0, grid)
                        ax.imshow(masked_grid, origin="lower", aspect="auto",
                                  cmap=cmap_name, norm=norm)
                        for yi in range(ny):
                            for xi in range(nx):
                                if grid[yi, xi] > 0:
                                    ax.text(xi, yi, int(grid[yi, xi]),
                                            ha="center", va="center",
                                            fontsize=7)
                    else:
                        hist, _, _ = np.histogram2d(
                            list(xv), list(yv), bins=[x_e, y_e],
                        )
                        masked_hist = np.ma.masked_where(hist.T <= 0, hist.T)
                        ax.pcolormesh(x_e, y_e, masked_hist, cmap=cmap_name,
                                      norm=norm, edgecolors="white",
                                      linewidth=0.3)
                        ax.tick_params(labelsize=7)
                    configure_axis(ax, family, pname_j, "x", show_label=False)
                    configure_axis(ax, family, pname_i, "y", show_label=False)
                else:
                    ax.set_visible(False)

                # Tick visibility: only outer edges get labels.
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
                        param_names[j],
                        "x",
                        show_label=True,
                    )

        # ── Single colourbar for all 2-D cells ───────────────────────
        fig.subplots_adjust(right=0.85)
        br_ax = axes[n - 1, n - 1]
        br_pos = br_ax.get_position()
        cbar_ax = fig.add_axes([0.88, br_pos.y0, 0.02, br_pos.height])
        colorbar = fig.colorbar(
            plt.cm.ScalarMappable(norm=norm, cmap=cmap_name),
            cax=cbar_ax,
        )
        colorbar.set_label("Count", fontsize=8)

        hide_overlapping_corner_x_tick_labels(fig, axes)

        save_figure(fig, out_dir, f"corner_{family}.png")


def fallback_histogram(
    family: str,
    entries: list[dict[str, Any]],
    param_names: list[str],
    out_dir: Path,
) -> None:
    """Single 1-D histogram for families with only one parameter."""
    fig, ax = plt.subplots(figsize=(5, 4))
    color = FAMILY_COLORS.get(family, "#333333")
    pname = param_names[0]
    values = [
        to_plot_space(family, pname, e["params"][pname])
        for e in entries
        if pname in e["params"]
    ]
    quali_labels = get_quali_labels(family, pname)
    edges = get_parameter_edges(family, pname)

    if quali_labels:
        counts = Counter(values)
        x = list(range(len(quali_labels)))
        y = [counts.get(i, 0) for i in x]
        ax.bar(x, y, color=color, edgecolor="white", linewidth=0.5, alpha=0.85)
    else:
        ax.hist(
            values,
            bins=edges,
            color=color,
            edgecolor="white",
            linewidth=0.5,
            alpha=0.85,
        )

    configure_axis(ax, family, pname, "x")
    add_histogram_grid(ax)
    ax.set_ylabel("Count", fontsize=10)
    fig.tight_layout()
    save_figure(fig, out_dir, f"corner_{family}.png")


def plot_parameter_histograms(
    by_family: dict[str, list[dict[str, Any]]],
    out_dir: Path,
) -> None:
    """Histograms of submitted parameter values."""
    print("\nGenerating parameter histograms...")

    for family, entries in sorted(by_family.items()):
        if not entries:
            continue

        param_names = list(entries[0]["params"].keys())
        fig, axes = setup_figure(len(param_names))
        color = FAMILY_COLORS.get(family, "#333333")

        for ax, pname in zip(axes, param_names):
            values = [
                to_plot_space(family, pname, e["params"][pname])
                for e in entries
                if pname in e["params"]
            ]
            bins = get_parameter_edges(family, pname)

            ax.hist(values, bins=bins, color=color,
                    edgecolor="white", linewidth=0.5, alpha=0.85)

            configure_axis(ax, family, pname, "x")
            add_histogram_grid(ax)

            ax.set_ylabel("Count", fontsize=8)

        fig.tight_layout()
        save_figure(fig, out_dir, f"parameter_histograms_{family}.png")


# ── b) Time-series diagnostics ──────────────────────────────────────────────


def plot_time_series(
    by_family: dict[str, list[dict[str, Any]]],
    out_dir: Path,
) -> None:
    """Time-series plots showing parameter evolution and daily activity."""
    print("\nGenerating time-series diagnostics...")

    for family, entries in sorted(by_family.items()):
        if not entries:
            continue

        param_names = list(entries[0]["params"].keys())
        color = FAMILY_COLORS.get(family, "#333333")

        # Sort by timestamp
        entries_sorted = sorted(entries, key=lambda e: e["ts"])
        timestamps = [e["ts"] for e in entries_sorted]

        if len(timestamps) < 2:
            print(f"  skipping {family} — needs at least 2 data points")
            continue

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
                (e["ts"], to_plot_space(family, pname, e["params"][pname]))
                for e in entries_sorted
                if pname in e["params"]
            ]

            if len(pairs) < 2:
                ax.text(0.5, 0.5, "not enough data", ha="center", va="center", transform=ax.transAxes)
                continue

            t_vals = [pair[0] for pair in pairs]
            values = np.array([pair[1] for pair in pairs])

            ax.scatter(t_vals, values, s=9, color=color, alpha=0.28, edgecolors="none")
            configure_axis(ax, family, pname, "y")
            ax.set_ylabel(get_param_label(family, pname), fontsize=9)

            set_parameter_ylim(ax, family, pname)

            ax.grid(True, which="major", linestyle="--", linewidth=0.6, alpha=0.35)
            ax.set_axisbelow(True)
            y_limits = ax.get_ylim()
            hist_ax.hist(values, bins=get_parameter_edges(family, pname), orientation="horizontal",
                         color=color, edgecolor="white", linewidth=0.5, alpha=0.85)
            configure_axis(hist_ax, family, pname, "y", show_label=False)
            hist_ax.set_ylim(y_limits)
            hist_ax.tick_params(axis="y", left=False, labelleft=False)
            hist_ax.tick_params(axis="x", bottom=False, labelbottom=False)
            hist_ax.grid(True, which="major", axis="y", linestyle="--", linewidth=0.6, alpha=0.35)
            hist_ax.set_axisbelow(True)
            remove_axis_frame(hist_ax)

        axes[-1, 0].set_xlabel("Date")
        axes[-1, 0].xaxis.set_major_locator(mdates.AutoDateLocator(maxticks=7))
        axes[-1, 0].xaxis.set_major_formatter(
            mdates.ConciseDateFormatter(
                axes[-1, 0].xaxis.get_major_locator(),
                show_offset=False,
            ),
        )
        plt.setp(axes[-1, 0].get_xticklabels(), rotation=30, ha="right")
        for ax in axes[:-1, 0]:
            ax.tick_params(axis="x", labelbottom=False)

        fig.tight_layout()
        save_figure(fig, out_dir, f"timeseries_{family}.png")


def plot_run_activity(
    by_family: dict[str, list[dict[str, Any]]],
    out_dir: Path,
) -> None:
    """Two-row figure showing daily and cumulative run counts."""
    print("\nGenerating run activity...")

    fig, (daily_ax, cumulative_ax) = plt.subplots(
        2,
        1,
        figsize=(12, 7),
        sharex=True,
    )

    for family, entries in sorted(by_family.items()):
        color = FAMILY_COLORS.get(family, "#333333")
        label = FAMILY_LABELS.get(family, family)
        timestamps = [e["ts"] for e in entries]

        daily_counts: dict[str, int] = defaultdict(int)
        for ts in timestamps:
            daily_counts[ts.strftime("%Y-%m-%d")] += 1

        days = sorted(daily_counts.keys())
        counts = [daily_counts[d] for d in days]
        day_dates = [datetime.strptime(d, "%Y-%m-%d") for d in days]

        daily_ax.plot(day_dates, counts, color=color, linewidth=1.8, marker="o",
                      markersize=3.5, label=label)

        cumulative_timestamps = sorted(timestamps)
        if not cumulative_timestamps:
            continue

        cumulative_counts = list(range(1, len(cumulative_timestamps) + 1))
        cumulative_ax.step(cumulative_timestamps, cumulative_counts, where="post",
                           color=color, linewidth=1.8, label=label)

    daily_ax.set_ylabel("Runs per day")
    cumulative_ax.set_ylabel("Runs")
    cumulative_ax.set_xlabel("Date")

    for ax in (daily_ax, cumulative_ax):
        ax.grid(True, which="major", linestyle="--", linewidth=0.6, alpha=0.35)
        ax.set_axisbelow(True)

    daily_ax.legend(fontsize=9, frameon=False)
    locator = mdates.AutoDateLocator(maxticks=24)
    cumulative_ax.xaxis.set_major_locator(locator)
    cumulative_ax.xaxis.set_major_formatter(
        mdates.ConciseDateFormatter(locator, show_offset=False),
    )
    plt.setp(cumulative_ax.get_xticklabels(), rotation=30, ha="right")
    fig.tight_layout()
    save_figure(fig, out_dir, "run_activity.png")


def plot_overview(by_family: dict[str, list[dict[str, Any]]], out_dir: Path) -> None:
    """Single overview figure: total runs per family bar chart."""
    print("\nGenerating overview...")

    fig, ax = plt.subplots(figsize=(6, 3.5))
    families = sorted(by_family.keys(), key=lambda f: len(by_family[f]), reverse=True)
    counts = [len(by_family[f]) for f in families]
    colors = [FAMILY_COLORS.get(f, "#999999") for f in families]
    labels = [FAMILY_LABELS.get(f, f) for f in families]

    bars = ax.bar(range(len(families)), counts, color=colors, edgecolor="white", linewidth=0.5)
    for bar, count in zip(bars, counts):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                format_count(count), ha="center", fontsize=9, fontweight="bold")

    ax.set_xticks(range(len(families)))
    ax.set_xticklabels(labels)
    ax.set_ylabel("Runs")
    fig.tight_layout()
    save_figure(fig, out_dir, "overview_runs_per_family.png")


# ── Main ────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="Plot parameter distribution diagnostics from D1")
    parser.add_argument("--remote", action="store_true",
                        help="Query the remote (production) D1 database rather than local")
    parser.add_argument("--out", type=Path, default=Path("plots"),
                        help="Output directory for generated figures (default: plots/)")
    args = parser.parse_args()

    print(f"Querying {'remote' if args.remote else 'local'} D1 database...")
    rows = fetch_rows(remote=args.remote)
    by_family = parse_rows(rows)

    print(f"Loaded {sum(len(v) for v in by_family.values())} rows across {len(by_family)} families: "
          f"{', '.join(f'{k} ({len(v)})' for k, v in sorted(by_family.items()))}")

    out_dir = args.out
    plot_overview(by_family, out_dir)
    plot_parameter_histograms(by_family, out_dir)
    plot_corner(by_family, out_dir)
    plot_time_series(by_family, out_dir)
    plot_run_activity(by_family, out_dir)

    print(f"\nDone. Figures saved to {out_dir.resolve()}/")


if __name__ == "__main__":
    main()
