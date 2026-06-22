# Signposting For Editable App Copy

This document lists the main places where user-facing text can be refined without changing app logic, with a focus on YAML-backed content.

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

## What each file controls

### `src/selection/parameter-info.yaml`

This is the source of truth for parameter explainer copy.

- Used when a parameter card is clicked in the parameter selection overlay.
- Used again when the same parameter cards appear in the end-of-run summary overlay.
- Key field for copy refinement: `description`.

Rendered by:

- `src/selection/parameter-editor.ts`
- `src/summaries/summary-overlay.ts`

### `src/selection/simulation-catalog.yaml`

This controls simulation-family metadata and display-view copy.

- `label`: family name shown in the UI.
- `parameterSubtitle`: text beneath the family heading in the parameter selection overlay.
- `views[].label`: name shown in the display overlay view switcher.
- `views[].description`: text shown when the view-switcher info button is clicked.

Rendered by:

- `src/selection/simulation-catalog.ts`
- `src/video_player/view-switcher.ts`
- `src/app/app-shell.ts`

### `src/summaries/summary-stats-config.yaml`

This is the main authored copy file for the end-of-run summary overlay.

- `resources[]`: top-right "Resources Used" cards.
- `simulationStats[]`: top-right "Simulation Stats" cards.
- `results[]`: result-bar labels and fallback values.
- `description`: the modal text shown when a summary card is clicked.

Rendered by:

- `src/summaries/summary-overlay.ts`

Notes:

- If a result/stat id matches data coming from a run sidecar YAML, the live value can override the fallback `value`, but the authored `description` still comes from this file.
- Section titles such as `Resources Used`, `Simulation Stats`, `Input Parameters`, and `Similarity Results` are currently hardcoded in `src/summaries/summary-overlay.ts` rather than YAML-backed.

### `src/summaries/summary-target-messages.yaml`

This controls the longer explanation shown when a result bar is opened.

- Each metric has six possible message buckets.
- The chosen message depends on whether the result is close to target, too high, or too low.

Rendered by:

- `src/summaries/summary-overlay.ts`

### `src/loading/planetary.yaml`, `src/loading/galaxy.yaml`, `src/loading/cosmos.yaml`

These files provide the faux-terminal loading lines.

- Each YAML file is a flat list of strings.
- The app randomly draws from the current family's list during the loading overlay sequence.

Rendered by:

- `src/loading/init-text.ts`
- `src/loading/overlay.ts`
- `src/app/app-shell.ts`

### `src/live-data/live-stats-config.yaml`

This controls the small top-right live telemetry panel in display mode.

- `label`: visible row label.
- `value`: fallback placeholder before live data arrives.
- `unit`: suffix shown beside the value.

Rendered by:

- `src/live-data/hud.ts`

This file is more about labels than long descriptions, but it is still editable user-facing YAML text.

### `src/data/credits.yaml`

This controls the credits view.

- `text`: exact text shown.
- `url`: optional clickable link.
- `header: true`: renders the item as a section heading.

Rendered by:

- `src/data/credits.ts`

### `public/assets/**/run_summary.yaml`

These are per-run sidecar files.

- `summaryMetrics.*.label` controls the label for a metric coming from the selected run.
- `summaryMetrics.*.value` controls its displayed value.

Rendered by:

- `src/selection/video-run-metadata.ts`
- `src/summaries/summary-overlay.ts`

Notes:

- These files do not usually contain explanatory paragraphs, but they do contain user-facing labels that may need refinement.
- The top-level numeric fields like `wallclockSeconds`, `computeUsed`, `memoryUsed`, `carbonBurnt`, and `particlesUpdated` drive summary/HUD values rather than descriptive copy.

## Nearby YAML files that are mostly data, not copy

| File pattern                       | Purpose                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `public/assets/**/parameters.yaml` | Per-run parameter values used for selected-run metadata. Numeric data, not descriptive text. |
| `public/assets/*_test.yaml`        | Test/sample YAML assets rather than authored production copy.                                |

## Important non-YAML exceptions

The following user-facing text is editable, but it is currently hardcoded in TypeScript rather than stored in YAML:

| UI surface                                                                | File                               |
| ------------------------------------------------------------------------- | ---------------------------------- |
| Landing-page scale descriptions (`Smash together proto-planets...`, etc.) | `src/entry/entry-overlay.ts`       |
| Landing-page "About this experience" modal copy                           | `src/entry/entry-overlay.ts`       |
| Some summary hints and section titles                                     | `src/summaries/summary-overlay.ts` |
| View-info overlay chrome (`Close`, modal shell text)                      | `src/app/app-shell.ts`             |

## Fastest places to refine copy by feature

If you want to update a specific kind of text quickly:

- Parameter explainer popups: `src/selection/parameter-info.yaml`
- Display-mode info-button text for alternate views: `src/selection/simulation-catalog.yaml`
- End-of-run summary card descriptions: `src/summaries/summary-stats-config.yaml`
- End-of-run result-bar detail messages: `src/summaries/summary-target-messages.yaml`
- Loading terminal lines: `src/loading/*.yaml`
- HUD row labels: `src/live-data/live-stats-config.yaml`
- Credits wording: `src/data/credits.yaml`
- Per-run metric labels coming from asset sidecars: `public/assets/**/run_summary.yaml`
