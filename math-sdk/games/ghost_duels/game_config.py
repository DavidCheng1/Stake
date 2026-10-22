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
        self.rtp = 0.9567
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

        # Buyable modes. Each round starts on a normal board.
        #   bonus   Ghost Crates: 3-5 FS planted on distinct reels, by the natural odds of 3, 4 or 5 FS given a trigger
        #   bonus4  Big Ghost Crates: exactly 4 FS        bonus5  Mega Ghost Crates: exactly 5 FS
        #   vsspin  VS Spin: a normal spin with at least one VS reel (1-6, by the natural VS reel counts)
        # Costs (in bets) are set from the simulated books so every mode's RTP matches the base game:
        # cost = mean payout of the mode / base RTP, rounded to a whole bet (to 0.1 below 20 bets).
        # Rerun run.py after any math change, then set the costs here and in BUYS in ghost-duels-web/game.js.
        self.buy_modes = {
            "bonus": {"cost": 183.0, "buy_fs": [(3, 961), (4, 38.7), (5, 0.9)]},
            "bonus4": {"cost": 325.0, "buy_fs": [(4, 1)]},
            "bonus5": {"cost": 652.0, "buy_fs": [(5, 1)]},
            "vsspin": {"cost": 5.3, "force_vs": True},
        }

        # No reelstrips: every cell is drawn independently by symbol weight.
        # A single unforced distribution per mode keeps lookup weights at 1, so the simulated RTP is the real RTP.
        def mode(name, cost, conditions):
            return BetMode(
                name=name,
                cost=cost,
                rtp=self.rtp,
                max_win=self.wincap,
                auto_close_disabled=False,
                is_feature=name == "base",
                is_buybonus=name != "base",
                distributions=[
                    Distribution(
                        criteria="natural" if name == "base" else name,
                        quota=1.0,
                        conditions={"reel_weights": {self.basegame_type: {}, self.freegame_type: {}}, "force_wincap": False, **conditions},
                    ),
                ],
            )

        self.bet_modes = [mode("base", 1.0, {"force_freegame": False})] + [
            mode(name, m["cost"], {"force_freegame": "buy_fs" in m, "buy_fs": m.get("buy_fs"), "force_vs": m.get("force_vs", False)})
            for name, m in self.buy_modes.items()
        ]

    def p_rune(self, num_fs: int) -> float:
        """Chance per empty cell and bonus spin that a rune lands."""
        return 0.028 + 0.0005 * (num_fs - 3)
