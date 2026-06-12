# UniverseEngine

A web app for displaying and interacting with simulation videos spread across a parameter hypercube.

## Quick Start

- `npm install`
- `npm run dev`

Production build:

- `npm run build`

Formatting:

- `npm run format`
- `npm run format:check`

## Requirements

- `node` / `npm` for the frontend
- `python3` for asset-generation scripts
- `ffprobe` for `scripts/generate_run_summaries.py`

## App Configuration

The app now has a password-gated `Advanced Settings` section inside the normal `Settings` overlay.

Advanced settings include:

- locking the app to a single cosmic scale
- choosing manifest source: `local` or `online`
- toggling verbose console logging
- hiding selected scales from the landing screen

Current default behavior:

- the app uses `public/assets/local-manifest.json`
- online manifest support exists, but is intended for the future Cloudflare-backed asset bucket

## Current UI Structure

The app currently uses a four-mode interface:

- `entry` - first-load simulation-family chooser
- `config` - overlay for parameter tuning and theme settings
- `initializing` - terminal-style faux startup window shown after run
- `display` - viewport with telemetry panel, timeline, and a burger menu that opens `Home`, `Settings`, `Credits`, and `Fullscreen`

Inside `Settings`, the `Advanced Settings` section is password-gated for exhibit / kiosk style controls.

See `UI_ARCHITECTURE.md` for the current component and state breakdown.

## Repository Layout

- `src/main.ts` - browser entrypoint (imports global CSS, boots the app)
- `src/app/` - app shell/orchestration
- `src/entry/` - landing screen / scale selection overlay
- `src/loading/` - initialization overlay and boot text
- `src/live-data/` - CSV parsing, HUD sampling, telemetry presentation
- `src/selection/` - parameter editor, settings overlay, theme picker, manifest-backed asset lookup
- `src/shared/` - cross-cutting helpers like URLs, logging, and advanced settings persistence
- `src/summaries/` - run summary overlay and metrics
- `src/video_player/` - viewport, view switcher, and timeline
- `scripts/` - manifest, summary, and upload utilities
- `public/assets/` - local runtime assets and generated manifests

## Asset Layout

Simulation assets live under `public/assets/` using a run-based layout:

- `public/assets/<simulation-id>/<run-id>/animations/*.mp4`
- `public/assets/<simulation-id>/<run-id>/live_data_table.csv`
- `public/assets/<simulation-id>/<run-id>/final_snapshot_summary.csv`
- `public/assets/<simulation-id>/<run-id>/run_summary.yaml`

The frontend resolves the nearest available run through a generated manifest.

Current manifest files:

- `public/assets/local-manifest.json` - default local manifest used by the app
- `public/assets/run-manifest.json` - optional online manifest intended for Cloudflare-hosted assets

## Manifest And Summary Generation

### 1. Refresh run summaries

Run this when `final_snapshot_summary.csv`, `live_data_table.csv`, or the videos have changed:

```bash
python3 scripts/generate_run_summaries.py
```

This writes one `run_summary.yaml` file per run directory.

Note: this script requires `ffprobe` to be available on your machine.

### 2. Refresh the local manifest

This is the default manifest used by the app today:

```bash
npm run generate:run-manifest
```

Equivalent explicit form:

```bash
python3 scripts/generate_run_manifest.py --local --output "public/assets/local-manifest.json"
```

This writes:

- `public/assets/local-manifest.json`

### 3. Refresh the online manifest

When the Cloudflare / R2 asset bucket is available, generate the online manifest with a public base URL:

```bash
python3 scripts/generate_run_manifest.py --cloudflare-base "https://YOUR_PUBLIC_R2_BASE"
```

Equivalent explicit form:

```bash
python3 scripts/generate_run_manifest.py --cloudflare-base "https://YOUR_PUBLIC_R2_BASE" --output "public/assets/run-manifest.json"
```

This writes:

- `public/assets/run-manifest.json`

### Recommended local workflow

If you have changed local assets, run:

```bash
python3 scripts/generate_run_summaries.py
npm run generate:run-manifest
```

### Recommended online workflow

If you are preparing a Cloudflare-backed manifest, run:

```bash
python3 scripts/generate_run_summaries.py
python3 scripts/generate_run_manifest.py --cloudflare-base "https://YOUR_PUBLIC_R2_BASE"
```

The manifest generator:

- scans `public/assets/planetary/`, `public/assets/galaxy/`, and `public/assets/cosmos/`
- reads `parameters.yaml` when present
- falls back to supported parameter tokens in the run directory name when needed
- writes either a local or online manifest depending on flags

Current supported cosmos run-name tokens are:

- `Fb` -> `baryon_fraction`
- `Ef` -> `black_hole_strength`
- `G` -> `gravity_strength`

The manifest keeps local relative asset paths today, but the same schema can later be regenerated as `run-manifest.json` with remote URLs for Cloudflare-hosted assets.

## Notes

- If `Advanced Settings` is set to `online` before the online manifest exists, the app will fall back gracefully to placeholder assets.
- Verbose logging can be enabled in `Advanced Settings` for parameter-selection and manifest/debug output.
