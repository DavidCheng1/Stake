"""Run the automated Stake Engine review checks for a game and print PASS/FAIL per guideline ID.

    math-sdk\\env\\Scripts\\python.exe tools\\review\\run_review.py                       all checks, Ghost Duels
    math-sdk\\env\\Scripts\\python.exe tools\\review\\run_review.py rules replay          only these groups
    math-sdk\\env\\Scripts\\python.exe tools\\review\\run_review.py --profile tools\\review\\games\\other.json

Groups: basic invalid bets resume zero broke confirm currency social lang rules replay sizes static.
Starts its own mock RGS (tools/mock_rgs.py) on --port with a large balance and stops it afterwards; screenshots,
rules text and report.md/report.json go to .review-out/<game>/. Exit code 1 if any check FAILs.
Needs: Chrome or Edge, and the venv packages websocket-client and zstandard.
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import checks  # noqa: E402


def server_up(host):
    try:
        return urllib.request.urlopen(host + "/", timeout=2).status == 200
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("groups", nargs="*", help="check groups to run (default: all)")
    ap.add_argument("--profile", default=os.path.join(HERE, "games", "ghost_duels.json"))
    ap.add_argument("--port", type=int, default=8090, help="mock RGS port (8090 keeps your 8080 test session free)")
    ap.add_argument("--publish", help="math folder to serve instead of the profile's (e.g. _UPLOAD_TO_STAKE/1_math while new books are simulated)")
    args = ap.parse_args()

    profile = json.load(open(args.profile, encoding="utf-8"))
    if args.publish:
        profile["publish"] = os.path.relpath(os.path.abspath(args.publish), ROOT)
    host = f"http://127.0.0.1:{args.port}"
    out = os.path.join(ROOT, ".review-out", profile["game"])
    os.makedirs(out, exist_ok=True)

    server = None
    if not server_up(host):
        print(f"Starting the mock RGS on port {args.port} (loading books takes a minute)...", flush=True)
        log = open(os.path.join(out, "mock_rgs.log"), "w", encoding="utf-8")
        server = subprocess.Popen([sys.executable, os.path.join(ROOT, "tools", "mock_rgs.py"), "--port", str(args.port), "--balance", "1000000",
                                   "--web", os.path.join(ROOT, profile["web"]), "--publish", os.path.join(ROOT, profile["publish"]), "--game", profile["game"]],
                                  stdout=log, stderr=subprocess.STDOUT, env={**os.environ, "PYTHONUNBUFFERED": "1"})
        for _ in range(600):
            if server_up(host) or server.poll() is not None:
                break
            time.sleep(1)
        if not server_up(host):
            sys.exit(f"mock RGS did not start; see {os.path.join(out, 'mock_rgs.log')}")

    review = checks.Review(profile, ROOT, host, out)
    groups = [(g, fn) for g, fn in checks.CHECKS if not args.groups or g in args.groups]
    t0 = time.time()
    try:
        for name, fn in groups:
            print(f"\n== {name}", flush=True)
            try:
                fn(review)
            except Exception as err:  # a crashed group is a failed group, not a crashed run
                review.add(name, f"check group '{name}' crashed", False, repr(err))
    finally:
        if server:
            server.terminate()

    res = review.results
    counts = {v: sum(1 for x in res if x["verdict"] == v) for v in ("PASS", "FAIL", "AT RISK", "NEEDS A HUMAN")}
    print(f"\n{'=' * 70}\nSUMMARY ({time.time() - t0:.0f}s): " + " · ".join(f"{n} {v}" for v, n in counts.items() if n))
    for x in res:
        if x["verdict"] != "PASS":
            print(f"  [{x['id']}] {x['verdict']:13} {x['title']} :: {x['evidence'][:200]}")
    with open(os.path.join(out, "report.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, indent=2, ensure_ascii=False)
    with open(os.path.join(out, "report.md"), "w", encoding="utf-8") as f:
        f.write(f"# Review checks: {profile['title']}\n\n" + " · ".join(f"{n} {v}" for v, n in counts.items() if n) + "\n\n| ID | Check | Verdict | Evidence |\n|---|---|---|---|\n")
        for x in res:
            f.write(f"| {x['id']} | {x['title']} | {x['verdict']} | {x['evidence'].replace('|', '/')[:300]} |\n")
    print(f"report: {os.path.join(out, 'report.md')}")
    sys.exit(1 if counts["FAIL"] else 0)


if __name__ == "__main__":
    main()
