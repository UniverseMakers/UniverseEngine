# Running UniverseEngine Locally

Everything you need to get the UniverseEngine app running on your own machine with
local simulation assets.

## Prerequisites

| Tool | Minimum version | Why |
|---|---|---|
| **Node.js** | 18 | Vite 6 requires ESM support. Node 18 is the oldest supported LTS. |
| **npm** | (bundled with Node) | Package manager for the frontend. |
| **Python** | 3.9 | Asset-generation and server scripts. |
| **ffprobe** | (any modern build) | Video metadata probing. Part of `ffmpeg`. |

### Installing prerequisites

**Node.js** — the simplest way is [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# Restart your terminal, then:
nvm install 22
```

**Python** — macOS and most Linux distributions include Python 3 already.  Check
with `python3 --version`.  If you need to install it:

```bash
# macOS
brew install python3

# Ubuntu / Debian
sudo apt install python3

# WSL — same as Ubuntu
```

**ffprobe** — bundled with `ffmpeg`:

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian / WSL
sudo apt install ffmpeg
```

## Quick start (with cloud assets)

If you just want to browse the simulation runs that are already hosted online,
you only need two commands:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.  The app defaults to **online** manifest mode and
streams assets from the Cloudflare R2 bucket.

> **Note:** You won't be able to play videos offline this way, and planet-selection
> tracking won't be recorded unless you also run the local tracking server
> (see [Local Tracking](#local-tracking)).

## Full local setup (with offline assets)

For a fully offline experience — or if you want to work with a specific subset
of runs — follow these steps from a fresh clone.

### 1. Clone and install

```bash
git clone <repo-url> && cd UniverseEngine
npm install
```

### 2. Download simulation assets

Pull the file tree you want from the cloud into your local `public/assets/`
directory:

```bash
npm run download:assets          # all three families (planetary, galaxy, cosmos)
npm run download:cosmos          # cosmos only
```

This reads `public/assets/run-manifest.json` (the online manifest) and
downloads every referenced video, CSV, and YAML file.  Files that already
exist locally are skipped, so you can run it again to grab only what's new.

If you already have assets in `public/assets/` that you copied manually,
skip this step.

### 3. Generate the local manifest

The manifest tells the frontend which runs exist and where their files live:

```bash
npm run generate:run-manifest
```

This writes `public/assets/local-manifest.json`.  Re-run it whenever you add
or remove run directories under `public/assets/`.

### 4. (Optional) Refresh run summaries

If CSV data or video files have changed and you need up-to-date
`run_summary.yaml` files for every run:

```bash
python3 scripts/generate_run_summaries.py
```

Requires `ffprobe`.

### 5. Switch to local manifest mode

The app defaults to **online** manifest mode.  To use your downloaded assets:

1. Start the dev server: `npm run dev`
2. Open Settings (burger menu → Settings)
3. Click the **Advanced Settings** toggle (password is on the screen)
4. Set **Manifest Source** to `local`

This setting is not persisted — you'll need to switch it again on each fresh
boot.

> **Tip:** You can verify the switch worked by checking the browser console
> for `Manifest source: local` messages.

### 6. Start the dev server

```bash
npm run dev
```

Open `http://localhost:5173`.  You should now have video playback, live
telemetry, and end-of-run summaries all working from local files.

## Local tracking

When you select a run and press "Let's Go", the app sends a tracking POST with
the chosen parameters.  In production this goes to a Cloudflare Worker that
writes to a D1 database.  We can replicate that locally.

### Start the tracking server

In a **separate terminal** alongside `npm run dev`:

```bash
npm run tracking:server
```

This starts a small Python HTTP server on `http://127.0.0.1:8765` that receives
`POST /api/track-run` and writes each selection to `local_tracking.db` (a
SQLite file at the repo root, gitignored).

In dev mode, Vite proxies `/api/track-run` to this server automatically, so
your parameter selections are recorded without any manual configuration.

You can check how many records have been captured:

```bash
curl http://localhost:8765/api/track-run/count
```

### Sync local records to the cloud D1 database

After accumulating records locally, push them to the online D1 database:

```bash
npm run tracking:sync
```

This reads every row from `local_tracking.db`, inserts them into the remote
D1 `run_selections` table in batches, and deletes the synced records from the
local database.

Options:

```bash
npm run tracking:sync -- --dry-run   # preview without touching D1
npm run tracking:sync -- --no-clear  # upload but keep local records
```

## Troubleshooting

### `SyntaxError: Unexpected token {` on `npm run dev`

Your Node.js version is too old.  See [Prerequisites](#prerequisites) above.

### `qt.qpa.xcb: could not connect to display` on WSL

This is a system-level Qt library conflict in some WSL installations and is
**not related to this project**.  Make sure `node_modules` exists (`npm
install`).  If the error persists, check your `PATH` for any Qt-linked
binaries that may be shadowing `node` or `vite`.

### Empty / blank screen after starting

The app defaults to **online** manifest mode and may fall back to placeholder
assets if no network is available.  Switch to **local** mode in
Settings → Advanced Settings → Manifest Source.

### Missing videos or "4 views expected, only 3 shown"

Run `npm run generate:run-manifest` to regenerate the local manifest.  If you
added runs manually, make sure each run directory under `public/assets/`
contains the expected video files in `animations/`.

### WSL-specific notes

- Use the WSL filesystem (`~/...`), **not** `/mnt/c/...`, for the repository.
  Filesystem performance and case sensitivity differ.
- If `npm run dev` fails with a port conflict, WSL sometimes maps ports
  differently.  Try `npx vite --port 5174`.
