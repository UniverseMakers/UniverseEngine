# UniverseEngine

A web app for displaying and interacting with simulation videos spread across a parameter hypercube.

## Quick Start

- `npm install`
- `npm run dev`

Formatting:

- `npm run format`
- `npm run format:check`

## Current UI Structure

The app currently uses a four-mode interface:

- `entry` - first-load simulation-family chooser
- `config` - overlay for parameter tuning and theme settings
- `initializing` - terminal-style faux startup window shown after run
- `display` - viewport with telemetry panel, timeline, and a burger menu that opens Parameters / Settings / Terminal

The `Terminal` menu entry is intended to become a real simulation-log viewer later, so visitors can inspect the underlying run logs alongside the video when that integration is ready.

See `UI_ARCHITECTURE.md` for the current component and state breakdown.

## Repository Layout

- `src/main.ts` - browser entrypoint (imports global CSS, boots the app)
- `src/app/` - app shell/orchestration
- `src/components/` - UI overlays + HUD components
- `src/domain/` - non-UI logic (CSV parsing/sampling, metrics derivation, placeholder asset lookup)
- `src/data/` - YAML-backed simulation catalog
- `src/init-text/` - YAML-backed initializing-terminal scripts

## Run Manifest

Simulation assets are moving to a run-based layout under `public/assets/`:

- `public/assets/<simulation-id>/<run-id>/animations/*.mp4`
- `public/assets/<simulation-id>/<run-id>/live_data_table.csv`
- `public/assets/<simulation-id>/<run-id>/final_snapshot_summary.csv`
- `public/assets/<simulation-id>/<run-id>/run_summary.yaml`

The app reads a generated manifest at `public/assets/run-manifest.json` for nearest-grid-point lookup.

Generate or refresh the manifest with:

- `npm run generate:run-manifest`

This script:

- scans `public/assets/planetary/`, `public/assets/galaxy/`, and `public/assets/cosmos/`
- parses supported parameter tokens from each run directory name
- writes one `run_summary.yaml` per run directory
- writes `public/assets/run-manifest.json`

Current supported cosmos run-name tokens are:

- `Fb` -> `baryon_fraction`
- `Ef` -> `black_hole_strength`
- `G` -> `gravity_strength`

The manifest keeps local relative asset paths today, but the same schema can later be regenerated with remote URLs for Cloudflare-hosted assets.
