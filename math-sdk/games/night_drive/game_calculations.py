"""Night Drive rules: board draws, Drive-By, ways wins with car multipliers, The Chase's cars.

Boards are lists of cells, board[reel][row] = {"name": .., "m": car x, "car": id}, row 0 at the top.
"""

import random
from src.executables.executables import Executables


def weighted(pairs):
    """Pick a value from [(value, weight), ...]."""
    x = random.random() * sum(w for _, w in pairs)
    for value, w in pairs:
        x -= w
        if x < 0:
            return value
    return pairs[-1][0]


class GameCalculations(Executables):
    """Game-specific board and feature calculations."""

    def cfg(self, key):
        """A config value, overridden by the current criteria's bias (wincap rounds)."""
        bias = self.get_current_distribution_conditions().get("bias") or {}
        return bias.get(key, getattr(self.config, key))

    def car_mult(self):
        cond = self.get_current_distribution_conditions()
        return weighted(self.cfg("mults_super") if cond.get("super") else self.cfg("mults"))

    def draw_cell(self, reel, fs, no_scatter):
        cond = self.get_current_distribution_conditions()
        pairs = list(self.config.symbol_weights.items())
        if reel > 0:  # cars land on reels 2 to 5
            pairs.append(("W", self.cfg("wild_weight_fs") if fs else self.config.wild_weight))
        if not fs and not no_scatter:
            pairs.append(("S", self.config.scatter_weight_boost if cond.get("boost") else self.config.scatter_weight))
        name = weighted(pairs)
        return {"name": name, "m": self.car_mult()} if name == "W" else {"name": name}

    def draw_reels(self, fs):
        """A fresh board: at most one sunset per reel (a second one is drawn again without the sunset)."""
        board = []
        for c in range(self.config.num_reels):
            seen, col = False, []
            for _ in range(self.config.num_rows[c]):
                cell = self.draw_cell(c, fs, seen)
                seen = seen or cell["name"] == "S"
                col.append(cell)
            board.append(col)
        return board

    def scatter_positions(self, board):
        return [(c, r) for c, col in enumerate(board) for r, s in enumerate(col) if s["name"] == "S"]

    def draw_base_board(self):
        """Base game board. With force_freegame the sunsets are planted (n of them on distinct reels, by
        scatter_triggers); otherwise the board is drawn until it does not trigger (the freegame criteria holds the
        triggers)."""
        cond = self.get_current_distribution_conditions()
        least = min(self.config.fs_for)
        if cond.get("force_freegame"):
            board = self.draw_reels(fs=False)
            for c, r in self.scatter_positions(board):
                board[c][r] = self.redraw_no_scatter(c)
            n = weighted(list(cond["scatter_triggers"].items()))
            for c in random.sample(range(self.config.num_reels), n):
                board[c][random.randrange(self.config.num_rows[c])] = {"name": "S"}
            return board
        while True:
            board = self.draw_reels(fs=False)
            if len(self.scatter_positions(board)) < least:
                return board

    def redraw_no_scatter(self, reel):
        while True:
            cell = self.draw_cell(reel, False, True)
            if cell["name"] != "S":
                return cell

    def drive_by(self, board):
        """Now and then a car speeds along a row and leaves 2-4 cars on distinct reels 2-5 (never on a sunset)."""
        if random.random() >= self.config.driveby_chance:
            return None
        row = random.randrange(self.config.num_rows[0])
        n = weighted(self.config.driveby_cars)
        reels = sorted(random.sample(range(1, self.config.num_reels), n), reverse=True)
        cars, under = [], []
        for c in reels:
            if board[c][row]["name"] == "S":
                continue
            under.append((c, board[c][row]["name"]))
            m = weighted(self.cfg("mults"))
            board[c][row] = {"name": "W", "m": m}
            cars.append((c, m))
        return (row, cars, under) if cars else None

    def evaluate_ways(self, board):
        """Left-to-right ways. A car counts as its x on its reel, so cars in one way multiply; ways made of cars only
        do not pay. Every win pays at least min_win. Returns (wins, total)."""
        wins, total = [], 0.0
        for s, pays in self.config.way_pays.items():
            pv, pw, kind, cells = 1, 1, 0, []
            for c, col in enumerate(board):
                v = w = 0
                here = []
                for r, cell in enumerate(col):
                    if cell["name"] == s:
                        v += 1
                        here.append((c, r))
                    elif cell["name"] == "W":
                        v += cell["m"]
                        w += cell["m"]
                        here.append((c, r))
                if not v:
                    break
                pv, pw, kind = pv * v, pw * w, kind + 1
                cells += here
            ways = pv - pw
            if kind < 3 or ways <= 0:
                continue
            # Stake pays in steps of 0.1x the bet: each win is rounded to the nearest 0.1x, and is at least min_win
            win = round(max(self.config.min_win, round(pays[kind - 3] * ways, 1)), 1)
            wins.append({"symbol": s, "kind": kind, "ways": ways, "win": win, "positions": cells})
            total += win
        return wins, round(total, 1)
