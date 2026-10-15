# Stake Game Project

This repository contains the files for our Stake Engine game project. The main game prototype is **Loan Shark**, based on the Stake Engine SDK examples.

## Repository layout

```text
Stake/
├─ math-sdk/                         # Python game mathematics and simulations
├─ web-sdk/                          # Svelte/PixiJS frontend SDK and games
│  └─ apps/cluster/                  # Our current Loan Shark game prototype
├─ stake-engine-docs-reference.json  # Saved Stake Engine documentation reference
└─ README.md
```

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

Open a terminal in the web SDK directory:

```powershell
cd "C:\Users\David Cheng\Documents\GitHub\StakeStuff\Stake\web-sdk"
pnpm.cmd install
```

The repository uses a pnpm workspace and TurboRepo, so install dependencies from `web-sdk`, not from `web-sdk/apps/cluster`.

## Start the Loan Shark prototype

Start Storybook for the cluster game on port `6002`:

```powershell
cd "C:\Users\David Cheng\Documents\GitHub\StakeStuff\Stake\web-sdk"
$env:PUBLIC_CHROMATIC="true"
pnpm.cmd --filter cluster exec storybook dev -p 6002 public
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

From the repository root, create and activate a Python virtual environment:

```powershell
cd "C:\Users\David Cheng\Documents\GitHub\StakeStuff\Stake\math-sdk"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

The included math examples are under [`math-sdk/games/`](math-sdk/games/). Use the documentation in [`math-sdk/docs/math_docs/`](math-sdk/docs/math_docs/) to understand the game-state format, events, tests, and simulations before creating a new game math model.

## Current prototype status

- The frontend prototype uses a 7x7 game grid.
- The current local Storybook setup provides demo betting/spin behavior.
- Placeholder symbols, backgrounds, and animations can be replaced with final game assets later.
- A live Stake Engine/RGS connection is not required for the local Storybook demo.

## Troubleshooting

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
