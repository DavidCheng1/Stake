# Stake Game Project

This repository contains the files for our Stake Engine game projects: **Loan Shark**, based on the Stake Engine SDK examples, and **Ghost Duels**.

## Repository layout

```text
Stake/
├─ math-sdk/                         # Python game mathematics and simulations
│  └─ games/ghost_duels/             # Ghost Duels math
├─ web-sdk/                          # Svelte/PixiJS frontend SDK and games
│  └─ apps/cluster/                  # Our current Loan Shark game prototype
├─ ghost-duels-web/                  # Ghost Duels frontend (static)
├─ tools/mock_rgs.py                 # Local RGS stand-in for testing Ghost Duels
├─ GhostDuelsV2.html                 # Original Ghost Duels prototype
├─ stake-engine-docs-reference.json  # Saved Stake Engine documentation reference
└─ README.md
```

## Ghost Duels (Geisterduell)

The second game, ported from the `GhostDuelsV2.html` prototype:

| Part | Location |
| --- | --- |
| Math (rules, simulations, publish files) | [`math-sdk/games/ghost_duels/`](math-sdk/games/ghost_duels/) |
| Frontend (static, no build step) | [`ghost-duels-web/`](ghost-duels-web/) |
| Local mock RGS for testing | [`tools/mock_rgs.py`](tools/mock_rgs.py) |

Generate the math (about 2 minutes, after the math SDK setup below):

```powershell
cd math-sdk
env\Scripts\python.exe games\ghost_duels\run.py
```

This writes `games/ghost_duels/library/publish_files/` (books, lookup table, `index.json`) and runs the RGS format checks. Results are deterministic, so every run produces identical files. They are not in Git because the book file is about 140 MB.

Play it locally against the real books:

```powershell
math-sdk\env\Scripts\python.exe tools\mock_rgs.py
```

For Stake Engine, upload `math-sdk/games/ghost_duels/library/publish_files/` as the math and the `ghost-duels-web/` folder as the frontend.

Current math, from 1M spins: RTP 95.67%, a win every 3.6 spins, a bonus every 725 spins, max win 25,000×.

## Loan Shark

The active frontend project is located at:

`web-sdk/apps/cluster`

The main game configuration and UI files are in:

- `web-sdk/apps/cluster/src/game/`
- `web-sdk/apps/cluster/src/components/`
- `web-sdk/apps/cluster/src/stories/`

## Prerequisites

- Node.js `22.16.0` or newer
- pnpm `10.5.0`
- Python `3.12` or newer for the math SDK
- Git
- Visual Studio Code is recommended

Check the installed versions:

```powershell
node --version
pnpm --version
python --version
```

## Install the web SDK

From the repository root, open the web SDK directory:

```powershell
cd web-sdk
pnpm.cmd install
```

The repository uses a pnpm workspace and TurboRepo, so install dependencies from `web-sdk`, not from `web-sdk/apps/cluster`.

## Start the Loan Shark prototype

Start Storybook for the cluster game on port `6002`:

```powershell
cd web-sdk
pnpm.cmd --filter cluster run storybook
```

Then open [http://localhost:6002/](http://localhost:6002/) in a browser. Storybook is the local development preview used to inspect and interact with the game UI.

To stop the server, press `Ctrl+C` in the terminal.

### Alternative Vite development server

The cluster app also has a Vite development command:

```powershell
pnpm.cmd --filter cluster run dev
```

This uses the app's normal development entry point and may require Stake Engine/RGS configuration. Storybook is currently the simplest way to inspect the local prototype without a live RGS connection.

## Build the frontend

From `web-sdk`:

```powershell
pnpm.cmd --filter cluster run build
```

The generated build output is for local validation and deployment preparation. Build output directories are ignored by Git.

## Math SDK setup

The math SDK defines game rules, symbols, events, simulations, and win distributions. Its detailed documentation is in [`math-sdk/docs/`](math-sdk/docs/) and its own [`math-sdk/README.md`](math-sdk/README.md).

From the repository root, create the Python virtual environment in `math-sdk\env` (the same steps as `make setup`, and the path the commands above use):

```powershell
cd math-sdk
python -m venv env
env\Scripts\python.exe -m pip install --upgrade pip
env\Scripts\python.exe -m pip install -r requirements.txt
env\Scripts\python.exe -m pip install -e .
```

The included math examples are under [`math-sdk/games/`](math-sdk/games/). Use the documentation in [`math-sdk/docs/math_docs/`](math-sdk/docs/math_docs/) to understand the game-state format, events, tests, and simulations before creating a new game math model.

## Current prototype status

- The frontend prototype uses a 7x7 game grid.
- The current local Storybook setup provides demo betting/spin behavior.
- Placeholder symbols, backgrounds, and animations can be replaced with final game assets later.
- A live Stake Engine/RGS connection is not required for the local Storybook demo.

## Troubleshooting

### Spin behavior and regression checks

Press **SPIN** once to play a round. It stays disabled through the full event sequence and animations, then becomes available again after settlement. Auto-spin uses the same round flow.

The local preview uses recorded sample math outcomes, including losses, cascades, and bonus events. The demo balance deducts the wager at round start and credits the recorded payout once at round end. These samples are not a production probability distribution.

From `web-sdk`, run `node --test scripts/test-cluster-spin.mjs` to check the cluster actor and event player with controlled animation callbacks. The tests cover repeated spins, event order, settlement, insufficient funds, failed-round recovery, and auto-spin. Visual animation timing still needs a browser check.

### `PUBLIC_CHROMATIC` is not recognized

The inline environment-variable syntax in the package script is Unix-style. In Windows PowerShell, set it separately first:

```powershell
$env:PUBLIC_CHROMATIC="true"
```

Then run the Storybook command shown above.

### Storybook reports parsing warnings

Warnings about Storybook version compatibility, missing `.mdx` files, or CSF parsing can appear while the server starts. If the terminal prints a local URL and the page loads, the server is running. Use the browser console and terminal output to investigate any specific story that fails to render.

### Port already in use

Use another port, for example:

```powershell
pnpm.cmd --filter cluster exec storybook dev -p 6003 public
```

## Useful references

- [Stake Engine documentation](https://stake-engine.com/docs/)
- [Web SDK documentation](web-sdk/README.md)
- [Math SDK documentation](math-sdk/README.md)
- [Saved documentation reference](stake-engine-docs-reference.json)
