"""Win-tier titles that move inside: each title (ghost-duels-web/assets/win-tiers/<tier>) is split into a back layer
(flames, moon, skull, ship, storm, the Ghost Pirate) and a front layer (letters, bat wings, the ornament and chains
under them), so the back can move on its own (flames flaring up, the ship rocking) while the letters stay put. Also
builds the MAX WIN title from a picture painted with tools/imagegen, and softens the edge of a title painted as a
full scene (EPIC WIN), so it no longer shows as a rectangle.

    math-sdk\\env\\Scripts\\python.exe tools\\sprites\\win_tiers_motion.py split [big super mega epic] [--soften epic]
    math-sdk\\env\\Scripts\\python.exe tools\\sprites\\win_tiers_motion.py max <picture-cut.png>

split   works on the rig and atlas tools/sprites/win_tiers_assets.py wrote (one part "title"); a title that is split
        already is left alone. The two layers come from soft masks (front rects, blurred), so the seam is invisible
        while the back moves a few pixels; the back's motions are pivoted on the seam. The tier's own lights (moon,
        eyes, lightning, cannon fire) move with the back, its flicker, pulse and flash stay with the front.
max     makes ghost-duels-web/assets/win-tiers/max from a cut-out picture (gen.py takes-NN-cut.png): the purple the
        magenta backdrop leaves on its flames is turned green, lights are made from its own bright and green parts,
        and it is split like the others.

Needs only numpy and pillow (math-sdk's environment).
"""

import argparse
import colorsys
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TIERS_DIR = os.path.join(ROOT, "ghost-duels-web", "assets", "win-tiers")
PXU, GXU = 1.5, .5  # atlas px per title px, for the title and for its lights (as win_tiers_assets.py)

# Front layer, in title px of the four painted titles (the same template): the letters, the bat wings at both ends,
# the ornament with chains under the letters. Everything else is the back.
FRONT = [(105, 232, 920, 462), (0, 178, 190, 352), (832, 178, 1022, 352), (120, 430, 905, 570)]
# Back motions per tier (loop tracks as rigplayer.js reads them) and the pivot (on the seam, so the seam stays still)
MOTION = {
    "big": dict(pivot=(511, 262), loop=[dict(prop="scaley", amount=.04, cycles=4, phase=0), dict(prop="scalex", amount=.012, cycles=4, phase=.5),
                                        dict(prop="rotate", amount=.6, cycles=2, phase=.25)]),
    "super": dict(pivot=(511, 262), loop=[dict(prop="rotate", amount=1.2, cycles=1, phase=0), dict(prop="y", amount=3, cycles=2, phase=.25),
                                          dict(prop="scaley", amount=.02, cycles=2, phase=.5)]),
    "mega": dict(pivot=(511, 262), loop=[dict(prop="scaley", amount=.045, cycles=4, phase=0), dict(prop="scalex", amount=.015, cycles=4, phase=.5),
                                         dict(prop="rotate", amount=.5, cycles=2, phase=.75)]),
    "epic": dict(pivot=(511, 262), loop=[dict(prop="rotate", amount=1.1, cycles=1, phase=0), dict(prop="scaley", amount=.02, cycles=2, phase=.25)]),
    # the skeleton pirate rises behind the letters: he bobs and sways (no stretching, it would pull his face)
    "max": dict(pivot=(511, 250), loop=[dict(prop="y", amount=-4, cycles=2, phase=0), dict(prop="rotate", amount=.8, cycles=1, phase=.25),
                                        dict(prop="scale", amount=.012, cycles=2, phase=.5)]),
}
SOFTEN = {"epic": dict(px=1, py=1, power=3.2, band=.24, cloud=.12)}  # rounded shape the scene fades out to (fractions of the half size)


# ---------------------------------------------------------------- small image helpers

def blur(a, r):
    """Separable gaussian blur of a 2-D float array (sigma r px)."""
    if r <= 0:
        return a
    x = np.arange(-int(3 * r), int(3 * r) + 1)
    k = np.exp(-x ** 2 / (2 * r * r))
    k /= k.sum()
    a = np.apply_along_axis(lambda v: np.convolve(v, k, "same"), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, "same"), 1, a)


def to_f(im):
    return np.asarray(im.convert("RGBA"), np.float32) / 255


def to_im(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8), "RGBA")


def resize_f(a, w, h):
    return to_f(to_im(a).resize((w, h), Image.LANCZOS))


def rect_mask(w, h, rects, scale, feather):
    """1 inside the rects (title px x scale), blurred by feather (title px)."""
    m = np.zeros((h, w), np.float32)
    for x0, y0, x1, y1 in rects:
        m[round(y0 * scale):round(y1 * scale), round(x0 * scale):round(x1 * scale)] = 1
    small = Image.fromarray((m * 255).astype(np.uint8)).resize((max(1, w // 4), max(1, h // 4)), Image.BILINEAR)
    small = np.asarray(small, np.float32) / 255
    small = blur(small, feather * scale / 4)
    return np.asarray(Image.fromarray((np.clip(small, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR), np.float32) / 255


def soften(a, cfg):
    """A title painted as a full scene: made solid and given a soft, slightly cloudy rounded edge, so its rectangle
    does not show. Its painted-checkerboard cut left the scene (and even the letters) patchily see-through, so it is
    first laid over the dark of the win screen (it looks as before) and then made opaque."""
    h, w = a.shape[:2]
    dark = np.array(cfg.get("dark", (10, 22, 20)), np.float32) / 255
    flat = a[..., :3] * a[..., 3:] + dark * (1 - a[..., 3:])
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    nx, ny = np.abs(x / (w - 1) * 2 - 1) / cfg["px"], np.abs(y / (h - 1) * 2 - 1) / cfg["py"]
    d = (nx ** cfg["power"] + ny ** cfg["power"]) ** (1 / cfg["power"])
    # a cloudy edge: low-frequency noise moves it in and out a little
    rng = np.random.default_rng(cfg.get("seed", 3))
    noise = Image.fromarray((rng.random((5, 9)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    d = d + (np.asarray(noise, np.float32) / 255 - .5) * cfg.get("cloud", .1)
    m = np.clip((1 - d) / cfg.get("band", .22), 0, 1)
    m = m * m * (3 - 2 * m)
    return np.dstack([flat, m]), m


# ---------------------------------------------------------------- atlas

def pack(pics, width=1600, gap=4):
    """Shelf packing, tallest first. pics: list of float RGBA arrays. Returns frames [x, y, w, h] and the sheet."""
    order = sorted(range(len(pics)), key=lambda i: -pics[i].shape[0])
    width = max(width, max(p.shape[1] for p in pics) + 2 * gap)
    frames, x, y, row = [None] * len(pics), gap, gap, 0
    for i in order:
        h, w = pics[i].shape[:2]
        if x + w + gap > width:
            x, y, row = gap, y + row + gap, 0
        frames[i] = [x, y, w, h]
        x += w + gap
        row = max(row, h)
    sheet = np.zeros((y + row + gap, width, 4), np.float32)
    for (fx, fy, fw, fh), p in zip(frames, pics):
        sheet[fy:fy + fh, fx:fx + fw] = p
    return frames, sheet


def crop_box(a, pad=2):
    ys, xs = np.nonzero(a[..., 3] > 1 / 255)
    if not len(xs):
        return None
    x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
    x1, y1 = min(a.shape[1], xs.max() + 1 + pad), min(a.shape[0], ys.max() + 1 + pad)
    return x0, y0, x1 - x0, y1 - y0


# ---------------------------------------------------------------- split

def split_rig(tier, rig, atlas, title, lights):
    """title: float RGBA of the whole title at PXU; lights: [(effect, float RGBA at GXU)]. Writes rig.json + atlas."""
    W, H = rig["w"], rig["h"]
    th, tw = title.shape[:2]
    fs = tw / W  # atlas px per title px
    if tier in SOFTEN:
        title, m = soften(title, SOFTEN[tier])
        for i, (e, l) in enumerate(lights):
            mm = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((l.shape[1], l.shape[0]), Image.BILINEAR), np.float32) / 255
            l = l.copy()
            l[..., 3] *= mm
            lights[i] = (e, l)
    sx, sy = W / 1022, H / 570  # the front rects are for the 1022 x 570 template
    rects = [(x0 * sx, y0 * sy, x1 * sx, y1 * sy) for x0, y0, x1, y1 in FRONT]
    fm = rect_mask(tw, th, rects, fs, feather=14)
    front, back = title.copy(), title.copy()
    front[..., 3] *= fm
    back[..., 3] *= 1 - fm
    old = rig["parts"][0]
    base_loop, intro = old.get("loop", []), old.get("intro", [])
    mo = MOTION[tier]
    pv = [mo["pivot"][0] * sx, mo["pivot"][1] * sy]
    pics, parts = [], []
    # one pivot for both layers (on the seam), so the shared intro and loop move them as one piece
    for name, pic, loop, pivot in (("back", back, base_loop + mo["loop"], pv), ("front", front, base_loop, pv)):
        bx, by, bw, bh = crop_box(pic)
        pics.append(pic[by:by + bh, bx:bx + bw])
        parts.append({"name": name, "box": [round(bx / fs, 3), round(by / fs, 3), round(bw / fs, 3), round(bh / fs, 3)],
                      "pivot": pivot, "loop": loop, "intro": intro})
    effects = []
    for e, l in lights:
        e = dict(e)
        e["part"] = "back" if e.pop("_back", False) else "front"
        pics.append(l)
        effects.append(e)
    others = [dict(e, part="front") if "part" in e else e for e in rig["effects"] if e["type"] != "glow"]
    mask_for = None
    if tier in SOFTEN or tier == "max":  # the shine gets a mask of just the letters, not the scene or flames behind them
        sh = next(e for e in others if e["type"] == "shine")
        x0, y0, x1, y1 = (round(v * fs) for v in sh["rect"])
        r, g, b = front[..., 0], front[..., 1], front[..., 2]
        if tier == "max":  # gold letters in front of bright green flames
            bright = (r > .55) & (g > .4) & (b < .45) & (r > b + .25) & (front[..., 3] > .5)
        else:  # EPIC WIN: bright gold and green letters over a darker scene
            bright = (front[..., :3].max(2) > .55) & (front[..., 3] > .5)
        m = np.zeros(bright.shape, np.float32)
        m[y0:y1, x0:x1] = bright[y0:y1, x0:x1]
        bx, by, bw, bh = crop_box(front)
        m = blur(m[by:by + bh, bx:bx + bw], 1.2)
        mask = np.dstack([np.ones(m.shape + (3,), np.float32), np.clip(m, 0, 1)])
        mask = resize_f(mask, round(bw / 2), round(bh / 2))
        pics.append(mask)
        mask_for = sh
    frames, sheet = pack(pics)
    if mask_for is not None:
        mask_for["mask"] = frames[-1]
    for p, f in zip(parts, frames):
        p["frame"] = f
    for e, f in zip(effects, frames[len(parts):]):
        e["frame"] = f
    doc = {k: v for k, v in rig.items() if k not in ("parts", "effects")}
    doc["parts"], doc["effects"] = parts, effects + others
    out = os.path.join(TIERS_DIR, tier)
    os.makedirs(out, exist_ok=True)
    to_im(sheet).save(os.path.join(out, "atlas.webp"), quality=90, method=6, alpha_quality=100)
    with open(os.path.join(out, "rig.json"), "w", encoding="utf-8") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    size = sum(os.path.getsize(os.path.join(out, x)) for x in ("atlas.webp", "rig.json"))
    print(f"{tier}: back + front, {len(effects)} lights -> {out} ({size // 1024} KB)")


def split(tiers, soften_tiers):
    for tier in tiers:
        d = os.path.join(TIERS_DIR, tier)
        rig = json.load(open(os.path.join(d, "rig.json"), encoding="utf-8"))
        if [p["name"] for p in rig["parts"]] != ["title"]:
            print(f"{tier}: split already, left alone")
            continue
        if tier not in soften_tiers:
            SOFTEN.pop(tier, None)
        atlas = to_f(Image.open(os.path.join(d, "atlas.webp")))
        x, y, w, h = rig["parts"][0]["frame"]
        title = atlas[y:y + h, x:x + w]
        lights = []
        glows = [e for e in rig["effects"] if e["type"] == "glow"]
        for i, e in enumerate(glows):
            fx, fy, fw, fh = e["frame"]
            e = {k: v for k, v in e.items() if k != "frame"}
            e["_back"] = i >= 3  # 0 flicker, 1 pulse, 2 landing flash; from 3 on the tier's own lights (win_tiers_assets.py)
            lights.append((e, atlas[fy:fy + fh, fx:fx + fw]))
        split_rig(tier, rig, atlas, title, lights)


# ---------------------------------------------------------------- MAX WIN

def green_rim(a):
    """The magenta backdrop tints soft shapes purple (rims and shading of the flames): purple turns the flames' green.
    The MAX WIN title has no purple of its own."""
    alpha = a[..., 3]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    purple = (r - g > .1) & (b - g > .1) & (alpha > 0)
    hsv = np.asarray(to_im(a).convert("RGB").convert("HSV"), np.float32) / 255
    hsv[..., 0] = np.where(purple, 128 / 360, hsv[..., 0])  # the green of the flames
    rgb = np.asarray(Image.fromarray((hsv * 255 + .5).astype(np.uint8), "HSV").convert("RGB"), np.float32) / 255
    out = a.copy()
    out[..., :3] = np.where(purple[..., None], rgb, a[..., :3])
    print(f"max: {purple.sum()} purple px turned green")
    return out


def light(a, kind, scale):
    """A light layer from a title (float RGBA at its atlas scale), at that scale; blur radii in title px."""
    al = a[..., 3]
    rgb = a[..., :3]
    lum = rgb.max(2)
    if kind == "flicker":  # the green flames: their own colour, bloomed
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        e = np.clip((g - np.maximum(r, b)) * 2.2, 0, 1) * np.clip((lum - .35) / .4, 0, 1) * al
        col, rad, spread = rgb, 9, 2.2
    elif kind == "pulse":  # the brightest spots
        e = np.clip((lum - .7) / .3, 0, 1) ** 2 * al
        col, rad, spread = rgb, 10, 2.5
    else:  # flash: white light over the whole silhouette
        e = blur(al, 6 * scale) * 1.2
        col, rad, spread = np.ones_like(rgb), 0, 1
    li = e[..., None] * col
    if rad:
        li = np.dstack([blur(li[..., i], rad * scale) for i in range(3)]) * spread + li * .6
    alpha = np.clip(li.max(2), 0, 1)
    return np.dstack([np.where(alpha[..., None] > 1e-4, li / np.maximum(alpha[..., None], 1e-4), 0), alpha])


def build_max(picture):
    src = to_f(Image.open(picture))
    src = green_rim(src)
    W = 1022
    H = round(src.shape[0] * W / src.shape[1])
    title = resize_f(src, round(W * PXU), round(H * PXU))
    small = resize_f(src, round(W * GXU), round(H * GXU))
    lights = [({"type": "glow", "amount": .5, "min": 0, "cycles": 9, "wave": "flicker"}, light(small, "flicker", GXU)),
              ({"type": "glow", "amount": .45, "min": .15, "cycles": 3, "phase": .3}, light(small, "pulse", GXU)),
              ({"type": "glow", "amount": .55, "loop": False, "flash": [[0, 0], [.22, 0], [.3, 1], [.7, 0]]}, light(small, "flash", GXU))]
    for e, l in lights:
        e["box"] = [0, 0, W, H]
    # the letters: where the gold is, in the middle band (for the shine across them)
    a = src
    gold = (a[..., 0] > .6) & (a[..., 1] > .45) & (a[..., 2] < .35) & (a[..., 3] > .9)
    ys, xs = np.nonzero(gold[round(a.shape[0] * .45):round(a.shape[0] * .85)])
    k = W / src.shape[1]
    y0 = round(a.shape[0] * .45)
    letters = [round(np.percentile(xs, 2) * k), round((np.percentile(ys, 2) + y0) * k), round(np.percentile(xs, 98) * k), round((np.percentile(ys, 98) + y0) * k)]
    rig = {"w": W, "h": H, "pad": .02, "intro": 1.1, "loop": 3.2, "fade": .1,
           "atlas": "atlas.webp",
           "parts": [{"name": "title", "box": [0, 0, W, H], "pivot": [W / 2, H * .62],
                      "loop": [{"prop": "scale", "amount": .014, "cycles": 2, "phase": 0}, {"prop": "rotate", "amount": .5, "cycles": 1, "phase": .25},
                               {"prop": "y", "amount": 3, "cycles": 2, "phase": .25}],
                      "intro": [{"prop": "scale", "keys": [[0, .2], [.3, 1.15, "out"], [.5, .96, "inout"], [.65, 1, "inout"]]},
                                {"prop": "rotate", "keys": [[0, -8], [.3, 2, "out"], [.55, 0, "inout"]]},
                                {"prop": "alpha", "keys": [[0, 0], [.12, 1, "linear"]]}]}],
           "effects": [{"type": "shine", "part": "title", "rect": letters, "amount": .8, "cycles": 1, "sweep": .4, "phase": .45, "width": .07, "angle": 22},
                       {"type": "sparkles", "rect": [W * .12, H * .1, W * .88, H * .85], "count": 24, "size": 8, "color": "#fff3c4", "cycles": 1, "seed": 7}]}
    print(f"max: {W} x {H}, letters {letters}")
    split_rig("max", rig, None, title, lights)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("split")
    s.add_argument("tiers", nargs="*", default=["big", "super", "mega", "epic"])
    s.add_argument("--soften", nargs="*", default=["epic"])
    m = sub.add_parser("max")
    m.add_argument("picture")
    a = ap.parse_args()
    if a.cmd == "split":
        split(a.tiers, set(a.soften))
    else:
        build_max(a.picture)


if __name__ == "__main__":
    main()
