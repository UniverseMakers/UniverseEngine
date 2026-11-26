# Offline Setup

These instructions walk you through setting up UniverseEngine to run entirely locally, with no internet needed once it's set up.

## 1. Install the tools

You need `git`, Python 3 and Node.js 18+.

### macOS

Install [Homebrew](https://brew.sh) by following the instructions on its homepage if needed,
then:

```bash
brew install git python node
```

### Windows (WSL)

On Windows, UniverseEngine needs WSL (Windows Subsystem for Linux).

If you already have WSL set up, skip to step 3.

1. Install WSL by following
   [Microsoft's instructions](https://learn.microsoft.com/en-us/windows/wsl/install)
   (usually just `wsl --install` in an admin PowerShell, then a restart).
2. Open **Ubuntu** from the Start menu and set up your user.
3. Follow the **Linux** steps below inside Ubuntu. Keep the project in your Ubuntu
   home folder (`~`), not under `/mnt/c`.

### Linux (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y git python3 python3-venv curl
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Restart your terminal, then:

```bash
nvm install 22
```

On other distributions, install `git`, `python3` and `curl` with your package
manager, then use the same `nvm` commands.

## 2. Download and install UniverseEngine

```bash
cd ~
git clone https://github.com/UniverseMakers/UniverseEngine.git
cd UniverseEngine
npm install
```

## 3. Download the assets

The full set is **about 30 GB**, so make sure you have at least 35 GB free.

```bash
npm run setup:local
```

If the download is interrupted, rerun the command. It skips files you already have.

To download only one scale, run one of these instead, then
`npm run generate:run-manifest`:

- Cosmos (23 GB): `npm run download:cosmos`
- Planetary (6 GB): `python3 scripts/download_engine_assets.py --simulation planetary`
- Galaxy (0.6 GB): `python3 scripts/download_engine_assets.py --simulation galaxy`

## 4. Run the app

```bash
npm run local
```

Open http://localhost:5173 in your browser. We recommend Chrome; Edge is known to have performance issues on Windows.

Press `Ctrl + C` in the terminal to stop the app.

To start it again later, run `npm run local` in `~/UniverseEngine`. To update,
run `git pull && npm install && npm run setup:local` there.

## Bonus: usage stats

Each time someone presses **Let's Go**, the app records their chosen parameters
and a timestamp in `local_tracking.db`. Nothing personal is stored.

### View your stats

One-time setup:

```bash
cd ~/UniverseEngine
python3 -m venv .venv
.venv/bin/pip install matplotlib numpy pyyaml
```

Then:

```bash
.venv/bin/python scripts/summarize_tracking_database.py --db local_tracking.db
.venv/bin/python scripts/plot_param_distributions.py --db local_tracking.db   # charts saved to plots/
```

### Contribute to the global stats

Email `local_tracking.db` to **willjroper@gmail.com**, saying where it was
collected (for example, the venue name). Stop the app first.
