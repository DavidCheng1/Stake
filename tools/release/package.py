"""Refresh the upload folder with the current math and frontend.

    math-sdk\\env\\Scripts\\python.exe tools\\release\\package.py ghost_duels ghost-duels-web "Ghost Duels"
    ... --out _UPLOAD_TO_STAKE     (default) upload folder
    ... --frontend-only            keep 1_math as it is

1_math gets the published math (index.json, books, lookup tables); 2_frontend the web folder without README.md;
HOW_TO_UPLOAD.txt lists the modes from the math stats. 1_math is stored with Git LFS: every math version costs about
0.5 GB of the repo owner's LFS quota, so only package math you would upload.
"""

import argparse
import datetime
import json
import os
import shutil
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def replace_dir(src, dst, ignore=None):
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=ignore)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("game")
    ap.add_argument("web")
    ap.add_argument("title")
    ap.add_argument("--out", default="_UPLOAD_TO_STAKE")
    ap.add_argument("--frontend-only", action="store_true")
    args = ap.parse_args()
    out = os.path.join(ROOT, args.out)
    lib = os.path.join(ROOT, "math-sdk", "games", args.game, "library")
    publish = os.path.join(lib, "publish_files")
    os.makedirs(out, exist_ok=True)

    index = json.load(open(os.path.join(publish, "index.json"), encoding="utf-8"))
    if not args.frontend_only:
        replace_dir(publish, os.path.join(out, "1_math"))
    replace_dir(os.path.join(ROOT, args.web), os.path.join(out, "2_frontend"), shutil.ignore_patterns("README.md"))

    rows = []
    for m in index["modes"]:
        s = json.load(open(os.path.join(lib, f"stats_{m['name']}.json"), encoding="utf-8"))
        rows.append(f"  {m['name']:10} {m['cost']:>7g}x   RTP {s['rtp'] * 100:6.2f}%   max win {s['max_win']:>9,.0f}x")
    branch = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    n = len(os.listdir(os.path.join(out, "1_math")))
    with open(os.path.join(out, "HOW_TO_UPLOAD.txt"), "w", encoding="utf-8") as f:
        f.write(f"""{args.title} - files for the Stake Engine dashboard (built {datetime.date.today()} from branch {branch})

1_math       Upload all {n} files as the math version: index.json plus a books file (.jsonl.zst)
             and a lookup table (.csv) for each mode.

2_frontend   Upload the contents of this folder as the frontend version (index.html at the top).

3_cover-art  The 16:9 cover. Add the 3:4 game tile next to it.

Modes (cost, RTP, max win):
{chr(10).join(rows)}

After uploading: play once with a real session - spin, win, boosts, every bonus buy, reload mid-round, a replay
link, social mode.

The big math files are stored with Git LFS, so "git pull" downloads them on any computer with Git LFS (Git for
Windows includes it). Rebuild with the stake-release skill or tools/release/package.py. Every new math version adds
about 0.5 GB to the repo's LFS storage, which counts against the repo owner's GitHub quota.
""")
    print("\n".join(rows))
    print(f"packaged {'frontend' if args.frontend_only else 'math and frontend'} into {out}")


if __name__ == "__main__":
    main()
