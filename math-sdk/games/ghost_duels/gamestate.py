"""Ghost Duels round flow: reveal, cascades with VS duels, then the Geisterkisten bonus."""

from game_override import GameStateOverride
from game_events import (
    reveal_event,
    vs_duel_event,
    win_info_event,
    update_tumble_win_event,
    tumble_board_event,
    wincap_event,
    bonus_trigger_event,
    bonus_start_event,
    bonus_spin_event,
    bonus_end_event,
    set_total_win_event,
    final_win_event,
)
from game_calculations import weighted
import random


class GameState(GameStateOverride):
    """Handle all game-logic and event updates for a given simulation number."""

    def run_spin(self, sim, simulation_seed=None):
        self.reset_seed(sim)
        self.repeat = True
        while self.repeat:
            self.reset_book()
            self.draw_base_board()
            reveal_event(self)

            while not self.wincap_triggered:
                clusters = self.find_clusters()
                if not clusters:
                    break
                duels = sorted({c for cl in clusters for c in cl["vsReels"]} - set(self.vs_mult))
                for c in duels:
                    duel = self.run_duel(c)
                    self.vs_mult[c], self.vs_winner[c] = duel["mult"], duel["winner"]
                    vs_duel_event(self, duel)
                    if duel["tier"] >= 2:
                        self.record({"kind": duel["tier"], "symbol": "vs", "gametype": self.gametype})
                tumble_win = self.evaluate_clusters(clusters)
                tumble_win = min(tumble_win, round(self.config.wincap - self.win_manager.running_bet_win, 2))
                self.win_manager.update_spinwin(tumble_win)
                win_info_event(self, clusters, tumble_win)
                update_tumble_win_event(self)
                if self.win_manager.running_bet_win >= self.config.wincap:
                    self.wincap_triggered = True
                    wincap_event(self)
                    break
                tumble_board_event(self, self.tumble_clusters(clusters))

            self.win_manager.update_gametype_wins(self.gametype)

            fs = self.fs_positions()
            if len(fs) >= self.config.bonus_min_fs and not self.wincap_triggered:
                self.record({"kind": len(fs), "symbol": "scatter", "gametype": self.gametype})
                bonus_trigger_event(self, fs)
                self.fs_cells = fs
                self.run_freespin()

            set_total_win_event(self)
            self.evaluate_finalwin()
            self.check_repeat()

        self.imprint_wins()

    def run_freespin(self):
        """Geisterkisten: FS cells become crates, then spins until 3 misses in a row or a full board."""
        cfg = self.config
        self.gametype = cfg.freegame_type
        self.triggered_freegame = True
        self.win_manager.reset_spin_win()
        num_fs = min(cfg.num_reels, len(self.fs_cells))
        grid = [[None] * cfg.num_rows[0] for _ in range(cfg.num_reels)]
        crates = []
        for c, r in sorted(self.fs_cells):
            item = {"type": "crate", "symbol": random.choice(cfg.characters), "mult": weighted(cfg.start_mults[num_fs])}
            grid[c][r] = item
            crates.append({"reel": c, "row": r, **item})
        lives, spin = cfg.bonus_lives, 0
        bonus_start_event(self, crates, lives)
        while lives > 0 and any(cell is None for col in grid for cell in col):
            spin += 1
            landed = self.bonus_spin(grid, num_fs)
            lives = cfg.bonus_lives if landed else lives - 1
            bonus_spin_event(self, spin, landed, lives)

        groups = self.link_groups(grid)
        room = round(cfg.wincap - self.win_manager.running_bet_win, 2)
        total = min(round(sum(g["win"] for g in groups), 2), room)
        bonus_end_event(self, groups, total)
        self.win_manager.update_spinwin(total)
        self.win_manager.update_gametype_wins(self.gametype)
        if self.win_manager.running_bet_win >= cfg.wincap:
            self.wincap_triggered = True
            wincap_event(self)
