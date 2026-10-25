"""Start a new game on the Stake 3-star template: copy an SDK sample game as the game logic, add the release layer
(mode ladder, optimizer fences, weighted stats with 3-star metrics) and a tools/review profile.

    math-sdk\\env\\Scripts\\python.exe templates\\stake-3star\\new_game.py my_game "My Game"
    math-sdk\\env\\Scripts\\python.exe templates\\stake-3star\\new_game.py my_game "My Game" --from 0_0_lines

The sample's game_config.py becomes sample_config.py; the new game_config.py subclasses it and replaces the bet
modes with the ladder from release.py. conditions() says which reels and scatter counts each criteria uses: it is
written for 0_0_cluster; for another sample, fill it in from that sample's bet modes.
"""

import argparse
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GAMES = os.path.join(ROOT, "math-sdk", "games")

CLUSTER_CONDITIONS = '''        base, free = self.basegame_type, self.freegame_type
        reels = {base: {"BR0": 1}, free: {"FR0": 1}}
        if criteria == "wincap":
            reels[free] = {"FR0": 1, "WCAP": 5}  # the sample's big-multiplier reel helps rounds reach the cap
        cond = {"reel_weights": reels}
        if criteria in ("wincap", "freegame") or mode["kind"] == "buy":
            # more scatters = more free spins: the super and premium buys start with more
            cond["scatter_triggers"] = {"super": {6: 1, 7: 1}, "premium": {8: 1}}.get(name, {4: 5, 5: 1})
        return cond'''

STUB_CONDITIONS = '''        # TODO: the reel weights (and scatter_triggers, multiplier tables ...) of this criteria, as in the sample's
        # former bet modes (sample_config.py). Must contain "reel_weights".
        raise NotImplementedError("fill in GameConfig.conditions")'''

CONFIG = '''"""{title}: game configuration. The game logic comes from the SDK sample {sample} (sample_config.py); the bet
modes come from the Stake 3-star release layer (release.py)."""

from sample_config import GameConfig as SampleConfig
from release import LADDER, RTP, WINCAP, build_bet_modes


class GameConfig(SampleConfig):

    def __init__(self):
        super().__init__()
        self.game_id = "{game}"
        self.working_name = "{title}"
        self.rtp, self.wincap = RTP, WINCAP
        self.construct_paths()
        self.bet_modes = build_bet_modes(self, LADDER, self.conditions)

    def conditions(self, name, mode, criteria):
        """Conditions of one criteria of a mode (see release.py); force_wincap / force_freegame are added there."""
{conditions}
'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("game", help="game id = folder name in math-sdk/games (letters, digits, _)")
    ap.add_argument("title", help="display name")
    ap.add_argument("--from", dest="sample", default="0_0_cluster", help="SDK sample game to copy (default 0_0_cluster)")
    args = ap.parse_args()
    if not re.fullmatch(r"[a-z0-9_]+", args.game):
        sys.exit("game id: lower-case letters, digits and _ only")
    src, dst = os.path.join(GAMES, args.sample), os.path.join(GAMES, args.game)
    if os.path.exists(dst):
        sys.exit(f"{dst} exists already")

    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("library", "__pycache__", "*.xlsx"))
    os.replace(os.path.join(dst, "game_config.py"), os.path.join(dst, "sample_config.py"))
    for f in ("release.py", "game_optimization.py", "game_stats.py", "run.py"):
        shutil.copy(os.path.join(HERE, "math", f), os.path.join(dst, f))
    conditions = CLUSTER_CONDITIONS if args.sample == "0_0_cluster" else STUB_CONDITIONS
    with open(os.path.join(dst, "game_config.py"), "w", encoding="utf-8") as f:
        f.write(CONFIG.format(title=args.title, sample=args.sample, game=args.game, conditions=conditions))

    profile = os.path.join(ROOT, "tools", "review", "games", f"{args.game}.json")
    if not os.path.exists(profile):
        with open(os.path.join(HERE, "review_profile.json"), encoding="utf-8") as f:
            text = f.read().replace("GAME_ID", args.game).replace("GAME_TITLE", args.title)
        with open(profile, "w", encoding="utf-8") as f:
            f.write(text)
    print(f"created {dst}\n  quick check:  cd math-sdk; env\\Scripts\\python.exe games\\{args.game}\\run.py 20000 5000"
          f"\n  review profile: {profile} (fill in the selectors once the frontend exists)")


if __name__ == "__main__":
    main()
