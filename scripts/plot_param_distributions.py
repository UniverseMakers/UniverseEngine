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
        if expected is not None and not expected.issuperset(params.keys()):
            discarded += 1
            continue

        ts = datetime.fromisoformat(row["created_at"]).replace(tzinfo=None)
        by_family[family].append({"ts": ts, "params": params})

    if discarded:
        print(f"  Discarded {discarded} record(s) with outdated parameter sets.")

    return dict(by_family)


# ── Plotting helpers ────────────────────────────────────────────────────────


def setup_figure(n_params: int, title: str) -> tuple[plt.Figure, list[plt.Axes]]:
    """Create a figure with one subplot per parameter in a horizontal row."""
    fig, axes = plt.subplots(1, n_params, figsize=(5 * n_params, 4.5))
    if n_params == 1:
        axes = [axes]
    fig.suptitle(title, fontsize=13, fontweight="bold")
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

        # ── Extract values, qualitative labels, and shared bin edges ──
        values: dict[str, list[float]] = {}
        quali: dict[str, list[str] | None] = {}
        edges: dict[str, np.ndarray | None] = {}

        for pname in param_names:
            pv = [e["params"].get(pname) for e in entries if pname in e["params"]]
            values[pname] = pv
            lbls = get_quali_labels(family, pname)
            quali[pname] = lbls
            if lbls:
                edges[pname] = np.arange(-0.5, len(lbls) + 0.5, 1)
            else:
                nbins = min(30, max(5, len(pv) // 3))
                edges[pname] = np.histogram_bin_edges(pv, bins=nbins)

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
                    (e["params"][param_names[j]], e["params"][param_names[i]])
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

        norm = plt.Normalize(vmin=0, vmax=max(global_max, 1))

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
                        ax.set_xticks(x)
                        ax.set_xticklabels(lbls, fontsize=7,
                                           rotation=30, ha="right")
                    else:
                        ax.hist(values[pname_i], bins=e, color=color,
                                edgecolor="white", linewidth=0.5, alpha=0.85)
                        ax.margins(x=0)
                    ax.yaxis.set_visible(False)
                elif i > j:
                    # Lower triangle: 2-D histogram.
                    pairs = [
                        (e["params"][param_names[j]], e["params"][param_names[i]])
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
                            grid[yi, xi] = c
                        ax.imshow(grid, origin="lower", aspect="auto",
                                   cmap=cmap_name, norm=norm)
                        ax.set_xticks(range(nx))
                        ax.set_xticklabels(x_lbls, fontsize=6,
                                           rotation=30, ha="right")
                        ax.set_yticks(range(ny))
                        ax.set_yticklabels(y_lbls, fontsize=6)
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
                        ax.pcolormesh(x_e, y_e, hist.T, cmap=cmap_name,
                                   norm=norm, edgecolors="white",
                                   linewidth=0.3)
                        ax.tick_params(labelsize=7)
                else:
                    ax.set_visible(False)

                # Tick visibility: only outer edges get labels.
                if j > 0:
                    ax.tick_params(axis="y", labelleft=False)
                if i < n - 1:
                    ax.tick_params(axis="x", labelbottom=False)

                if j == 0:
                    ax.set_ylabel(pname_i, fontsize=8)
                if i == n - 1:
                    ax.set_xlabel(param_names[j], fontsize=8)

        # ── Single colourbar for all 2-D cells ───────────────────────
        fig.subplots_adjust(right=0.85)
        br_ax = axes[n - 1, n - 1]
        br_pos = br_ax.get_position()
        cbar_ax = fig.add_axes([0.88, br_pos.y0, 0.02, br_pos.height])
        fig.colorbar(
            plt.cm.ScalarMappable(norm=norm, cmap=cmap_name),
            cax=cbar_ax,
        )

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
    values = [e["params"].get(pname) for e in entries if pname in e["params"]]
    quali_labels = get_quali_labels(family, pname)

    if quali_labels:
        counts = Counter(values)
        x = list(range(len(quali_labels)))
        y = [counts.get(i, 0) for i in x]
        ax.bar(x, y, color=color, edgecolor="white", linewidth=0.5, alpha=0.85)
        ax.set_xticks(x)
        ax.set_xticklabels(quali_labels, fontsize=8)
    else:
        bins = min(30, max(5, len(values) // 3))
        ax.hist(values, bins=bins, color=color, edgecolor="white", linewidth=0.5, alpha=0.85)

    ax.set_title(f"{FAMILY_LABELS.get(family, family)} — {pname}", fontsize=12)
    ax.set_xlabel(pname, fontsize=10)
    ax.set_ylabel("count", fontsize=10)
    fig.tight_layout()
    save_figure(fig, out_dir, f"corner_{family}.png")


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
        label = FAMILY_LABELS.get(family, family)

        # Sort by timestamp
        entries_sorted = sorted(entries, key=lambda e: e["ts"])
        timestamps = [e["ts"] for e in entries_sorted]

        if len(timestamps) < 2:
            print(f"  skipping {family} — needs at least 2 data points")
            continue

        # ── Parameter values over time (scatter + rolling mean) ──
        fig, axes = setup_figure(
            len(param_names),
            f"{label} — Parameter Values Over Time",
        )

        for ax, pname in zip(axes, param_names):
            values = np.array([e["params"].get(pname) for e in entries_sorted if pname in e["params"]])

            if len(values) < 2:
                ax.text(0.5, 0.5, "not enough data", ha="center", va="center", transform=ax.transAxes)
                continue

            t_vals = timestamps[:len(values)]

            ax.scatter(t_vals, values, s=12, color=color, alpha=0.5, edgecolors="none")

            ax.set_title(pname, fontsize=10)
            ax.xaxis.set_major_locator(mdates.AutoDateLocator(maxticks=8))
            ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
            plt.setp(ax.get_xticklabels(), rotation=20, ha="right")
            ax.grid(True, which="major", linestyle="--", alpha=0.3)

        fig.tight_layout()
        save_figure(fig, out_dir, f"timeseries_{family}.png")


def plot_runs_per_day(
    by_family: dict[str, list[dict[str, Any]]],
    out_dir: Path,
) -> None:
    """Single figure with one line per simulation family showing daily run counts."""
    print("\nGenerating runs per day...")

    fig, ax = plt.subplots(figsize=(12, 4))

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

        ax.plot(day_dates, counts, color=color, linewidth=2, marker="o",
                markersize=5, label=label)

    ax.set_title("Runs Per Day", fontsize=12, fontweight="bold")
    ax.set_ylabel("runs")
    ax.grid(True, linestyle='--', alpha=0.7)
    ax.legend(fontsize=9)
    ax.xaxis.set_major_locator(mdates.AutoDateLocator(maxticks=8))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    plt.setp(ax.get_xticklabels(), rotation=20, ha="right")
    fig.tight_layout()
    save_figure(fig, out_dir, "runs_per_day.png")


def plot_cumulative_runs(
    by_family: dict[str, list[dict[str, Any]]],
    out_dir: Path,
) -> None:
    """Single figure with one line per simulation family showing cumulative counts over time."""
    print("\nGenerating cumulative runs...")

    fig, ax = plt.subplots(figsize=(12, 5))

    for family, entries in sorted(by_family.items()):
        color = FAMILY_COLORS.get(family, "#333333")
        label = FAMILY_LABELS.get(family, family)
        timestamps = sorted(e["ts"] for e in entries)

        if not timestamps:
            continue

        counts = list(range(1, len(timestamps) + 1))
        ax.step(timestamps, counts, where="post", color=color,
                linewidth=1.5, label=label)

    ax.set_title("Cumulative Runs Over Time", fontsize=12, fontweight="bold")
    ax.set_ylabel("total runs")
    ax.grid(True, linestyle='--', alpha=0.7)
    ax.legend(fontsize=9)
    ax.xaxis.set_major_locator(mdates.AutoDateLocator(maxticks=8))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    plt.setp(ax.get_xticklabels(), rotation=20, ha="right")
    fig.tight_layout()
    save_figure(fig, out_dir, "cumulative_runs.png")


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
                str(count), ha="center", fontsize=9, fontweight="bold")

    ax.set_xticks(range(len(families)))
    ax.set_xticklabels(labels)
    ax.set_title("Total Runs Per Simulation Family", fontsize=12, fontweight="bold")
    ax.set_ylabel("runs")
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
    plot_corner(by_family, out_dir)
    plot_time_series(by_family, out_dir)
    plot_runs_per_day(by_family, out_dir)
    plot_cumulative_runs(by_family, out_dir)

    print(f"\nDone. Figures saved to {out_dir.resolve()}/")


if __name__ == "__main__":
    main()
