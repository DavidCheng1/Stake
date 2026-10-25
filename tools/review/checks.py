"""Automated checks for Stake Engine's review guidelines (engine-review-prompt.md), run against the local mock RGS.

Each check records (guideline id, title, verdict, evidence). Verdicts: PASS, FAIL, AT RISK, NEEDS A HUMAN.
Checks are grouped; run_review.py runs all groups or the ones named on the command line.
"""

import glob
import json
import os
import re
from contextlib import contextmanager

from cdp import Browser

API = 1_000_000


class Review:
    def __init__(self, profile, root, host, out):
        self.p, self.root, self.host, self.out = profile, root, host, out
        self.sel = profile["sel"]
        self.results = []
        self.modes = self._mode_stats()

    # ---- results
    def add(self, gid, title, ok, evidence):
        verdict = ok if isinstance(ok, str) else ("PASS" if ok else "FAIL")
        self.results.append({"id": str(gid), "title": title, "verdict": verdict, "evidence": str(evidence)[:600]})
        print(f"  [{gid}] {verdict:13} {title} :: {str(evidence)[:220]}", flush=True)

    # ---- math facts from the published files (weights from the optimizer are respected)
    def _mode_stats(self):
        pub = os.path.join(self.root, self.p["publish"])
        idx = json.load(open(os.path.join(pub, "index.json"), encoding="utf-8"))
        out = {}
        for m in idx["modes"]:
            tw = tp = mx = 0
            first = None
            for line in open(os.path.join(pub, m["weights"]), encoding="utf-8"):
                i, w, p = (int(x) for x in line.split(","))
                tw += w
                tp += w * p
                if w:
                    mx = max(mx, p)
                    first = first if first is not None else i
            out[m["name"]] = {"cost": m["cost"], "rtp": tp / tw / 100 / m["cost"] * 100, "max": mx / 100, "first": first}
        return out

    # ---- browser helpers
    def url(self, force="", **params):
        q = {"sessionID": "local", "lang": "en", "currency": "EUR", "device": "desktop", "social": "false"}
        q.update(params)
        rgs = q.pop("rgs_url", f"{self.host}{'/force/' + force if force else ''}")
        return f"{self.host}/?" + "&".join(f"{k}={v}" for k, v in q.items()) + f"&rgs_url={rgs}"

    @contextmanager
    def browser(self, name, w=1280, h=800, mobile=False):
        b = Browser(os.path.join(self.out, name))
        try:
            b.viewport(w, h, mobile)
            yield b
        finally:
            b.close()

    def start(self, b, url, touch=False):
        """Open the game, dismiss the intro with a real click (which also starts audio) and wait until it is ready."""
        b.open(url, 3)
        if self.p.get("dismissIntro"):
            b.wait_for(f"!!document.querySelector({json.dumps(self.p['dismissIntro'])})", 8)
            b.click(self.p["dismissIntro"], touch)
        return b.wait_for(self.p["ready"], 25)

    def spin(self, b, touch=False):
        n = len(b.plays())
        b.click(self.sel["spin"], touch)
        b.pump(1)
        b.wait_for(f"!({self.p['busy']})", 300)
        return len(b.plays()) - n

    def text(self, b, sel):
        return b.ev(f"(document.querySelector({json.dumps(sel)}) || {{}}).textContent") or ""

    def all_text(self, b):
        """Visible text of the page plus every menu, dialog and accessible name."""
        s = self.sel
        texts = [b.ev("document.body.innerText")]
        for opener, closer in ((s["info"], s["rulesClose"]), (s["buy"], s["buyClose"]), (s["autoplay"], s["autoClose"]), (s["sound"], s["soundClose"])):
            if b.ev(f"!!document.querySelector({json.dumps(opener)}) && !document.querySelector({json.dumps(opener)}).hidden"):
                b.ev(f"document.querySelector({json.dumps(opener)}).click()")
                b.pump(0.8)
                texts.append(b.ev("document.body.innerText"))
                b.ev(f"document.querySelector({json.dumps(closer)})?.click()")
                b.pump(0.4)
        texts.append(b.ev("[...document.querySelectorAll('[aria-label],[title],[alt]')].map(e => [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('alt')].filter(Boolean).join(' ')).join(' | ')"))
        texts.append(b.ev("document.title"))
        return "\n".join(t or "" for t in texts)


CHECKS = []


def group(name):
    def deco(fn):
        CHECKS.append((name, fn))
        return fn
    return deco


num = lambda t: float(re.sub(r"[^\d.\-]", "", t.replace(",", "")) or "nan")


# ---------------------------------------------------------------- RGS requests and betting
@group("basic")
def basic(r):
    with r.browser("basic") as b:
        r.start(b, r.url("win"))
        auth = [x for x in b.requests if x[0] == "/wallet/authenticate"]
        r.add(181, "Authenticates with the RGS on launch", bool(auth) and (auth[0][1] or {}).get("sessionID") == "local", f"requests: {b.paths()[:3]}")
        r.spin(b)
        p = b.plays()
        r.add(183, "Bet sends a successful play request", len(p) == 1 and str(p[0].get("mode", "")).upper() == "BASE" and p[0].get("sessionID") == "local",
              f"play body {p[:1]}; win shown {r.text(b, r.sel['win'])!r}")
        n = len(b.plays())
        b.key()
        b.pump(1)
        b.wait_for(f"!({r.p['busy']})", 300)
        r.add(228, "Space bar places a bet", len(b.plays()) == n + 1, f"plays before {n}, after {len(b.plays())}")
        r.add("228b", "Space does not scroll the page", b.ev("window.scrollY") == 0, f"scrollY {b.ev('window.scrollY')}")
        r.add("console", "No console errors during basic play", not b.errors, b.errors[:3] or "none")


@group("invalid")
def invalid(r):
    with r.browser("invalid") as b:
        b.open(r.url(rgs_url="example.com"), 8)
        if r.p.get("dismissIntro"):
            b.click(r.p["dismissIntro"])
        b.pump(2)
        err = b.ev(f"(() => {{ const d = document.querySelector({json.dumps(r.sel['error'])}); return d && !d.hidden ? document.querySelector({json.dumps(r.sel['errorText'])}).textContent : null; }})()")
        r.add(274, "Fails correctly with an invalid rgs_url", bool(err), f"error shown: {err!r}")


@group("bets")
def bets(r):
    lv = [1_000_000, 1_250_000, 1_500_000, 2_000_000]
    with r.browser("bets") as b:
        b.rewrite["/wallet/authenticate"] = lambda d: (d["config"].update(betLevels=lv, minBet=lv[0], maxBet=lv[-1], stepBet=250_000, defaultBetLevel=1_500_000), d)[1]
        r.start(b, r.url("lose"))
        start = r.text(b, r.sel["bet"])
        seen = [start]
        for _ in range(4):
            b.click(r.sel["betMinus"]); b.pump(0.2); seen.append(r.text(b, r.sel["bet"]))
        low = b.ev(f"document.querySelector({json.dumps(r.sel['betMinus'])}).disabled")
        for _ in range(6):
            b.click(r.sel["betPlus"]); b.pump(0.2); seen.append(r.text(b, r.sel["bet"]))
        high = b.ev(f"document.querySelector({json.dumps(r.sel['betPlus'])}).disabled")
        r.spin(b)
        sent = b.plays()[-1]["amount"] if b.plays() else None
        vals = sorted({num(x) for x in seen})
        r.add(242, "Uses every bet parameter from authenticate",
              num(start) == 1.5 and vals == [1.0, 1.25, 1.5, 2.0] and low and high and sent == 2_000_000,
              f"opened on {start}; stepped through {vals}; ends disabled {low}/{high}; bet sent {sent}")
    with r.browser("bets2") as b:
        b.rewrite["/wallet/authenticate"] = lambda d: (d["config"].update(betLevels=[500_000, 1_000_000, 1_100_000, 2_000_000, 3_000_000], minBet=1_000_000, maxBet=2_000_000, stepBet=500_000, defaultBetLevel=1_000_000), d)[1]
        r.start(b, r.url("lose"))
        offered = b.ev(f"JSON.stringify({r.p.get('betLevelsVar', 'BETS')})")
        r.add("242b", "Levels outside minBet/maxBet/stepBet are not offered", offered == "[1,2]", f"0.5,1,1.1,2,3 with min 1, max 2, step 0.5 -> {offered}")


@group("resume")
def resume(r):
    with r.browser("resume1") as b:
        b.block.add("/wallet/end-round")
        r.start(b, r.url("win"))
        for _ in range(3):
            b.click(r.sel["betPlus"]); b.pump(0.2)
        chosen = r.text(b, r.sel["bet"])
        r.spin(b)
        sent = b.plays()[-1]["amount"] if b.plays() else None
    with r.browser("resume2") as b:
        r.start(b, r.url("lose"))
        b.wait_for(f"!({r.p['busy']})", 300)
        after = r.text(b, r.sel["bet"])
        ended = "/wallet/end-round" in b.paths()
        r.spin(b)
        nxt = b.plays()[-1]["amount"] if b.plays() else None
        r.add(187, "An active round restores its bet amount", after == chosen and nxt == sent and ended,
              f"bet {chosen} ({sent}); reload resumed and closed the round: {ended}; bet shown {after}; next bet {nxt}")


@group("zero")
def zero(r):
    with r.browser("zero") as b:
        r.start(b, r.url("lose"))
        b.requests.clear()
        r.spin(b)
        r.spin(b)
        seq = [p for p in b.paths() if p.startswith("/wallet/")]
        r.add(221, "Zero-win rounds send no end-round", seq == ["/wallet/play", "/wallet/play"], f"requests: {seq}")


@group("broke")
def broke(r):
    with r.browser("broke") as b:
        def zero_balance(path, d):
            if isinstance(d, dict) and isinstance(d.get("balance"), dict):
                d["balance"]["amount"] = 0
            return d
        b.rewrite_any = zero_balance
        r.start(b, r.url("win"))
        b.requests.clear()
        b.click(r.sel["spin"]); b.pump(1)
        msg = r.text(b, r.sel["message"])
        b.key(); b.pump(1)
        b.ev(f"document.querySelector({json.dumps(r.sel['autoplay'])})?.click(); document.querySelector({json.dumps(r.sel['autoPick'])})?.click(); document.querySelector({json.dumps(r.sel['autoStart'])})?.click()")
        b.pump(2)
        for t in r.sel.get("toggles", []):
            b.ev(f"document.querySelector({json.dumps(t)})?.click()"); b.pump(0.3)
            b.click(r.sel["spin"]); b.pump(1)
        b.ev(f"document.querySelector({json.dumps(r.sel['buy'])})?.click()"); b.pump(1)
        disabled = b.ev(f"[...document.querySelectorAll({json.dumps(r.sel['buyOptions'])})].filter(x => !x.closest('[hidden]')).every(x => x.disabled || /close/i.test(x.id))")
        b.ev(f"[...document.querySelectorAll({json.dumps(r.sel['buyOptions'])})].forEach(x => x.click())"); b.pump(1)
        r.add(222, "Insufficient balance sends no play request (spin, space, autoplay, toggles, buys)",
              not b.plays() and bool(msg) and disabled, f"message {msg!r}; buy options disabled {disabled}; play requests {len(b.plays())}")


@group("confirm")
def confirm(r):
    with r.browser("confirm") as b:
        b.block.add("/wallet/play")
        r.start(b, r.url("lose"))
        b.requests.clear()
        b.click(r.sel["autoplay"]); b.pump(1.2)
        menu = b.ev(f"!document.querySelector({json.dumps(r.sel['autoMenu'])}).hidden")
        n_auto = len(b.plays())
        b.ev(f"document.querySelector({json.dumps(r.sel['autoClose'])}).click()"); b.pump(0.5)
        r.add(104, "Autoplay needs a confirmation step", menu and n_auto == 0, f"one press opened the menu: {menu}; play requests {n_auto}")
        b.click(r.sel["buy"]); b.pump(1.2)
        dlg = b.ev(f"!document.querySelector({json.dumps(r.sel['buyDialog'])}).hidden")
        cards = b.ev(f"[...document.querySelectorAll({json.dumps(r.sel['buyCards'])})].map(x => x.innerText.replace(/\\s+/g, ' ').trim())") or []
        b.shot("buy_dialog.png")
        b.ev(f"document.querySelector({json.dumps(r.sel['buyClose'])})?.click()"); b.pump(0.4)
        toggles = []
        for t in r.sel.get("toggles", []):
            b.click(t); b.pump(0.5)
            toggles.append(b.ev(f"document.querySelector({json.dumps(t)}).innerText.replace(/\\s+/g, ' ')"))
            b.click(t); b.pump(0.3)
        costed = all("€" in c for c in cards) and all("€" in t for t in toggles)
        r.add(31, "High-cost modes need a confirmation or a switch that shows the cost", dlg and not b.plays() and costed,
              f"buy dialog opened: {dlg}; play requests {len(b.plays())}; options {cards}; switches {toggles}")


# ---------------------------------------------------------------- currencies, social, language
def _currency_rewrite(code, levels=None, whole=False):
    def fn(path, d):
        if isinstance(d, dict) and isinstance(d.get("balance"), dict):
            d["balance"]["currency"] = code
            if whole:
                d["balance"]["amount"] = round(d["balance"]["amount"] / API) * API
        if path == "/wallet/authenticate" and levels:
            d["config"].update(betLevels=levels, minBet=levels[0], maxBet=levels[-1], stepBet=levels[0], defaultBetLevel=levels[1])
        return d
    return fn


@group("currency")
def currency(r):
    pats = {"USD": r"^\$[\d,]+\.\d\d$", "EUR": r"^€[\d,]+\.\d\d$", "CAD": r"^CA\$[\d,]+\.\d\d$", "MXN": r"^MX\$[\d,]+\.\d\d$", "JPY": r"^¥[\d,]+$"}
    for code, pat in pats.items():
        with r.browser("currency_" + code) as b:
            jpy = code == "JPY"
            b.rewrite_any = _currency_rewrite(code, [10 * API, 20 * API, 50 * API, 100 * API] if jpy else None, whole=jpy)
            r.start(b, r.url("win", currency=code))
            r.spin(b)
            bal, bet, win = (r.text(b, r.sel[k]) for k in ("balance", "bet", "win"))
            clip = b.ev(f"[{json.dumps(r.sel['balance'])}, {json.dumps(r.sel['win'])}].map(s => document.querySelector(s)).some(e => e.scrollWidth > e.clientWidth + 1)")
            ok = bool(re.match(pat, bal)) and bool(re.match(pat, win)) and (not jpy or "." not in bet) and not clip
            b.shot("dashboard.png")
            r.add(219, f"Currency {code} shows correctly", ok, f"balance {bal!r}, bet {bet!r}, win {win!r}, clipped {clip}")
    with r.browser("subcent") as b:
        r.start(b, r.url())
        shown = b.ev("typeof RGS !== 'undefined' ? [RGS.formatMoney(0.005), RGS.formatMoney(0.0375), RGS.formatMoney(1.5)] : null")
        r.add(273, "Sub-cent payouts keep their digits", shown == ["€0.005", "€0.0375", "€1.50"] if shown else "NEEDS A HUMAN", f"0.005 / 0.0375 / 1.5 -> {shown}")


RESTRICTED = ["at the cost of", "be awarded to player's accounts", "bet", "bets", "betting", "bonus buy", "bought", "buy", "buy bonus", "cash",
              "cost of", "credit", "currency", "deposit", "fund", "gamble", "money", "paid", "paid out", "pay", "pay out", "payer", "pays",
              "pays out", "place your bets", "purchase", "rebet", "stake", "total bet", "wager", "win feature", "withdraw", "paytable", "pay table"]


def restricted_in(text):
    low = text.lower()
    return sorted({w for w in RESTRICTED if re.search(r"(?<![a-z])" + re.escape(w) + r"(?![a-z])", low)})


@group("social")
def social(r):
    for code in ("XSC", "XGC"):
        with r.browser("social_" + code) as b:
            b.rewrite_any = _currency_rewrite(code)
            r.start(b, r.url("win", currency=code, social="true"))
            r.spin(b)
            bal = r.text(b, r.sel["balance"])
            text = r.all_text(b)
            words = restricted_in(text)
            r.add(78, f"Social {code}: amounts in {code[1:]}, no $", bal.endswith(" " + code[1:]) and "$" not in text, f"balance {bal!r}; '$' present: {'$' in text}")
            r.add(77, f"Social {code}: no restricted words anywhere", not words, f"found: {words}")
            names = " ".join(b.ev(f"[...document.querySelectorAll({json.dumps(r.sel['buyCards'])})].map(x => x.innerText)") or [])
            r.add(225, f"Social {code}: mode names use social wording", not restricted_in(names), f"found in mode names: {restricted_in(names)}")
    mode = r.p.get("replayMode", "base")
    with r.browser("social_replay") as b:
        b.open(f"{r.host}/?replay=true&game={r.p['game']}&version=1&mode={mode}&event={r.modes[mode]['first']}&amount={API}&currency=XSC&lang=en&social=true&rgs_url={r.host}", 2)
        b.wait_for(f"!!document.querySelector({json.dumps(r.sel['replayGo'])})?.offsetParent", 30)
        t1 = b.ev("document.body.innerText") or ""
        b.ev(f"document.querySelector({json.dumps(r.sel['replayGo'])})?.click()")
        b.pump(1)
        b.wait_for(f"!({r.p['busy']}) || !!document.querySelector({json.dumps(r.sel['replayGo'])})?.offsetParent", 300)
        words = restricted_in(t1 + "\n" + (b.ev("document.body.innerText") or ""))
        r.add(188, "Social replay: no restricted words", not words, f"found: {words}")


@group("lang")
def lang(r):
    for code in ("en", "zz"):
        with r.browser("lang_" + code) as b:
            r.start(b, r.url("win", lang=code))
            r.spin(b)
            text = r.all_text(b)
            bad = re.findall(r"undefined|NaN|\{[a-zA-Z_]+\}|\b[a-z]+\.[a-z_]+\.[a-z_]+\b", text)
            german = re.findall(r"\b(Einsatz|Gewinn|Guthaben|Freispiele|Drück|Walze|Kisten|Spielregeln)\b", text)
            r.add(239 if code == "en" else 240, f"lang={code}: English, no keys or undefined", not bad and not german, f"bad {bad[:5]}, German {german[:5]}")


# ---------------------------------------------------------------- rules vs math
@group("rules")
def rules(r):
    with r.browser("rules") as b:
        r.start(b, r.url())
        b.ev(f"document.querySelector({json.dumps(r.sel['info'])}).click()")
        b.pump(1.2)
        text = b.ev(f"document.querySelector({json.dumps(r.sel['rules'])}).innerText") or ""
        with open(os.path.join(r.out, "rules.txt"), "w", encoding="utf-8") as f:
            f.write(text)
        fmt = lambda x, d: f"{x:,.{d}f}"
        rows = []
        for name, m in r.modes.items():
            rows.append((name, round(m["rtp"], 2), m["max"], fmt(m["rtp"], 2) in text, fmt(m["max"], 0) in text))
        r.add(25, "RTP and max win stated per mode, matching the published math", all(x[3] and x[4] for x in rows),
              "; ".join(f"{n} {rtp}% {'ok' if a else 'MISSING'} / {mx:,.0f}x {'ok' if bb else 'MISSING'}" for n, rtp, mx, a, bb in rows))
        costs = [(n, m["cost"], f"{m['cost']:g}×" in text) for n, m in r.modes.items() if n != "base"]
        r.add(27, "Every mode has a description and its cost", all(c[2] for c in costs), "; ".join(f"{n} {c:g}× {'ok' if ok else 'MISSING'}" for n, c, ok in costs))
        for gid, title in (("24", "Every symbol's payout is shown"), ("26", "Win combinations are explained"), ("29", "Free games and re-triggers are explained")):
            need = r.p.get("rulesMustContain", {}).get(gid, [])
            missing = [w for w in need if w.lower() not in text.lower()]
            r.add(gid, title, not missing if need else "NEEDS A HUMAN", f"missing: {missing}" if need else "no expectations in the game profile")
        visible = b.ev("""[...document.querySelectorAll('button')].filter(x => x.offsetParent && x.id && !x.closest('[role=dialog], dialog, #rules, #buyDlg, #autoMenu, #sndMenu, #replayDlg, #errDlg, #intro')).map(x => x.id)""") or []
        controls = r.p.get("controls", {})
        unknown = [i for i in visible if i not in controls]
        missing = [i for i in visible if i in controls and controls[i].lower() not in text.lower()]
        r.add(235, "Every control is explained in the rules", not unknown and not missing, f"visible controls {visible}; not in the profile {unknown}; not explained {missing}")
        disc = ["malfunction voids", "internet connection", "reload", "expected return", "illustrative", "remote game server"]
        r.add(185, "General disclaimer is present", all(d in text.lower() for d in disc), {d: d in text.lower() for d in disc})


# ---------------------------------------------------------------- replay
@group("replay")
def replay(r):
    mode = r.p.get("replayMode", "base")
    m = r.modes[mode]
    for (w, h), name in (((1280, 720), "replay"), ((400, 225), "replay_small")):
        with r.browser(name, w, h) as b:
            b.open(f"{r.host}/?replay=true&game={r.p['game']}&version=1&mode={mode}&event={m['first']}&amount={5 * API}&currency=EUR&lang=en&rgs_url={r.host}", 2)
            b.wait_for(f"!!document.querySelector({json.dumps(r.sel['replayGo'])})?.offsetParent", 30)  # the round loads first
            panel = r.text(b, r.sel["replayInfo"])
            go_ok = b.ev(f"(() => {{ const e = document.querySelector({json.dumps(r.sel['replayGo'])}); if (!e) return false; const k = e.getBoundingClientRect(); return k.width > 0 && k.bottom <= innerHeight && k.right <= innerWidth; }})()")
            b.ev(f"document.querySelector({json.dumps(r.sel['replayGo'])}).click()")
            b.pump(1)
            b.wait_for(f"!({r.p['busy']}) || (document.querySelector({json.dumps(r.sel['replayGo'])})?.offsetParent && document.querySelector({json.dumps(r.sel['spin'])}).disabled)", 300)
            b.pump(1)
            again = r.text(b, r.sel["replayGo"])
            wallet = [p for p in b.paths() if p.startswith("/wallet/")]
            ids = [r.sel[k] for k in ("spin", "betPlus", "betMinus", "buy", "autoplay")] + r.sel.get("toggles", [])
            off = b.ev(f"{json.dumps(ids)}.every(s => {{ const e = document.querySelector(s); return !e || e.disabled || e.hidden || !e.offsetParent; }})")
            b.shot("end.png")
            if name == "replay":
                real = f"€{5 * m['cost']:,.2f}"
                r.add(171, "Replay loads and plays with no wallet calls and no way into play", not wallet and off and bool(panel), f"wallet calls {wallet}; betting controls off {off}")
                r.add(172, "Replay applies amount, currency and language", "€5.00" in panel, f"panel {panel!r}")
                r.add(173, "Replay can be watched again", "again" in again.lower(), f"button after the round {again!r}")
                r.add(174, "Replay shows bet, multiplier and real cost", "€5.00" in panel and (m["cost"] == 1 or (f"{m['cost']:g}" in panel and real in panel)), f"expected {real}; panel {panel!r}")
            else:
                r.add(243, "Replay works at popout S (400×225)", go_ok and "again" in again.lower(), f"play button on screen {go_ok}; after {again!r}")


# ---------------------------------------------------------------- layouts
@group("sizes")
def sizes(r):
    for w, h, mobile, gid in ((1024, 576, False, 193), (400, 225, False, 195), (800, 450, False, 195), (425, 812, True, 194)):
        with r.browser(f"size_{w}x{h}", w, h, mobile) as b:
            r.start(b, r.url("win", device="mobile" if mobile else "desktop"), touch=mobile)
            played = r.spin(b, touch=mobile)
            b.shot("after_bet.png")
            m = b.ev("({sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight})")
            off = b.ev("""[...document.querySelectorAll('button')].filter(x => x.offsetParent && !x.closest('[role=dialog], dialog, #rules, #buyDlg, #autoMenu, #sndMenu, #replayDlg, #errDlg, #intro'))
                .filter(x => { const k = x.getBoundingClientRect(); return k.width < 1 || k.left < -1 || k.top < -1 || k.right > innerWidth + 1 || k.bottom > innerHeight + 1; }).map(x => x.id)""")
            ok = m["sw"] <= m["iw"] and m["sh"] <= m["ih"] and not off and played == 1
            r.add(gid, f"{w}×{h}{' touch' if mobile else ''}: no scroll, controls on screen, a bet works", ok, f"{m}; off screen {off}; plays {played}")
            if w == 1024:
                r.add(227, "Main frame does not scroll", m["sw"] <= m["iw"] and m["sh"] <= m["ih"], m)


# ---------------------------------------------------------------- static checks on the frontend files
@group("static")
def static(r):
    web = os.path.join(r.root, r.p["web"])
    files = [f for f in glob.glob(os.path.join(web, "**", "*"), recursive=True) if f.endswith((".html", ".js", ".css"))]
    src = {f: open(f, encoding="utf-8", errors="ignore").read() for f in files}
    strip = lambda s: re.sub(r"/\*.*?\*/", "", re.sub(r"(?m)^\s*//.*$|\s//\s.*$", "", s), flags=re.S)
    html = src.get(os.path.join(web, "index.html"), "")
    vp = re.search(r'<meta name="viewport"[^>]*>', html)
    r.add(223, "Double-tap zoom is disabled", bool(vp and ("user-scalable=no" in vp.group(0) or "maximum-scale=1" in vp.group(0))), vp.group(0) if vp else "no viewport meta")
    ext = []
    for f, s in src.items():
        for m in re.finditer(r"""(?:src|href)\s*=\s*["'](https?://[^"']+)|url\(\s*["']?(https?://[^)"']+)|(?:fetch|import)\s*\(\s*["'](https?://[^"']+)""", strip(s)):
            ext.append(f"{os.path.relpath(f, web)}: {next(g for g in m.groups() if g)}")
    r.add("static", "Nothing is loaded from external hosts", not ext, ext[:5] or "none")
    hits = [os.path.relpath(f, web) for f, s in src.items() if re.search(r"powered by stake|engine-loader|engineloader|stake engine loader", strip(s), re.I)]
    r.add(275, "No Stake Engine loader", not hits, hits or "none")
    title = (re.search(r"<title>(.*?)</title>", html) or [None, ""])[1]
    bad = [t for t in ("megaways", "xways", "enhanced", "boosted", "rtp", "gates of", "bonanza", "olympus", "rush", "kraken", "waylanders") if t in (title + " " + r.p.get("title", "")).lower()]
    r.add(213, "Title avoids restricted terms", not bad, f"title {title!r}; found {bad}")
    js = "\n".join(strip(s) for f, s in src.items() if f.endswith(".js"))
    dest = len(re.findall(r"\.destination\b", js))
    other = len(re.findall(r"new Audio\(|<audio", js + html))
    r.add(107, "All sound goes through one output (mute covers everything)", "PASS" if dest == 1 and not other else "NEEDS A HUMAN",
          f"AudioContext outputs {dest}, <audio>/new Audio {other}; listen once with mute on")
    r.add(217, "No offensive content, no child-like characters", "NEEDS A HUMAN", "look at every symbol and character; Stake forbids child-like characters in a gambling context")
    r.add(253, "Distinct from existing titles", "NEEDS A HUMAN", "title, logo, characters, theme and mechanic must not closely resemble a live game")
