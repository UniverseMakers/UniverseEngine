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
