"""Night Drive round flow: a base spin (with Drive-By), then The Chase when 3+ sunsets land."""

from game_calculations import GameCalculations
from game_events import (
    reveal_event, driveby_event, win_info_event, update_win_event, set_total_win_event, fs_trigger_event,
    chase_move_event, update_freespin_event, cars_land_event, freespin_end_event, wincap_event, final_win_event,
)


class GameState(GameCalculations):
    """All game logic and events of one simulation."""

    def assign_special_sym_function(self):
        pass

    def run_spin(self, sim, simulation_seed=None):
        self.reset_seed(sim)
        self.repeat = True
        while self.repeat:
            self.reset_book()
            self.gametype = self.config.basegame_type
            board = self.draw_base_board()
            reveal_event(self, board)
            db = self.drive_by(board)
            if db:
                driveby_event(self, *db)
            self.pay(board)
            self.win_manager.update_gametype_wins(self.gametype)
            set_total_win_event(self)

            scatters = self.scatter_positions(board)
            if len(scatters) >= min(self.config.fs_for) and not self.wincap_triggered:
                n = min(len(scatters), max(self.config.fs_for))
                self.record({"kind": n, "symbol": "scatter", "gametype": self.gametype})
                super_mode = bool(self.get_current_distribution_conditions().get("super"))
                fs_trigger_event(self, scatters, self.config.fs_for[n], super_mode)
                self.run_chase(self.config.fs_for[n])

            self.evaluate_finalwin()
            self.check_repeat()
        self.imprint_wins()

    def run_freespin(self):
        """Not used: The Chase runs from run_spin (run_chase), with its own spin count."""
        raise NotImplementedError

    def pay(self, board):
        """Evaluate a board, add its win (capped at the wincap), emit the win events."""
        wins, total = self.evaluate_ways(board)
        if total > 0:
            room = round(self.config.wincap - self.win_manager.running_bet_win, 1)
            total = min(total, room)
            for w in wins:
                self.record({"kind": w["kind"], "symbol": w["symbol"], "gametype": self.gametype})
            self.win_manager.update_spinwin(total)
            win_info_event(self, wins, total)
            update_win_event(self)
            # the sums are floats: 24851.33 + 148.67 can land a hair under 25000, so compare with a tolerance
            if self.win_manager.running_bet_win >= self.config.wincap - 1e-6 and not self.wincap_triggered:
                self.wincap_triggered = True
                wincap_event(self)
        return total

    def run_chase(self, spins):
        """The Chase: before every spin each car drives one reel left (off the board: +1 spin); the free cells spin;
        cars that land stay."""
        self.gametype = self.config.freegame_type
        self.triggered_freegame = True
        cars, next_id, left, spin, total_spins = [], 0, spins, 0, spins
        while left > 0 and not self.wincap_triggered:
            if cars:
                for car in cars:
                    car["reel"] -= 1
                exits = [car for car in cars if car["reel"] < 0]
                cars = [car for car in cars if car["reel"] >= 0]
                left += len(exits)
                total_spins += len(exits)
                chase_move_event(self, cars, exits, total_spins)
            left -= 1
            spin += 1
            self.win_manager.reset_spin_win()
            update_freespin_event(self, spin, total_spins)
            board = self.draw_reels(fs=True)
            for car in cars:
                board[car["reel"]][car["row"]] = {"name": "W", "m": car["m"], "car": car["id"]}
            landed = []
            for c, col in enumerate(board):
                for r, cell in enumerate(col):
                    if cell["name"] == "W" and "car" not in cell:
                        next_id += 1
                        cell["car"] = next_id
                        car = {"id": next_id, "reel": c, "row": r, "m": cell["m"]}
                        cars.append(car)
                        landed.append(car)
            reveal_event(self, board)
            if landed:
                cars_land_event(self, landed)
            self.pay(board)
            self.win_manager.update_gametype_wins(self.gametype)
            set_total_win_event(self)
        freespin_end_event(self, self.win_manager.freegame_wins)
        self.gametype = self.config.basegame_type

    def evaluate_finalwin(self):
        self.update_final_win()
        final_win_event(self)

    def check_game_repeat(self):
        """A criteria with a target win (0 or the cap) repeats the round until it is met."""
        if self.repeat is False:
            win_criteria = self.get_current_betmode_distributions().get_win_criteria()
            if win_criteria is not None and self.final_win != win_criteria:
                self.repeat = True
