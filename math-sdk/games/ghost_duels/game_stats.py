"""RTP and hit-rate summary from the published lookup table (weights are all 1 without optimization)."""

import json
import os
import statistics


def print_stats(config, mode="base"):
    lut_path = os.path.join(config.publish_path, f"lookUpTable_{mode}_0.csv")
    split_path = os.path.join(config.library_path, "lookup_tables", f"lookUpTableSegmented_{mode}.csv")
    pays = [int(line.split(",")[2]) / 100 for line in open(lut_path, encoding="UTF-8")]
    free = [float(line.split(",")[3]) for line in open(split_path, encoding="UTF-8")]
    n = len(pays)
    stats = {
        "mode": mode,
        "spins": n,
        "rtp": round(sum(pays) / n, 6),
        "rtp_base": round((sum(pays) - sum(free)) / n, 6),
        "rtp_bonus": round(sum(free) / n, 6),
        "std_dev": round(statistics.pstdev(pays), 3),
        "hit_rate": round(n / max(1, sum(p > 0 for p in pays)), 3),
        "bonus_rate": round(n / max(1, sum(f > 0 for f in free)), 1),
        "max_win": max(pays),
        "wins_over_1000x": sum(p >= 1000 for p in pays),
        "wins_at_cap": sum(p >= config.wincap for p in pays),
    }
    print(json.dumps(stats, indent=2))
    with open(os.path.join(config.library_path, f"stats_{mode}.json"), "w", encoding="UTF-8") as f:
        json.dump(stats, f, indent=2)
    if abs(stats["rtp"] - config.rtp) > 0.0005:
        print(f"WARNING: declared rtp {config.rtp} differs from lookup table rtp {stats['rtp']}")
    return stats
