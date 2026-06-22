# Signposting For App Behavior and Copy

This document explains where the app's editable user-facing text lives, what each file is responsible for, and how those files connect to the UI.

Most of the app follows the same pattern:

1. Text is authored in YAML.
2. A TypeScript file loads that YAML and turns it into app data.
3. A UI component renders that data in an overlay, panel, modal, or card.

The sections below are organised around that link between file, code, and UI surface.

## Main YAML files

| UI surface                                                                                       | File                                                                               | What to edit                                                                                       |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Parameter card titles, parameter info popups, slider labels                                      | `src/selection/parameter-info.yaml`                                                | `label`, `description`, plus units/ranges if needed                                                |
| Simulation family labels, parameter-page subtitle, display-view labels, display-view info popups | `src/selection/simulation-catalog.yaml`                                            | `label`, `parameterSubtitle`, each view `label`, `icon`, and `description`                         |
| Summary overlay card labels, fallback values, and click-for-more-info card copy                  | `src/summaries/summary-stats-config.yaml`                                          | `label`, `value`, `unit`, `description` in `resources`, `results`, and `simulationStats`           |
| Summary result-bar detail messages                                                               | `src/summaries/summary-target-messages.yaml`                                       | The `greenLow`, `greenHigh`, `amberLow`, `amberHigh`, `redLow`, `redHigh` messages for each metric |
| Loading terminal text                                                                            | `src/loading/planetary.yaml`, `src/loading/galaxy.yaml`, `src/loading/cosmos.yaml` | Each list item is one possible terminal line                                                       |
| Live telemetry/HUD labels and fallback values                                                    | `src/live-data/live-stats-config.yaml`                                             | `label`, `value`, `unit`, `live_key`                                                               |
| Credits page text                                                                                | `src/data/credits.yaml`                                                            | Each entry's `text`, `url`, and `header`                                                           |
| Per-run summary metric labels and values                                                         | `public/assets/**/run_summary.yaml`                                                | `summaryMetrics.*.label` and `summaryMetrics.*.value`                                              |

## How The Main Files Fit Together

### `src/selection/parameter-info.yaml`

This file defines the parameters for each simulation family.

- It contains the visible parameter `label`, explanatory `description`, units, and slider ranges.
- `src/selection/simulation-catalog.ts` loads this file and merges it into the simulation-class data used throughout the app.
- `src/selection/parameter-editor.ts` uses that merged data to build the cards in the parameter selection overlay.
- `src/summaries/summary-overlay.ts` reuses the same parameter definitions when it shows the selected input parameters in the end-of-run summary overlay.

If you want to change the text shown when someone clicks a parameter card, edit the `description` fields here.

Connected files:

- `src/selection/simulation-catalog.ts`
- `src/selection/parameter-editor.ts`
- `src/summaries/summary-overlay.ts`

### `src/selection/simulation-catalog.yaml`

This file defines the top-level metadata for each simulation family.

- `label` gives the family its visible name.
- `parameterSubtitle` appears in the parameter selection overlay.
- `views[].label` and `views[].description` control the alternate-view buttons and info popups in the display overlay.
- `src/selection/simulation-catalog.ts` loads this file and turns it into the `SIMULATION_CLASSES` structure used by the rest of the app.
- `src/video_player/view-switcher.ts` renders the view labels and info buttons.
- `src/app/app-shell.ts` opens the display-overlay info modal when one of those info buttons is clicked.

This is the file to edit when you want to change how a simulation family or alternate view is described across the app.

Connected files:

- `src/selection/simulation-catalog.ts`
- `src/video_player/view-switcher.ts`
- `src/app/app-shell.ts`

### `src/summaries/summary-stats-config.yaml`

This is the main configuration file for the cards and labels in the end-of-run summary overlay.

- `resources[]`: top-right "Resources Used" cards.
- `simulationStats[]`: top-right "Simulation Stats" cards.
- `results[]`: result-bar labels and fallback values.
- `description`: the modal text shown when a summary card is clicked.

`src/selection/simulation-catalog.ts` loads this file and attaches the summary configuration to each simulation family. `src/summaries/summary-overlay.ts` then uses that configuration to decide which cards appear, what they are called, and what explanatory text appears when a card is opened.

This is the main place to refine wording in the end-of-run summary overlay.

Connected files:

- `src/selection/simulation-catalog.ts`
- `src/summaries/summary-overlay.ts`

Notes:

- If a result or stat uses data from a run's `run_summary.yaml`, that real value can replace the fallback `value`, but the explanatory `description` still comes from this file.
- Section titles such as `Resources Used`, `Simulation Stats`, `Input Parameters`, and `Similarity Results` are currently hardcoded in `src/summaries/summary-overlay.ts` rather than YAML-backed.

### `src/summaries/summary-target-messages.yaml`

This file controls the longer explanation shown when someone opens a result bar in the end-of-run summary overlay.

- Each metric has six possible message buckets.
- The chosen message depends on whether the result is close to target, too high, or too low.

`src/summaries/summary-overlay.ts` reads these messages and picks one based on the bar's score band.

If the result-bar explanations need rewriting, this is the file to edit.

Connected files:

- `src/summaries/summary-overlay.ts`

### `src/loading/planetary.yaml`, `src/loading/galaxy.yaml`, `src/loading/cosmos.yaml`

These files provide the faux-terminal text shown in the loading overlay.

- Each YAML file is a flat list of strings.

`src/loading/init-text.ts` loads the correct file for the active simulation family. `src/loading/overlay.ts` displays the lines, and `src/app/app-shell.ts` starts the loading overlay while the selected simulation assets are being prepared.

If you want to change the tone of the loading experience, edit these files.

Connected files:

- `src/loading/init-text.ts`
- `src/loading/overlay.ts`
- `src/app/app-shell.ts`

### `src/live-data/live-stats-config.yaml`

This file controls the live telemetry panel in the top-right of the display overlay.

- `label`: visible row label.
- `value`: fallback placeholder before live data arrives.
- `unit`: suffix shown beside the value.

`src/selection/simulation-catalog.ts` loads this file and attaches the live-stat configuration to each simulation family. `src/live-data/hud.ts` then uses that configuration to build the rows in the telemetry panel.

Edit this file when you want to change row names, default values, or units in the telemetry panel.

Connected files:

- `src/selection/simulation-catalog.ts`
- `src/live-data/hud.ts`

### `src/data/credits.yaml`

This file controls the content of the Credits view.

- `text`: exact text shown.
- `url`: optional clickable link.
- `header: true`: renders the item as a section heading.

`src/data/credits.ts` parses and validates this YAML before the credits view renders it.

Connected files:

- `src/data/credits.ts`

### `public/assets/**/run_summary.yaml`

These are the per-run summary files that sit alongside individual simulation assets.


- `summaryMetrics.*.label` controls the label for a metric coming from the selected run.
- `summaryMetrics.*.value` controls its displayed value.
- `src/selection/video-run-metadata.ts` loads the chosen run's `run_summary.yaml`.
- `src/summaries/summary-overlay.ts` uses those values in the end-of-run summary overlay.

These files matter when wording belongs to one specific run rather than a whole simulation family.

Connected files:

- `src/selection/video-run-metadata.ts`
- `src/summaries/summary-overlay.ts`

Notes:

- The top-level numeric fields like `wallclockSeconds`, `computeUsed`, `memoryUsed`, `carbonBurnt`, and `particlesUpdated` drive summary/HUD values rather than descriptive copy.

## Related YAML Files That Support The Same UI

| File pattern                       | Purpose                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `public/assets/**/parameters.yaml` | Per-run parameter values used alongside `run_summary.yaml`. These feed selected-run metadata and summary comparisons, but they are numeric data rather than descriptive copy. |
| `public/assets/*_test.yaml`        | Test/sample YAML assets rather than authored production copy. |

## Important Non-YAML Exceptions

The following user-facing text is editable, but it currently lives directly in TypeScript rather than YAML. These are easy to confuse with the YAML-driven parts of the app because they sit in the same UI surfaces.

| UI surface                                                                | File                               |
| ------------------------------------------------------------------------- | ---------------------------------- |
| Entry overlay scale descriptions (`Smash together proto-planets...`, etc.) | `src/entry/entry-overlay.ts` |
| Entry overlay "About this experience" modal copy | `src/entry/entry-overlay.ts` |
| Some end-of-run summary overlay hints and section titles | `src/summaries/summary-overlay.ts` |
| Display overlay view-info modal shell text | `src/app/app-shell.ts` |

## Quick Lookup By UI Surface

Use this list when you already know which part of the app you want to change.

- Parameter selection overlay parameter popups: `src/selection/parameter-info.yaml`
- Display overlay alternate-view info buttons: `src/selection/simulation-catalog.yaml`
- End-of-run summary overlay card descriptions: `src/summaries/summary-stats-config.yaml`
- End-of-run summary overlay result-bar detail messages: `src/summaries/summary-target-messages.yaml`
- Loading overlay terminal lines: `src/loading/*.yaml`
- Display overlay telemetry panel row labels: `src/live-data/live-stats-config.yaml`
- Credits wording: `src/data/credits.yaml`
- Per-run metric labels coming from `run_summary.yaml` files: `public/assets/**/run_summary.yaml`
