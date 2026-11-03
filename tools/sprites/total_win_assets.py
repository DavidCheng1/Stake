"""Builds the Total Win emblem from the asset sheet examples/total-win/assets-sheet.jpeg (every part drawn separately on a
fake checkerboard): cuts the parts out, puts them together and animates them for ghost-duels-web/rigplayer.js.

    D:\\GhostDuels\\sprite-tools\\venv\\Scripts\\python.exe tools\\sprites\\total_win_assets.py [--out folder] [--preview]

Out: rig.json and atlas.webp (all parts and their light layers on one sheet) in ghost-duels-web/assets/total-win;
--preview also writes preview.png (the rest pose on the game's teal) next to them.

1. Cut: the checkerboard is two flat greys. Everything those greys do not reach from the border is a part; enclosed
   pockets of checkerboard (the counters of O and A, gaps under arms) are taken out again. WIN stands in front of a pair
   of ghosts on the sheet, so it is cut by its gold, plus its outline and rim; the emblem uses the other pair of ghosts.
2. Sharpen: the colours come from a 4x Real-ESRGAN copy of the sheet (SPRITE_TOOLS), the edges from the 1x cut.
3. Compose: LAYOUT puts every part in emblem units (1 unit = 1 sheet pixel), back to front.
4. Light: a teal halo around the wings, letters and ghosts, a warm pulse on the letters, green eyes, glowing runes,
   flickering candles, a white flash at the landing, a shine across the letters and sparkles. All drawn additively by
   the player, so they move with their part.
"""

import argparse
import json
import math
import os
import subprocess

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SHEET = os.path.join(HERE, "examples", "total-win", "assets-sheet.jpeg")
OUT = os.path.join(ROOT, "ghost-duels-web", "assets", "total-win")
TOOLS = os.environ.get("SPRITE_TOOLS", r"D:\GhostDuels\sprite-tools")
ESRGAN = os.path.join(TOOLS, "realesrgan", "realesrgan-ncnn-vulkan.exe")
TMP = os.environ.get("SPRITE_TMP", os.path.join(TOOLS, "tmp"))
PXU = 2.4  # atlas pixels per emblem unit for the parts
GXU = 1.0  # ... for the light layers (they are blurred anyway)
GLOW_PAD = 26  # units of room around a part for its light to fade out

# where each part lies on the sheet (x0, y0, x1, y1): the cut parts whose middle falls inside belong to it
RECTS = {"total": (50, 25, 340, 145), "devil": (445, 20, 578, 140), "ghostA": (750, 30, 858, 160), "ghostB": (858, 45, 950, 140),
         "wingL": (25, 185, 320, 362), "plaque": (330, 150, 700, 372), "wingR": (700, 185, 1005, 362), "win": (30, 370, 350, 530),
         "banner": (360, 392, 668, 552), "crossL": (725, 345, 845, 558), "crossR": (875, 345, 998, 558)}
LETTERS = ("total", "win")
W, H, CX, CY = 900, 480, 450, 220  # the emblem, and the plaque's middle

# ---------------------------------------------------------------- 1. cut


def cut(x):
    """Foreground mask of the sheet (1x)."""
    sat, v = x.max(2) - x.min(2), x.max(2)
    bglike = ((sat < 28) & (v >= 22) & (v <= 92)).astype(np.uint8)
    n, lab = cv2.connectedComponents(bglike, connectivity=4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outer = np.isin(lab, list(border))
    g = x.mean(2)
    letters = np.zeros(g.shape, bool)
    for name in LETTERS:
        x0, y0, x1, y1 = RECTS[name]
        letters[y0:y1, x0:x1] = True
    for i in range(1, n):
        if i in border:
            continue
        m = lab == i
        vals = g[m]
        if len(vals) < 25:
            continue
        dark, light = (np.abs(vals - 33) < 7).mean(), (np.abs(vals - 68) < 7).mean()
        flat = dark + light > .8
        if flat and ((dark > .15 and light > .15) or (len(vals) < 400 and letters[m].mean() > .5)):
            outer |= m  # a pocket of checkerboard, not stone
    return ~outer


def part_masks(x, fg):
    n, lab, st, cen = cv2.connectedComponentsWithStats(fg.astype(np.uint8), connectivity=8)
    masks = {k: np.zeros(fg.shape, bool) for k in RECTS}
    for i in range(1, n):
        if st[i, 4] < 20:
            continue
        for name, (x0, y0, x1, y1) in RECTS.items():
            if x0 <= cen[i][0] < x1 and y0 <= cen[i][1] < y1:
                masks[name] |= lab == i
    # the ghosts' hat and bandana are as grey as the checkerboard, which leaks into them: seal and fill them
    for name in ("ghostA", "ghostB"):
        m = cv2.morphologyEx(masks[name].astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
        holes = m.copy()
        cv2.floodFill(holes, np.zeros((m.shape[0] + 2, m.shape[1] + 2), np.uint8), (0, 0), 1)
        masks[name] = cv2.erode(((m > 0) | (holes == 0)).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0  # off their greyish rim
    # WIN: its gold, grown over its dark outline and teal rim (the ghosts behind it stay out)
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    gold = masks["win"] & (r > 150) & (g > 80) & (b < 120) & (r - b > 50)
    gold = cv2.morphologyEx(gold.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    masks["win"] = (cv2.dilate(gold, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))) > 0) & masks["win"]
    return masks


def upscaled(sheet):
    """The sheet at 4x by Real-ESRGAN, or plainly enlarged when it is missing."""
    big = os.path.join(TMP, "total-win-assets-x4.png")
    if os.path.exists(ESRGAN):
        os.makedirs(TMP, exist_ok=True)
        src = os.path.join(TMP, "total-win-assets.png")
        Image.open(sheet).convert("RGB").save(src)
        r = subprocess.run([ESRGAN, "-i", src, "-o", big, "-n", "realesrgan-x4plus-anime"], cwd=os.path.dirname(ESRGAN), capture_output=True)
        if r.returncode == 0 and os.path.exists(big):
            return np.asarray(Image.open(big).convert("RGB"))
    print("Real-ESRGAN not found: the sheet is enlarged plainly")
    im = Image.open(sheet).convert("RGB")
    return np.asarray(im.resize((im.size[0] * 4, im.size[1] * 4), Image.LANCZOS))


def crop_part(x4, mask, pad=2):
    """A part as RGBA at PXU per unit, and its box on the sheet (x0, y0, w, h) in sheet px."""
    ys, xs = np.nonzero(mask)
    x0, y0, x1, y1 = int(xs.min()) - pad, int(ys.min()) - pad, int(xs.max()) + 1 + pad, int(ys.max()) + 1 + pad
    m = mask[y0:y1, x0:x1].astype(np.float32)
    w, h = round((x1 - x0) * PXU), round((y1 - y0) * PXU)
    a = cv2.resize(m, (w, h), interpolation=cv2.INTER_LINEAR)
    a = np.clip((a - .3) / .4, 0, 1)  # crisp, antialiased edge
    rgb = cv2.resize(x4[y0 * 4:y1 * 4, x0 * 4:x1 * 4], (w, h), interpolation=cv2.INTER_AREA)
    return np.dstack([rgb, a * 255]).astype(np.uint8), (x0, y0, x1 - x0, y1 - y0)

# ---------------------------------------------------------------- 3. compose and animate


def tr(prop, amount, cycles=2, phase=0, wave=None):
    t = {"prop": prop, "amount": amount, "cycles": cycles, "phase": phase}
    if wave:
        t["wave"] = wave
    return t


def keys(prop, *k):
    return {"prop": prop, "keys": [list(x) for x in k]}


def layout(sizes):
    """Where each part goes (top-left in emblem units, scale, mirrored), its pivot and its motion, back to front."""
    pw, ph = sizes["plaque"]
    px0, py0 = CX - pw / 2, CY - ph / 2
    L = {}
    dw, dh = sizes["devil"]
    L["devil"] = dict(at=(CX - dw / 2, py0 - dh + 26), pivot=(CX, py0 + 10),
                      loop=[tr("y", 3, 2, .5)], intro=[keys("y", (.14, -130), (.32, 0, "bounce")), keys("alpha", (.14, 0), (.18, 1, "linear"))])
    ww, wh = sizes["wingL"]
    L["wingL"] = dict(at=(px0 + 34 - ww, py0 + 8), pivot=(px0 + 24, py0 + 70),
                      loop=[tr("rotate", 9, 2, wave="flap"), tr("scaley", .05, 2, .25)],
                      intro=[keys("rotate", (.12, -75), (.34, 0, "back")), keys("alpha", (.12, 0), (.17, 1, "linear"))])
    ww, wh = sizes["wingR"]
    L["wingR"] = dict(at=(px0 + pw - 34, py0 + 8), pivot=(px0 + pw - 24, py0 + 70),
                      loop=[tr("rotate", -9, 2, wave="flap"), tr("scaley", .05, 2, .25)],
                      intro=[keys("rotate", (.12, 75), (.34, 0, "back")), keys("alpha", (.12, 0), (.17, 1, "linear"))])
    for name, side, ph_ in (("crossL", -1, 0), ("crossR", 1, .5)):
        cw, ch = sizes[name]
        bx = CX + side * (pw / 2 + 18)
        L[name] = dict(at=(bx - cw / 2, py0 + ph + 138 - ch), pivot=(bx, py0 + ph + 138),
                       loop=[tr("rotate", 2.5, 2, ph_)],
                       intro=[keys("y", (.30 + ph_ * .06, 150), (.50 + ph_ * .06, 0, "back")), keys("alpha", (.30 + ph_ * .06, 0), (.34 + ph_ * .06, 1, "linear"))])
    bw, bh = sizes["banner"]
    L["banner"] = dict(at=(CX - bw / 2, py0 + ph - 22), pivot=(CX, py0 + ph - 12),
                       loop=[tr("rotate", 1.5, 2, .1), tr("scaley", .02, 2, .35)],
                       intro=[keys("scaley", (.18, 0), (.36, 1, "back")), keys("alpha", (.18, 0), (.22, 1, "linear"))])
    L["plaque"] = dict(at=(px0, py0), pivot=(CX, CY),
                       loop=[],
                       intro=[keys("scale", (0, .3), (.16, 1, "back")), keys("scaley", (.16, 1), (.2, .94, "out"), (.27, 1.03, "inout"), (.34, 1, "inout")),
                              keys("scalex", (.16, 1), (.2, 1.05, "out"), (.27, .985, "inout"), (.34, 1, "inout")), keys("alpha", (0, 0), (.06, 1, "linear"))])
    gw, gh = sizes["ghostA"]
    L["ghostA"] = dict(at=(px0 - 118 - gw / 2, CY + 120 - gh), pivot=(px0 - 118, CY + 120),
                       loop=[tr("y", 6, 2), tr("rotate", 5, 2, .25), tr("scaley", .04, 4, .1)],
                       intro=[keys("x", (.24, -230), (.46, 0, "back")), keys("rotate", (.24, -25), (.46, 0, "back")), keys("alpha", (.24, 0), (.32, 1, "linear"))])
    gw, gh = sizes["ghostB"]
    L["ghostB"] = dict(at=(px0 + pw + 112 - gw / 2, CY + 108 - gh), pivot=(px0 + pw + 112, CY + 108),
                       loop=[tr("y", 6, 2, .4), tr("rotate", -5, 2, .65), tr("scaley", .04, 4, .5)],
                       intro=[keys("x", (.28, 230), (.5, 0, "back")), keys("rotate", (.28, 25), (.5, 0, "back")), keys("alpha", (.28, 0), (.36, 1, "linear"))])
    tw, th = sizes["total"][0] * .86, sizes["total"][1] * .86
    L["total"] = dict(at=(CX - tw / 2, CY - 26 - th / 2), pivot=(CX, CY - 26), scale=.86,
                      loop=[tr("scale", .012, 2)],
                      intro=[keys("y", (.16, -170), (.30, 0, "bounce")), keys("alpha", (.16, 0), (.2, 1, "linear"))])
    nw, nh = sizes["win"][0] * .9, sizes["win"][1] * .9
    L["win"] = dict(at=(CX - nw / 2, CY + 48 - nh / 2), pivot=(CX, CY + 48), scale=.9,
                    loop=[tr("scale", .012, 2, .5)],
                    intro=[keys("scale", (.26, 0), (.38, 1, "back")), keys("alpha", (.26, 0), (.3, 1, "linear"))])
    return L

# ---------------------------------------------------------------- 4. light


def light(alpha, rgb, kind):
    """A light layer for a part (RGBA, same size): halo outside it, or a glow of its bright parts."""
    a = alpha.astype(np.float32) / 255
    blur = lambda m, r: cv2.GaussianBlur(m, (0, 0), r * PXU)
    if kind == "halo":  # teal light around the outline, none on the part itself
        m = np.clip(blur(a, 9) * 1.6, 0, 1) * (1 - a)
        col = (63, 242, 200)
    elif kind == "warm":
        m = blur(a, 5) * a
        col = (255, 207, 90)
    elif kind == "flash":
        m = np.clip(blur(a, 10) * 1.3, 0, 1)
        col = (255, 255, 255)
    else:  # the part's own glowing bits: green eyes, teal runes, candle flames
        x = rgb.astype(np.int16)
        hot = (a > .5) & (x[..., 1] > 140) & (x[..., 1] - x[..., 0] > 60)
        m = np.clip(blur(hot.astype(np.float32), 5) * 2.2, 0, 1)
        col = (93, 255, 154) if kind == "eyes" else (110, 255, 200)
    return np.dstack([np.broadcast_to(np.array(col, np.uint8), m.shape + (3,)), (m * 255).astype(np.uint8)])


def shrink(img, f):
    return cv2.resize(img, (max(1, round(img.shape[1] * f)), max(1, round(img.shape[0] * f))), interpolation=cv2.INTER_AREA)

# ---------------------------------------------------------------- atlas


def pack(images, gap=4):
    """Shelf packing: tallest first. Returns the atlas and each image's frame [x, y, w, h]."""
    order = sorted(images, key=lambda k: -images[k].shape[0])
    width = max(1600, max(im.shape[1] for im in images.values()) + 2 * gap)
    x = y = shelf = gap
    frames = {}
    for k in order:
        h, w = images[k].shape[:2]
        if x + w + gap > width:
            x, y, shelf = gap, y + shelf + gap, 0
        frames[k] = [x, y, w, h]
        x += w + gap
        shelf = max(shelf, h)
    sheet = np.zeros((y + shelf + gap, width, 4), np.uint8)
    for k, (fx, fy, w, h) in frames.items():
        sheet[fy:fy + h, fx:fx + w] = images[k]
    return sheet, frames


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()
    x = np.asarray(Image.open(SHEET).convert("RGB")).astype(np.int16)
    masks = part_masks(x, cut(x))
    x4 = upscaled(SHEET)
    parts, sizes = {}, {}
    for name, m in masks.items():
        img, box = crop_part(x4, m)
        parts[name], sizes[name] = img, (box[2], box[3])
    L = layout(sizes)
    order = ["devil", "wingL", "wingR", "crossL", "crossR", "banner", "plaque", "ghostA", "ghostB", "total", "win"]
    images, rig_parts, effects = {}, [], []
    LIGHTS = {"wingL": ["halo"], "wingR": ["halo"], "ghostA": ["halo"], "ghostB": ["halo"], "total": ["halo", "warm"], "win": ["halo", "warm"],
              "devil": ["eyes"], "plaque": ["hot", "flash"], "banner": ["hot"], "crossL": ["hot"], "crossR": ["hot"]}
    FX = {"halo": dict(amount=.75, min=.55, cycles=2), "warm": dict(amount=.4, min=.15, cycles=2), "hot": dict(amount=.8, min=.35, cycles=4),
          "eyes": dict(amount=.95, min=.35, cycles=4, flash=[[.3, 0], [.35, 1.8], [.55, 1]]), "flash": dict(amount=.4, loop=False, flash=[[.08, 0], [.15, 1], [.45, 0]])}
    for name in order:
        img = parts[name]
        sc = L[name].get("scale", 1)
        (ax, ay), (w, h) = L[name]["at"], (sizes[name][0] * sc, sizes[name][1] * sc)
        images[name] = img
        rig_parts.append({"name": name, "box": [round(ax, 2), round(ay, 2), round(w, 2), round(h, 2)], "pivot": [round(v, 2) for v in L[name]["pivot"]],
                          "loop": L[name]["loop"], "intro": L[name]["intro"]})
        m = round(GLOW_PAD * PXU)
        roomy = np.pad(img, ((m, m), (m, m), (0, 0)))  # the light needs room to fade out
        for kind in LIGHTS.get(name, []):
            lit = light(roomy[..., 3], roomy[..., :3], kind)
            if lit[..., 3].max() < 8:
                continue
            key = f"{name}-{kind}"
            fx = dict(FX[kind])
            if kind == "hot" and name.startswith("cross"):
                fx.update(wave="flicker", cycles=9 if name == "crossL" else 11, phase=0 if name == "crossL" else .3)
            images[key] = shrink(lit, GXU / PXU)
            g = GLOW_PAD * sc
            effects.append({"type": "glow", "part": name, "key": key, **fx, "box": [round(ax - g, 2), round(ay - g, 2), round(w + 2 * g, 2), round(h + 2 * g, 2)]})
    sheet, frames = pack(images)
    for p in rig_parts:
        p["frame"] = frames[p["name"]]
    for e in effects:
        e["frame"] = frames[e.pop("key")]
    tb, nb = rig_parts[order.index("total")]["box"], rig_parts[order.index("win")]["box"]
    effects += [{"type": "shine", "part": "total", "rect": [tb[0], tb[1], tb[0] + tb[2], tb[1] + tb[3]], "amount": .8, "cycles": 1, "sweep": .35, "phase": .55, "width": .08, "angle": 25},
                {"type": "shine", "part": "win", "rect": [nb[0], nb[1], nb[0] + nb[2], nb[1] + nb[3]], "amount": .8, "cycles": 1, "sweep": .35, "phase": .62, "width": .1, "angle": 25},
                {"type": "sparkles", "rect": [CX - 230, CY - 120, CX + 230, CY + 130], "count": 18, "size": 6, "color": "#fff3c4", "cycles": 1, "seed": 7}]
    rig = {"w": W, "h": H, "pad": .03, "intro": 3.3, "loop": 4.2, "fade": .12, "shake": {"amount": 4, "cycles": 14, "duration": .25},
           "atlas": "atlas.webp", "parts": rig_parts, "effects": effects}
    os.makedirs(args.out, exist_ok=True)
    Image.fromarray(sheet).save(os.path.join(args.out, "atlas.webp"), quality=90, method=6)
    with open(os.path.join(args.out, "rig.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(rig, f, separators=(",", ":"))
    print(f"{len(rig_parts)} parts, {len(effects)} effects; atlas {sheet.shape[1]}x{sheet.shape[0]} ({os.path.getsize(os.path.join(args.out, 'atlas.webp')) // 1024} KB) in {args.out}")
    if args.preview:  # the rest pose, parts and lights as the player draws them
        k = 2
        out = Image.new("RGBA", (W * k, H * k), (16, 52, 46, 255))
        for p in rig_parts:
            fx_, fy_, fw, fh = p["frame"]
            bx, by, bw, bh = p["box"]
            im = Image.fromarray(sheet[fy_:fy_ + fh, fx_:fx_ + fw]).resize((round(bw * k), round(bh * k)), Image.LANCZOS)
            out.alpha_composite(im, (round(bx * k), round(by * k)))
            for e in effects:
                if e.get("part") == p["name"] and e["type"] == "glow" and e.get("loop") is not False:
                    gx, gy, gw, gh = e["frame"]
                    ex, ey, ew, eh = e["box"]
                    lit = np.asarray(Image.fromarray(sheet[gy:gy + gh, gx:gx + gw]).resize((round(ew * k), round(eh * k)), Image.LANCZOS)).astype(np.float32)
                    base = np.asarray(out).astype(np.float32)
                    x0, y0 = max(0, round(ex * k)), max(0, round(ey * k))
                    lit = lit[y0 - round(ey * k):, x0 - round(ex * k):]
                    sub = base[y0:y0 + lit.shape[0], x0:x0 + lit.shape[1], :3]
                    lit = lit[:sub.shape[0], :sub.shape[1]]
                    sub += lit[..., :3] * (lit[..., 3:] / 255) * e["amount"] * .75
                    base[y0:y0 + sub.shape[0], x0:x0 + sub.shape[1], :3] = np.clip(sub, 0, 255)
                    out = Image.fromarray(base.astype(np.uint8))
        out.save(os.path.join(args.out, "preview.png"))


if __name__ == "__main__":
    main()
