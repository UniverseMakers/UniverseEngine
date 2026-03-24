# UI Architecture

## Flow

UniverseEngine uses a simple four-mode UI shell:

- `entry` - first-load overlay used to choose the simulation class
- `config` - responsive overlay used to edit parameters and switch theme
- `initializing` - a faux terminal window shown immediately after pressing run
- `display` - the simulation viewport with a top-left burger menu, top-right telemetry card, and bottom timeline

`src/main.ts` stays intentionally tiny; `src/app/app-shell.ts` owns the mode
orchestration today.

## Current Layout

- `src/main.ts` - browser entrypoint (imports CSS + boots the app)
- `src/app/` - app orchestration (shell assembly, display menu wiring)
- `src/components/` - UI building blocks and overlays
- `src/domain/` - non-UI logic (metrics, CSV parsing/sampling, placeholder asset lookup)
- `src/data/` - YAML-backed simulation catalog source-of-truth
- `src/init-text/` - YAML-backed initialization text source-of-truth
- `src/shared/` - tiny cross-cutting helpers (formatting, etc.)

## Target Layout

If the codebase grows, a reasonable next split is:

- `src/app/` - bootstrap, mode orchestration, session state, display menu wiring
- `src/features/display/` - viewport, timeline, data panel, terminal viewer
- `src/features/overlays/` - entry, config, initializing, and summary overlays
- `src/features/config/` - parameter editor and theme picker
- `src/domain/simulations/` - simulation catalog, placeholder assets, summary metric helpers
- `src/domain/init-text/` - YAML loader and per-simulation initialization text
- `src/domain/live-stats/` - CSV loading, sampling, and fake-data helpers
- `src/shared/` - formatting, DOM helpers, and other cross-cutting utilities
- `src/styles/` - eventually split CSS by base, display, overlays, and theme tokens

## Component Responsibilities

- `src/app/app-shell.ts` - orchestrates mode changes, theme changes, parameter persistence, and run transitions
- `src/components/entry-overlay.ts` - initial simulation-family selection overlay
- `src/components/config-overlay.ts` - configuration overlay shell and its Parameters / Settings / Terminal sections
- `src/components/parameter-editor.ts` - parameter sliders inside config
- `src/components/theme.ts` - theme ids + persistence + theme picker UI
- `src/components/initializing-overlay.ts` - plays the faux terminal sequence
- `src/components/telemetry-panel.ts` - compact display-mode telemetry (top-right)
- `src/components/display-terminal.ts` - display-mode terminal/log viewer (placeholder stream today)
- `src/app/display-menu.ts` - display-mode burger menu (top-left)
- `src/components/timeline.ts` - renders the display-mode scrubber
- `src/components/viewport.ts` - owns the background simulation image/video surface
- `src/components/summary-overlay.ts` - end-of-run overlay shown after playback ends

## State Ownership

The app keeps three important pieces of shared state in `src/app/app-shell.ts`:

- active simulation class
- active theme
- parameter values keyed by simulation class

Parameter values are preserved per class so reopening config does not reset the user's earlier selections.

## Styling Structure

`src/style.css` is organized around shared layout primitives first, then component styling, then responsive breakpoints.

Theme flexibility is preserved through CSS custom properties on `[data-theme='...']`, while the Tron layout currently acts as the visual reference implementation.

## Planned Terminal Log Viewer

The `Terminal` item in the display-mode burger menu is intentionally present ahead of full backend integration.

Its long-term purpose is to let visitors inspect the real simulation log alongside the video playback when that data becomes available. The current terminal section in config is therefore a placeholder landing area for a future log-viewing workflow, not just decorative UI.

## Documentation Convention

The codebase is moving to a denser documentation standard aimed at nonexpert readers.

- every TypeScript module should start with a module-level doc comment explaining purpose and boundaries
- every exported interface, type, and function should have a short doc comment
- every logical block inside implementation code should have an inline comment introducing what the block is doing
- especially non-obvious logic should be commented line-by-line when helpful
- YAML source files should carry top-level schema comments explaining what each section means

The goal is not minimal commentary; the goal is clarity.

## Formatting

Prettier is the standard formatting tool for the TypeScript/CSS/YAML/Markdown side of the repo.

- `npm run format` writes formatting changes
- `npm run format:check` verifies formatting without changing files
