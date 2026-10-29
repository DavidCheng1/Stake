"""Clean up and upscale cartoon art with black outlines, before it is cut into parts or animated.

    py tools\\sprites\\clean.py picture.png out.png [--scale 3] [--config clean.json] [--rules recolor.json --rig rig.json]
                                [--compare compare.png]

- Cuts the silhouette at the outer black outline: glow halos and leftovers of the background outside it go.
  clean.json: {"dark": 0.45 (darker than this blocks the flood), "close": 5 (gaps in outlines closed, px),
  "keep": [[[x, y], ...], ...] (polygons kept whole: a flame or a lit dome without an outline), "ink": 0.3 (darker thin
  lines are redrawn as outlines), "glow": {"hue": [330, 25], "sat": 0.5}
  (colour of a glow around the art, peeled off), "peel": 12 (px of glow at most), "drop": [[x, y], ...]
  (pockets of glow enclosed by the art: the area between outlines around each point goes), "stroke": 1.4 (width of the even outline
  drawn all round, px of the picture), "smooth": true}. Check the cut on a bright background with --compare.
- With `--rig`, the parts are found and their cuts moved onto the outlines (rig.snap_owner), and recolour rules that
  name parts use them.
- Smooths speckle out of the colours (edge-preserving), and recolours them with recolor.py rules when given
  (`--rig` lets rules name parts).
- Redraws at `--scale`: the colours are upscaled without their outlines, then the outlines and the silhouette are drawn
  on top as crisp, anti-aliased shapes. Cartoon art comes out much sharper than with plain resizing.
"""

import argparse
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recolor as recolor_mod  # noqa: E402
import rig as rig_mod  # noqa: E402

INK_RGB = np.array([0.035, 0.03, 0.045], np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def ink_lines(rgb, a, dark=0.3, thick=9):
    """Outlines: dark and thin (big dark areas such as a shadowed panel are not lines). Returns the line mask and a
    darkness field (1 = black) around it, which carries the anti-aliasing of the line's edges."""
    V = rgb.max(2)
    dark_m = ((V < dark) & (a > 0.3)).astype(np.uint8)
    body = cv2.morphologyEx(dark_m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (thick, thick)))
    line = (dark_m > 0) & (body == 0)
    near = cv2.dilate(line.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    k = np.clip((0.5 - V) / 0.5, 0, 1) * near
    return line, k.astype(np.float32), dark_m > 0


def silhouette(rgb, a, dark=0.45, close=5, keep=(), glow=None, peel=12, black=0.08, drop=(), ink=0.3):
    """Inside of the outer outline: flood the outside through everything that isn't dark, after closing small gaps in
    the outlines. Then peel the glow off the rim, up to `peel` px deep and never through a black (< `black`) pixel:
    dark fringe (darker than `dark`) and, with `glow` {"hue": [lo, hi], "sat": min}, glow-coloured pixels.
    `keep` polygons (where a shape has no outline, e.g. a flame or a lit dome) block the flood and stay whole.
    `drop` points [x, y]: the area between outlines around each goes too (a pocket of glow enclosed by the art)."""
    h, w = a.shape
    V = rgb.max(2)
    barrier = cv2.morphologyEx(((V < dark) & (a > 0.3)).astype(np.uint8), cv2.MORPH_CLOSE,
                               cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close, close)))
    kept = np.zeros((h, w), np.uint8)
    for poly in keep:
        cv2.fillPoly(kept, [np.int32(poly)], 1)
    barrier |= kept
    canvas = np.pad((barrier == 0).astype(np.uint8), 1, constant_values=1)
    cv2.floodFill(canvas, np.zeros((h + 4, w + 4), np.uint8), (0, 0), 2, flags=4)
    inside = (canvas[1:-1, 1:-1] != 2) & ((a > 0.5) | (barrier > 0))
    peelable = (V >= black) & (kept == 0) & (V < dark)
    if glow:
        hsv = cv2.cvtColor(rgb.astype(np.float32), cv2.COLOR_RGB2HSV)
        lo, hi = glow["hue"]
        hue_in = ((hsv[..., 0] - lo) % 360) <= ((hi - lo) % 360)
        peelable |= (V >= black) & (kept == 0) & hue_in & (hsv[..., 1] >= glow.get("sat", 0.5))
    for _ in range(peel):
        out = cv2.dilate((~inside).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        rim = inside & out & peelable
        if not rim.any():
            break
        inside &= ~rim
    inside = rig_mod.fill_holes(inside.astype(np.uint8)) & (a > 0.02)
    if drop:  # after the peel, which works only inwards from the real outside
        _, lab = cv2.connectedComponents((inside & (V >= ink)).astype(np.uint8), connectivity=4)
        for x, y in drop:
            if lab[y, x] > 0:
                inside &= lab != lab[y, x]
    return inside


def up(x, W, H, blur):
    """Smooth upscale of a field, blurred a little so diagonal steps become straight edges before thresholding."""
    x = cv2.resize(x, (W, H), interpolation=cv2.INTER_CUBIC)
    return cv2.GaussianBlur(x, (0, 0), blur) if blur > 0 else x


def clean(img, scale=3, rules=None, owner=None, parts=None, cfg=None):
    """Redraw the picture `scale` times bigger. Returns a dict: "big" (RGBA), "fill" (the colours without outlines,
    recoloured, at 1x), "inside" (the silhouette at 1x) and "owner" (the parts at 1x, snapped to the outlines).
    cfg: {"dark": 0.45, "close": 5, "keep": [polygons], "glow": {...}, "peel": 12, "ink": 0.3, "stroke": 1.4,
    "smooth": true}."""
    cfg = cfg or {}
    rgb, a = img[..., :3], img[..., 3]
    line, k, _ = ink_lines(rgb, a, cfg.get("ink", 0.3))
    inside = silhouette(rgb, a, cfg.get("dark", 0.45), cfg.get("close", 5), cfg.get("keep", ()), cfg.get("glow"),
                        cfg.get("peel", 12), drop=cfg.get("drop", ()), ink=cfg.get("ink", 0.3))
    k = k * inside
    names = [p["name"] for p in parts] if parts else None
    if owner is not None and parts:
        cut = np.dstack([rgb, a * inside])
        owner = rig_mod.snap_owner(cut, np.where(inside, owner, -1), parts, cfg.get("ink", 0.3))
    # coverage of the outer edge: outline pixels on the rim are partly outside
    rim = inside & (cv2.erode(inside.astype(np.uint8), np.ones((3, 3), np.uint8)) == 0)
    F = inside.astype(np.float32)
    F[rim] = np.clip(np.maximum(k[rim] * 1.25, a[rim] * (k[rim] < 0.05)), 0, 1)
    # colours without the outlines, spread outwards, speckle smoothed
    rgb8 = (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)
    if cfg.get("smooth", True):
        rgb8 = cv2.bilateralFilter(rgb8, 5, 28, 3)
    hole = (cv2.dilate((k > 0.25).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0) | ~inside
    fill = cv2.inpaint(rgb8, hole.astype(np.uint8), 3, cv2.INPAINT_TELEA).astype(np.float32) / 255
    if rules:
        lab = rig_mod.regions(np.dstack([rgb, a * inside]), cfg.get("ink", 0.3))[1]
        fill = recolor_mod.recolor(np.dstack([fill, np.ones_like(a)]), rules, owner, names, lab)[..., :3]
    h, w = a.shape
    W, H = round(w * scale), round(h * scale)
    soft = 0.3 * scale
    big_fill = np.clip(cv2.resize(fill, (W, H), interpolation=cv2.INTER_CUBIC), 0, 1)
    ink = smoothstep(0.36, 0.56, up(k, W, H, soft))
    alpha = smoothstep(0.42, 0.58, up(F, W, H, soft))
    # an even outline all round the silhouette, where the picture's own was cut off or thin
    edge = cv2.distanceTransform((alpha > 0.5).astype(np.uint8), cv2.DIST_L2, 5)
    sw = cfg.get("stroke", 1.4) * scale
    ink = np.maximum(ink, smoothstep(sw + 0.8, sw - 0.8, edge) * (alpha > 0.01))
    out = np.dstack([big_fill * (1 - ink[..., None]) + INK_RGB * ink[..., None], alpha])
    return {"big": out.astype(np.float32), "fill": fill, "inside": inside, "owner": owner}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image")
    ap.add_argument("out")
    ap.add_argument("--scale", type=float, default=3)
    ap.add_argument("--rules", help="recolor.py rules")
    ap.add_argument("--rig", help="rig.json, for rules that name parts (parts are found on its split_from picture)")
    ap.add_argument("--config", help="clean.json (see above)")
    ap.add_argument("--compare", help="write the picture before and after, side by side, on a dark background")
    args = ap.parse_args()
    img = rig_mod.load_rgba(args.image)
    rules = owner = parts = None
    if args.rules:
        rules = json.load(open(args.rules, encoding="utf-8"))["rules"]
    if args.rig:
        spec = json.load(open(args.rig, encoding="utf-8"))
        seg = img
        if spec.get("split_from"):
            seg = rig_mod.load_rgba(os.path.join(os.path.dirname(os.path.abspath(args.rig)), spec["split_from"]))
        owner = rig_mod.segment(seg, spec["parts"])
        parts = spec["parts"]
    cfg = json.load(open(args.config, encoding="utf-8")) if args.config else None
    out = clean(img, args.scale, rules, owner, parts, cfg)["big"]
    Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(args.out)
    if args.compare:
        bg = np.array([0.08, 0.1, 0.1], np.float32)
        before = cv2.resize(img, (out.shape[1], out.shape[0]), interpolation=cv2.INTER_CUBIC)
        pair = [np.clip(x[..., :3] * x[..., 3:] + bg * (1 - x[..., 3:]), 0, 1) for x in (before, out)]
        Image.fromarray((np.concatenate(pair, 0) * 255).astype(np.uint8)).save(args.compare)
    print(f"{img.shape[1]}x{img.shape[0]} -> {out.shape[1]}x{out.shape[0]} -> {args.out}")


if __name__ == "__main__":
    main()
