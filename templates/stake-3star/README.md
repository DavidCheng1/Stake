# Stake 3-star release template

A starting point and a release routine for Stake Engine slots that aim for a 3-star review. The benchmark is Paperclip's games (Loan Shark, Toon Sailor, Le Bandit, Soul Strings):

- every mode at **96.00%**
- a **25,000×** cap that the bonus modes really reach
- **3× and 6× chance boosts**
- a buy ladder of roughly 100× / 300× / 1000×
- bought bonuses that rarely pay 0×

## What is here

| Path | What it is |
|---|---|
| `math/release.py` | The mode ladder as config (`LADDER`), the criteria each mode is simulated in, and the optimizer fences: hit rate and RTP share per fence, fitted to the game's natural averages |
| `math/game_optimization.py` | Optimizer setup from the ladder; `SCALING` shapes a mode's win tail when a 3-star metric is over its limit |
| `math/game_stats.py` | Weighted stats per mode: RTP, hit rate, bonus rate, 0× rate, max win and its odds, and the 3-star metrics in both readings |
| `math/run.py` | Simulate → optimize → stats → format checks (`run.py 20000 5000` for a quick check) |
| `new_game.py` | Creates `math-sdk/games/<id>` from an SDK sample (default `0_0_cluster`) plus the files above, and a `tools/review` profile |
| `review_profile.json` | Profile template for `tools/review/run_review.py` |
| `FRONTEND_CHECKLIST.md` | The Engine review guidelines and the 3-star polish list |
| `../../.claude/skills/stake-release/` | The release routine as a Claude Code skill (`/stake-release <game>`) |
| `../../tools/release/` | `sync_frontend.py` (math → frontend RTP / max win / price check), `package.py` (refresh `_UPLOAD_TO_STAKE`) |

## Start a game

```
cd math-sdk
env\Scripts\python.exe ..\templates\stake-3star\new_game.py my_game "My Game"
env\Scripts\python.exe games\my_game\run.py 20000 5000
```

This copies the cluster sample as the game logic. Verified 2026-10-25: base, both boosts, the 100× and the 300× buy all optimize to exactly 96.00% with 25,000× reachable (the 1000× premium rung simulates very slowly on the cluster sample; delete it from `LADDER` for quick checks). `game_config.py` subclasses it and takes the bet modes from `release.py`. Replace the sample's logic with the game's own. Keep `GameConfig.conditions()` in step: it returns the reels and scatter counts each criteria uses.

An existing game can use the release layer too. Copy `release.py`, `game_optimization.py` and `game_stats.py`, then build `self.bet_modes` with `build_bet_modes`. Ghost Duels uses the same approach with its own fence numbers in `game_optimization.py`.

## Tuning the ladder

- `bonus_share` (spin modes): the share of the price paid back through the bonus. The bonus frequency follows from the game's own bonus average: 1 in average ÷ (share × cost) spins. The defaults are 0.33 for base, 0.75 for 3× and 0.88 for 6×, so the boosts bring the bonus about 7× and 16× as often in any game.
- `bonus_hr` (instead of `bonus_share`): fix the frequency directly, the bonus once in that many spins. If that would need more RTP than the mode has, `release.py` stops and says so.
- `zero_rate`: the share of bought bonuses that pay 0×; the rest of the RTP goes to the paying ones. Only set it if the bonus can pay 0× (otherwise the simulation looks for 0× bonuses forever). With `None` every bought bonus pays.
- `WINCAP_SHARE`: the RTP share of rounds at the cap. At 0.0005 the cap comes about once in 50 million base spins and about once in 100k–300k buys at 100×–650×.

## 3-star metrics, both readings

`utils/rgs_verification.py` checks each mode against these limits:

- prob5k ≤ 1%
- prob10k ≤ 0.5%
- etl40b ≤ 0.9
- etl10k ≤ 0.8
- cvar ≤ 800

prob5k and prob10k get leniency for prices of 200+. The SDK measures etl40b and etl10k in base bets. In that reading, any mode costing 3× or more that gets most of its RTP from the bonus is over the limit by construction. `game_stats.py` therefore also reports them divided by the mode's cost (`per_cost`). Report both. Stake has not said which reading the star rating uses.

What to do when a metric fails:

- **prob5k too high in a buy:** scale the freegame tail down (`SCALING` in `game_optimization.py`) or lower the price.
- **etl10k too high:** lower `WINCAP_SHARE` for that mode.

## Release

Run the skill (`/stake-release ghost_duels`) or follow its steps by hand:

1. simulate and optimize
2. stats and 3-star metrics
3. `sync_frontend.py`
4. `package.py`
5. `tools/review/run_review.py`
6. summary
