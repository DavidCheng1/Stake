# Ghost Duels frontend

Static Stake Engine frontend for Ghost Duels (Geisterduell), built from `GhostDuelsV2.html`. No build step: this folder is uploaded as-is, with `index.html` at its root.

| File | Role |
| --- | --- |
| `index.html`, `style.css` | Page and styles |
| `game.js` | Animations and round playback. Every outcome comes from the RGS book events |
| `rgs.js` | Stake Engine RGS client: URL session, wallet calls, replay, money formatting |
| `loader.js` | Studio intro (Maestro Studios logo), which is also the loading screen: a glint with a small synthesized sound, a thin line showing real progress, then it fades into the game as the music fades in |
| `assets/`, `fonts/` | Images and bundled fonts (Creepster, Barlow Condensed, SIL OFL), so nothing loads from third parties |

## How a round works

1. `boot()` calls `/wallet/authenticate`. That returns the balance, currency, bet levels and jurisdiction flags, plus any round that is still active.
2. Spin calls `/wallet/play`, which debits the bet and returns the round's book events (`round.state`).
3. `playRound()` plays the events in order: `reveal`, `vsDuel`, `winInfo`, `updateTumbleWin`, `tumbleBoard`, `wincap`, `bonusTrigger`, `bonusStart`, `bonusSpin`, `bonusEnd`, `setTotalWin`, `finalWin`. Progress is saved with `/bet/event`.
4. If the round won (`round.active`), `/wallet/end-round` credits the payout.

The events are produced by `math-sdk/games/ghost_duels`; see its `readme.txt` for the rules. The only random draws left in the frontend are decorative: the idle board, the tease blur and the refill after a bonus.

- **Resume:** a round that was interrupted is played again from the start after reload, then closed.
- **Replay:** `replay=true&game=…&version=…&mode=…&event=…&amount=…` loads a past round and plays it without wallet calls.
- **Languages:** German for `lang=de`, English for every other language.
- **Jurisdiction:** `disabledAutoplay`, `disabledSpacebar` and `minimumRoundDuration` are respected.

## Test locally

The mock RGS serves this folder and answers the wallet endpoints from the real math books. Generate the math first (`math-sdk`, see the root README).

```powershell
math-sdk\env\Scripts\python.exe tools\mock_rgs.py
```

Open the printed URL. To force a feature, use `rgs_url=http://127.0.0.1:8080/force/<kind>` with one of `bonus`, `duel`, `tier2`, `tier3`, `wildonly`, `big`, `win` or `lose`.

## Keep in sync with the math

The paytable in `SYM` and `RTP_TEXT` in `game.js` are display values only. Update them whenever `game_config.py` or the simulation results change.
