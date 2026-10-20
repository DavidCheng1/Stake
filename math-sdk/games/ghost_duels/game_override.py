from game_executables import GameExecutables


class GameStateOverride(GameExecutables):
    """Extends the universal state.py functions with Ghost Duels round state."""

    def reset_book(self):
        super().reset_book()
        self.vs_reels = []
        self.vs_mult = {}
        self.vs_winner = {}

    def assign_special_sym_function(self):
        pass
