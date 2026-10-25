"""Optimizer targets for Ghost Duels: every mode at exactly 96.00% (game_config.rtp).

The optimizer (math-sdk/optimization_program) groups each mode's books into fences and reweights them:
  wincap    win exactly 25,000x                     tiny RTP share, so the cap is reachable but very rare
  0         win exactly 0                           gets the probability left over
  freegame  rounds with the bonus (force record)    base and boosts: bonus frequency; buys: the paying bonuses
  basegame  everything else                         ordinary wins
A fence is set by its hit rate (1 in hr rounds) and RTP share (of the mode's price); its average win is then
hr * share * price. (Average win + share only works for the exact-win fences: the optimizer divides by the price
twice otherwise.) TARGETS keeps each fence's average close to its natural mean (measured from the books), so the
game plays like the simulation and only the frequencies move.
"""

from optimization_program.optimization_config import (
    ConstructConditions,
    ConstructParameters,
    ConstructScaling,
    verify_optimization_input,
)

WINCAP_SHARE = 0.0005  # RTP share of rounds at the 25,000x cap: about once in 50 million base spins

# per mode and fence: (hit rate, RTP share of the price); basegame takes the share that is left
#   base    bonus 1 in 536 (avg 168.6x), other wins 1 in 3.65 (avg 2.35x)               - as simulated
#   boost   bonus 1 in 78.5 (avg 177x at 3x), other wins 1 in 3.76                       - as simulated
#   boost6  bonus 1 in 36 (avg 185x at 6x), other wins 1 in 3.70
#   buys    10% of bought bonuses pay 0x (naturally ~20%): the paying ones are 1 in 1/0.9
#   vsspin  natural bonus 1 in 658, other wins 1 in 2.02 (avg 9.15x)                     - as simulated
TARGETS = {
    "base":   {"freegame": (536.0, 0.3145), "basegame": 3.65},
    "boost":  {"freegame": (78.5, 0.7510), "basegame": 3.757},
    "boost6": {"freegame": (36.12, None), "basegame": (3.70, 0.10586)},
    "bonus":  {"freegame": (1 / 0.9, None)},
    "bonus4": {"freegame": (1 / 0.9, None)},
    "bonus5": {"freegame": (1 / 0.9, None)},
    "vsspin": {"freegame": (657.9, 0.0553), "basegame": 2.024},
}


def mode_conditions(rtp, name, wincap):
    t = TARGETS[name]
    cond = {"wincap": ConstructConditions(rtp=WINCAP_SHARE, av_win=wincap, search_conditions=wincap).return_dict(),
            "0": ConstructConditions(rtp=0, av_win=0, search_conditions=0).return_dict()}
    rest = round(rtp - WINCAP_SHARE, 6)
    fg_hr, fg_share = t["freegame"]
    bg = t.get("basegame")
    if bg is None:  # buys: every round is a bonus; the paying ones form the freegame fence, 0 gets the rest
        cond["freegame"] = ConstructConditions(rtp=rest, hr=round(fg_hr, 6)).return_dict()
        return cond
    if fg_share is None:  # boost6: basegame share fixed, the bonus takes the rest
        bg_hr, bg_share = bg
        fg_share = round(rest - bg_share, 6)
    else:
        bg_hr, bg_share = bg, round(rest - fg_share, 6)
    cond["freegame"] = ConstructConditions(rtp=fg_share, hr=fg_hr, search_conditions={"symbol": "scatter"}).return_dict()
    cond["basegame"] = ConstructConditions(rtp=bg_share, hr=bg_hr).return_dict()
    return cond


# Mega bonus (5 FS, 650x price): 5,000x+ wins would land a bit over 2% of the buys, above the 3-star limit
# (prob5k <= 1%, counted at half for prices of 500+). Their weight is scaled down in the candidate distributions.
SCALING = {
    "bonus5": [{"criteria": "freegame", "scale_factor": 0.3, "win_range": (4000, 24999), "probability": 1.0}],
}


class OptimizationSetup:
    """Builds game_config.opt_params for every bet mode."""

    def __init__(self, game_config):
        self.game_config = game_config
        game_config.opt_params = {}
        for bm in game_config.bet_modes:
            name = bm.get_name()
            game_config.opt_params[name] = {
                "conditions": mode_conditions(bm.get_rtp(), name, bm.get_wincap()),
                "scaling": ConstructScaling(SCALING.get(name, [])).return_dict(),
                "parameters": ConstructParameters(
                    num_show=5000,
                    num_per_fence=10000,
                    min_m2m=4,
                    max_m2m=8,
                    pmb_rtp=1.0,
                    sim_trials=5000,
                    test_spins=[50, 100, 200],
                    test_weights=[0.3, 0.4, 0.3],
                    score_type="rtp",
                ).return_dict(),
            }
        verify_optimization_input(game_config, game_config.opt_params)
