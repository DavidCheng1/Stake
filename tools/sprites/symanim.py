"""Idle and win animations for the Ghost Duels symbols, from Gemini Omni clips: the symbol's own picture is the first
frame (image_to_video), on a flat backdrop that is keyed away frame by frame; the frames become sprite sheets the game
plays on a canvas over the symbol (symAnim in game.js).

    math-sdk\\env\\Scripts\\python.exe tools\\sprites\\symanim.py start [id ...]
    math-sdk\\env\\Scripts\\python.exe tools\\sprites\\symanim.py gen [id ...] [--kind idle|win] [--yes]
    math-sdk\\env\\Scripts\\python.exe tools\\sprites\\symanim.py build [id ...] [--take idle=N] [--take win=N]

start  the first frame: the symbol (ghost-duels-web/assets/<id>.webp) scaled to SYM_PX and centred on a 720x1280 frame
       of its backdrop (green or magenta, symanim.json), in imagegen-out/anim-<id>/start.png.
gen    one 3 s clip per kind with tools/imagegen/gen.py video (about $0.21 each), into imagegen-out/anim-<id>-<kind>/.
       One request at a time: parallel ones failed.
build  keys the backdrop out of every frame (the colour is unmixed, so soft glows keep their own colour instead of
       taking on the backdrop's), crops a square around the symbol with the margin the motion needs, and writes
       ghost-duels-web/assets/sym-anim/<id>-<kind>.webp (a sheet, frames left to right, top to bottom, with a 2 px
       clear gutter), the timing in assets/sym-anim/anim.json, and a preview in imagegen-out/anim-<id>/preview.png.
       Takes the newest take of each kind unless --take names one.

The win plays the first WIN_S seconds of its clip, every second frame, at 24 fps (so twice as fast); the idle plays
its whole clip at IDLE_FPS from every 24/IDLE_FPS-th frame.

Needs numpy, Pillow and OpenCV (math-sdk's environment) and, for gen, the GEMINI_API_KEY like gen.py.
"""

import json
import os
import subprocess
import sys
import time

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "symanim.json")
WEB = os.path.join(ROOT, "ghost-duels-web")
OUT = os.path.join(WEB, "assets", "sym-anim")
TAKES = os.path.join(ROOT, "imagegen-out")
PY = sys.executable
FW, FH, SYM_PX = 720, 1280, 560  # the clip frame and the symbol's size in it
BGS = {"green": (0, 255, 0), "magenta": (255, 0, 255)}
BOX = 128  # px of the symbol's square in the sheets (the cell's symbol box)
PAD_CAP = {"idle": .2, "win": .45}  # most margin around the symbol, per side, as a share of its box
WIN_S, IDLE_FPS = 2.5, 12
NAMES = {"green": "green", "magenta": "magenta"}


def spec():
    with open(SPEC, encoding="utf-8") as f:
        return json.load(f)["symbols"]


def start(ids):
    S = spec()
    for i in ids:
        bg = BGS[S[i]["bg"]]
        sym = Image.open(os.path.join(WEB, "assets", f"{i}.webp")).convert("RGBA")
        k = SYM_PX / max(sym.size)
        sym = sym.resize((round(sym.width * k), round(sym.height * k)), Image.LANCZOS)
        frame = Image.new("RGBA", (FW, FH), bg + (255,))
        frame.alpha_composite(sym, ((FW - sym.width) // 2, (FH - sym.height) // 2))
        d = os.path.join(TAKES, f"anim-{i}")
        os.makedirs(d, exist_ok=True)
        frame.convert("RGB").save(os.path.join(d, "start.png"))
        print(os.path.join(d, "start.png"))


def prompt(i, kind):
    s = spec()[i]
    bg = NAMES[s["bg"]]
    tail = ("Subtle and alive. It ends exactly as it starts, so it can loop." if kind == "idle" else
            "A winning moment: exciting and powerful, ending at its brightest. The effects stay close around the symbol.")
    return (f"Animate this slot-game symbol ({s['what']}, exactly as drawn, same style, same size and place) on its "
            f"flat, pure {bg} background, static camera, 3 seconds. {s[kind]} {tail} The background stays perfectly "
            f"flat pure {bg} the whole time, no other objects, no text.")


def gen(ids, kinds, yes):
    for i in ids:
        st = os.path.join(TAKES, f"anim-{i}", "start.png")
        if not os.path.exists(st):
            start([i])
        for kind in kinds:
            cmd = [PY, os.path.join(ROOT, "tools", "imagegen", "gen.py"), "video", f"anim-{i}-{kind}", prompt(i, kind),
                   "--ref", st, "--duration", "3", "--task", "image_to_video"] + (["--yes"] if yes else [])
            d = os.path.join(TAKES, f"anim-{i}-{kind}")
            count = lambda: len([f for f in os.listdir(d) if f.endswith(".mp4")]) if os.path.isdir(d) else 0
            before = count()
            # the video model answers RESOURCE_EXHAUSTED when asked too often: a pause after every clip, and a
            # longer one before trying a failed clip again
            for attempt in range(4):
                print(f"== {i} {kind}" + (f" (try {attempt + 1})" if attempt else ""), flush=True)
                subprocess.run(cmd, cwd=ROOT)
                if count() > before:
                    break
                time.sleep(120 * (attempt + 1))
            time.sleep(45)


def frames(path):
    import cv2  # only reading clips needs OpenCV; settle works without it
    c = cv2.VideoCapture(path)
    out = []
    while True:
        ok, f = c.read()
        if not ok:
            break
        out.append(cv2.cvtColor(f, cv2.COLOR_BGR2RGB).astype(np.float32))
    return out


def key(rgb, warm=False):
    """Alpha from how far a pixel leans to the backdrop colour, the colour unmixed from it: C = a F + (1 - a) B.
    The backdrop (green or magenta) is read off the frame's edge, so takes on either key right. warm: the symbol is
    gold (red >= green >= blue everywhere), so each pixel is given the gold hue, and the faint
    halo a flash casts on the backdrop thins out."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    edge = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3), rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    B = np.median(edge, axis=0)  # this frame's backdrop, as filmed
    bg = "green" if B[1] > max(B[0], B[2]) else "magenta"
    lean = g - np.maximum(r, b) if bg == "green" else np.minimum(r, b) - g
    full = (B[1] - max(B[0], B[2])) if bg == "green" else (min(B[0], B[2]) - B[1])
    lo, hi = .22 * full, .86 * full  # leaning this little is the symbol's own colour; this much is backdrop
    a = np.clip((hi - lean) / (hi - lo), 0, 1)
    a[a < .04] = 0
    F = (rgb - (1 - a[..., None]) * B) / np.maximum(a[..., None], 1e-3)
    F = np.clip(F, 0, 255)
    # what is left of the backdrop at the soft edges: no channel may lean to it more than the rest of the pixel does
    soft = a < .98
    if bg == "green":
        F[..., 1] = np.where(soft, np.minimum(F[..., 1], np.maximum(F[..., 0], F[..., 2])), F[..., 1])
    else:
        m = np.minimum(F[..., 0], F[..., 2]) - F[..., 1]
        cut_ = np.where(soft, np.maximum(m, 0), 0)
        F[..., 0] -= cut_
        F[..., 2] -= cut_
    if warm:  # each pixel takes the gold hue, its brightness and saturation kept: pink or lime spill turns gold
        hi_, lo_ = F.max(axis=2), F.min(axis=2)
        off = (F[..., 1] > F[..., 0]) | (F[..., 2] > F[..., 1])  # only where the order is broken: gold and orange stay
        F = np.where(off[..., None], np.dstack([hi_, lo_ + .7 * (hi_ - lo_), lo_]), F)
        a = np.where(a < 1, a ** 1.6, a)  # and the faint halo of a flash thins out instead of veiling the frame
    F[a == 0] = 0
    return np.dstack([F, a * 255]).clip(0, 255).astype(np.uint8)


def newest(kind_dir):
    takes = sorted(f for f in os.listdir(kind_dir) if f.startswith("take-") and f.endswith(".mp4"))
    return takes[-1]


def build(ids, picks):
    S = spec()
    os.makedirs(OUT, exist_ok=True)
    meta_path = os.path.join(OUT, "anim.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
    for i in ids:
        sheets = {}
        for kind in ("idle", "win"):
            d = os.path.join(TAKES, f"anim-{i}-{kind}")
            if not os.path.isdir(d) or not any(f.endswith(".mp4") for f in os.listdir(d)):
                print(f"{i} {kind}: no clip yet")
                continue
            take = picks.get(kind)
            take = f"take-{int(take):02d}.mp4" if take else newest(d)
            fr = frames(os.path.join(d, take))
            if kind == "win":
                fr = fr[:int(WIN_S * 24) + 1:2]
            else:
                step = 24 / IDLE_FPS
                fr = [fr[int(round(k * step))] for k in range(int(len(fr) / step))]
            rgba = [key(f, S[i].get("warm", False)) for f in fr]
            # the symbol's box in the clip, and the margin the motion reaches out to (the same on every side, so the
            # game can lay the canvas out round the symbol evenly)
            x0, y0 = (FW - SYM_PX) / 2, (FH - SYM_PX) / 2
            al = np.max([f[..., 3] for f in rgba], axis=0) > 20
            ys, xs = np.nonzero(al)
            reach = max(x0 - xs.min(), xs.max() - (x0 + SYM_PX), y0 - ys.min(), ys.max() - (y0 + SYM_PX), 0) / SYM_PX
            pad = min(PAD_CAP[kind], np.ceil(reach * 20) / 20)
            side = SYM_PX * (1 + 2 * pad)
            fpx = round(BOX * (1 + 2 * pad))
            crops = []
            for f in rgba:
                im = Image.fromarray(f, "RGBA")
                big = Image.new("RGBA", (FW + 2 * SYM_PX, FH + 2 * SYM_PX), (0, 0, 0, 0))  # room past the frame's edges
                big.paste(im, (SYM_PX, SYM_PX))
                l, t = SYM_PX + x0 - pad * SYM_PX, SYM_PX + y0 - pad * SYM_PX
                c = big.crop((round(l), round(t), round(l + side), round(t + side))).resize((fpx, fpx), Image.LANCZOS)
                crops.append(c)
            # fade the margin's outer edge in, so nothing cut off by the cap ends in a hard line
            ramp = np.ones((fpx, fpx), np.float32)
            e = max(2, int(fpx * .06))
            lin = np.minimum(np.arange(fpx), np.arange(fpx)[::-1]) / e
            ramp = np.minimum(np.clip(lin, 0, 1)[None, :], np.clip(lin, 0, 1)[:, None])
            for k, c in enumerate(crops):
                a = np.asarray(c).copy()
                a[..., 3] = (a[..., 3] * ramp).astype(np.uint8)
                crops[k] = Image.fromarray(a, "RGBA")
            crops, h = settle_frames(crops, still_frame(i, fpx, pad), kind)
            n = len(crops)
            cols, dst = write_sheet(i, kind, crops)
            fps = 24 if kind == "win" else IDLE_FPS
            meta.setdefault(i, {})[kind] = {"n": n, "cols": cols, "px": fpx, "pad": round(float(pad), 3), "fps": fps, "settled": True}
            sheets[kind] = crops
            print(f"{i} {kind}: {take}, {n} frames, pad {pad:.2f}, {fpx}px, halo r{h[1]} x{h[2]:.1f}, "
                  f"{os.path.getsize(dst) // 1024} KB")
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=1, sort_keys=True)
        preview(i, sheets)


# ---------------------------------------------------------------- clean hand-over between the still and the clip
# The game shows the still symbol, swaps to the sheet, and swaps back. Any difference between the still and the
# sheet's first or last frame shows as a jump, and the clip's frames lack the colour halo painted into the still.
# So every frame gets the still's halo (fitted to it), the first frames blend out of the exact still, and an idle
# loop's last frames blend back into it. A win keeps its own end: the game holds that frame until the symbol bursts,
# or plays the win backwards to its first frame (the still) when the symbol stays.
SETTLE_IN = {"idle": 4, "win": 3}  # frames that blend from the still into the clip
SETTLE_OUT = {"idle": 6, "win": 0}  # frames that blend from the clip back into the still


def still_frame(i, fpx, pad):
    """The still symbol as the game shows it, on a sheet frame: its box in the middle, the margin round it."""
    box = round(fpx / (1 + 2 * pad))
    sym = Image.open(os.path.join(WEB, "assets", f"{i}.webp")).convert("RGBA").resize((box, box), Image.LANCZOS)
    c = Image.new("RGBA", (fpx, fpx), (0, 0, 0, 0))
    c.alpha_composite(sym, ((fpx - box) // 2, (fpx - box) // 2))
    return c


def _f(im):
    return np.asarray(im, np.float32) / 255


def _im(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8), "RGBA")


def _over(top, bottom):
    """Straight-alpha 'top over bottom'."""
    ta, ba = top[..., 3:], bottom[..., 3:]
    a = ta + ba * (1 - ta)
    rgb = (top[..., :3] * ta + bottom[..., :3] * ba * (1 - ta)) / np.maximum(a, 1e-6)
    return np.concatenate([rgb, a], -1)


def _halo(alpha, rgb, r, s):
    from PIL import ImageFilter
    b = _f(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)))
    h = np.zeros(alpha.shape + (4,), np.float32)
    h[..., :3] = rgb
    h[..., 3] = np.clip(b * s, 0, 1)
    return h


def fit_halo(still, first):
    """The halo painted into the still, as colour, blur radius and strength, fitted against the clip's first frame
    (the same picture without the halo)."""
    S, F = _f(still), _f(first)
    ring = (S[..., 3] > .04) & (F[..., 3] < .03)
    if ring.sum() < 20:
        return None
    w = S[..., 3][ring][:, None]
    rgb = (S[..., :3][ring] * w).sum(0) / w.sum()
    zone = (S[..., 3] > .02) | (F[..., 3] > .02)
    best = None
    for r in (2, 3, 4, 6, 8, 11, 14):
        for s in np.arange(.3, 2.01, .1):
            C = _over(F, _halo(F[..., 3], rgb, r, s))
            d = np.abs(C[..., :3] * C[..., 3:] - S[..., :3] * S[..., 3:]).sum(-1)[zone].mean() \
                + np.abs(C[..., 3] - S[..., 3])[zone].mean()
            if best is None or d < best[0]:
                best = (d, r, float(s))
    return rgb, best[1], best[2]


def _smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def _mix(a, b, w):
    """Blend a into b by w in premultiplied colour, so edges don't darken."""
    pa, pb = a[..., :3] * a[..., 3:], b[..., :3] * b[..., 3:]
    al = a[..., 3:] * (1 - w) + b[..., 3:] * w
    return np.concatenate([(pa * (1 - w) + pb * w) / np.maximum(al, 1e-6), al], -1)


def settle_frames(frames, still, kind):
    """Halo on every frame, first frames out of the still, (idle) last frames back into it. Returns the frames and
    the fitted halo (colour, radius, strength), or None for the halo when the still has none."""
    S = _f(still)
    h = fit_halo(still, frames[0])
    out = []
    for f in frames:
        F = _f(f)
        out.append(_over(F, _halo(F[..., 3], *h)) if h else F)
    n, k_in, k_out = len(out), SETTLE_IN[kind], SETTLE_OUT[kind]
    for k in range(n):
        w = 1.0
        if k < k_in:
            w = min(w, _smooth(k / k_in))
        if k_out and k >= n - k_out:
            w = min(w, _smooth((n - 1 - k) / k_out))
        if w < 1:
            out[k] = _mix(S, out[k], w)
    return [_im(f) for f in out], (h[0] if h else None, h[1] if h else 0, h[2] if h else 0)


def write_sheet(i, kind, crops):
    n = len(crops)
    fpx = crops[0].width
    cols = int(np.ceil(np.sqrt(n)))
    rows = int(np.ceil(n / cols))
    g = fpx + 2
    sheet = Image.new("RGBA", (cols * g, rows * g), (0, 0, 0, 0))
    for k, c in enumerate(crops):
        sheet.paste(c, ((k % cols) * g + 1, (k // cols) * g + 1))
    dst = os.path.join(OUT, f"{i}-{kind}.webp")
    sheet.save(dst, quality=72, method=6, alpha_quality=70)
    return cols, dst


def settle(ids):
    """Rework sheets already in the game (when their clips are not on this computer): halo, blend in and out."""
    meta_path = os.path.join(OUT, "anim.json")
    meta = json.load(open(meta_path, encoding="utf-8"))
    for i in ids:
        for kind, m in meta.get(i, {}).items():
            if m.get("settled"):
                print(f"{i} {kind}: already settled")
                continue
            sheet = Image.open(os.path.join(OUT, f"{i}-{kind}.webp")).convert("RGBA")
            g = m["px"] + 2
            crops = [sheet.crop(((k % m["cols"]) * g + 1, (k // m["cols"]) * g + 1,
                                 (k % m["cols"]) * g + 1 + m["px"], (k // m["cols"]) * g + 1 + m["px"])) for k in range(m["n"])]
            crops, h = settle_frames(crops, still_frame(i, m["px"], m["pad"]), kind)
            cols, dst = write_sheet(i, kind, crops)
            m.update(cols=cols, settled=True)
            print(f"{i} {kind}: halo r{h[1]} x{h[2]:.1f}, {os.path.getsize(dst) // 1024} KB")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, sort_keys=True)


def preview(i, sheets):
    """Every 4th frame of each kind over the game's dark cell colour, idle above, win below."""
    rows = []
    for kind in ("idle", "win"):
        if kind not in sheets:
            continue
        cs = sheets[kind][::4]
        px = 220
        row = Image.new("RGB", (px * len(cs), px), (14, 40, 38))
        for k, c in enumerate(cs):
            row.paste(c.resize((px, px)), (k * px, 0), c.resize((px, px)))
        rows.append(row)
    if not rows:
        return
    w = max(r.width for r in rows)
    out = Image.new("RGB", (w, sum(r.height for r in rows)), (0, 0, 0))
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height
    p = os.path.join(TAKES, f"anim-{i}", "preview.png")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    out.save(p)
    print(p)


def main():
    a = sys.argv[1:]
    if not a or a[0] not in ("start", "gen", "build", "settle"):
        sys.exit(__doc__)
    picks, kinds, yes = {}, ["idle", "win"], "--yes" in a
    rest = []
    it = iter(a[1:])
    for x in it:
        if x == "--take":
            k, v = next(it).split("=")
            picks[k] = v
        elif x == "--kind":
            kinds = [next(it)]
        elif x != "--yes":
            rest.append(x)
    ids = rest or list(spec())
    if a[0] == "start":
        start(ids)
    elif a[0] == "gen":
        gen(ids, kinds, yes)
    elif a[0] == "settle":
        settle(ids)
    else:
        build(ids, picks)


if __name__ == "__main__":
    main()
