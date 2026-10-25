"""Stake 3-star release layer: the mode ladder as config, the criteria every mode is simulated in, and the
optimizer fences that put every mode at exactly 96.00% with a reachable 25,000x.

Use it from a game's game_config.py (after the game's own setup, reels etc.):

    from release import LADDER, RTP, WINCAP, build_bet_modes
    self.rtp, self.wincap = RTP, WINCAP
    self.bet_modes = build_bet_modes(self, LADDER, conditions)

where conditions(name, mode, criteria) returns the game's own condition dict for that criteria (reel weights,
scatter triggers, multiplier tables ...): the release layer adds force_wincap / force_freegame on top.

Criteria (each mode's books are split into them; the optimizer reweights each group):
  wincap    rounds that reach the cap (simulated with the game's wincap conditions, repeated until they do)
  0         rounds that pay nothing
  freegame  rounds with the bonus (spin modes: forced trigger; buys: every round)
  basegame  other rounds, drawn naturally (spin modes only)

Spin modes (base and the boosts) are the same game at different prices: the optimizer sets how often the bonus
comes. Give each spin mode either bonus_share (the share of its price paid back through the bonus; the frequency then
follows from the game's average bonus, so the ladder fits any game) or bonus_hr (the bonus once in that many spins). Buys start the bonus; zero_rate is the share of bought bonuses that pay 0x. Set it only if the
game's bonus can pay 0x (Ghost Duels: 0.10); with None, buys have no 0 criteria (a bonus that always pays would
otherwise be re-simulated forever looking for a 0x round).
"""

import csv
import os

from src.config.betmode import BetMode
from src.config.distributions import Distribution
from optimization_program.optimization_config import (
    ConstructConditions,
    ConstructParameters,
    ConstructScaling,
    verify_optimization_input,
)

RTP = 0.96
WINCAP = 25000.0
WINCAP_SHARE = 0.0005  # RTP share of rounds at the cap: about 1 in 50 million base spins, far more often in buys

# Paperclip-style ladder (Loan Shark, Toon Sailor ...): base, 3x and 6x chance boosts, a regular, a super and a
# premium buy. bonus_share: share of the price paid back through the bonus (base about a third, like Ghost Duels;
# with 0.75 at 3x and 0.88 at 6x the bonus comes about 7x and 16x as often as in the base game). zero_rate: share of
# bought bonuses paying 0x, or None when the bonus always pays.
# Delete the rungs a game does not have; the names become the RGS mode names (upper case in the frontend).
LADDER = {
    "base": {"cost": 1.0, "kind": "spin", "bonus_share": 0.33},
    "boost": {"cost": 3.0, "kind": "spin", "bonus_share": 0.75},
    "boost6": {"cost": 6.0, "kind": "spin", "bonus_share": 0.88},
    "bonus": {"cost": 100.0, "kind": "buy", "zero_rate": None},
    "super": {"cost": 300.0, "kind": "buy", "zero_rate": None},
    "premium": {"cost": 1000.0, "kind": "buy", "zero_rate": None},
}

# criteria: share of the simulated books (not of the final odds; the optimizer sets those)
QUOTAS = {
    "spin": {"wincap": 0.001, "0": 0.25, "freegame": 0.1, "basegame": 0.649},
    "buy": {"wincap": 0.001, "0": 0.1, "freegame": 0.899},
    "buy_no_zero": {"wincap": 0.001, "freegame": 0.999},
}


def kind_quotas(m):
    if m["kind"] == "buy" and not m.get("zero_rate"):
        return QUOTAS["buy_no_zero"]
    return QUOTAS[m["kind"]]


def build_bet_modes(config, ladder, conditions):
    modes = []
    for name, m in ladder.items():
        dists = []
        for criteria, quota in kind_quotas(m).items():
            cond = dict(conditions(name, m, criteria))
            cond["force_wincap"] = criteria == "wincap"
            cond["force_freegame"] = criteria in ("wincap", "freegame") or m["kind"] == "buy"
            win = {"wincap": config.wincap, "0": 0.0}.get(criteria)
            dists.append(Distribution(criteria=criteria, quota=quota, win_criteria=win, conditions=cond))
        modes.append(BetMode(name=name, cost=m["cost"], rtp=config.rtp, max_win=config.wincap, auto_close_disabled=False,
                             is_feature=m["kind"] == "spin", is_buybonus=m["kind"] == "buy", distributions=dists))
    return modes


def natural(config, name):
    """Natural averages from the simulated books of a mode (library/lookup_tables/lookUpTableSegmented_<mode>.csv:
    id, criteria, base win, bonus win): bonus round average, and the hit rate and average of other wins."""
    path = os.path.join(config.library_path, "lookup_tables", f"lookUpTableSegmented_{name}.csv")
    bonus, base, base_rounds = [], [], 0
    with open(path, encoding="UTF-8") as f:
        for _, crit, bw, fw in csv.reader(f):
            win = float(bw) + float(fw)
            if crit == "freegame":
                bonus.append(win)
            elif crit == "basegame":
                base_rounds += 1
                if float(fw) > 0:
                    bonus.append(win)
                elif win > 0:
                    base.append(win)
    return {"bonus_avg": sum(bonus) / max(1, len(bonus)), "base_avg": sum(base) / max(1, len(base)),
            "base_hr": base_rounds / max(1, len(base))}


def fences(config, name, m, nat):
    """Optimizer fences for one mode. Non-exact fences are given by hit rate and RTP share (the optimizer's average
    win for them is hr * share * cost; giving av_win instead divides by the cost twice)."""
    cost, rtp = m["cost"], config.rtp
    cond = {"wincap": ConstructConditions(rtp=WINCAP_SHARE, av_win=config.wincap, search_conditions=config.wincap).return_dict()}
    rest = round(rtp - WINCAP_SHARE, 6)
    if m["kind"] == "buy" and not m.get("zero_rate"):  # every bought bonus pays: freegame takes all other rounds
        cond["freegame"] = ConstructConditions(rtp=rest, hr="x").return_dict()
        return cond
    cond["0"] = ConstructConditions(rtp=0, av_win=0, search_conditions=0).return_dict()
    if m["kind"] == "buy":
        cond["freegame"] = ConstructConditions(rtp=rest, hr=round(1 / (1 - m["zero_rate"]), 6)).return_dict()
        return cond
    if "bonus_share" in m:
        fg_share = m["bonus_share"]
        fg_hr = round(nat["bonus_avg"] / (fg_share * cost), 4)
    else:
        fg_hr = m["bonus_hr"]
        fg_share = round(nat["bonus_avg"] / (fg_hr * cost), 6)
    bg_share = round(rest - fg_share, 6)
    if bg_share <= 0:
        raise ValueError(f"{name}: a bonus every {fg_hr} spins at {nat['bonus_avg']:.1f}x on average is "
                         f"{fg_share:.1%} RTP, more than the {rest:.1%} available; make bonus_hr larger or bonus_share smaller")
    bg_hr = round(nat["base_avg"] / (bg_share * cost), 4)  # keep the natural size of other wins, move their frequency
    cond["freegame"] = ConstructConditions(rtp=fg_share, hr=fg_hr, search_conditions={"symbol": "scatter"}).return_dict()
    cond["basegame"] = ConstructConditions(rtp=bg_share, hr=bg_hr).return_dict()
    return cond


def optimizer_params(config, ladder, scaling=None, **params):
    """Sets config.opt_params for every mode. scaling: {mode: [ConstructScaling entries]} to shape a mode's tail, e.g.
    {"criteria": "freegame", "scale_factor": 0.3, "win_range": (4000, 24999), "probability": 1.0} when prob5k is high.
    Needs simulated books (natural averages); before the first simulation it sets placeholder fences."""
    config.opt_params = {}
    defaults = dict(num_show=5000, num_per_fence=10000, min_m2m=4, max_m2m=8, pmb_rtp=1.0, sim_trials=5000,
                    test_spins=[50, 100, 200], test_weights=[0.3, 0.4, 0.3], score_type="rtp")
    for name, m in ladder.items():
        try:
            nat = natural(config, name)
        except FileNotFoundError:
            nat = {"bonus_avg": 150.0, "base_avg": 2.5, "base_hr": 3.5}
        config.opt_params[name] = {
            "conditions": fences(config, name, m, nat),
            "scaling": ConstructScaling((scaling or {}).get(name, [])).return_dict(),
            "parameters": ConstructParameters(**{**defaults, **params}).return_dict(),
        }
    verify_optimization_input(config, config.opt_params)
