"""Night Drive configuration: every tunable number of the game lives here.

5 x 5 board, left-to-right ways (3125). The getaway car (W) is wild on reels 2-5 and carries x2, x3 or x5; cars on a
reel add their x to the reel's count, and the counts multiply across reels, so cars in one win multiply. Every win
pays at least MIN_WIN x the bet. Drive-By: now and then a car speeds along a row and leaves 2-4 cars behind.
3-5 sunsets (S, at most one per reel) start The Chase: 10/12/15 free spins in which every car that lands stays and
drives one reel to the left before each spin; a car that leaves the board gives +1 spin (Nitro).

This is the prototype's math (night-drive-web/game.js) ported one to one; the optimizer (release.py fences) then
weights the simulated rounds so that every mode returns exactly 96.00%.
"""

from src.config.config import Config
from release import LADDER, RTP, WINCAP, build_bet_modes


class GameConfig(Config):
    """Singleton Night Drive configuration."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        super().__init__()
        self.game_id = "night_drive"
        self.provider_number = 0
        self.provider_name = "night_drive"
        self.game_name = "night_drive"
        self.working_name = "Night Drive"
        self.rtp, self.wincap = RTP, WINCAP
        self.win_type = "ways"
        self.construct_paths()

        self.num_reels = 5
        self.num_rows = [5] * self.num_reels
        self.include_padding = False

        # Symbols (book names): H1 driver, H2 captain, H3 club owner, H4 DJ, M1 boat, M2 cassette, M3 flamingo,
        # M4 briefcase, L1 shades, L2 skate, L3 palm, L4 heart; W the getaway car (wild), S the sunset (scatter).
        self.symbol_weights = {"H1": 3, "H2": 3, "H3": 3, "H4": 3, "M1": 5, "M2": 5, "M3": 5, "M4": 5,
                               "L1": 9, "L2": 9, "L3": 9, "L4": 9}
        self.wild_weight = 1.6        # per cell on reels 2-5 in the base game
        self.wild_weight_fs = 2.2     # per cell on reels 2-5 in The Chase
        self.scatter_weight = 1.27    # per cell in the base game (at most one per reel)
        self.scatter_weight_boost = 1.97  # Chance x3
        self.mults = [(2, 6), (3, 3), (5, 1)]          # a car's x
        self.mults_super = [(3, 5), (4, 3), (5, 2)]    # Super Chase: every car x3 or more
        self.driveby_chance = 0.03                     # base game spins with a Drive-By
        self.driveby_cars = [(2, 1), (3, 1), (4, 1)]   # how many cars it leaves (on distinct reels 2-5)
        self.min_win = 0.1

        # pay per way (x bet) for 3, 4, 5 reels: the prototype's PAY x K (K = 0.038)
        k = 0.038
        base_pays = {"H1": [1, 2.5, 6], "H2": [.8, 2, 5], "H3": [.6, 1.5, 4], "H4": [.5, 1.2, 3],
                     "M1": [.3, .8, 2], "M2": [.3, .7, 1.8], "M3": [.25, .6, 1.5], "M4": [.25, .6, 1.4],
                     "L1": [.12, .3, .7], "L2": [.12, .3, .7], "L3": [.1, .25, .6], "L4": [.1, .25, .6]}
        self.way_pays = {s: [round(p * k, 6) for p in v] for s, v in base_pays.items()}
        self.paytable = {(n, s): self.way_pays[s][n - 3] for s in self.way_pays for n in (3, 4, 5)}
        self.special_symbols = {"wild": ["W"], "scatter": ["S"], "multiplier": ["W"]}

        self.fs_for = {3: 10, 4: 12, 5: 15}
        self.buy_spins = 10
        self.freespin_triggers = {self.basegame_type: dict(self.fs_for), self.freegame_type: {}}
        self.anticipation_triggers = {self.basegame_type: 2, self.freegame_type: 0}
        # sunsets of a natural trigger (from simulate() in the prototype: 3 by far the most often)
        self.natural_scatters = [(3, 900), (4, 90), (5, 6)]

        # wincap rounds: a Chase with many big cars, repeated until it reaches the cap
        self.wincap_bias = {"wild_weight_fs": 12.0, "mults": [(5, 1)], "mults_super": [(5, 1)]}

        self.bet_modes = build_bet_modes(self, LADDER, self.conditions)

    def conditions(self, name, mode, criteria):
        """The conditions of one criteria of a mode (release.py adds force_wincap / force_freegame)."""
        cond = {"reel_weights": {self.basegame_type: {}, self.freegame_type: {}},
                "boost": name == "boost", "super": name == "super"}
        if mode["kind"] == "buy":
            cond["scatter_triggers"] = {3: 1}  # a bought Chase: 10 free spins
        elif criteria in ("wincap", "freegame"):
            cond["scatter_triggers"] = dict(self.natural_scatters)
        if criteria == "wincap":
            cond["bias"] = self.wincap_bias
        return cond
