"""Ghost Duels configuration: every tunable number of the game lives here."""

from src.config.config import Config
from src.config.distributions import Distribution
from src.config.betmode import BetMode


class GameConfig(Config):
    """Singleton Ghost Duels configuration class."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        super().__init__()
        self.game_id = "ghost_duels"
        self.provider_number = 0
        self.provider_name = "ghost_duels"
        self.game_name = "ghost_duels"
        self.working_name = "Ghost Duels"
        self.wincap = 25000.0
        self.win_type = "cluster"
        self.construct_paths()

        # Game Dimensions
        self.num_reels = 7
        self.num_rows = [7] * self.num_reels
        self.include_padding = False

        # Symbols: draw weight per cell and pay (x bet) for clusters of 4, 5, 6, 7, 8, 9+
        self.symbol_weights = {
            "devil": 2.5,
            "pirate": 3,
            "witch": 3.5,
            "blue": 4,
            "book": 5,
            "ring": 5,
            "key": 6,
            "lantern": 6,
            "potion": 6,
            "rune_green": 10,
            "rune_blue": 10,
            "rune_purple": 10,
            "rune_fire": 10,
            "rune_pink": 10,
            "fs": 0.516,
        }
        self.symbol_pays = {
            "devil": [7, 12, 35, 80, 160, 350],
            "pirate": [5, 10, 25, 70, 120, 250],
            "witch": [4, 8, 20, 50, 100, 200],
            "blue": [3.5, 7, 16, 40, 80, 160],
            "book": [2, 4, 8, 16, 35, 70],
            "ring": [2, 4, 8, 16, 35, 70],
            "key": [1.2, 2.5, 5, 10, 20, 40],
            "lantern": [1.2, 2.5, 5, 10, 20, 40],
            "potion": [1, 2, 4, 8, 16, 35],
            "rune_green": [0.3, 0.8, 1.2, 2.5, 5, 10],
            "rune_blue": [0.3, 0.8, 1.2, 2.5, 5, 10],
            "rune_purple": [0.3, 0.8, 1.2, 2.5, 5, 10],
            "rune_fire": [0.3, 0.8, 1.2, 2.5, 5, 10],
            "rune_pink": [0.3, 0.8, 1.2, 2.5, 5, 10],
        }
        self.min_cluster = 4
        # Duel characters, strongest first (a wild-only cluster pays as the strongest duel winner)
        self.characters = ["devil", "pirate", "witch", "blue"]
        size_ranges = [(4, 4), (5, 5), (6, 6), (7, 7), (8, 8), (9, self.num_reels * self.num_rows[0])]
        pay_group = {}
        for sym, pays in self.symbol_pays.items():
            for size_range, pay in zip(size_ranges, pays):
                pay_group[(size_range, sym)] = pay
        self.paytable = self.convert_range_table(pay_group)
        self.special_symbols = {"wild": ["vs"], "scatter": ["fs"]}

        # VS wild reels: chance per spin, then how many reels land (mostly 1)
        self.vs_chance = 0.098
        self.vs_count = [(1, 80), (2, 15.5), (3, 3.2), (4, 0.9), (5, 0.3), (6, 0.1)]

        # Duel inside a VS reel: round 1 ghosts, round 2 pirate challenges, round 3 the devil
        self.duel_p2 = 0.08
        self.duel_p3 = 0.002
        self.duel_t1 = [(2, 30), (3, 25), (4, 18), (5, 12), (6, 7), (8, 5), (10, 3)]
        self.duel_t2 = [(20, 30), (25, 22), (30, 18), (40, 13), (50, 9), (75, 5), (100, 3)]
        self.duel_t3 = [(150, 35), (200, 25), (250, 15), (300, 10), (500, 8), (750, 5), (1000, 2)]
        # Cosmetic only: a challenger shows up and loses (does not change the outcome odds)
        self.duel_fake2 = 0.04
        self.duel_fake3 = 0.25

        # Geisterkisten bonus: 3+ FS symbols, 3 lives, runes and crates land in empty cells
        self.bonus_min_fs = 3
        self.rune_ids = ["rune_green", "rune_blue", "rune_purple", "rune_fire", "rune_pink"]
        self.rune_values = [(1, 62), (2, 21), (3, 8), (4, 4), (5, 2.5), (6, 1.2), (8, 0.8), (10, 0.5)]
        self.crate_mults = [(2, 92), (3, 8)]
        self.start_mults = {
            3: [(2, 95), (3, 5)],
            4: [(2, 95), (3, 5)],
            5: [(2, 92), (3, 8)],
            6: [(2, 90), (3, 10)],
            7: [(2, 88), (3, 12)],
        }
        self.p_crate = 0.0004
        self.crate_near = 0.25
        self.min_link = 4
        self.bonus_lives = 3

        self.freespin_triggers = {
            self.basegame_type: {n: 1 for n in range(self.bonus_min_fs, self.num_reels + 1)},
            self.freegame_type: {},
        }
        self.anticipation_triggers = {self.basegame_type: self.bonus_min_fs - 1, self.freegame_type: 0}

        # ---------------- bet modes ----------------
        # Every mode is optimized to exactly 96.00% (math-sdk optimization_program, targets in game_optimization.py).
        # Each mode's simulations are split into criteria; the optimizer reweights them per criteria:
        #   wincap    rounds generated with a bias (see WINCAP_*) until they reach the 25,000x cap; tiny weight
        #   0         rounds that pay nothing
        #   freegame  rounds with the Ghost Crates bonus (FS planted on distinct reels, by the natural FS counts)
        #   basegame  every other round, drawn naturally
        # Buy modes start the bonus directly (freegame) or force a VS reel (vsspin). The boosts are bet variants:
        # same game, FS land more often (fs_weight) and the optimizer sets the bonus frequency.
        # Prices are whole bets so every buy costs whole cents at any bet level (5.27 x 0.10 = 0.527 is not a bet).
        self.rtp = 0.96
        natural_fs = [(3, 961), (4, 38.7), (5, 0.9)]  # FS counts of a natural trigger
        self.bonus_wincap_bias = {  # big bonuses: every crate x3, crates and runes land often, high rune values
            "start_mults": {n: [(3, 1)] for n in range(3, 8)}, "crate_mults": [(3, 1)], "p_crate": 0.02, "crate_near": 1.0,
            "p_rune_base": 0.12, "rune_values": [(6, 1), (8, 1), (10, 1)]}
        self.duel_wincap_bias = {  # devil duels on two or three VS reels, many devils on the board
            "duel_p2": 0.0, "duel_p3": 1.0, "vs_count": [(2, 1), (3, 1)],
            "symbol_weights": {**self.symbol_weights, "devil": 40}}
        self.buy_modes = {
            # bet variants: a spin costs 3x / 6x, FS land more often, the bonus comes about 7x / 15x as often
            "boost": {"cost": 3.0, "fs_weight": 1.03, "kind": "boost"},
            "boost6": {"cost": 6.0, "fs_weight": 1.25, "kind": "boost"},
            # bonus buys: Ghost Crates (3-5 FS by the natural odds), Big (exactly 4 FS), Mega (exactly 5 FS)
            "bonus": {"cost": 182.0, "buy_fs": natural_fs, "kind": "buy"},
            "bonus4": {"cost": 324.0, "buy_fs": [(4, 1)], "kind": "buy"},
            "bonus5": {"cost": 650.0, "buy_fs": [(5, 1)], "kind": "buy"},
            # VS Spin: a spin with at least one VS reel, weighted towards a single reel
            "vsspin": {"cost": 5.0, "force_vs": True, "vs_count": [(1, 86.1), (2, 9.5), (3, 3.2), (4, 0.9), (5, 0.3), (6, 0.1)], "kind": "vsspin"},
        }

        def dist(criteria, quota, win=None, **cond):
            return Distribution(criteria=criteria, quota=quota, win_criteria=win,
                                conditions={"reel_weights": {self.basegame_type: {}, self.freegame_type: {}},
                                            "force_wincap": win == self.wincap, "force_freegame": False, **cond})

        def distributions(kind, m):
            common = {k: m[k] for k in ("fs_weight", "force_vs", "vs_count") if k in m}
            if kind == "buy":
                buy = {"buy_fs": m["buy_fs"], "force_freegame": True, **common}
                return [dist("wincap", 0.001, self.wincap, bias=self.bonus_wincap_bias, **buy),
                        dist("0", 0.1, 0.0, **buy),
                        dist("freegame", 0.899, **buy)]
            if kind == "vsspin":
                return [dist("wincap", 0.001, self.wincap, bias=self.duel_wincap_bias, **common),
                        dist("0", 0.3, 0.0, **common),
                        dist("freegame", 0.02, buy_fs=natural_fs, force_freegame=True, **common),
                        dist("basegame", 0.679, **common)]
            return [dist("wincap", 0.001, self.wincap, bias=self.bonus_wincap_bias, buy_fs=natural_fs, force_freegame=True, **common),
                    dist("0", 0.25, 0.0, **common),
                    dist("freegame", 0.1, buy_fs=natural_fs, force_freegame=True, **common),
                    dist("basegame", 0.649, **common)]

        def mode(name, m):
            return BetMode(
                name=name,
                cost=m["cost"],
                rtp=self.rtp,
                max_win=self.wincap,
                auto_close_disabled=False,
                is_feature=m["kind"] in ("base", "boost"),
                is_buybonus=m["kind"] in ("buy", "vsspin"),  # the boosts are bet variants, not bonus buys
                distributions=distributions(m["kind"], m),
            )

        self.bet_modes = [mode("base", {"cost": 1.0, "kind": "base"})] + [mode(name, m) for name, m in self.buy_modes.items()]

    p_rune_base = 0.028

    def p_rune(self, num_fs: int) -> float:
        """Chance per empty cell and bonus spin that a rune lands."""
        return self.p_rune_base + 0.0005 * (num_fs - 3)
