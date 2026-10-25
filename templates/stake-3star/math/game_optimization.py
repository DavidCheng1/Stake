"""Optimizer setup: every mode of the ladder at exactly RTP (release.py). Tune the ladder there; SCALING shapes a
mode's win tail when a 3-star metric is over its limit (see game_stats.py)."""

from release import LADDER, optimizer_params

SCALING = {
    # "super": [{"criteria": "freegame", "scale_factor": 0.3, "win_range": (4000, 24999), "probability": 1.0}],
}


class OptimizationSetup:
    """Builds game_config.opt_params for every bet mode."""

    def __init__(self, game_config):
        optimizer_params(game_config, LADDER, SCALING)
