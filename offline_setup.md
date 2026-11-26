# Offline Setup

Run UniverseEngine on your own computer with no internet needed once it's set up.
It takes about 15 minutes, plus however long the asset download takes.

You will type commands into a **terminal**. Copy each grey box, paste it into the
terminal, press **Enter**, and wait for it to finish before moving on.

---

## 1. Install the tools

Follow the section for your computer, then go to step 2.

### macOS

1. Open **Terminal** (press `Cmd + Space`, type `Terminal`, press Enter).
2. Install Apple's developer tools (gives you `git` and `python3`). Click
   **Install** in the pop-up and wait for it to finish:
   ```bash
   xcode-select --install
   ```
   If it says they're already installed, that's fine.
3. Install Node.js:
   ```bash
   touch ~/.zshrc
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   ```
4. **Close Terminal and open it again**, then run:
   ```bash
   nvm install 22
   ```

### Windows (using WSL)

WSL lets Windows run Linux tools. UniverseEngine needs it.

1. Right-click the **Start** button and choose **Terminal (Admin)** or
   **PowerShell (Admin)**.
2. Run:
   ```powershell
   wsl --install
   ```
3. **Restart your computer.**
4. Open **Ubuntu** from the Start menu. The first time, it asks you to choose a
   username and password. Remember the password, because you'll need it in a moment
   (nothing shows on screen while you type it, which is normal).
5. Follow the **Linux** steps below, inside this Ubuntu window. Run every command
   from here on in Ubuntu, not PowerShell.

### Linux (Ubuntu/Debian)

1. Open a terminal (usually `Ctrl + Alt + T`).
2. Install the basics (enter your password if asked):
   ```bash
   sudo apt update && sudo apt install -y git python3 python3-venv curl
   ```
3. Install Node.js:
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   ```
4. **Close the terminal and open it again**, then run:
   ```bash
   nvm install 22
   ```

> Using a different Linux (Fedora, Arch…)? Install `git`, `python3` and `curl`
> with your package manager, then do steps 3 and 4.

**Check it worked.** Each of these should print a version number:

```bash
git --version
python3 --version
node --version
```

---

## 2. Download UniverseEngine

```bash
cd ~
git clone https://github.com/UniverseMakers/UniverseEngine.git
cd UniverseEngine
npm install
```

---

## 3. Download the simulation assets

This downloads all the simulation videos and data. **It's about 30 GB**, so use a
fast connection and make sure you have at least 35 GB of free disk space.

```bash
npm run setup:local
```

If the download is interrupted, run the same command again. Anything already
downloaded is skipped.

> Only need one scale? Run one of these instead, then `npm run generate:run-manifest`:
>
> - Cosmos (23 GB): `npm run download:cosmos`
> - Planetary (6 GB): `python3 scripts/download_engine_assets.py --simulation planetary`
> - Galaxy (0.6 GB): `python3 scripts/download_engine_assets.py --simulation galaxy`

---

## 4. Run the app

```bash
npm run local
```

When you see `Local: http://localhost:5173/`, open that address in your web browser
(on Windows, just use your normal Windows browser).

- **To stop:** click the terminal and press `Ctrl + C`.
- **To start again later:** open a terminal and run:
  ```bash
  cd ~/UniverseEngine
  npm run local
  ```
- **To get updates:** run `git pull` and then `npm install` in the
  `UniverseEngine` folder.

---

## Bonus: usage stats

Every time someone presses **Let's Go**, the app saves their chosen settings to a
file called `local_tracking.db` in the `UniverseEngine` folder. It holds only the
chosen parameters and timestamps, nothing personal.

### See your own stats

One-time setup:

```bash
cd ~/UniverseEngine
python3 -m venv .venv
.venv/bin/pip install matplotlib numpy pyyaml
```

Then, whenever you want a summary:

```bash
.venv/bin/python scripts/summarize_tracking_database.py --db local_tracking.db
```

And to make charts (saved in a new `plots` folder):

```bash
.venv/bin/python scripts/plot_param_distributions.py --db local_tracking.db
```

### Add your stats to the global online stats

We'd love to include your visitors' choices in the worldwide stats.

1. Stop the app (`Ctrl + C`).
2. Open the `UniverseEngine` folder:
   - macOS: `open ~/UniverseEngine`
   - Windows (WSL): `explorer.exe ~/UniverseEngine`
   - Linux: `xdg-open ~/UniverseEngine`
3. Email `local_tracking.db` to **willjroper@gmail.com**, saying where it was
   collected (for example, the venue name).
