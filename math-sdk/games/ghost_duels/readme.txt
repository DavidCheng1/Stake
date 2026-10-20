Ghost Duels (Geisterduell) - 7x7 cluster tumble game, ported from GhostDuelsV2.html.

Rules
- Every cell is drawn independently by symbol weight (no reelstrips). At most one FS per reel.
- Clusters of 4+ touching symbols pay by size (4, 5, 6, 7, 8, 9+). Winners explode and the reel refills from the top.
- 9.8% of spins land 1-6 VS reels: whole-column wilds. A cluster touching a VS reel starts a duel on it.
  Duel tiers: x2-x10 (ghosts), x20-x100 (pirate, 8%), x150-x1000 (devil, 0.2%).
  Multipliers of all VS reels in a cluster add up. 4+ VS reels side by side pay as a 4-cluster of the
  strongest duel winner. Used VS reels are removed by the tumble.
- 3+ FS on the final board start Geisterkisten: FS cells become crates (x2/x3), 3 lives, each spin runes or
  crates may land in empty cells (landing anything refills the lives). At the end, groups of 4+ touching runes
  with at least one crate pay (sum of rune values) x every crate multiplier in the group.
- Max win 25,000x bet.

Events (amounts are bet multiplier x100): reveal, vsDuel, winInfo, updateTumbleWin, tumbleBoard, wincap,
bonusTrigger, bonusStart, bonusSpin, bonusEnd, setTotalWin, finalWin.

Run (from math-sdk, ~2 minutes): env\Scripts\python.exe games\ghost_duels\run.py
Quick check: env\Scripts\python.exe games\ghost_duels\run.py 10000
Output for upload: games/ghost_duels/library/publish_files (books, lookup table, index.json).
Results are deterministic (seed = simulation number); re-running gives identical files.

1M spins: RTP 95.67% (base 64.36%, bonus 31.32%), hit rate 1 in 3.63, bonus 1 in 725, max seen 6,144x.
No optimization is run, so lookup weights are all 1 and the published RTP is the simulated RTP.
