# Ghost Duels: status and to-do

Last updated: 2026-10-22. All work is on the `ghost-duels` branch, which is not merged into `main` yet.

## Done

- [x] **Math** in `math-sdk/games/ghost_duels/`: all GhostDuelsV2 rules ported to the math SDK.
  - 1M simulated rounds: RTP 95.67%, a win every 3.6 spins, a bonus every 725 spins.
  - Stake's format checks pass.
  - Rune pays changed for Stake's 0.1× payout steps: 4 runes 0.35× → 0.3×, 5 runes 0.7× → 0.8×.
- [x] **Frontend** in `ghost-duels-web/`: GhostDuelsV2 as a static Stake Engine game with no build step.
  - Every outcome comes from Stake's server.
  - Covers wallet calls, resume after reload, replay links, bet levels and currency from Stake, and German/English text.
- [x] **Local test server** `tools/mock_rgs.py`: stands in for Stake's server using the real simulated rounds.
- [x] Tested in a browser: normal rounds, devil duel, 4+ VS reels side by side, bonus, resume, replay, and autoplay with low balance.
- [x] **Presentation:** intro screen with the three features (click to continue); the VS reel lands small and bursts open into a framed reel with the Skull King and smoke; spooky multiplier lettering; connected groups light up as one glowing shape instead of lines; the big Skull King stands behind the dashboard.
- [x] **Turbo and skip:** the bolt button on the dashboard plays rounds about twice as fast; a click on the board or Spin during a round skips the rest of it. Both respect Stake's `disabledTurbo` and `disabledSlamstop`.
- [x] **English first:** the page is written in English; German is the translation for `lang=de`.
- [x] **Bonus buy:** `bonus` bet mode (cost 183×, RTP 95.63% from 100k rounds) that starts Ghost Crates directly, plus the Buy Bonus plaque and confirmation dialog. Follows Stake's `disabledBuyFeature`.
  - The price must match in two places: `buy_cost` in `game_config.py` and `BUY.cost` in `game.js`. After changing the math, rerun `run.py` and set both to the bonus mean payout divided by the base RTP.

## To do

### Before uploading

- [ ] **Decide on the 25,000× max win.** The biggest of the 1M rounds paid 6,144×, so the advertised max win never happens in the published game.
  - Option A: install Rust and run the SDK optimiser so a few rounds reach 25,000×.
  - Option B: lower the advertised max win (`wincap` in `game_config.py`, `MAX_WIN_X` in `game.js`).
- [ ] **Ask Stake Engine (or check their docs):**
  - Do they accept a frontend that isn't built on their Svelte web-sdk?
  - What unit is `minimumRoundDuration`? The code assumes values under 100 are seconds and larger ones are milliseconds (`ghost-duels-web/rgs.js`).
  - What is the allowed RTP range, and are there required UI elements (rules screen, RTP display, sound toggle, turbo)?
- [ ] **Review the pull request** and merge `ghost-duels` into `main`: https://github.com/DavidCheng1/Stake/pull/new/ghost-duels

### Upload (Stake Engine dashboard)

- [ ] Run the math (see "Run it" below), then upload `math-sdk/games/ghost_duels/library/publish_files/`.
  - The five files are `books_base.jsonl.zst`, `lookUpTable_base_0.csv`, `books_bonus.jsonl.zst`, `lookUpTable_bonus_0.csv` and `index.json`.
- [ ] Upload the `ghost-duels-web/` folder as the frontend. You can leave its `README.md` out.
- [ ] Test on Stake with a real session: spin, win, bonus, reload mid-round, and a replay link.

- [ ] **Decide on bonus buys that pay nothing:** about 1 in 5 bought bonuses (22%) pays 0×, because Ghost Crates only pays when 4+ runes touch a crate. That feels harsh at 183×. Options: more lives or a guaranteed minimum in the bought bonus, then reprice.
- [ ] The SDK's 3-star volatility check flags `etl40b` for the bonus buy (1.10, limit 0.9). The check adds up wins of 40× the mode cost in base-bet units, so for a 183× mode it is not comparable; ask Stake whether it applies to buy modes.

### Nice to have

- [ ] Resume continues from the saved event instead of replaying the round from the start.
- [ ] More languages: right now German is shown for `lang=de` and English for everything else.
- [x] The local test server no longer drops image requests (its connection backlog was 5).
- [x] Background music: "Spooky Carousel" loops gaplessly. The speaker in the top-right corner opens Music and Effects volume sliders and a mute.
- [x] First sound effects, synthesized placeholders: button clicks, spin whoosh, one knock per landing reel (heavy for VS reels and crates), free-spin tease riser.
- [ ] Remaining sound effects: wins, tumbles, duels, bonus trigger and lives, and lowering the music during big wins. Decide between synthesized sounds and a licensed sample pack.

### Whenever the math changes

- [ ] Rerun `run.py` and update `self.rtp` in `game_config.py` to the RTP it prints.
- [ ] Update the display values in `ghost-duels-web/game.js`: the pays in `SYM` and `RTP_TEXT`.

## Working from another computer

Everything is in the repo **except** the generated math files, which are too big for GitHub. You regenerate them with one command, and the result is identical every time.

1. Install Git and Python 3.12+ (Node is not needed for Ghost Duels).
2. Get the branch:
   ```powershell
   git clone https://github.com/DavidCheng1/Stake.git
   cd Stake
   git switch ghost-duels
   ```
3. Set up the math SDK:
   ```powershell
   cd math-sdk
   python -m venv env
   Get-Content requirements.txt | Where-Object { $_ -notmatch '^-e git' } | Set-Content req-local.txt
   env\Scripts\python.exe -m pip install -r req-local.txt
   env\Scripts\python.exe -m pip install -e .
   Remove-Item req-local.txt
   ```
4. Run it:
   ```powershell
   env\Scripts\python.exe games\ghost_duels\run.py   # about 7 minutes (base + bonus buy), writes library/publish_files
   cd ..
   math-sdk\env\Scripts\python.exe tools\mock_rgs.py   # then open the printed URL
   ```
   To jump straight to a feature, append `/force/bonus`, `/force/tier3`, `/force/wildonly`, `/force/duel` or `/force/big` to `rgs_url` in the URL.

On a new computer, Git asks you to sign in to GitHub the first time you push, and needs your name and email for commits:
```powershell
git config --global user.name "Djabs112"
git config --global user.email "danieljabs0990@gmail.com"
```
