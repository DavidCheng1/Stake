"""Cut-out animation ("rig"): split a picture into parts and move each part as a solid piece, like Spine or Live2D.

    py tools\\sprites\\rig.py split picture.png rig.json [--out folder]     check the parts: overlay.png and layer_*.png
    (rendering goes through make_sheet.py: put "rig": "rig.json" into the recipe, or pass --rig)

rig.json lists the parts. Coordinates are pixels of the picture as given (before any upscaling).

    {"parts": [
      {"name": "wingL", "z": 1, "rect": [30, 45, 225, 180], "pivot": [205, 110],
       "fg": [[[90, 105], [140, 75], [180, 80]]], "bg": [[[200, 150], [225, 150], [225, 180]]],
       "loop": [{"prop": "rotate", "wave": "flap", "amount": 8, "cycles": 4}],
       "intro": [{"prop": "rotate", "keys": [[0.1, 60], [0.3, 0, "back"]]}]},
      {"name": "base", "z": 3, "pivot": [346, 120]}
    ]}

- Parts are found by GrabCut inside `rect`: `fg` polygons are surely the part, `bg` polygons surely not. The part named
  "base" gets every remaining pixel. A higher `z` is in front.
- Behind every part that something else covers, the hidden area is filled in (inpainted) up to `extend` px (20) from the
  visible part, so nothing tears open when the parts move.
- `loop` tracks run all the time: `wave` sin, flap (quick down stroke, slow lift) or bounce, `amount`, whole `cycles`
  per loop, `phase`. `intro` tracks only in a one-shot sheet: `keys` [time 0..1, value, ease], eases linear, in, out,
  inout, back, elastic, bounce. Props: rotate (degrees), x, y (px), scale, scalex, scaley, alpha. Intro scale and alpha
  values are absolute (1 = rest), the others add to the loop. End every intro track on its rest value, then the intro's
  last frame is the loop's first.
"""

import argparse
import json
import math
import os

import cv2
import numpy as np
from PIL import Image


# ---------------------------------------------------------------- splitting the picture into parts
def fill_holes(mask):
    """Close holes inside a part (dark eyes inside a ghost are still the ghost)."""
    h, w = mask.shape
    pad = np.zeros((h + 2, w + 2), np.uint8)
    pad[1:-1, 1:-1] = mask
    flood = pad.copy()
    cv2.floodFill(flood, np.zeros((h + 4, w + 4), np.uint8), (0, 0), 1)
    return (pad | (1 - flood))[1:-1, 1:-1].astype(bool)


def segment(img, parts):
    """Visible pixels of every part: GrabCut per part, then the front-most part owns overlapping pixels."""
    h, w = img.shape[:2]
    a = img[..., 3]
    rgb8 = ((img[..., :3] * a[..., None] + 0.5 * (1 - a[..., None])) * 255).astype(np.uint8)
    owner = np.full((h, w), -1, np.int32)
    for idx in sorted(range(len(parts)), key=lambda k: parts[k].get("z", 0)):
        p = parts[idx]
        if p["name"] == "base":
            continue
        m = np.full((h, w), cv2.GC_BGD, np.uint8)
        x0, y0, x1, y1 = p["rect"]
        m[y0:y1, x0:x1] = cv2.GC_PR_FGD
        for poly in p.get("bg", []):
            cv2.fillPoly(m, [np.int32(poly)], cv2.GC_BGD)
        for poly in p.get("fg", []):
            cv2.fillPoly(m, [np.int32(poly)], cv2.GC_FGD)
        m[a < 0.1] = cv2.GC_BGD
        bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
        cv2.grabCut(rgb8, m, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
        mask = ((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)).astype(np.uint8)
        # keep the pieces that hold a sure-part seed (or the biggest), then close inner holes
        n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        seeds = np.zeros((h, w), np.uint8)
        for poly in p.get("fg", []):
            cv2.fillPoly(seeds, [np.int32(poly)], 1)
        keep = set(np.unique(lab[(seeds > 0) & (mask > 0)])) - {0}
        if not keep and n > 1:
            keep = {1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))}
        mask = fill_holes(np.isin(lab, list(keep)).astype(np.uint8)) & (a > 0.02)
        owner[mask] = idx  # parts are visited back to front, so a front part overwrites
    base = [i for i, p in enumerate(parts) if p["name"] == "base"]
    if base:
        b = base[0]
        owner[(owner < 0) & (a > 0.02)] = b
        if parts[b].get("core"):
            # glow and shadow around the moving parts belong to them: base pixels outside the base's own outline
            # go to the nearest other part
            core = np.zeros((h, w), np.uint8)
            for poly in parts[b]["core"]:
                cv2.fillPoly(core, [np.int32(poly)], 1)
            stray = (owner == b) & (core == 0)
            others = [i for i in range(len(parts)) if i != b and (owner == i).any()]
            if stray.any() and others:
                dist = np.stack([cv2.distanceTransform((owner != i).astype(np.uint8), cv2.DIST_L2, 5) for i in others])
                near = np.array(others)[np.argmin(dist, axis=0)]
                owner[stray] = near[stray]
    return owner


def build_layers(img, parts, owner):
    """One RGBA layer per part: its visible pixels plus the filled-in area that parts in front of it hide."""
    h, w = img.shape[:2]
    rgb8 = (img[..., :3] * 255).astype(np.uint8)
    z = np.array([p.get("z", 0) for p in parts])
    zmap = np.where(owner >= 0, z[np.maximum(owner, 0)], -10**6)
    layers = []
    for idx, p in enumerate(parts):
        own = owner == idx
        if not own.any():
            layers.append(None)
            continue
        ext = np.zeros_like(own)
        covered = (zmap > p.get("z", 0)) & ~own
        if covered.any():
            pts = cv2.findNonZero(own.astype(np.uint8))
            hull = np.zeros((h, w), np.uint8)
            cv2.fillConvexPoly(hull, cv2.convexHull(pts), 1)
            dist = cv2.distanceTransform((~own).astype(np.uint8), cv2.DIST_L2, 5)
            ext = covered & (hull > 0) & (dist < p.get("extend", 20))
        layer = np.zeros((h, w, 4), np.float32)
        layer[..., :3] = img[..., :3]
        if ext.any():  # the colours under front parts come from this part only
            fill = cv2.inpaint(rgb8, (~own).astype(np.uint8), 4, cv2.INPAINT_TELEA)
            layer[ext, :3] = fill[ext] / 255
        layer[..., 3] = np.where(own, img[..., 3], 0) + np.where(ext, 1.0, 0)
        layers.append(layer)
    return layers


def split(img, spec, cache_dir=None):
    """Parts of the picture as layers; cached in cache_dir (rebuilt when the picture or rig changes)."""
    parts = spec["parts"]
    key = None
    if cache_dir:
        key = str(abs(hash((img.tobytes()[::997], json.dumps(parts, sort_keys=True)))))
        f = os.path.join(cache_dir, "rig_cache.npz")
        if os.path.exists(f):
            d = np.load(f, allow_pickle=False)
            if str(d["key"]) == key:
                return [d[f"l{i}"] if f"l{i}" in d else None for i in range(len(parts))], d["owner"]
    owner = segment(img, parts)
    layers = build_layers(img, parts, owner)
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        np.savez_compressed(os.path.join(cache_dir, "rig_cache.npz"), key=key, owner=owner,
                            **{f"l{i}": l for i, l in enumerate(layers) if l is not None})
    return layers, owner


def overlay(img, parts, owner, path):
    """Each part tinted in its own colour, with its name and pivot, to check the split."""
    a = img[..., 3:]
    base = img[..., :3] * a + 0.15 * (1 - a)
    rng = np.random.default_rng(3)
    cols = rng.uniform(0.2, 1, (len(parts), 3))
    out = base.copy()
    for i, p in enumerate(parts):
        m = owner == i
        out[m] = base[m] * 0.45 + cols[i] * 0.55
    out = (np.clip(out, 0, 1) * 255).astype(np.uint8)
    big = cv2.resize(out, (out.shape[1] * 2, out.shape[0] * 2), interpolation=cv2.INTER_NEAREST)
    for i, p in enumerate(parts):
        m = owner == i
        if not m.any():
            continue
        ys, xs = np.nonzero(m)
        px, py = p.get("pivot", (xs.mean(), ys.mean()))
        cv2.circle(big, (int(px * 2), int(py * 2)), 5, (255, 255, 255), -1)
        cv2.putText(big, p["name"], (int(xs.mean() * 2) - 20, int(ys.mean() * 2)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
    Image.fromarray(big).save(path)


# ---------------------------------------------------------------- moving the parts
def ease(kind, x):
    x = min(max(x, 0.0), 1.0)
    if kind == "in":
        return x ** 3
    if kind == "out":
        return 1 - (1 - x) ** 3
    if kind == "inout":
        return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2
    if kind == "back":
        s = 1.9
        return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2
    if kind == "elastic":
        return 1.0 if x >= 1 else 2 ** (-10 * x) * math.sin((x * 10 - 0.75) * 2 * math.pi / 3) + 1
    if kind == "bounce":
        n, d = 7.5625, 2.75
        if x < 1 / d:
            return n * x * x
        if x < 2 / d:
            x -= 1.5 / d
            return n * x * x + 0.75
        if x < 2.5 / d:
            x -= 2.25 / d
            return n * x * x + 0.9375
        x -= 2.625 / d
        return n * x * x + 0.984375
    return x


def wave(tr, t):
    th = 2 * math.pi * (tr.get("cycles", 1) * t + tr.get("phase", 0))
    kind = tr.get("wave", "sin")
    if kind == "flap":  # wing beat: quick down stroke, slower lift
        return tr["amount"] * math.sin(th + 0.45 * math.sin(th))
    if kind == "bounce":
        return tr["amount"] * abs(math.sin(th / 2))
    return tr["amount"] * math.sin(th)


def keyed(tr, t):
    keys = tr["keys"]
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0, *_), (t1, v1, *e) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * ease(e[0] if e else "out", (t - t0) / max(t1 - t0, 1e-9))
    return keys[-1][1]


ABSOLUTE = ("scale", "scalex", "scaley", "alpha")


class Rig:
    """Renders the parts, moved by their tracks, into the (supersampled) canvas of make_sheet."""

    def __init__(self, spec, img, cv, n, loop, factor=1.0, cache_dir=None):
        self.parts, self.cv, self.n, self.loop, self.f = spec["parts"], cv, n, loop, factor
        src_h, src_w = img.shape[:2]
        small = img if factor == 1 else cv2.resize(img, (round(src_w / factor), round(src_h / factor)), interpolation=cv2.INTER_AREA)
        layers, self.owner = split(small, spec, cache_dir)
        self.layers = []
        for p, l in zip(self.parts, layers):
            if l is None:
                self.layers.append(None)
                continue
            if factor != 1:  # parts were found on the picture as given; their pixels come from the upscaled one
                m = cv2.resize(l[..., 3], (src_w, src_h), interpolation=cv2.INTER_LINEAR)
                own = cv2.resize((self.owner == self.parts.index(p)).astype(np.float32), (src_w, src_h), interpolation=cv2.INTER_LINEAR)
                big = np.dstack([np.where(own[..., None] > 0.5, img[..., :3], cv2.resize(l[..., :3], (src_w, src_h))),
                                 np.where(own > 0.5, img[..., 3], m)])
                l = big
            pre = l.copy()
            pre[..., :3] *= pre[..., 3:]
            self.layers.append(cv2.resize(pre, (cv.sw, cv.sh), interpolation=cv2.INTER_AREA if cv.sw < pre.shape[1] else cv2.INTER_CUBIC))
        self.order = sorted([i for i, l in enumerate(self.layers) if l is not None], key=lambda i: self.parts[i].get("z", 0))
        self.k = cv.sw / (src_w / factor)  # picture px -> canvas px

    def values(self, p, t):
        v = {"rotate": 0.0, "x": 0.0, "y": 0.0, "scale": 1.0, "scalex": 1.0, "scaley": 1.0, "alpha": 1.0}
        for tr in p.get("loop", []):
            w = wave(tr, t)
            v[tr["prop"]] = v[tr["prop"]] * (1 + w) if tr["prop"] in ABSOLUTE else v[tr["prop"]] + w
        if not self.loop:
            for tr in p.get("intro", []):
                k = keyed(tr, t)
                v[tr["prop"]] = v[tr["prop"]] * k if tr["prop"] in ABSOLUTE else v[tr["prop"]] + k
        return v

    def frame(self, i):
        cv = self.cv
        t = i / self.n if self.loop else i / max(self.n - 1, 1)
        out = np.zeros((cv.h, cv.w, 4), np.float32)
        for idx in self.order:
            p, layer = self.parts[idx], self.layers[idx]
            v = self.values(p, t)
            if v["alpha"] <= 0.001:
                continue
            px, py = p.get("pivot", (0, 0))
            px, py = px * self.k, py * self.k  # pivot in layer px
            r = math.radians(v["rotate"])
            sx, sy = v["scale"] * v["scalex"], v["scale"] * v["scaley"]
            c, s = math.cos(r), math.sin(r)
            # layer px -> canvas px: move to the pivot, scale, rotate, back, then offset into the canvas and by x/y
            A = np.array([[c * sx, -s * sy], [s * sx, c * sy]], np.float32)
            tvec = np.array([px, py], np.float32) - A @ np.array([px, py], np.float32)
            tvec += np.array([cv.ox + v["x"] * self.k, cv.oy + v["y"] * self.k], np.float32)
            M = np.hstack([A, tvec[:, None]])
            moved = cv2.warpAffine(layer, M, (cv.w, cv.h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
            if v["alpha"] < 1:
                moved *= v["alpha"]
            out = moved + out * (1 - moved[..., 3:])
        return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["split"])
    ap.add_argument("image")
    ap.add_argument("rig")
    ap.add_argument("--out")
    args = ap.parse_args()
    spec = json.load(open(args.rig, encoding="utf-8"))
    img = np.asarray(Image.open(args.image).convert("RGBA"), np.float32) / 255
    out = args.out or os.path.dirname(os.path.abspath(args.rig))
    os.makedirs(out, exist_ok=True)
    layers, owner = split(img, spec)
    overlay(img, spec["parts"], owner, os.path.join(out, "overlay.png"))
    for p, l in zip(spec["parts"], layers):
        if l is not None:
            Image.fromarray((np.clip(l, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(out, f"layer_{p['name']}.png"))
        print(f"{p['name']:10} z {p.get('z', 0):2}  {int((owner == spec['parts'].index(p)).sum()):6} px visible" if l is not None else f"{p['name']:10} EMPTY")
    print(f"overlay.png and layer_*.png -> {out}")


if __name__ == "__main__":
    main()
