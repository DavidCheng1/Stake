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
import hashlib
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


def regions(img, dark=0.3):
    """Areas enclosed by outlines (4-connected, outline pixels are 0) and the outline mask."""
    a = img[..., 3]
    line = (img[..., :3].max(2) < dark) & (a > 0.3)
    n, lab = cv2.connectedComponents((~line & (a > 0.5)).astype(np.uint8), connectivity=4)
    return n, lab, line


def snap_owner(img, owner, parts, dark=0.3, reach=4.0, share=0.6, vote=True):
    """Move the cuts between parts onto the outlines: an area enclosed by outlines goes wholly to the part that owns
    most of it (`share` at least), and an outline pixel goes to the front-most part whose area is within `reach` px
    of the nearest one, so the shared line between a front and a back part belongs to the front part.
    vote=False keeps the areas as they are and only settles the outlines (for a second pass at a bigger size)."""
    a = img[..., 3]
    n, lab, line = regions(img, dark)
    k = len(parts)
    ok = (owner >= 0) & (lab > 0)
    counts = np.bincount(lab[ok] * k + owner[ok], minlength=n * k).reshape(n, k)
    tot = counts.sum(1)
    best = counts.argmax(1)
    sure = (tot > 0) & (counts[np.arange(n), best] >= share * np.maximum(tot, 1))
    sure[0] = False
    out = np.where(sure[lab], best[lab], owner) if vote else owner.copy()
    z = np.array([p.get("z", 0) for p in parts], np.float32)
    area = (lab > 0)
    dist = np.stack([cv2.distanceTransform((~(area & (out == i))).astype(np.uint8), cv2.DIST_L2, 5) for i in range(k)])
    near = dist.min(0)
    cand = dist <= near + reach
    front = np.argmax(np.where(cand, z[:, None, None], -1e9), axis=0)
    fix = (line | ((a > 0.02) & ~area)) & (near <= 3 * reach)
    out = np.where(fix, front, out)
    out[a <= 0.02] = -1
    return out


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


def split(img, spec, cache_dir=None, seg=None):
    """Parts of the picture as layers; cached in cache_dir (rebuilt when the picture or rig changes).
    `seg`: find the parts on this version of the picture (same size), take the pixels from `img`."""
    parts = spec["parts"]
    key = None
    if cache_dir:
        h = hashlib.md5(img.tobytes())  # Python's hash() changes per run, so it can't key a cache on disk
        if seg is not None:
            h.update(seg.tobytes())
        h.update(json.dumps(parts, sort_keys=True).encode())
        key = h.hexdigest()
        f = os.path.join(cache_dir, "rig_cache.npz")
        if os.path.exists(f):
            d = np.load(f, allow_pickle=False)
            if str(d["key"]) == key:
                return [d[f"l{i}"] if f"l{i}" in d else None for i in range(len(parts))], d["owner"]
    owner = segment(img if seg is None else seg, parts)
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
        seg = spec.get("_split_img")
        if seg is not None and seg.shape[:2] != small.shape[:2]:
            seg = cv2.resize(seg, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_AREA)
        layers, self.owner = split(small, spec, cache_dir, seg)
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


# ---------------------------------------------------------------- export for live playback (web/rigplayer.js)
def load_rgba(path):
    return np.asarray(Image.open(path).convert("RGBA"), np.float32) / 255


def big_layers(layers, owner, big):
    """The layers at the size of an upscaled copy of the picture: shapes from the split, pixels from the copy."""
    h, w = big.shape[:2]
    out = []
    for i, l in enumerate(layers):
        if l is None:
            out.append(None)
            continue
        own = cv2.resize((owner == i).astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
        alpha = np.where(own > 0.5, big[..., 3], cv2.resize(l[..., 3], (w, h), interpolation=cv2.INTER_LINEAR))
        rgb = np.where(own[..., None] > 0.5, big[..., :3], cv2.resize(l[..., :3], (w, h), interpolation=cv2.INTER_CUBIC))
        out.append(np.dstack([rgb, alpha]))
    return out


def sharpen_up(l, f):
    """Plain upscaling with a light unsharp mask, for when no upscaled copy (Real-ESRGAN) is given."""
    h, w = l.shape[:2]
    pre = l.copy()
    pre[..., :3] *= pre[..., 3:]
    big = cv2.resize(pre, (round(w * f), round(h * f)), interpolation=cv2.INTER_LANCZOS4)
    big = np.clip(big + 0.5 * (big - cv2.GaussianBlur(big, (0, 0), 0.9 * f)), 0, 1)
    a = big[..., 3:]
    big[..., :3] = np.where(a > 1e-4, big[..., :3] / np.maximum(a, 1e-4), 0)
    return np.clip(big, 0, 1)


def crop_box(l):
    """The opaque box of a layer as [x, y, w, h] in the layer's px, or None."""
    ys, xs = np.nonzero(l[..., 3] > 0.004)
    if not len(xs):
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max() + 1 - xs.min()), int(ys.max() + 1 - ys.min())]


def save_crop(l, path, quality):
    """Save the opaque box of a layer; returns it as [x, y, w, h] in the layer's px."""
    box = crop_box(l)
    if box is None:
        return None
    x, y, w, h = box
    crop = (np.clip(l[y:y + h, x:x + w], 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(crop, "RGBA").save(path, quality=quality, method=6, alpha_quality=100)
    return box


def pack(sizes, width=2048, gap=4):
    """Shelf packing, tallest first: positions [x, y] for boxes of (w, h), and the sheet's (w, h)."""
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i][1])
    pos, x, y, shelf, used = [None] * len(sizes), gap, gap, 0, 0
    for i in order:
        w, h = sizes[i]
        if x + w + gap > width:
            x, y, shelf = gap, y + shelf + gap, 0
        pos[i] = [x, y]
        x += w + gap
        shelf = max(shelf, h)
        used = max(used, x)
    return pos, (used, y + shelf + gap)


def merge_fragments(owner, k, min_frac=0.03):
    """Pieces of a part cut off from its main body (smaller than `min_frac` of the part) go to the part around them."""
    out = owner.copy()
    stray = np.zeros(owner.shape, bool)
    for i in range(k):
        m = (owner == i).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
        if n <= 2:
            continue
        big = st[1:, cv2.CC_STAT_AREA].max()
        for c in range(1, n):
            if st[c, cv2.CC_STAT_AREA] < min_frac * big:
                stray |= lab == c
    if stray.any():
        keep = ((owner >= 0) & ~stray).astype(np.uint8)
        _, near = cv2.distanceTransformWithLabels(1 - keep, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        ys, xs = np.nonzero(keep)
        lut = np.full(near.max() + 1, -1, np.int32)
        lut[near[ys, xs]] = owner[ys, xs]
        out[stray] = lut[near[stray]]
    return out


def clean_layers(img, spec, base_dir, scale, seg=None):
    """The parts cut precisely, at `scale`: the picture is cleaned and redrawn (clean.py: silhouette at the outer
    outline, crisp outlines, recoloured), the cuts follow the outlines (snap_owner, at 1x and again at full size),
    neighbouring parts blend over a pixel, and every part is filled in where parts in front of it hide it."""
    import clean as clean_mod

    parts = spec["parts"]
    cfg = json.load(open(os.path.join(base_dir, spec["clean"]), encoding="utf-8")) if spec.get("clean") else {}
    rules = json.load(open(os.path.join(base_dir, spec["recolor"]), encoding="utf-8"))["rules"] if spec.get("recolor") else None
    owner0 = segment(img if seg is None else seg, parts)
    res = clean_mod.clean(img, scale, rules, owner0, parts, cfg)
    big, fill, owner1 = res["big"], res["fill"], res["owner"]
    H, W = big.shape[:2]
    up = cv2.resize(owner1.astype(np.int32), (W, H), interpolation=cv2.INTER_NEAREST)
    up = np.where(big[..., 3] > 0.02, up, -1)
    missing = (up < 0) & (big[..., 3] > 0.02)
    if missing.any():  # edge pixels the 1x map had as empty: the nearest part
        known = (up >= 0).astype(np.uint8)
        _, near = cv2.distanceTransformWithLabels(1 - known, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        ys, xs = np.nonzero(known)
        lut = np.zeros(near.max() + 1, np.int32)
        lut[near[ys, xs]] = up[ys, xs]
        up = np.where(missing, lut[near], up)
    owner = snap_owner(big, up, parts, cfg.get("ink", 0.3), reach=3 * scale, vote=False)
    owner = merge_fragments(owner, len(parts))
    z = np.array([p.get("z", 0) for p in parts])
    zmap = np.where(owner >= 0, z[np.maximum(owner, 0)], -10**6)
    blur = [cv2.GaussianBlur((owner == i).astype(np.float32), (0, 0), 0.45 * scale) for i in range(len(parts))]
    total = np.maximum(sum(blur), 1e-6)
    fill8 = (np.clip(fill, 0, 1) * 255 + 0.5).astype(np.uint8)
    layers = []
    for i, p in enumerate(parts):
        own = owner == i
        if not own.any():
            layers.append(None)
            continue
        soft = np.clip(blur[i] / total, 0, 1)
        covered = (zmap > p.get("z", 0)) & ~own & (big[..., 3] > 0.02)
        ext = np.zeros_like(own)
        if covered.any():
            hull = np.zeros((H, W), np.uint8)
            cv2.fillConvexPoly(hull, cv2.convexHull(cv2.findNonZero(own.astype(np.uint8))), 1)
            dist = cv2.distanceTransform((~own).astype(np.uint8), cv2.DIST_L2, 5)
            ext = covered & (hull > 0) & (dist < p.get("extend", 20) * scale)
        layer = np.zeros((H, W, 4), np.float32)
        layer[..., :3] = big[..., :3]
        if ext.any():  # hidden area: this part's own colours carried on
            mine = owner1 == i
            hidden = cv2.inpaint(fill8, (~mine).astype(np.uint8), 4, cv2.INPAINT_TELEA).astype(np.float32) / 255
            hidden = cv2.resize(hidden, (W, H), interpolation=cv2.INTER_CUBIC)
            sel = ext & (soft < 0.5)
            layer[sel, :3] = hidden[sel]
        layer[..., 3] = np.maximum(big[..., 3] * soft, ext.astype(np.float32))
        layers.append(layer)
    return layers, owner1, big


def light_layer(l, rect, f, fx):
    """A glow effect as a picture of light: the bright pixels of a part inside `rect`, with their bloom."""
    a = l[..., 3]
    m = np.zeros(a.shape, np.float32)
    x0, y0, x1, y1 = (round(v * f) for v in rect)
    m[y0:y1, x0:x1] = 1
    m = cv2.GaussianBlur(m, (0, 0), 2 * f)
    lum = l[..., :3].max(2)
    th = fx.get("threshold", 0.6)
    e = np.clip((lum - th) / max(1 - th, 1e-6), 0, 1) ** 2 * a * m
    col = hex_rgb(fx["color"]) if fx.get("color") else None
    light = e[..., None] * (col if col is not None else l[..., :3])
    bloom = cv2.GaussianBlur(light, (0, 0), fx.get("radius", 10) * f) * fx.get("spread", 2.5)
    rgb = bloom + light * 0.6
    alpha = np.clip(rgb.max(2), 0, 1)
    return np.dstack([np.where(alpha[..., None] > 1e-4, rgb / np.maximum(alpha[..., None], 1e-4), 0), alpha])


def hex_rgb(c):
    c = c.lstrip("#")
    return np.array([int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def export(img, spec, out, big=None, scale=None, quality=90, seg=None, base_dir="."):
    """Write the parts as one sprite sheet (atlas.webp, with the light layers of the glow effects) plus rig.json for
    rigplayer.js, which moves them live in the browser. Coordinates stay in px of the picture as given; the sheet has
    `scale` image px per picture px. With "clean" (and "recolor") in the rig, the picture is cleaned up first."""
    parts = spec["parts"]
    h, w = img.shape[:2]
    if spec.get("clean") or spec.get("recolor"):
        f = scale or 3
        layers, owner, _ = clean_layers(img, spec, base_dir, f, seg)
    else:
        layers, owner = split(img, spec, seg=seg)
        if big is not None:
            f = big.shape[1] / w
            layers = big_layers(layers, owner, big)
            if scale and abs(scale - f) > 1e-3:
                layers = [None if l is None else cv2.resize(l, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
                          for l in layers]
                f = scale
        else:
            f = scale or 2
            layers = [None if l is None else sharpen_up(l, f) for l in layers]
    os.makedirs(out, exist_ok=True)
    web = spec.get("web", {})
    doc = {"w": w, "h": h, "pad": web.get("pad", 0.08), "intro": web.get("intro_seconds", 3.3),
           "loop": web.get("loop_seconds", 4), "fade": web.get("fade", 0.1), "shake": web.get("shake"),
           "atlas": "atlas.webp", "parts": [], "effects": []}
    names = [p["name"] for p in parts]
    pics = []  # (entry, crop) for the sheet
    for i in sorted(range(len(parts)), key=lambda k: parts[k].get("z", 0)):
        p, l = parts[i], layers[i]
        box = None if l is None else crop_box(l)
        if box is None:
            continue
        e = {"name": p["name"], "box": [round(v / f, 3) for v in box], "pivot": p.get("pivot", [w / 2, h / 2]),
             "loop": p.get("loop", []), "intro": p.get("intro", [])}
        doc["parts"].append(e)
        pics.append((e, l[box[1]:box[1] + box[3], box[0]:box[0] + box[2]]))
    for fx in web.get("effects", []):
        fx = {k: v for k, v in fx.items() if k != "note"}
        if fx["type"] in ("glow", "shine") and "part" not in fx:  # the part that owns most of the rect
            x0, y0, x1, y1 = fx["rect"]
            ids, counts = np.unique(owner[y0:y1, x0:x1], return_counts=True)
            ok = ids >= 0
            fx["part"] = names[int(ids[ok][np.argmax(counts[ok])])]
        if fx["type"] == "glow":
            light = light_layer(layers[names.index(fx["part"])], fx["rect"], f, fx)
            box = crop_box(light)
            if box is None:
                continue
            fx["box"] = [round(v / f, 3) for v in box]
            pics.append((fx, light[box[1]:box[1] + box[3], box[0]:box[0] + box[2]]))
        doc["effects"].append(fx)
    pos, (sw, sh) = pack([(c.shape[1], c.shape[0]) for _, c in pics])
    sheet = np.zeros((sh, sw, 4), np.float32)
    for (e, c), (x, y) in zip(pics, pos):
        sheet[y:y + c.shape[0], x:x + c.shape[1]] = c
        e["frame"] = [x, y, c.shape[1], c.shape[0]]
    Image.fromarray((np.clip(sheet, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(
        os.path.join(out, "atlas.webp"), quality=quality, method=6, alpha_quality=100)
    with open(os.path.join(out, "rig.json"), "w", encoding="utf-8") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    size = sum(os.path.getsize(os.path.join(out, x)) for x in ("atlas.webp", "rig.json"))
    print(f"{len(doc['parts'])} parts, {len(doc['effects'])} effects at {f:g}x, sheet {sw}x{sh} -> {out} ({size // 1024} KB)")
    return doc, sheet


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["split", "export"])
    ap.add_argument("image")
    ap.add_argument("rig")
    ap.add_argument("--out")
    ap.add_argument("--big", help="export: an upscaled copy of the picture (Real-ESRGAN), the parts take their pixels from it")
    ap.add_argument("--scale", type=float, help="export: image px per picture px (default: 3 with clean, the --big factor, else 2)")
    ap.add_argument("--quality", type=int, default=90)
    args = ap.parse_args()
    spec = json.load(open(args.rig, encoding="utf-8"))
    img = load_rgba(args.image)
    out = args.out or os.path.dirname(os.path.abspath(args.rig))
    if args.cmd == "export":
        seg = None
        if spec.get("split_from"):  # find the parts on this picture (e.g. before recolouring)
            seg = load_rgba(os.path.join(os.path.dirname(os.path.abspath(args.rig)), spec["split_from"]))
        export(img, spec, out, load_rgba(args.big) if args.big else None, args.scale, args.quality, seg,
               os.path.dirname(os.path.abspath(args.rig)))
        return
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
