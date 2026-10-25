# Frontend checklist: reviewer quality

Two parts. **Must pass** lists the Stake Engine review guidelines. `tools/review/run_review.py` checks every one marked *auto* and prints PASS/FAIL per ID; the full wording is in [engine-review-prompt.md](../../engine-review-prompt.md). **3-star polish** is what separates a game reviewers rate highly from one that only passes. It comes from the Paperclip benchmark (Loan Shark, Toon Sailor, Le Bandit, Soul Strings) and from what went wrong in Ghost Duels.

## Must pass

| ID | Check | How |
|---|---|---|
| 181, 183, 274 | Authenticate on launch, play on bet, clear error with a bad `rgs_url` | auto |
| 242, 242b, 187 | Bet levels only from authenticate; resume restores `round.amount` | auto |
| 221, 222 | No end-round for 0×; no play request without balance (mode's real cost) | auto |
| 219, 273 | USD EUR CAD MXN JPY (0 decimals); sub-cent wins shown exactly | auto |
| 228, 104, 31 | Space bets; autoplay needs a confirmation; modes over 2× need a confirmation or a switch that shows the real price | auto |
| 25, 27, 24, 26, 29, 235, 185 | Rules: RTP and max win per mode; every mode and its cost; symbols, wins, bonus, every control; disclaimer | auto (24/26/29 via `rulesMustContain`) |
| 78, 77, 225, 188 | Social mode: SC/GC, no `$`, no restricted words anywhere (also "Paytable"), including the replay | auto |
| 239, 240 | English, and unknown `lang` falls back to English | auto |
| 171–174, 243 | Replay: no wallet calls, plays, watch again, bet + multiplier + real cost, works at 400×225 | auto |
| 193, 195, 194, 227, 223 | 1024×576, 400×225, 800×450, 425×812 by touch; no scrolling; no double-tap zoom | auto + screenshots |
| 275, 107, 213 | No Stake Engine loader; one mute for all audio; title without restricted terms | auto |
| 217, 253 | No offensive content and **no child-like characters** (cute chibi ghosts count); distinct from existing titles | human |
| — | No external hosts (fonts, CDNs); no console errors | auto |

## 3-star polish

**Math the player can feel**
- [ ] Every mode at 96.00%, the same cap (25,000×) in every mode, and the rules table shows both per mode (`tools/release/sync_frontend.py`).
- [ ] Ladder: base, 3× and 6× chance boosts as a switch that shows the real price per spin, buys around 100× / 300× / 1000×.
- [ ] Bought bonuses rarely pay 0× (about 10% or less). Players read a dead 300× buy as a broken game.
- [ ] The bonus frequency in the base game feels reachable (1 in 300–550 spins). The boosts say how much more often ("about 7× as often").

**Feel**
- [ ] Anticipation: with one trigger symbol short, the next reels slow down and the stage darkens, with fog, glow and a rising sound. The slowed strip must land on the *real* result symbols, with no swap at the end.
- [ ] Win tiers (big / mega / epic) with count-ups that can be skipped. Count-ups never show negative or long decimals, also in turbo.
- [ ] Turbo really halves the time, and a tap or Space skips animations without changing the result.
- [ ] A dedicated sound for every event: spin, land, small and big win, trigger symbol landing (louder for the 2nd and 3rd), the tease, the bonus intro and the end tally. Music ducks under big moments.
- [ ] Bonus: an intro card, a clear counter of spins and lives, collected values readable at phone size, and an end screen with the total.
- [ ] Symbols readable at 400×225. High symbols differ by shape and not only by colour.

**Presentation**
- [ ] A 16:9 cover and a 3:4 tile from the game's own art. The logo is readable at thumbnail size.
- [ ] Intro screen with 2–3 cards that explain the feature, then a tap to start (this also unlocks audio).
- [ ] Phone portrait layout designed on purpose, not a squeezed desktop layout.
- [ ] Fonts bundled, themed fonts for numbers in the bonus.

**Before upload**
- [ ] `python tools/review/run_review.py` with no FAIL; look at every screenshot in `.review-out/<game>/`.
- [ ] Play every mode once against the mock (`tools/mock_rgs.py`, `/force/<kind>` for features).
- [ ] `_UPLOAD_TO_STAKE` refreshed (`tools/release/package.py`). Math versions cost about 0.5 GB of LFS each, so only package versions you upload.
