"""Builds the four win-tier titles (BIG, SUPER, MEGA, EPIC WIN) from the pictures in examples/win-tiers (each painted
on a fake checkerboard) for ghost-duels-web/rigplayer.js: cut out with their glow, sharpened, and given lights.

    D:\\GhostDuels\\sprite-tools\\venv\\Scripts\\python.exe tools\\sprites\\win_tiers_assets.py [big super ...] [--out folder] [--preview]

Out: <tier>/rig.json and <tier>/atlas.webp in ghost-duels-web/assets/win-tiers; --preview also writes <tier>.png (the
rest pose on the game's dark backdrop and on white, to check the cut) to SPRITE_TMP/win-tiers-preview.

1. Checkerboard: its cells are found from their edges (an even grid, about 17 px), then every cell that shows gets its
   own grey (the painted board is not quite regular), and the hidden cells their light or dark grey by alternation.
2. Cut: the glow is painted over the board, so the board shows through it. Against the rebuilt board every pixel is
   un-matted into its own colour and opacity (light over a known background). Paint is opaque: the shapes closed by
   the letters' and frame's rims, grey material (chains, anchors, blades, bone), anything nearly opaque, and the black
   outline where it runs over the board's black cells (just as black as they are). Only as much of the board is taken
   out as visibly shows (opaque smoke stays as painted); what is still left of it is cut out at the board's own
   frequencies, and the faintest haze and the picture's edge fade out.
3. Sharpen: opaque areas take their colours from a 4x Real-ESRGAN copy (SPRITE_TOOLS); the glow stays soft.
4. Light: the tier's flames flicker, the brightest spots pulse, and each picture's own lights (eyes, moon, lanterns,
   lightning, cannon fire) are set in TIERS; a white flash when it lands, a shine across the letters and sparkles.
   All drawn additively by the player.
"""

import argparse
import colorsys
import json
import os
import subprocess
import warnings

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(HERE, "examples", "win-tiers")
OUT = os.path.join(ROOT, "ghost-duels-web", "assets", "win-tiers")
TOOLS = os.environ.get("SPRITE_TOOLS", r"D:\GhostDuels\sprite-tools")
ESRGAN = os.path.join(TOOLS, "realesrgan", "realesrgan-ncnn-vulkan.exe")
TMP = os.environ.get("SPRITE_TMP", os.path.join(TOOLS, "tmp"))
PXU = 1.5  # atlas pixels per picture pixel for the title
GXU = .5  # ... for the light layers (they are blurred anyway)
LETTERS = (140, 255, 895, 445)  # where the words are, the same on all four pictures

# per tier: the flame colour (the hue that flickers) and its own lights: (kind, rect x0 y0 x1 y1, colour or None for
# the picture's own, amount, cycles, wave). kinds: "spot" (the bright pixels in rect), "disc" (everything opaque in rect)
TIERS = {
    "big": dict(hue=(205, 90, 255), lights=[("spot", (480, 150, 555, 195), (200, 120, 255), 1.0, 3, "sin")]),
    "super": dict(hue=(60, 235, 215), lights=[("disc", (385, 18, 690, 300), (90, 255, 230), .35, 1, "sin")]),
    "mega": dict(hue=(255, 120, 40), lights=[("disc", (355, 40, 680, 330), (255, 120, 50), .35, 1, "sin"),
                                             ("spot", (480, 150, 560, 195), (255, 170, 80), 1.0, 3, "sin")]),
    "epic": dict(hue=(70, 255, 150), lights=[("spot", (395, 20, 630, 200), (120, 255, 150), .9, 7, "flicker"),
                                             ("spot", (250, 0, 380, 130), (190, 255, 230), 1.0, 2, "strike"),
                                             ("spot", (600, 0, 860, 130), (190, 255, 230), 1.0, 3, "strike"),
                                             ("spot", (20, 140, 190, 370), (255, 170, 60), .9, 11, "flicker"),
                                             ("spot", (835, 140, 1010, 370), (255, 170, 60), .9, 13, "flicker")]),
}

# ---------------------------------------------------------------- 1. the checkerboard


def grid_axis(prof, period=17.0):
    """Cell edges along one axis from a count of edge pixels (prof[i]: between pixels i and i+1): offset and period of
    the even grid that runs through most of them."""
    prof = np.convolve(prof.astype(float), [.5, 1, .5], "same")
    n, best = len(prof), (-1, 0, period)
    for p in np.arange(period - .4, period + .4, .002):
        k = np.arange(-1, n / p + 1)
        for b0 in np.arange(0, p, .25):
            at = np.round(b0 + k * p - .5).astype(int)
            at = at[(at >= 0) & (at < n)]
            sc = prof[at].sum()
            if sc > best[0]:
                best = (sc, b0, p)
    return best[1], best[2]


def checkerboard(x):
    """The board's cells: where they lie, which of them show, their greys, and light or dark for each."""
    H, W = x.shape[:2]
    g, sat = x.mean(2), x.max(2) - x.min(2)
    neutral = (sat < 16) & (g < 56)
    dx, dy = np.abs(np.diff(g, axis=1)), np.abs(np.diff(g, axis=0))
    bx, px = grid_axis(((dx > 10) & neutral[:, 1:] & neutral[:, :-1]).sum(0))
    by, py = grid_axis(((dy > 10) & neutral[1:] & neutral[:-1]).sum(1))
    ix, iy = np.floor((np.arange(W) - bx) / px).astype(int), np.floor((np.arange(H) - by) / py).astype(int)
    ix, iy = ix - ix.min(), iy - iy.min()
    ncx, ncy = ix.max() + 1, iy.max() + 1
    cid = iy[:, None] * ncx + ix[None, :]
    fx, fy = ((np.arange(W) - bx) / px) % 1, ((np.arange(H) - by) / py) % 1
    middle = (np.minimum(fx, 1 - fx)[None, :] * px > 3) & (np.minimum(fy, 1 - fy)[:, None] * py > 3)
    n_in = np.bincount(cid[middle], minlength=ncx * ncy)
    sel = middle & neutral
    n_ok = np.bincount(cid[sel], minlength=ncx * ncy)
    mean = np.stack([np.bincount(cid[sel], weights=x[..., c][sel], minlength=ncx * ncy) for c in range(3)], 1) / np.maximum(n_ok, 1)[:, None]
    sq = np.bincount(cid[sel], weights=g[sel] ** 2, minlength=ncx * ncy) / np.maximum(n_ok, 1)
    flat = sq - mean.mean(1) ** 2 < 25  # one even grey: the cell itself, even where the picture covers most of it
    seen = (n_ok > .15 * np.maximum(n_in, 1)) & (n_ok >= 12) & flat
    lum = mean.mean(1)
    lo, hi = np.percentile(lum[seen], 25), np.percentile(lum[seen], 75)
    light = lum > (lo + hi) / 2
    # and of the board's own two greys: an even, faint haze over a cell is not the cell
    gl, gd = np.median(lum[seen & light]), np.median(lum[seen & ~light])
    seen &= np.where(light, np.abs(lum - gl), np.abs(lum - gd)) < 6
    # hidden cells alternate, by majority over the cells that show (and are put right later where they visibly do not)
    par = (np.arange(ncx * ncy) % ncx + np.arange(ncx * ncy) // ncx) % 2
    s = int(((par == 1) == light)[seen].mean() > .5)
    # the light and the dark grey at every cell: smooth maps of the cells that show
    greys = []
    for want in (True, False):
        m = (seen & (light == want)).reshape(ncy, ncx).astype(np.float32)
        w = cv2.GaussianBlur(m, (0, 0), 3)
        val = mean.reshape(ncy, ncx, 3).astype(np.float32)
        sm = np.stack([cv2.GaussianBlur(val[..., c] * m, (0, 0), 3) for c in range(3)], 2) / np.maximum(w, 1e-4)[..., None]
        greys.append(np.where(w[..., None] > .02, sm, np.median(mean[seen & (light == want)], 0)).reshape(-1, 3))
    return dict(cid=cid, shape=(ncy, ncx), period=(px, py), middle=middle, seen=seen, light=np.where(seen, light, par == s), L=greys[0], D=greys[1],
                obs=mean, info=f"grid {px:.3f} x {py:.3f} px, {seen.mean() * 100:.0f}% of cells show")


def paint(bd, cells=None):
    """The board as a picture (float RGB): the cells that show in their own grey, the hidden ones light or dark."""
    if cells is None:
        cells = np.where(bd["light"][:, None], bd["L"], bd["D"])
        cells[bd["seen"]] = bd["obs"][bd["seen"]]
    return cv2.GaussianBlur(cells[bd["cid"]].astype(np.float32), (0, 0), .8)


def cell_step(g, use, bd):
    """Per cell: its brightness (the pixels in use, in its middle) minus its neighbours', nan where too little is in use."""
    ncy, ncx = bd["shape"]
    sel = (use & bd["middle"]).ravel()
    cid = bd["cid"].ravel()[sel]
    n = np.bincount(cid, minlength=ncx * ncy)
    m = np.bincount(cid, weights=g.ravel()[sel], minlength=ncx * ncy) / np.maximum(n, 1)
    m = np.pad(np.where(n >= 20, m, np.nan).reshape(ncy, ncx), 1, constant_values=np.nan)
    with warnings.catch_warnings():  # a cell without neighbours in use: nan
        warnings.simplefilter("ignore")
        nb = np.nanmean(np.stack([m[:-2, 1:-1], m[2:, 1:-1], m[1:-1, :-2], m[1:-1, 2:]]), 0)
    return (m[1:-1, 1:-1] - nb).ravel()


def unmatte(x, B, lightcell):
    """Opacity of light over the board B: the least that explains the pixel (0..1)."""
    d = x - B
    up = (np.clip(d, 0, None) / np.maximum(255 - B, 1)).max(2)
    down = np.where(lightcell, (np.clip(-d, 0, None) / np.maximum(B, 1)).max(2), 0)
    return np.maximum(np.clip((up - .015) / .985, 0, 1), np.clip((down - .15) / .85, 0, 1))


def paint_mask(x, B, bd, a, board):
    """Where the picture is opaque paint."""
    d = x - B
    diff = np.abs(d).max(2)
    g = x.mean(2)
    # grey material (its colour is not a light's, and it is like neither of the board's greys: a cell guessed wrong is
    # not paint), and nearly opaque
    chroma = d.max(2) - d.min(2)
    unlike = np.minimum(np.abs(x - paint(bd, bd["L"])).max(2), np.abs(x - paint(bd, bd["D"])).max(2)) >= 14
    # nor flat, dark and neutral: some cells are painted in a third grey between the two
    sd = np.sqrt(np.maximum(cv2.blur(g ** 2, (7, 7)) - cv2.blur(g, (7, 7)) ** 2, 0))
    flat = (sd < 3) & (g < 48) & (x.max(2) - x.min(2) < 16)
    grey = ~board & unlike & ~flat & (diff >= 14) & (chroma < .35 * np.abs(d).max(2))
    grey = cv2.morphologyEx(grey.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)) > 0  # not single specks
    solid = grey | (a >= .75)
    # the letters' gold rims, sealed
    mx, mn = x.max(2), x.min(2)
    hue = np.where(mx == x[..., 0], ((x[..., 1] - x[..., 2]) / np.maximum(mx - mn, 1e-3)) % 6, 9) * 60  # red-to-yellow hues only
    gold = (hue > 18) & (hue < 62) & (mx > 110) & ((mx - mn) / np.maximum(mx, 1) > .3)
    lx0, ly0, lx1, ly1 = LETTERS
    band = np.zeros(gold.shape, bool)
    band[ly0:ly1, lx0:lx1] = True
    rims = cv2.morphologyEx((gold & band).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)) > 0
    # closed shapes (letters, the frame's fields, gaps in chains): filled where the board does not show inside, i.e. its
    # light cells there are no brighter than its dark ones
    closed = (solid | rims | (a >= .5)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(1 - closed, connectivity=4)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    lightcell = B.mean(2) > 18
    li, dk = (bd["middle"] & lightcell).ravel(), (bd["middle"] & ~lightcell).ravel()
    lb = lab.ravel()
    s_l, n_l = np.bincount(lb[li], weights=g.ravel()[li], minlength=n), np.bincount(lb[li], minlength=n)
    s_d, n_d = np.bincount(lb[dk], weights=g.ravel()[dk], minlength=n), np.bincount(lb[dk], minlength=n)
    contrast = np.where((n_l >= 8) & (n_d >= 8), s_l / np.maximum(n_l, 1) - s_d / np.maximum(n_d, 1), 0)
    fill = np.array([i not in edge and st[i, 4] < 30000 and contrast[i] < 5 for i in range(n)])
    fill[0] = False
    solid |= (fill[lab] & (closed == 0)) | rims
    # the black outline where it runs over the board's black (as black as the board there)
    near = cv2.dilate(solid.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0
    return solid | (board & (x.max(2) < 16) & near)


def notch(img, bd, r=2.5):
    """img (H x W x C) without the board's periodic pattern: its cells alternate at half the cell rate in x and y, and
    its edges repeat at the cell rate, so all of it lies on a few points of the spectrum; those are cut out (Gaussian
    notches r bins wide)."""
    H, W = img.shape[:2]
    px, py = bd["period"]
    u = np.fft.fftfreq(W)[None, :] * W
    v = np.fft.fftfreq(H)[:, None] * H
    fx, fy = W / (2 * px), H / (2 * py)  # the alternation, in bins
    keep = np.ones((H, W))
    pts = [(i * fx, j * fy) for i in range(-int(W / 2 / fx) - 1, int(W / 2 / fx) + 2) for j in range(-int(H / 2 / fy) - 1, int(H / 2 / fy) + 2)
           if (i % 2 and j % 2) or (i % 2 == 0 and j == 0 and i) or (j % 2 == 0 and i == 0 and j)]  # cells; edge lines
    for cu, cv in pts:
        du = (u - cu + W / 2) % W - W / 2
        dv = (v - cv + H / 2) % H - H / 2
        keep *= 1 - np.exp(-(du ** 2 + dv ** 2) / (2 * r * r))
    out = np.empty_like(img, dtype=np.float32)
    for c in range(img.shape[2]):
        out[..., c] = np.real(np.fft.ifft2(np.fft.fft2(img[..., c]) * keep))
    return out


def cut(x, bd):
    """Colour (float RGB) and opacity (0..1) of the picture without the board."""
    x = x.astype(np.float32)
    g = x.mean(2)
    neutral = x.max(2) - x.min(2) < 16
    L, D = (paint(bd, bd[k]).mean(2) for k in ("L", "D"))

    clean = bd["seen"][bd["cid"]]

    def board_at(B):  # nothing over the board: it matches its cell (closely, where the cell is hidden), or the other
        # grey where the cell was guessed wrong. A looser match over hidden cells would drop faint haze over the dark cells
        # only, and draw the board into it.
        diff = np.abs(x - B).max(2)
        return (diff < np.where(clean, 5, 4)) | (neutral & ((np.abs(g - L) < 4) | (np.abs(g - D) < 4)))

    for _ in range(2):  # the second time with the hidden cells put right
        B = paint(bd)
        board = board_at(B)
        a = np.where(board, 0, unmatte(x, B, B.mean(2) > 18))
        solid = paint_mask(x, B, bd, a, board)
        # a hidden cell is light where it is brighter than its neighbours (the painted board is not quite regular)
        t = cell_step(g, ~solid, bd)
        fix = ~bd["seen"] & (np.abs(np.nan_to_num(t)) > 6)
        bd["light"] = np.where(fix, np.nan_to_num(t) > 0, bd["light"])
    # How much of the board shows at each cell: its step against the neighbours, (1 - opacity) of the full step. Only
    # that much of the board is taken out, so opaque smoke is not un-matted into an inverted board. Averaged over the
    # cells around (signed): the picture's own texture is about as strong as a faint board's step, but it does not keep
    # to the board's alternation, so it cancels out.
    full = np.maximum((bd["L"] - bd["D"]).mean(1), 8)
    sign = np.where(bd["light"], 1, -1)

    def shows(lum, unknown):
        t = cell_step(lum, ~solid, bd)
        ok = ~np.isnan(t)
        v = np.where(ok, np.nan_to_num(t) * sign / full, 0).reshape(bd["shape"]).astype(np.float32)
        sw = cv2.GaussianBlur(ok.reshape(bd["shape"]).astype(np.float32), (0, 0), 1.2)
        v = np.where(sw > .15, cv2.GaussianBlur(v, (0, 0), 1.2) / np.maximum(sw, 1e-4), unknown).ravel()
        return cv2.GaussianBlur(v[bd["cid"]].astype(np.float32), (0, 0), 4)

    mid = (paint(bd, bd["L"]) + paint(bd, bd["D"])) / 2
    vis = np.clip(shows(g, 1), 0, 1)
    vis[bd["seen"][bd["cid"]]] = 1
    for i in range(3):  # then twice more by what is still left of the board, laid over its middle grey
        lam = np.clip(vis / np.maximum(1 - a, .05), 0, 1)[..., None]
        Bs = mid + lam * (B - mid)
        a = np.where(board, 0, unmatte(x, Bs, B.mean(2) > 18))
        a = np.where(a < .02, 0, a)
        alpha = np.where(solid, 1, a)
        F = np.where(alpha[..., None] > 0, Bs + (x - Bs) / np.maximum(alpha[..., None], 1e-3), 0)
        F = np.clip(np.where(solid[..., None], x, F), 0, 255)
        if i < 2:
            over = (F * alpha[..., None] + mid * (1 - alpha[..., None])).mean(2)
            vis = np.clip(vis + shows(over, 0), 0, 1)  # over the middle grey, the board left is (what shows - vis)
    # what is still left of the board in the glow's light (its colour times opacity: what shows over a dark backdrop)
    # is taken out at the board's own frequencies; the opacity only grows where the light needs it
    pm = np.dstack([F * alpha[..., None], alpha[..., None] * 255])
    glow = cv2.GaussianBlur((~solid).astype(np.float32), (0, 0), 2)[..., None]
    pm = np.clip(pm - (pm - notch(pm, bd)) * glow, 0, None)
    alpha = np.where(solid, 1, np.clip(np.maximum(pm[..., 3], pm[..., :3].max(2)) / 255, 0, 1))
    pm = pm[..., :3]
    alpha = np.where(alpha < .01, 0, alpha)
    F = np.where(solid[..., None], F, pm / np.maximum(alpha[..., None], 1e-3))
    # the faintest haze (where the painted board's uneven seams would still show) and the glow at the picture's edge
    # fade out, so it blends into the game's dark backdrop
    H, W = alpha.shape
    edge = np.minimum(np.minimum(np.arange(W)[None, :], W - 1 - np.arange(W)[None, :]), np.minimum(np.arange(H)[:, None], H - 1 - np.arange(H)[:, None]))
    fade = np.clip((alpha - .03) / .12, 0, 1) * np.clip(edge / 60, 0, 1) ** .7
    alpha = np.where(solid, alpha, alpha * fade) * np.clip(edge / 30, 0, 1) ** .5  # and everything softly at the very edge
    return np.clip(F, 0, 255), alpha.astype(np.float32)


def upscaled(path, name):
    """The picture at 4x by Real-ESRGAN, or plainly enlarged when it is missing."""
    big = os.path.join(TMP, f"win-tier-{name}-x4.png")
    if os.path.exists(big) and os.path.getmtime(big) > os.path.getmtime(path):  # made before from this picture
        return np.asarray(Image.open(big).convert("RGB"))
    if os.path.exists(ESRGAN):
        os.makedirs(TMP, exist_ok=True)
        src = os.path.join(TMP, f"win-tier-{name}.png")
        Image.open(path).convert("RGB").save(src)
        r = subprocess.run([ESRGAN, "-i", src, "-o", big, "-n", "realesrgan-x4plus-anime"], cwd=os.path.dirname(ESRGAN), capture_output=True)
        if r.returncode == 0 and os.path.exists(big):
            return np.asarray(Image.open(big).convert("RGB"))
    print("Real-ESRGAN not found: the picture is enlarged plainly")
    im = Image.open(path).convert("RGB")
    return np.asarray(im.resize((im.size[0] * 4, im.size[1] * 4), Image.LANCZOS))


def title_image(F, alpha, x4, box):
    """The title at PXU per picture pixel: glow from the cut, opaque paint from the sharp copy."""
    x0, y0, w, h = box
    W, H = round(w * PXU), round(h * PXU)
    sl = (slice(y0, y0 + h), slice(x0, x0 + w))
    a = cv2.resize(alpha[sl], (W, H), interpolation=cv2.INTER_LINEAR)
    f = cv2.resize(F[sl].astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
    sharp = cv2.resize(x4[y0 * 4:(y0 + h) * 4, x0 * 4:(x0 + w) * 4], (W, H), interpolation=cv2.INTER_AREA).astype(np.float32)
    k = np.clip((a - .9) / .1, 0, 1)[..., None]
    col = sharp * k + f * (1 - k)
    return np.dstack([np.clip(col, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8)

# ---------------------------------------------------------------- 4. light


def hsv(rgb):
    return np.array(colorsys.rgb_to_hsv(*(np.array(rgb) / 255)))


def layer(mask, colour, blur):
    """A light layer: colour (RGB, or a per-pixel colour image) where mask is, softened by blur px."""
    m = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), blur) if blur else mask.astype(np.float32)
    if np.ndim(colour) == 3:
        c = cv2.GaussianBlur(colour.astype(np.float32) * mask[..., None], (0, 0), blur) / np.maximum(m[..., None], 1e-4)
        c = c / np.maximum(c.max(2, keepdims=True), 1) * 255  # its own colour, at full brightness
    else:
        c = np.broadcast_to(np.array(colour, np.float32), m.shape + (3,))
    return np.dstack([np.clip(c, 0, 255), np.clip(m * 1.6, 0, 1) * 255]).astype(np.uint8)


def lights(F, alpha, cfg):
    """(name, RGBA at 1x over the whole picture, effect settings) for every light of a tier."""
    x = F * alpha[..., None]
    v = x.max(2)
    s = (x.max(2) - x.min(2)) / np.maximum(v, 1)
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    mx, mn = x.max(2), x.min(2)
    dd = np.maximum(mx - mn, 1e-3)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) / 6
    th = hsv(cfg["hue"])[0]
    dh = np.minimum(np.abs(h - th), 1 - np.abs(h - th))
    out = []
    lx0, ly0, lx1, ly1 = LETTERS
    words = np.zeros(alpha.shape, bool)
    words[ly0:ly1, lx0:lx1] = True
    words &= alpha > .95  # the letters themselves, often in the flames' colour: they stay as painted
    flames = (dh < .07) & (s > .45) & (v > 150) & (alpha > .3) & ~words
    out.append(("flames", layer(flames, F, 3), dict(amount=.5, min=0, cycles=9, wave="flicker")))
    hot = (v > 232) & (alpha > .5)
    out.append(("hot", layer(hot, F, 4), dict(amount=.45, min=.15, cycles=3, phase=.3)))
    out.append(("flash", layer(alpha > .5, (255, 255, 255), 8), dict(amount=.55, loop=False, flash=[[0, 0], [.22, 0], [.3, 1], [.7, 0]])))
    for i, (kind, (x0, y0, x1, y1), col, amount, cycles, wave) in enumerate(cfg["lights"]):
        inside = np.zeros(alpha.shape, bool)
        inside[y0:y1, x0:x1] = True
        if kind == "disc":
            m, blur = inside & (alpha > .6), 10
        else:
            m, blur = inside & (v > 175) & (alpha > .3), 3
        fx = dict(amount=amount, min=0 if wave != "sin" else .15, cycles=cycles, wave=wave, phase=round(.17 * i, 2))
        out.append((f"light{i}", layer(m, col if col else F, blur), fx))
    return out

# ---------------------------------------------------------------- atlas and rig


def pack(images, gap=4):
    """Shelf packing, tallest first: the atlas and each image's frame [x, y, w, h]."""
    order = sorted(images, key=lambda k: -images[k].shape[0])
    width = max(im.shape[1] for im in images.values()) + 2 * gap
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


def crop_box(m):
    ys, xs = np.nonzero(m)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def build(name, out_dir, preview):
    path = os.path.join(SRC, name + ".png")
    x = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    bd = checkerboard(x)
    info = bd["info"]
    F, alpha = cut(x, bd)
    x0, y0, x1, y1 = crop_box(alpha > .04)
    W, H = x1 - x0, y1 - y0
    box = (x0, y0, W, H)
    title = title_image(F, alpha, upscaled(path, name), box)
    images = {"title": title}
    effects = []
    for key, lit, fx in lights(F, alpha, TIERS[name]):
        lit = lit[y0:y1, x0:x1]
        if lit[..., 3].max() < 8:
            continue
        images[key] = cv2.resize(lit, (max(1, round(W * GXU)), max(1, round(H * GXU))), interpolation=cv2.INTER_AREA)
        effects.append({"type": "glow", "part": "title", "key": key, **fx, "box": [0, 0, W, H]})
    sheet, frames = pack(images)
    for e in effects:
        e["frame"] = frames[e.pop("key")]
    cx, cy = W / 2, H * .62  # it lands on the words
    part = {"name": "title", "box": [0, 0, W, H], "pivot": [round(cx, 1), round(cy, 1)], "frame": frames["title"],
            "loop": [{"prop": "scale", "amount": .014, "cycles": 2, "phase": 0}, {"prop": "rotate", "amount": .5, "cycles": 1, "phase": .25},
                     {"prop": "y", "amount": 3, "cycles": 2, "phase": .25}],
            "intro": [{"prop": "scale", "keys": [[0, .2], [.3, 1.12, "out"], [.5, .97, "inout"], [.65, 1, "inout"]]},
                      {"prop": "rotate", "keys": [[0, -6], [.3, 1.5, "out"], [.55, 0, "inout"]]},
                      {"prop": "alpha", "keys": [[0, 0], [.12, 1, "linear"]]}]}
    lx0, ly0, lx1, ly1 = LETTERS
    effects += [{"type": "shine", "part": "title", "rect": [lx0 - x0, ly0 - y0, lx1 - x0, ly1 - y0], "amount": .7, "cycles": 1, "sweep": .4, "phase": .45, "width": .07, "angle": 22},
                {"type": "sparkles", "rect": [W * .12, H * .1, W * .88, H * .85], "count": 16, "size": 7, "color": "#fff3c4", "cycles": 1, "seed": 11}]
    rig = {"w": W, "h": H, "pad": .02, "intro": 1.1, "loop": 3.2, "fade": .1, "atlas": "atlas.webp", "parts": [part], "effects": effects}
    d = os.path.join(out_dir, name)
    os.makedirs(d, exist_ok=True)
    Image.fromarray(sheet).save(os.path.join(d, "atlas.webp"), quality=82, alpha_quality=70, method=6)
    with open(os.path.join(d, "rig.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(rig, f, separators=(",", ":"))
    print(f"{name}: {info}; title {W}x{H}, {len(effects)} effects; atlas {sheet.shape[1]}x{sheet.shape[0]} ({os.path.getsize(os.path.join(d, 'atlas.webp')) // 1024} KB)")
    if preview:  # the cut on the game's dark backdrop and on white, side by side
        t = title.astype(np.float32)
        a = t[..., 3:] / 255
        tiles = [np.clip(t[..., :3] * a + np.array(bg, np.float32) * (1 - a), 0, 255).astype(np.uint8) for bg in ((9, 26, 23), (236, 236, 236))]
        os.makedirs(os.path.join(TMP, "win-tiers-preview"), exist_ok=True)
        Image.fromarray(np.concatenate(tiles, 1)).save(os.path.join(TMP, "win-tiers-preview", name + ".png"))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("tiers", nargs="*", default=list(TIERS))
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()
    for name in args.tiers:
        build(name, args.out, args.preview)


if __name__ == "__main__":
    main()
