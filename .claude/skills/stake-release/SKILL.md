---
name: stake-release
description: Release routine for a Stake Engine slot in this repo (Ghost Duels or a game built on templates/stake-3star). Simulates and optimizes the math to 96.00% per mode, reports stats and 3-star metrics in both readings, syncs prices/RTP/max win into the frontend, refreshes _UPLOAD_TO_STAKE, runs tools/review and summarizes. Use when asked to release, rebuild, re-optimize, package or review-check a game for Stake Engine.
---

# Stake release

Argument: the game id (folder in `math-sdk/games`, default `ghost_duels`). Look up its web folder and title in `tools/review/games/<game>.json` (`web`, `title`). Run everything from the repo root with `math-sdk\env\Scripts\python.exe` (called `py` below). Work on the game's branch: `git pull` first, never force-push.

## 1. Simulate and optimize

```
cd math-sdk
py games\<game>\run.py 20000 5000      # quick check first: minutes
py games\<game>\run.py                 # full run: 1M base, 500k per boost, 100k per buy; can take hours, run in the background
```

`--optimize-only` re-optimizes existing books after changing targets; `--configs-only` only redoes stats and checks. Needs Rust (`%USERPROFILE%\.cargo\bin\cargo`). If the optimizer fails, run `cargo run --release` in `math-sdk/optimization_program` to see its error (run_script hides it). The usual cause is a fence that the books cannot reach. Fences other than exact wins must be given by hit rate + RTP share, not by average win.

## 2. Stats and 3-star metrics

Read `math-sdk/games/<game>/library/stats_<mode>.json` for every mode (written by `game_stats.py`, weighted by the optimizer's weights). Confirm:

- `rtp` is 0.96 in every mode (exactly, to 4 decimals)
- `max_win` is 25000 at least in the buy modes; note `max_win_odds`
- buys have `zero_rate` around 0.10 or lower
- `three_star.sdk_fails` and `three_star.per_cost_fails`: report both readings. A buy failing in both readings (usually prob5k) needs `SCALING` in `game_optimization.py`. Then re-run `--optimize-only`.

The format checks (`execute_all_tests`) must finish without an assertion error.

## 3. Sync the frontend

```
py tools\release\sync_frontend.py <game> <web>\game.js
```

It rewrites every `mode: "NAME", cost: N, rtp: N, maxWin: N` literal from the stats and fails if a price differs or a mode is missing on either side. If a mode is new, add its literal and its UI by hand, then run it again. Check that the rules text describing a mode still matches (e.g. "about 7× as often" = base bonus_rate ÷ mode bonus_rate).

## 4. Review checks

```
py tools\review\run_review.py --profile tools\review\games\<game>.json
```

It prints PASS/FAIL per guideline ID and writes `.review-out/<game>/report.md` plus screenshots. Look at the screenshots of new or changed UI. Fix every FAIL before packaging. "NEEDS A HUMAN" items (217 content, 253 originality) go into the summary.

## 5. Package

Ask the user before refreshing the math: every math version committed to `_UPLOAD_TO_STAKE/1_math` costs about 0.5 GB of the repo owner's Git LFS quota. Package only versions that will be uploaded.

```
py tools\release\package.py <game> <web> "<title>"                  # math and frontend
py tools\release\package.py <game> <web> "<title>" --frontend-only  # frontend only
```

Then commit and push. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 6. Summary

Give the user:

- **What changed.**
- **A per-mode table:** mode, cost, RTP, max win (and its odds), hit rate, bonus rate, 0× rate, and the 3-star metrics in both readings, with PASS/FAIL against the limits (prob5k 1%, prob10k 0.5%, etl40b 0.9, etl10k 0.8, cvar 800).
- **The review result:** counts, plus any FAIL or NEEDS A HUMAN.
- **What is still open.**
