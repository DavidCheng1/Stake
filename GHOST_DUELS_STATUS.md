# Ghost Duels: status and to-do

Last updated: 2026-10-23. All work is on the `ghost-duels` branch, which is not merged into `main` yet.

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
- [x] **Turbo fixes:** win and rune counters no longer go negative, jump back and forth or show long decimals in turbo.
- [x] **Turbo and skip:** the bolt button on the dashboard plays rounds about twice as fast; a click on the board or Spin during a round skips the rest of it. Both respect Stake's `disabledTurbo` and `disabledSlamstop`.
- [x] **English first:** the page is written in English; German is the translation for `lang=de`.
- [x] **Bonus buy:** `bonus` bet mode (cost 182×, RTP 96.09% from 100k rounds) that starts Ghost Crates directly, plus the Buy Bonus plaque and confirmation dialog. Follows Stake's `disabledBuyFeature`.
  - The price must match in two places: `buy_modes` in `game_config.py` and `BUYS` in `game.js`. After changing the math, rerun `run.py`, set the price to the mode's mean payout divided by 0.96 and its `rtp` to mean payout / price, then run `run.py --configs-only`.
- [x] **Spooky sounds** (synthesized, through the sound panel and mute): haunted bells for wins, a ghostly poof for tumbles, bone ticks while the win counts up, duel slam, metallic clashes and wails for knockouts, the pirate's horn and the devil's growl, organ and bell toll for the free-spin trigger, rune chimes, heartbeat for lost lives, big-win fanfare; a crypt reverb on all of it, and the music dips under big moments.
- [x] **Bonus menu:** four buyable modes, priced from 100k simulated rounds each so every RTP is within 0.1% of 96%:
  | Mode | Price | RTP | Max win | Pays 0× |
  | --- | --- | --- | --- | --- |
  | Ghost Crates (3–5 FS) | 182× | 96.09% | 25,000× | 21.6% |
  | Big Ghost Crates (exactly 4 FS) | 324× | 96.08% | 25,000× | 19.9% |
  | Mega Ghost Crates (exactly 5 FS) | 650× | 95.93% | 25,000× | 18.9% |
  | VS Spin (at least one VS reel) | 5× | 96.30% | 4,064× | 49.7% |
- [x] **FS Boost** (bet mode `boost`, 1M rounds): a switch above Buy Bonus. While it is on, every spin costs 3× the bet and FS symbols land more often (`fs_weight` 1.03 instead of 0.516), so the bonus comes every 109 spins instead of every 725 (about 6.7×). RTP 95.63%, max win 7,060×. It is a bet variant, not a bonus buy (`is_buybonus` false), off on every visit, and the switch shows the real price per spin [31].
- [x] **Spookier bonus:** rune values use the Creepster lettering with a glow in the rune's colour; crates are haunted coffin chests (dark planks with glowing seams, iron bands and brackets, the multiplier on a glowing iron tag, ghost smoke).
  - The price must match in `game_config.py` (`buy_modes`) and `game.js` (`BUYS`): price = mean payout of the mode / 0.96 in whole bets, so every buy costs whole cents at any bet level; each mode also declares `rtp` = mean payout / price. VS Spin reaches ~96% at 5× with its own VS reel counts (fewer 2-reel spins than the base game). Stake allows at most 96.7% per mode.
- [x] **Approval checklist fixes** (Engine's review prompt is `engine-review-prompt.md` in the repo root; guideline IDs in brackets):
  - The page is only the game, scaled to the window; nothing scrolls [227, 193, 195].
  - Phones held upright get their own layout: the reels on top, a touch panel with every control below [194].
  - Info opens in-game rules: how to win, full paytable, the bonus, the bonus buy and its cost, RTP and max win per mode, every control and the general disclaimer [24–29, 235, 185].
  - Social mode (`social=true`) uses Stake.us wording everywhere, including a PLAY patch over the BET label painted in the art; SC and GC show after the amount [77, 78, 188, 225].
  - Replay: start panel with mode, bet and real cost, then Replay again [171–174].
  - A launch without a working RGS shows an error dialog [274]; sub-cent amounts keep their digits [273]; no double-tap zoom [223].
  - The background art is upscaled 4× (Real-ESRGAN) so it stays sharp on large and high-DPI screens.

## To do

### Before uploading

- [ ] **Decide on the 25,000× max win.** The rules now state the real maximum per mode from the lookup tables (base game 6,144×, bonus buy 25,000×), which is what reviewers compare [25]. The cap stays 25,000×.
  - Option A: install Rust and run the SDK optimiser so a few base rounds reach 25,000×.
  - Option B: keep it as it is, or lower the cap (`wincap` in `game_config.py`, `MAX_WIN_X` in `game.js`).
  - Whatever changes, update `MODE_INFO` in `game.js` (RTP and max win per mode) after rerunning `run.py`.
- [x] **16:9 cover art:** `media/cover-16x9.png` (1920×1080), rendered from `media/cover-16x9.html`. The 3:4 game tile exists (kept outside the repo).
- [ ] **Ask Stake Engine (or check their docs):**
  - Do they accept a frontend that isn't built on their Svelte web-sdk?
  - What unit is `minimumRoundDuration`? The code assumes values under 100 are seconds and larger ones are milliseconds (`ghost-duels-web/rgs.js`).
  - Does the `etl40b` volatility warning apply to buy modes (see below)?
- [ ] **Review the pull request** and merge `ghost-duels` into `main`: https://github.com/DavidCheng1/Stake/pull/new/ghost-duels

### Upload (Stake Engine dashboard)

- [ ] Upload the math and front versions. Build them with the release script (see `release/` locally) or upload directly:
  - Math: `math-sdk/games/ghost_duels/library/publish_files/` after running the math.
  - 11 files: `index.json` plus a books file and a lookup table for each of the five modes (base, bonus, bonus4, bonus5, vsspin).
  - Front: the `ghost-duels-web/` folder without its `README.md`.
- [ ] Test on Stake with a real session: spin, win, bonus, bonus buy, reload mid-round, a replay link, and social mode.
- [x] **Engine review run (2026-10-23)** against the mock RGS with request interception, all four viewports and every test currency.
  Everything automatable passes: 181, 183, 274, 242, 187, 221, 222, 104, 31, 228, 227, 193, 194, 195, 219 (USD, EUR, CAD, MXN, JPY), 273,
  77, 78, 188, 225, 239, 240, 24–29, 235, 185, 171–174, 243, 107 (code), 213, 275. Fixed during the run: 242 (min/max/step), 187 (resumed stake),
  171 (Spin after a replay), 219 (long CA$/MX$ amounts clipped).
- [ ] Still for a person: 217 (content) and 253 (distinct from existing titles), listening to sound and mute, and a final look on a real phone.
- [ ] Before submitting, have a coding agent run `engine-review-prompt.md` again and fix what it reports.

- [ ] **Decide on bonus buys that pay nothing:** about 1 in 5 bought bonuses pays 0× (19–22%, even with 4 or 5 crates), because Ghost Crates only pays when 4+ runes touch a crate. That feels harsh at these prices. Options: more lives or a guaranteed minimum in bought bonuses, then reprice.
- [ ] **3-star rating (ask Stake).** The SDK's 3-star limits per mode are prob5k ≤ 1%, prob10k ≤ 0.5%, etl40b ≤ 0.9, etl10k ≤ 0.8, CVaR ≤ 800 and RTP ≤ 96.7% (`utils/rgs_verification.py`). The base game passes all of them. etl40b and etl10k add up big wins in base-bet units without dividing by the mode's price: as written, every other mode fails them (boost etl40b 2.11, VS Spin 1.18, Ghost Crates 1.11, Big 2.00 / 3.53, Mega etl10k 23.8); divided by the price, all six modes pass (largest: boost 0.70). Community write-ups disagree on which reading Stake uses, and one says new games are judged against 2-star limits (etl 0.8, CVaR 700), which the price-divided values also meet. Stake's own math requirements page could not be read; confirm with Stake before submitting.

### Nice to have

- [ ] Resume continues from the saved event instead of replaying the round from the start.
- [ ] More languages: right now German is shown for `lang=de` and English for everything else.
- [x] The local test server no longer drops image requests (its connection backlog was 5).
- [x] Background music: "Spooky Carousel" loops gaplessly. The speaker in the top-right corner opens Music and Effects volume sliders and a mute.
- [x] First sound effects, synthesized placeholders: button clicks, spin whoosh, one knock per landing reel (heavy for VS reels and crates), free-spin tease riser.
- [x] Remaining sound effects: wins, tumbles, duels, bonus trigger and lives, rune crumble and collect, and lowering the music during big wins (all synthesized).
- [x] **Designed sound effects:** 20 layered sounds (haunted bells, ghost wails, choir, organ, coffin knocks, thunder, chains, heartbeat) built by `tools/sound_design.py` into `ghost-duels-web/assets/sfx/` (708 KB). The game plays them once loaded and falls back to the synthesized versions. Edit a recipe and rerun the script to change a sound.

### Whenever the math changes

- [ ] Rerun `run.py` and update `self.rtp` in `game_config.py` to the RTP it prints.
- [ ] Update the display values in `ghost-duels-web/game.js`: the pays in `SYM`, `RTP_TEXT`, `MODE_INFO` (RTP and max win per mode) and `BUY.cost`.

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
   env\Scripts\python.exe games\ghost_duels\run.py   # about 20 minutes (base + 4 buy modes), writes library/publish_files
   cd ..
   math-sdk\env\Scripts\python.exe tools\mock_rgs.py   # then open the printed URL
   ```
   To jump straight to a feature, append `/force/bonus`, `/force/tier3`, `/force/wildonly`, `/force/duel` or `/force/big` to `rgs_url` in the URL.

On a new computer, Git asks you to sign in to GitHub the first time you push, and needs your name and email for commits:
```powershell
git config --global user.name "Djabs112"
git config --global user.email "danieljabs0990@gmail.com"
```
