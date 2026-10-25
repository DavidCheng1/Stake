"""Ghost Duels rules: board draws, clusters bridged by VS reels, duels, tumbles and the crate bonus.

Boards are plain lists of symbol names, board[reel][row], with row 0 at the top.
"""

import random
from src.executables.executables import Executables

N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def weighted(pairs):
    """Pick a value from [(value, weight), ...]."""
    x = random.random() * sum(w for _, w in pairs)
    for value, w in pairs:
        x -= w
        if x < 0:
            return value
    return pairs[0][0]


class GameCalculations(Executables):
    """Game-specific board and feature calculations."""

    # ---------- Board ----------
    def mode_weights(self):
        """Symbol weights of the current bet mode: the FS boost mode ("boost") raises the FS weight."""
        if getattr(self, "_weights_key", None) != (self.betmode, self.criteria):
            w = dict(self.config.symbol_weights)
            fs_weight = self.get_current_distribution_conditions().get("fs_weight")
            if fs_weight:
                w["fs"] = fs_weight
            self._weights_key, self._weights = (self.betmode, self.criteria), w
        return self._weights

    def draw_symbol(self, exclude=()):
        """Draw one cell by symbol weight, redrawing excluded symbols."""
        weights = self.mode_weights()
        while True:
            x = random.random() * sum(weights.values())
            for sym, w in weights.items():
                x -= w
                if x < 0:
                    break
            if sym not in exclude:
                return sym

    def pick_vs_reels(self):
        """Most spins have no VS reel; otherwise 1-6 distinct reels. VS Spin always has at least one."""
        if not self.get_current_distribution_conditions().get("force_vs") and random.random() >= self.config.vs_chance:
            return []
        n = weighted(self.get_current_distribution_conditions().get("vs_count") or self.config.vs_count)
        return sorted(random.sample(range(self.config.num_reels), n))

    def draw_base_board(self):
        """Fresh board: at most one FS per reel, VS reels fill their whole column."""
        cols, rows = self.config.num_reels, self.config.num_rows[0]
        self.board = [[self.draw_symbol() for _ in range(rows)] for _ in range(cols)]
        for col in self.board:
            seen = False
            for r, sym in enumerate(col):
                if sym == "fs":
                    if seen:
                        col[r] = self.draw_symbol(exclude=("fs",))
                    seen = True
        self.vs_reels = self.pick_vs_reels()
        for c in self.vs_reels:
            self.board[c] = ["vs"] * rows
        buy_fs = self.get_current_distribution_conditions().get("buy_fs")
        if buy_fs:
            self.plant_buy_fs(weighted(buy_fs))

    def plant_buy_fs(self, n):
        """Bonus buy: replace the board's FS with n FS on distinct non-VS reels, one per reel.
        If VS reels leave fewer than n free reels, the extra VS reels turn back into normal reels."""
        cols, rows = self.config.num_reels, self.config.num_rows[0]
        while cols - len(self.vs_reels) < n:
            c = self.vs_reels.pop(random.randrange(len(self.vs_reels)))
            self.board[c] = [self.draw_symbol(exclude=("fs",)) for _ in range(rows)]
        for c in range(cols):
            for r in range(rows):
                if self.board[c][r] == "fs":
                    self.board[c][r] = self.draw_symbol(exclude=("fs",))
        free = [c for c in range(cols) if c not in self.vs_reels]
        for c in random.sample(free, n):
            self.board[c][random.randrange(rows)] = "fs"

    # ---------- Clusters ----------
    def find_clusters(self):
        """Clusters of 4+ real symbols; VS reels act as wild bridges.
        4+ VS reels side by side form a wild-only cluster of their own."""
        cols, rows = self.config.num_reels, self.config.num_rows[0]
        board, out = self.board, []
        ids = []
        for col in board:
            for sym in col:
                if sym not in ("fs", "vs") and sym not in ids:
                    ids.append(sym)
        for sym in ids:
            seen = set()
            for c in range(cols):
                for r in range(rows):
                    if board[c][r] != sym or (c, r) in seen:
                        continue
                    cells, wild_reels, stack = [], set(), [(c, r)]
                    seen.add((c, r))
                    while stack:
                        x, y = stack.pop()
                        if board[x][y] == "vs":
                            wild_reels.add(x)
                        else:
                            cells.append([x, y])
                        for dx, dy in N4:
                            nx, ny = x + dx, y + dy
                            if 0 <= nx < cols and 0 <= ny < rows and (nx, ny) not in seen:
                                if board[nx][ny] in (sym, "vs"):
                                    seen.add((nx, ny))
                                    stack.append((nx, ny))
                    if len(cells) >= self.config.min_cluster:
                        out.append({"symbol": sym, "cells": sorted(cells), "vsReels": sorted(wild_reels), "wildOnly": False})
        c = 0
        while c < cols:
            if c not in self.vs_reels:
                c += 1
                continue
            e = c
            while e + 1 < cols and e + 1 in self.vs_reels:
                e += 1
            if e - c + 1 >= self.config.min_cluster:
                out.append({"symbol": None, "cells": [], "vsReels": list(range(c, e + 1)), "wildOnly": True})
            c = e + 1
        return out

    # ---------- Duels ----------
    def run_duel(self, reel):
        """Decide a duel's outcome and everything the animation shows."""
        cfg = self.config
        x = random.random()
        tier = 3 if x < cfg.duel_p3 else 2 if x < cfg.duel_p3 + cfg.duel_p2 else 1
        m1, m1b, m2, m3 = weighted(cfg.duel_t1), weighted(cfg.duel_t1), weighted(cfg.duel_t2), weighted(cfg.duel_t3)
        top = "blue" if random.random() < 0.5 else "witch"
        bottom = "witch" if top == "blue" else "blue"
        top_wins = random.random() < 0.5
        fake2 = tier == 1 and random.random() < cfg.duel_fake2
        fake3 = tier == 2 and random.random() < cfg.duel_fake3
        winner, mult = (top, m1) if top_wins else (bottom, m1b)
        challengers = []
        if tier >= 2 or fake2:
            challengers.append({"symbol": "pirate", "mult": m2, "wins": tier >= 2})
        if tier == 3 or fake3:
            challengers.append({"symbol": "devil", "mult": m3, "wins": tier == 3})
        if tier >= 2:
            winner, mult = "pirate", m2
        if tier == 3:
            winner, mult = "devil", m3
        return {
            "reel": reel,
            "tier": tier,
            "top": {"symbol": top, "mult": m1},
            "bottom": {"symbol": bottom, "mult": m1b},
            "topWins": top_wins,
            "challengers": challengers,
            "winner": winner,
            "mult": mult,
        }

    def evaluate_clusters(self, clusters):
        """Assign base pay, summed VS multipliers and win (x bet) to each cluster."""
        chars = self.config.characters
        for cl in clusters:
            if cl["wildOnly"]:
                cl["symbol"] = chars[min(chars.index(self.vs_winner[c]) for c in cl["vsReels"])]
                size = self.config.min_cluster
            else:
                size = min(len(cl["cells"]), 9)
            cl["base"] = self.config.symbol_pays[cl["symbol"]][size - self.config.min_cluster]
            cl["mult"] = sum(self.vs_mult.get(c, 0) for c in cl["vsReels"]) or 1
            cl["win"] = round(cl["base"] * cl["mult"], 2)
        return round(sum(cl["win"] for cl in clusters), 2)

    # ---------- Tumble ----------
    def tumble_clusters(self, clusters):
        """Remove winning cells and used VS reels, drop survivors, fill from the top.
        New symbols are never VS, and a reel never gets a second FS."""
        rows = self.config.num_rows[0]
        gone = {(c, r) for cl in clusters for c, r in cl["cells"]}
        used_vs = sorted({c for cl in clusters for c in cl["vsReels"]})
        for c in used_vs:
            gone.update((c, r) for r in range(rows))
            self.vs_mult.pop(c, None)
            self.vs_winner.pop(c, None)
        self.vs_reels = [c for c in self.vs_reels if c not in used_vs]
        new_symbols = [[] for _ in range(self.config.num_reels)]
        for c in range(self.config.num_reels):
            if c in self.vs_reels:
                continue
            keep = [self.board[c][r] for r in range(rows) if (c, r) not in gone]
            has_fs = "fs" in keep
            for _ in range(rows - len(keep)):
                sym = self.draw_symbol(exclude=("vs", "fs") if has_fs else ("vs",))
                has_fs = has_fs or sym == "fs"
                new_symbols[c].append(sym)
            self.board[c] = new_symbols[c] + keep
        return {
            "explodingSymbols": [{"reel": c, "row": r} for c, r in sorted(gone)],
            "removedVsReels": used_vs,
            "newSymbols": new_symbols,
        }

    def fs_positions(self):
        return [[c, r] for c, col in enumerate(self.board) for r, sym in enumerate(col) if sym == "fs"]

    # ---------- Geisterkisten bonus ----------
    def bonus_spin(self, grid, num_fs):
        """One bonus spin: each empty cell may get a crate (rare, rarer next to crates) or a rune."""
        cfg, cols, rows = self.config, self.config.num_reels, self.config.num_rows[0]
        planned = {}
        for c in range(cols):
            for r in range(rows):
                if grid[c][r] is not None:
                    continue
                near = False
                for dx, dy in N4:
                    nx, ny = c + dx, r + dy
                    if 0 <= nx < cols and 0 <= ny < rows:
                        here = grid[nx][ny] or planned.get((nx, ny))
                        if here and here["type"] == "crate":
                            near = True
                pc = cfg.p_crate * (cfg.crate_near if near else 1)
                x = random.random()
                if x < pc:
                    planned[(c, r)] = {"type": "crate"}
                elif x < pc + cfg.p_rune(num_fs):
                    planned[(c, r)] = {"type": "rune"}
        landed = []
        for (c, r), item in sorted(planned.items()):
            if item["type"] == "crate":
                item.update(symbol=random.choice(cfg.characters), mult=weighted(cfg.crate_mults))
            else:
                item.update(symbol=random.choice(cfg.rune_ids), value=weighted(cfg.rune_values))
            grid[c][r] = item
            landed.append({"reel": c, "row": r, **item})
        return landed

    def link_groups(self, grid):
        """Touching runes and crates form a group. 4+ runes with at least one crate pay
        (sum of rune values) x every crate multiplier in the group."""
        cols, rows = self.config.num_reels, self.config.num_rows[0]
        done, groups = set(), []
        for c0 in range(cols):
            for r0 in range(rows):
                if grid[c0][r0] is None or (c0, r0) in done:
                    continue
                nodes, stack = [], [(c0, r0)]
                done.add((c0, r0))
                while stack:
                    x, y = stack.pop()
                    nodes.append((x, y))
                    for dx, dy in N4:
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < cols and 0 <= ny < rows and grid[nx][ny] is not None and (nx, ny) not in done:
                            done.add((nx, ny))
                            stack.append((nx, ny))
                runes = sorted([x, y] for x, y in nodes if grid[x][y]["type"] == "rune")
                crates = sorted([x, y] for x, y in nodes if grid[x][y]["type"] == "crate")
                if not runes:
                    continue
                total = sum(grid[x][y]["value"] for x, y in runes)
                mults = sorted(grid[x][y]["mult"] for x, y in crates)
                ok = len(runes) >= self.config.min_link and len(crates) > 0
                mult = 1
                for m in mults:
                    mult *= m
                groups.append(
                    {
                        "runes": runes,
                        "crates": crates,
                        "sum": total,
                        "mults": mults,
                        "mult": mult if ok else 1,
                        "ok": ok,
                        "win": round(total * mult, 2) if ok else 0,
                    }
                )
        return groups
