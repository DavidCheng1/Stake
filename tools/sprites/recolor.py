"""Recolour a picture part by part, to bring art into the game's palette (teal glow, violet, gold, stone, green).

    py tools\\sprites\\recolor.py picture.png rules.json out.png [--rig rig.json] [--compare compare.png]

rules.json: {"rules": [rule, ...]}; every rule changes the pixels it matches, in order:
    {"parts": ["wingL", "wingR"],      only pixels of these rig parts (needs --rig); leave out for all parts
     "rect": [x0, y0, x1, y1],         only inside this box (picture px)
     "hue": [330, 25],                 hue range in degrees (wraps around 360), feathered by "soft" (8) degrees
     "sat": [0.35, 1], "val": [0, 1],  saturation and brightness ranges (0..1)
     "alpha": [0, 0.92],               opacity range: [0, 0.92] picks the soft glow around the art (ranges fade over 0.04)
     "to": 272,                        new hue in degrees (or "shift": degrees)
     "sat_mul": 0.85, "val_mul": 0.9,  saturation and brightness scaled
     "sat_to": 0.2,                    or saturation set
     "map": ["#120620", "#5b2a9e", "#c9a5ff"],  or instead paint a gradient by brightness, dark to light (keeps the
                                       shading, no hue seams); "range": [lo, hi] brightness for the ends (default: the
                                       2nd and 98th percentile of the matched pixels), "gamma", "blur" (0.6 px)
     "region": {"rect": [...], "area": [lo, hi], "hue": [...], "sat": [...], "val": [...]}}
                                       only whole areas between outlines whose centre, size and mean colour fit
Pixels are matched on the colours of the original picture, so later rules don't see earlier changes.
"""

import argparse
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image


def hue_weight(h, lo, hi, soft):
    """1 inside the hue range (degrees, may wrap past 360), fading out over `soft` degrees."""
    width = (hi - lo) % 360
    d = (h - lo) % 360  # 0..width inside
    inside = d <= width
    dist = np.minimum((lo - h) % 360, (h - hi) % 360)
    return np.where(inside, 1.0, np.clip(1 - dist / max(soft, 1e-6), 0, 1)).astype(np.float32)


def range_weight(x, lo, hi, soft=0.04):
    return (np.clip((x - lo + soft) / soft, 0, 1) * np.clip((hi - x + soft) / soft, 0, 1)).astype(np.float32)


def hex_rgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def palette(colors, t):
    """Gradient map: t 0..1 through the colours, evenly spaced."""
    cols = np.stack([hex_rgb(c) for c in colors])
    x = t * (len(cols) - 1)
    i = np.clip(np.floor(x).astype(int), 0, len(cols) - 2)
    f = (x - i)[..., None]
    return cols[i] * (1 - f) + cols[i + 1] * f


def region_stats(lab, H, S, V):
    """Per area between outlines: size, centre and mean colour (hue as a circular mean)."""
    n = int(lab.max()) + 1
    ys, xs = np.mgrid[0:lab.shape[0], 0:lab.shape[1]]
    f = lab.ravel()
    area = np.bincount(f, minlength=n).astype(np.float64)
    d = np.maximum(area, 1)
    rad = np.radians(H).ravel()
    hue = np.degrees(np.arctan2(np.bincount(f, np.sin(rad), n), np.bincount(f, np.cos(rad), n))) % 360
    return {"area": area, "x": np.bincount(f, xs.ravel(), n) / d, "y": np.bincount(f, ys.ravel(), n) / d, "hue": hue,
            "sat": np.bincount(f, S.ravel(), n) / d, "val": np.bincount(f, V.ravel(), n) / d}


def region_match(st, q):
    ok = np.ones(len(st["area"]), bool)
    ok[0] = False  # the outlines themselves
    if "rect" in q:
        x0, y0, x1, y1 = q["rect"]
        ok &= (st["x"] >= x0) & (st["x"] < x1) & (st["y"] >= y0) & (st["y"] < y1)
    for k in ("area", "sat", "val"):
        if k in q:
            ok &= (st[k] >= q[k][0]) & (st[k] <= q[k][1])
    if "hue" in q:
        lo, hi = q["hue"]
        ok &= ((st["hue"] - lo) % 360) <= ((hi - lo) % 360)
    return ok


def recolor(img, rules, owner=None, names=None, lab=None):
    rgb, a = img[..., :3].astype(np.float32), img[..., 3]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)  # float input: H in degrees, S and V 0..1
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    Y = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    st = region_stats(lab, H, S, V) if lab is not None and any("region" in r for r in rules) else None
    out = rgb.copy()
    for r in rules:
        w = np.ones(H.shape, np.float32)
        if r.get("parts") and owner is not None:
            w *= np.isin(owner, [names.index(p) for p in r["parts"] if p in names]).astype(np.float32)
        if r.get("rect"):
            x0, y0, x1, y1 = r["rect"]
            m = np.zeros_like(w)
            m[y0:y1, x0:x1] = 1
            w *= cv2.GaussianBlur(m, (0, 0), 1.5)
        if "hue" in r:
            w *= hue_weight(H, r["hue"][0], r["hue"][1], r.get("soft", 8))
        if "sat" in r:
            w *= range_weight(S, *r["sat"])
        if "val" in r:
            w *= range_weight(V, *r["val"])
        if "alpha" in r:
            w *= range_weight(a, *r["alpha"])
        if "region" in r and st is not None:
            w *= region_match(st, r["region"])[lab].astype(np.float32)
        if "map" in r and r.get("blur", 0.6) > 0:
            w = cv2.GaussianBlur(w, (0, 0), r.get("blur", 0.6))
        if not w.any():
            continue
        if "map" in r:  # gradient map by brightness: clean shading in the new colours, no hue seams
            sel = w > 0.5
            lo, hi = r.get("range") or (np.percentile(Y[sel], [2, 98]) if sel.sum() > 20 else (0.0, 1.0))
            t = np.clip((Y - lo) / max(hi - lo, 1e-3), 0, 1) ** r.get("gamma", 1.0)
            out += w[..., None] * (palette(r["map"], t) - out)
            continue
        cur = cv2.cvtColor(out, cv2.COLOR_RGB2HSV)
        nH, nS, nV = cur[..., 0], cur[..., 1], cur[..., 2]
        th = r["to"] if "to" in r else (H + r.get("shift", 0)) % 360
        # blend hues along the short way round
        dh = ((th - nH + 180) % 360) - 180
        nH = (nH + w * dh) % 360
        ts = np.full_like(S, r["sat_to"]) if "sat_to" in r else S * r.get("sat_mul", 1)
        nS = nS + w * (np.clip(ts, 0, 1) - nS)
        nV = nV + w * (np.clip(V * r.get("val_mul", 1), 0, 1) - nV)
        out = cv2.cvtColor(np.dstack([nH, nS, nV]).astype(np.float32), cv2.COLOR_HSV2RGB)
    return np.dstack([np.clip(out, 0, 1), a])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image")
    ap.add_argument("rules")
    ap.add_argument("out")
    ap.add_argument("--rig")
    ap.add_argument("--compare", help="write the picture before and after, side by side on a dark background")
    args = ap.parse_args()
    img = np.asarray(Image.open(args.image).convert("RGBA"), np.float32) / 255
    rules = json.load(open(args.rules, encoding="utf-8"))["rules"]
    owner = names = None
    if args.rig:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import rig as rigmod

        spec = json.load(open(args.rig, encoding="utf-8"))
        owner = rigmod.segment(img, spec["parts"])
        names = [p["name"] for p in spec["parts"]]
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import rig as rigmod

    out = recolor(img, rules, owner, names, rigmod.regions(img)[1])
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(args.out)
    if args.compare:
        bg = np.array([0.08, 0.1, 0.1], np.float32)
        pair = [x[..., :3] * x[..., 3:] + bg * (1 - x[..., 3:]) for x in (img, out)]
        Image.fromarray((np.concatenate(pair, 0) * 255).astype(np.uint8)).save(args.compare)
    print(f"recoloured with {len(rules)} rules -> {args.out}")


if __name__ == "__main__":
    main()
