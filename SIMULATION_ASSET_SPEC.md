# Simulation Asset Spec

Each _simulation run_ in UniverseEngine is represented by a small bundle of files.
Today these live under `public/assets/` and are loaded as static assets. Later we can
replace this with streaming endpoints, but the file _shape_ should stay the same.

## Required Files (Per Video)

For a run named `my_run.mp4`:

1. Video

- Path: `public/assets/my_run.mp4`
- Purpose: the visual playback shown in display mode.
- Duration: roughly ~20 seconds is a good target (not enforced).
- Notes:
  - Keep encoding web-friendly (H.264/AAC is the safest default).
  - The app assumes the video duration is the playback timeline.

2. Sidecar run metadata (YAML)

- Path: `public/assets/my_run.yaml` (same basename as the video)
- Purpose: final run totals used by the summary overlay and as targets for some "live" stats.
- Format: YAML mapping.

Schema (required keys):

```yaml
wallclockSeconds: 0.0 # number; total simulation wallclock runtime in seconds
computeUsed: 0.0 # number; computational resources used
memoryUsed: 0.0 # number; memory used in GB
carbonBurnt: 0.0 # number; carbon footprint in kgCO2e
particlesUpdated: 0 # number; total particle updates over the run (integer)
```

Notes:

- The UI currently displays runtime in _hours_ (derived from `wallclockSeconds`).
- Values are treated as totals/final values for the completed run.

3. Live stats stream (CSV)

- Path: `public/assets/my_run_<class>_stats.csv` (current placeholder naming)
- Purpose: time-varying telemetry shown in the top-right HUD.
- Format: CSV with a header row.

Schema:

- Must include a `t` column (seconds) to indicate the timestamp within the video of the entry.
- Additional columns are arbitrary keys used by `live_key` / `id` from `src/data/simulations.yaml`.

Example:

```csv
t,temperature,Earth mass
0.0,280,1.0
1.0,281,1.0
2.0,283,1.01
```

Notes:

- The app loads and samples the CSV at the current playback time.
- There is no need for each frame to have an entry, in fact this should be avoided for performance. We interpolate values between entries when the playback time falls between them which is perfectly fine for smooth display.
- Values are displayed with a maximum of 2 decimal places.

## How The UI Knows What To Display

The simulation family catalog lives in `src/data/simulations.yaml`.

Important fields:

- `metadata.summaryStats`: controls which rows appear in the end-of-run summary.
- `metadata.liveStats`: controls which rows appear in the live telemetry panel.

Per-stat fields used by the app:

- `id`: stable key.
- `label` (optional): display label override.
- `unit` (optional): appended in UI.
- `live: true`: the stat is expected to update over time.
- `live_key` (optional): CSV column key to use instead of `id`.
- `from_video: true`: pull the _final_ value from the video sidecar YAML.
- `video_key` (optional): YAML key to use instead of `id`.
- `scale_with_time: true`: when `live` and `from_video`, scale the final metadata value linearly by playback time.
- `integer: true`: when scaling, force values to be whole numbers.
