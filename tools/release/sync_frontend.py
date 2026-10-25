"""Copy each mode's RTP and max win from the math stats into the frontend, and check that the prices match.

    math-sdk\\env\\Scripts\\python.exe tools\\release\\sync_frontend.py ghost_duels ghost-duels-web\\game.js
    ... --check     only report differences (exit 1 if any)

The frontend declares every mode as an object literal that starts with
    mode: "NAME", cost: N, rtp: N, maxWin: N
(NAME is the math mode name in upper case, BASE for the base game; rtp in percent). Values come from
math-sdk/games/<game>/library/stats_<mode>.json (written by game_stats.py) and the published index.json.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODE = re.compile(r'mode:\s*"(\w+)",\s*cost:\s*([\d.]+),\s*rtp:\s*([\d.]+),\s*maxWin:\s*(\d+)')


def math_modes(game):
    lib = os.path.join(ROOT, "math-sdk", "games", game, "library")
    index = json.load(open(os.path.join(lib, "publish_files", "index.json"), encoding="utf-8"))
    out = {}
    for m in index["modes"]:
        stats = json.load(open(os.path.join(lib, f"stats_{m['name']}.json"), encoding="utf-8"))
        out["BASE" if m["name"] == "base" else m["name"].upper()] = {
            "cost": float(m["cost"]), "rtp": round(stats["rtp"] * 100, 2), "maxWin": int(stats["max_win"])}
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    game, js_path = args[0], os.path.join(ROOT, args[1])
    want = math_modes(game)
    src = open(js_path, encoding="utf-8").read()
    problems, changes, seen = [], [], set()

    def fix(m):
        name, cost, rtp, maxwin = m.group(1), float(m.group(2)), float(m.group(3)), int(m.group(4))
        seen.add(name)
        w = want.get(name)
        if not w:
            problems.append(f"{name}: in the frontend but not in the math")
            return m.group(0)
        if abs(cost - w["cost"]) > 1e-9:
            problems.append(f"{name}: frontend cost {cost:g}, math cost {w['cost']:g} (change the price in one of them)")
        if abs(rtp - w["rtp"]) > 1e-9 or maxwin != w["maxWin"]:
            changes.append(f"{name}: rtp {rtp} -> {w['rtp']:.2f}, maxWin {maxwin} -> {w['maxWin']}")
        return f'mode: "{name}", cost: {m.group(2)}, rtp: {w["rtp"]:.2f}, maxWin: {w["maxWin"]}'

    new = MODE.sub(fix, src)
    problems += [f"{n}: in the math but not in the frontend" for n in want if n not in seen]
    for line in changes + problems:
        print(line)
    if not check and new != src:
        open(js_path, "w", encoding="utf-8").write(new)
        print(f"updated {js_path}")
    if not changes and not problems:
        print("frontend matches the math: " + ", ".join(f"{n} {w['cost']:g}x {w['rtp']:.2f}% {w['maxWin']:,}x" for n, w in want.items()))
    sys.exit(1 if problems or (check and changes) else 0)


if __name__ == "__main__":
    main()
