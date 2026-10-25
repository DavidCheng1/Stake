"""Local stand-in for the Stake Engine RGS, for testing a static game frontend against its real math books.

Serves the frontend and the wallet endpoints (authenticate, play, end-round, bet/event, replay).
Rounds are drawn from the published books by lookup-table weight, like the RGS does. Every bet mode in
index.json is served: play with mode "BONUS" draws from the bonus buy books and debits amount x its cost.

    python tools/mock_rgs.py            then open the printed URL
    python tools/mock_rgs.py --port 8080 --books 20000 --currency EUR
    python tools/mock_rgs.py --web other-game-web --publish math-sdk/games/other_game/library/publish_files --game other_game

Force a feature by putting it in rgs_url, e.g. rgs_url=http://127.0.0.1:8080/force/bonus
(kinds: win, lose, big, bonus, plus Ghost Duels' duel, tier2, tier3, wildonly). Not part of the game upload.
"""

import argparse
import sys
import io
import json
import mimetypes
import os
import random
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

import zstandard

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "ghost-duels-web")
PUBLISH = os.path.join(ROOT, "math-sdk", "games", "ghost_duels", "library", "publish_files")
API = 1_000_000
BET_LEVELS = [0.1, 0.2, 0.4, 0.6, 0.8, 1, 2, 4, 5, 10, 20, 50, 100]


def categories(book):
    """Feature kinds of a round, for /force/<kind>. Works for any game's events; the duel kinds are Ghost Duels'."""
    types = {e.get("type") for e in book["events"]}
    tiers = {e.get("tier") for e in book["events"] if e.get("type") == "vsDuel"}
    wild_only = any(w.get("wildOnly") for e in book["events"] if e.get("type") == "winInfo" for w in e.get("wins", []))
    pay = book["payoutMultiplier"]
    out = ["win" if pay > 0 else "lose"]
    if "bonusEnd" in types or any(t and ("freespin" in t.lower() or t.lower().startswith("bonus")) for t in types):
        out.append("bonus")
    if tiers:
        out.append("duel")
    if 2 in tiers:
        out.append("tier2")
    if 3 in tiers:
        out.append("tier3")
    if wild_only:
        out.append("wildonly")
    if pay >= 10000:
        out.append("big")
    return out


def load_books(mode, limit, scan):
    """Keep the first `limit` books of a mode for normal play and, while scanning up to `scan`, examples of rare kinds."""
    weights = {}
    with open(os.path.join(PUBLISH, mode["weights"]), encoding="UTF-8") as f:
        for line in f:
            i, w, _ = line.strip().split(",")
            weights[int(i)] = int(w)
    books, forced = {}, {}
    with open(os.path.join(PUBLISH, mode["events"]), "rb") as f:
        reader = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(f), encoding="UTF-8")
        for n, line in enumerate(reader):
            if n >= scan:
                break
            book = json.loads(line)
            keep = n < limit
            for kind in categories(book):
                if len(forced.setdefault(kind, [])) < (2000 if kind in ("win", "lose") else 200):
                    forced[kind].append(book["id"])
                    keep = True
            if keep:
                books[book["id"]] = line  # raw JSON, parsed when played
    ids = [i for i in books if i < limit]
    return books, ids, [weights.get(i, 1) for i in ids], forced


class State:
    def __init__(self, args):
        self.lock = threading.Lock()
        self.balance = int(args.balance * API)
        self.currency = args.currency
        self.round = None  # active round
        self.event = None
        print("Loading books…", flush=True)
        with open(os.path.join(PUBLISH, "index.json"), encoding="UTF-8") as f:
            index = json.load(f)["modes"]
        self.modes = {}
        for m in index:
            books, ids, weights, forced = load_books(m, args.books, args.scan)
            self.modes[m["name"].upper()] = {"cost": m["cost"], "books": books, "ids": ids, "weights": weights, "forced": forced}
            print(f"{m['name']} (cost {m['cost']}x): {len(ids)} books for play; forced kinds: " + ", ".join(f"{k} {len(v)}" for k, v in forced.items()))

    def pick(self, mode, force):
        m = self.modes[mode]
        if force and m["forced"].get(force):
            return self.book(mode, random.choice(m["forced"][force]))
        return self.book(mode, random.choices(m["ids"], m["weights"])[0])

    def book(self, mode, book_id):
        line = self.modes[mode]["books"].get(book_id)
        return json.loads(line) if line else None


class Handler(BaseHTTPRequestHandler):
    state: State = None

    def log_message(self, fmt, *args):
        if "/wallet/" in self.path or "/bet/" in self.path:
            super().log_message(fmt, *args)

    def send_json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST")
        self.end_headers()

    def split_force(self):
        parts = urlparse(self.path).path.split("/")
        if len(parts) > 3 and parts[1] == "force":
            return parts[2], "/" + "/".join(parts[3:])
        return None, urlparse(self.path).path

    def do_GET(self):
        _, path = self.split_force()
        if path.startswith("/bet/replay/"):
            *_, mode, book_id = path.rstrip("/").split("/")
            mode = mode.upper()
            book = self.state.book(mode, int(book_id)) if mode in self.state.modes else None
            if not book:
                return self.send_json(404, {"error": "ERR_VAL", "message": "book not loaded"})
            return self.send_json(200, {"payoutMultiplier": book["payoutMultiplier"] / 100, "costMultiplier": self.state.modes[mode]["cost"], "state": book["events"]})
        file = os.path.normpath(os.path.join(WEB, unquote(path).lstrip("/") or "index.html"))
        if not file.startswith(WEB) or not os.path.isfile(file):
            self.send_response(404)
            self.end_headers()
            return
        with open(file, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(file)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        force, path = self.split_force()
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        st = self.state
        with st.lock:
            bal = lambda: {"amount": st.balance, "currency": st.currency}
            if path == "/wallet/authenticate":
                levels = [int(v * API) for v in BET_LEVELS]
                return self.send_json(200, {
                    "balance": bal(),
                    "config": {
                        "minBet": levels[0], "maxBet": levels[-1], "stepBet": 10000,
                        "defaultBetLevel": API, "betLevels": levels,
                        "jurisdiction": {"socialCasino": False, "disabledAutoplay": False, "disabledSpacebar": False,
                                         "disabledTurbo": False, "disabledSlamstop": False, "disabledBuyFeature": False,
                                         "displayRTP": True, "minimumRoundDuration": 0},
                    },
                    "round": dict(st.round, event=st.event) if st.round else None,
                })
            if path == "/wallet/play":
                amount = int(body.get("amount", 0))
                mode = str(body.get("mode") or "BASE").upper()
                if st.round:
                    return self.send_json(400, {"error": "ERR_VAL", "message": "round already active"})
                if amount <= 0 or amount % 10000 or mode not in st.modes:
                    return self.send_json(400, {"error": "ERR_VAL", "message": "invalid amount or mode"})
                cost = int(round(amount * st.modes[mode]["cost"]))  # amount is the base bet; a mode costs amount x its cost
                if cost > st.balance:
                    return self.send_json(400, {"error": "ERR_IPB", "message": "insufficient balance"})
                book = st.pick(mode, force)
                st.balance -= cost
                mult = book["payoutMultiplier"] / 100
                rnd = {"roundID": book["id"], "amount": amount, "payout": int(round(mult * amount)),
                       "payoutMultiplier": mult, "active": mult > 0, "mode": mode, "state": book["events"]}
                st.round, st.event = (rnd if mult > 0 else None), None
                print(f"  {mode.lower()} book {book['id']}  payout {mult}x  force={force}", flush=True)
                return self.send_json(200, {"balance": bal(), "round": rnd})
            if path == "/wallet/end-round":
                if st.round:
                    st.balance += st.round["payout"]
                    st.round = None
                return self.send_json(200, {"balance": bal()})
            if path == "/wallet/balance":
                return self.send_json(200, {"balance": bal()})
            if path == "/bet/event":
                st.event = body.get("event")
                return self.send_json(200, {"event": st.event})
        self.send_json(404, {"error": "ERR_VAL", "message": "unknown endpoint"})


def main():
    global WEB, PUBLISH
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--books", type=int, default=20000, help="books used for normal play")
    ap.add_argument("--scan", type=int, default=200000, help="books scanned for forced examples")
    ap.add_argument("--balance", type=float, default=1000)
    ap.add_argument("--currency", default="EUR")
    ap.add_argument("--web", default=WEB, help="frontend folder to serve (index.html at its root)")
    ap.add_argument("--publish", default=PUBLISH, help="math publish_files folder (index.json, books, lookup tables)")
    ap.add_argument("--game", default="ghost_duels", help="game id, only used in the printed replay link")
    args = ap.parse_args()
    WEB, PUBLISH = os.path.abspath(args.web), os.path.abspath(args.publish)
    # claim the port before the slow book loading, so a clash is reported right away
    try:
        server = Server(("127.0.0.1", args.port), Handler)
    except OSError:
        sys.exit(f"Port {args.port} is already in use, probably by an older mock_rgs.py. Stop it first, or use --port.")
    Handler.state = State(args)
    host = f"127.0.0.1:{args.port}"
    print(f"\nPlay:   http://{host}/?sessionID=local&lang=en&rgs_url=http://{host}")
    print(f"Bonus:  http://{host}/?sessionID=local&lang=en&rgs_url=http://{host}/force/bonus")
    print(f"Replay: http://{host}/?replay=true&game={args.game}&version=1&mode=base&event=<book id>&amount=1000000&rgs_url=http://{host}")
    print("        (mode=bonus replays a bonus buy round)\n")
    server.serve_forever()


class Server(ThreadingHTTPServer):
    # The default backlog of 5 is too small: a browser loading a board opens many image requests at once,
    # and on Windows the overflow is refused, which shows up as broken symbol images.
    request_queue_size = 128
    daemon_threads = True
    # Python's default reuse lets a second server on Windows share the port with an old one, which then answers
    # some requests with outdated code. Without it, starting a second server fails instead.
    allow_reuse_address = False


if __name__ == "__main__":
    main()
