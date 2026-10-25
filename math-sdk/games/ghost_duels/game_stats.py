"""RTP, hit-rate and 3-star summary from the published lookup table, weighted by the optimizer's weights.
RTP is the mean payout divided by the mode cost (1 for base, the buy price for the bonus buys).

The 3-star limits (utils/rgs_verification.py) are prob5k <= 1%, prob10k <= 0.5%, etl40b <= 0.9, etl10k <= 0.8,
cvar <= 800. The SDK measures etl40b and etl10k in base bets (not divided by the mode cost); "per_cost" gives the
same values divided by the cost, the other way to read them. Both are reported."""

import json
import os

from utils.analysis.distribution_functions import get_etl_cvar_p5k_10k_vales

LIMITS = {"prob5k": 1e-2, "prob10k": 0.5e-2, "etl40b": 0.9, "etl10k": 0.8, "cvar": 800}


def three_star(dist, cost):
    p5k, p10k, etl10k, etl40b, cvar = get_etl_cvar_p5k_10k_vales(dist, cost, sum(dist.values()))
    sdk = {"prob5k": p5k, "prob10k": p10k, "etl40b": etl40b, "etl10k": etl10k, "cvar": cvar}
    per_cost = {**sdk, "etl40b": etl40b / cost, "etl10k": etl10k / cost}
    fails = lambda m: sorted(k for k, v in m.items() if v > LIMITS[k] * (1 + 1e-9))
    rnd = lambda m: {k: round(v, 6) for k, v in m.items()}
    return {"sdk": rnd(sdk), "sdk_fails": fails(sdk), "per_cost": rnd(per_cost), "per_cost_fails": fails(per_cost)}


def print_stats(config, mode="base"):
    lut_path = os.path.join(config.publish_path, f"lookUpTable_{mode}_0.csv")
    split_path = os.path.join(config.library_path, "lookup_tables", f"lookUpTableSegmented_{mode}.csv")
    weights, pays = [], []
    for line in open(lut_path, encoding="UTF-8"):
        _, w, p = line.split(",")
        weights.append(int(w))
        pays.append(int(p) / 100)
    free = [float(line.split(",")[3]) for line in open(split_path, encoding="UTF-8")]
    total = sum(weights)
    cost = next(bm.get_cost() for bm in config.bet_modes if bm.get_name() == mode)
    wsum = lambda vals: sum(w * v for w, v in zip(weights, vals))
    prob = lambda flags: sum(w for w, f in zip(weights, flags) if f) / total
    mean = wsum(pays) / total
    var = wsum([(p - mean) ** 2 for p in pays]) / total
    dist = {}
    for w, p in zip(weights, pays):
        dist[p] = dist.get(p, 0) + w
    dist = dict(sorted(dist.items()))
    bonus = [f > 0 for f in free] if any(free) else [False] * len(pays)
    stats = {
        "mode": mode,
        "cost": cost,
        "books": len(pays),
        "rtp": round(mean / cost, 6),
        "mean_payout": round(mean, 3),
        "rtp_base": round((wsum(pays) - wsum(free)) / total / cost, 6),
        "rtp_bonus": round(wsum(free) / total / cost, 6),
        "std_dev": round(var ** 0.5, 3),
        "hit_rate": round(1 / max(1e-12, prob([p > 0 for p in pays])), 3),
        "bonus_rate": round(1 / max(1e-12, prob(bonus)), 1),
        "zero_rate": round(prob([p == 0 for p in pays]), 4),
        "max_win": max(pays),
        "max_win_odds": round(1 / max(1e-18, prob([p >= config.wincap for p in pays]))),
        "three_star": three_star(dist, cost),
    }
    print(json.dumps(stats, indent=2))
    with open(os.path.join(config.library_path, f"stats_{mode}.json"), "w", encoding="UTF-8") as f:
        json.dump(stats, f, indent=2)
    declared = next(bm.get_rtp() for bm in config.bet_modes if bm.get_name() == mode)
    if abs(stats["rtp"] - declared) > 0.0005:
        print(f"WARNING: declared rtp {declared} differs from lookup table rtp {stats['rtp']}")
    return stats
