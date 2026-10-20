# Ghost Duels: status and to-do

Last updated: 2026-10-20. All work is on the `ghost-duels` branch, which is not merged into `main` yet.

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
  - The three files are `books_base.jsonl.zst`, `lookUpTable_base_0.csv` and `index.json`.
- [ ] Upload the `ghost-duels-web/` folder as the frontend. You can leave its `README.md` out.
- [ ] Test on Stake with a real session: spin, win, bonus, reload mid-round, and a replay link.

### Nice to have

- [ ] Resume continues from the saved event instead of replaying the round from the start.
- [ ] Bonus buy mode: a new bet mode in `game_config.py` plus a buy button in the frontend.
- [ ] More languages: right now German is shown for `lang=de` and English for everything else.
- [ ] Sound: the prototype has none.

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
   env\Scripts\python.exe games\ghost_duels\run.py   # about 2 minutes, writes library/publish_files
   cd ..
   math-sdk\env\Scripts\python.exe tools\mock_rgs.py   # then open the printed URL
   ```
   To jump straight to a feature, append `/force/bonus`, `/force/tier3`, `/force/wildonly`, `/force/duel` or `/force/big` to `rgs_url` in the URL.

On a new computer, Git asks you to sign in to GitHub the first time you push, and needs your name and email for commits:
```powershell
git config --global user.name "Djabs112"
git config --global user.email "danieljabs0990@gmail.com"
```
