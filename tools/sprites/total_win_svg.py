"""Draws the Total Win emblem as vector art: emblem.svg and its rig.json for ghost-duels-web/rigplayer.js, which renders
each part at the screen's own resolution, so the emblem is sharp at every size and has clean edges.

    D:\\GhostDuels\\sprite-tools\\venv\\Scripts\\python.exe tools\\sprites\\total_win_svg.py [--out folder]

Same composition as the emblem cut from the mockup (examples/total-win): a faceted stone plaque with the title, thorny
vines, candles on a ledge, bat wings, the devil's head, a cape, two hanging crosses and two ghosts, in the game's
palette. The title is the game's display font (Creepster) turned into outlines with fontTools (pip install fonttools
brotli). Coordinates are SVG units on a 1200 x 500 canvas.

emblem.svg keeps every part as a group in <defs> (id = the part's name) and shows them all in z order, so it opens as
the whole emblem in a browser. The glow layers (fx-*) and the "aura" filter are in <defs> too; the player renders a
part, its aura and its glows by id. rig.json holds each part's box (from the points it is drawn through, so never too
small), pivot and motion, the effects and the timing.
"""

import argparse
import json
import math
import os
import re

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEB = os.path.join(ROOT, "ghost-duels-web")
FONT = os.path.join(WEB, "fonts", "Creepster-400-latin.woff2")
W, H, CX = 1200, 500, 600
INK = "#170c22"
AURA_BLUR = 13  # the teal halo around every part (stdDeviation, SVG units)


def fmt(v):
    return ("%.2f" % v).rstrip("0").rstrip(".") if v != int(v) else str(int(v))


# ---------------------------------------------------------------- shapes with their bounds
class Box:
    """Bounds in SVG units. Built from the points a shape is drawn through, curve handles included."""

    def __init__(self, pts=()):
        self.v = [math.inf, math.inf, -math.inf, -math.inf]
        for x, y in pts:
            self.add(x, y)

    def add(self, x, y):
        v = self.v
        v[0], v[1], v[2], v[3] = min(v[0], x), min(v[1], y), max(v[2], x), max(v[3], y)
        return self

    def grow(self, m):
        b = Box()
        b.v = [self.v[0] - m, self.v[1] - m, self.v[2] + m, self.v[3] + m]
        return b

    def __or__(self, o):
        b = Box()
        b.v = [min(self.v[0], o.v[0]), min(self.v[1], o.v[1]), max(self.v[2], o.v[2]), max(self.v[3], o.v[3])]
        return b

    def corners(self):
        x0, y0, x1, y1 = self.v
        return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

    def rect(self, margin=0):
        x0, y0, x1, y1 = self.grow(margin).v
        x0, y0 = math.floor(x0), math.floor(y0)
        return [x0, y0, math.ceil(x1) - x0, math.ceil(y1) - y0]


def attrs(a):
    return "".join(f' {k.replace("_", "-")}="{fmt(v) if isinstance(v, (int, float)) else v}"' for k, v in a.items() if v is not None)


NUM = re.compile(r"-?\d*\.?\d+(?:e-?\d+)?")


def path(d, **a):
    """An absolute M/L/C/Q/Z path; its box comes from all its points."""
    nums = [float(n) for n in NUM.findall(d)]
    return f'<path d="{d}"{attrs(a)}/>', Box(zip(nums[::2], nums[1::2])).grow(float(a.get("stroke_width", 0)) / 2)


def poly(pts, close=True, **a):
    d = "M " + " L ".join(f"{fmt(x)},{fmt(y)}" for x, y in pts) + (" Z" if close else "")
    return path(d, **a)


def ellipse(cx, cy, rx, ry, **a):
    sw = float(a.get("stroke_width", 0)) / 2
    return f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy)}" rx="{fmt(rx)}" ry="{fmt(ry)}"{attrs(a)}/>', Box([(cx - rx, cy - ry), (cx + rx, cy + ry)]).grow(sw)


def use(ref, box, **a):
    return f'<use href="#{ref}"{attrs(a)}/>', box


def matrix(ops):
    """SVG transform list -> affine (a, b, c, d, e, f)."""
    m = (1, 0, 0, 1, 0, 0)

    def mul(p, q):
        a, b, c, d, e, f = p
        A, B, C, D, E, F = q
        return (a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f)

    for op, *v in ops:
        if op == "translate":
            m = mul(m, (1, 0, 0, 1, v[0], v[1]))
        elif op == "scale":
            m = mul(m, (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0))
        elif op == "rotate":
            r = math.radians(v[0])
            m = mul(m, (math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0, 0))
    return m


def group(shapes, ops=None, **a):
    box = Box()
    for _, b in shapes:
        box = box | b
    t = None
    if ops:
        m = matrix(ops)
        box = Box([(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]) for x, y in box.corners()])
        t = " ".join(f"{op}({','.join(fmt(x) for x in v)})" for op, *v in ops)
    return f'<g{attrs({"transform": t, **a})}>' + "".join(s for s, _ in shapes) + "</g>", box


def mirror(shapes):
    return group(shapes, [("translate", W, 0), ("scale", -1, 1)])


def mx(pts):
    return [(W - x, y) for x, y in pts]


def lerp_hex(c0, c1, t):
    a = [int(c0[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join("%02x" % round(x + (y - x) * t) for x, y in zip(a, b))


# ---------------------------------------------------------------- paints
DEFS = f"""
<linearGradient id="goldT" gradientUnits="userSpaceOnUse" x1="0" y1="112" x2="0" y2="232">
  <stop offset="0" stop-color="#fffbe2"/><stop offset=".28" stop-color="#ffe680"/><stop offset=".55" stop-color="#ffc23a"/>
  <stop offset=".8" stop-color="#ea8a1c"/><stop offset="1" stop-color="#a9510b"/></linearGradient>
<linearGradient id="goldW" gradientUnits="userSpaceOnUse" x1="0" y1="222" x2="0" y2="360">
  <stop offset="0" stop-color="#fffbe2"/><stop offset=".28" stop-color="#ffe680"/><stop offset=".55" stop-color="#ffc23a"/>
  <stop offset=".8" stop-color="#ea8a1c"/><stop offset="1" stop-color="#a9510b"/></linearGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="panel" gradientUnits="userSpaceOnUse" cx="600" cy="236" r="260">
  <stop offset="0" stop-color="#1c6a5d"/><stop offset=".5" stop-color="#0f3b35"/><stop offset="1" stop-color="#061716"/></radialGradient>
<radialGradient id="tealHaze" cx=".5" cy=".5" r=".5">
  <stop offset="0" stop-color="#3ff2c8" stop-opacity=".45"/><stop offset="1" stop-color="#3ff2c8" stop-opacity="0"/></radialGradient>
<linearGradient id="ledge" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#eef3f8"/><stop offset=".45" stop-color="#b8c3d1"/><stop offset="1" stop-color="#5d6a80"/></linearGradient>
<radialGradient id="gem" cx=".36" cy=".3" r=".75">
  <stop offset="0" stop-color="#f2fff6"/><stop offset=".28" stop-color="#8dffbb"/><stop offset=".65" stop-color="#22c96a"/>
  <stop offset="1" stop-color="#0b6b3a"/></radialGradient>
<radialGradient id="eye" cx=".5" cy=".55" r=".6">
  <stop offset="0" stop-color="#f4fff8"/><stop offset=".35" stop-color="#9dffc4"/><stop offset=".75" stop-color="#3ee886"/>
  <stop offset="1" stop-color="#119a4e"/></radialGradient>
<radialGradient id="wing" gradientUnits="userSpaceOnUse" cx="200" cy="70" r="310">
  <stop offset="0" stop-color="#c79bff"/><stop offset=".35" stop-color="#9659ec"/><stop offset=".75" stop-color="#6a2fc4"/>
  <stop offset="1" stop-color="#43168a"/></radialGradient>
<linearGradient id="wingEdge" gradientUnits="userSpaceOnUse" x1="0" y1="120" x2="0" y2="310">
  <stop offset="0" stop-color="#2a0d5c" stop-opacity="0"/><stop offset="1" stop-color="#2a0d5c" stop-opacity=".45"/></linearGradient>
<radialGradient id="devilSkin" gradientUnits="userSpaceOnUse" cx="586" cy="40" r="96">
  <stop offset="0" stop-color="#7a5aa6"/><stop offset=".45" stop-color="#3e2a5c"/><stop offset="1" stop-color="#170e24"/></radialGradient>
<linearGradient id="horn" gradientUnits="userSpaceOnUse" x1="566" y1="52" x2="524" y2="4">
  <stop offset="0" stop-color="#3c1a76"/><stop offset=".55" stop-color="#8d58e0"/><stop offset="1" stop-color="#e6d4ff"/></linearGradient>
<linearGradient id="capeCloth" gradientUnits="userSpaceOnUse" x1="0" y1="350" x2="0" y2="496">
  <stop offset="0" stop-color="#b07cff"/><stop offset=".4" stop-color="#7d3fdc"/><stop offset="1" stop-color="#3b1680"/></linearGradient>
<linearGradient id="lavender" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#fbf7ff"/><stop offset=".45" stop-color="#c9b8ef"/><stop offset="1" stop-color="#7562b4"/></linearGradient>
<linearGradient id="silver" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c3cedb"/><stop offset="1" stop-color="#6b788e"/></linearGradient>
<linearGradient id="wax" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#cdb894"/><stop offset=".4" stop-color="#fffaf0"/><stop offset="1" stop-color="#bfa682"/></linearGradient>
<radialGradient id="flame" cx=".5" cy=".72" r=".62">
  <stop offset="0" stop-color="#fffdf0"/><stop offset=".3" stop-color="#ffe98a"/><stop offset=".65" stop-color="#ffaa38"/>
  <stop offset="1" stop-color="#ff6a14"/></radialGradient>
<radialGradient id="ghost" gradientUnits="userSpaceOnUse" cx="-24" cy="-44" r="128">
  <stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#dcfff4"/><stop offset=".72" stop-color="#a4efda"/>
  <stop offset="1" stop-color="#5fc9ae"/></radialGradient>
<filter id="aura" filterUnits="userSpaceOnUse" x="-300" y="-300" width="1800" height="1100" color-interpolation-filters="sRGB">
  <feGaussianBlur in="SourceAlpha" stdDeviation="{AURA_BLUR}"/>
  <feColorMatrix values="0 0 0 0 .2  0 0 0 0 .95  0 0 0 0 .78  0 0 0 1.6 0"/></filter>
<filter id="fxWhite" filterUnits="userSpaceOnUse" x="-300" y="-300" width="1800" height="1100" color-interpolation-filters="sRGB">
  <feGaussianBlur in="SourceAlpha" stdDeviation="14"/>
  <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.3 0"/></filter>
<filter id="blur3" filterUnits="userSpaceOnUse" x="-300" y="-300" width="1800" height="1100"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="blur7" filterUnits="userSpaceOnUse" x="-300" y="-300" width="1800" height="1100"><feGaussianBlur stdDeviation="7"/></filter>
<filter id="blur9" filterUnits="userSpaceOnUse" x="-300" y="-300" width="1800" height="1100"><feGaussianBlur stdDeviation="9"/></filter>
"""


# ---------------------------------------------------------------- the plaque (part "base")
# outer and inner outline of the stone frame, point for point, clockwise from the peak under the devil
OUTER = [(600, 72), (652, 104), (868, 90), (846, 134), (836, 292), (790, 350), (640, 350), (600, 392),
         (560, 350), (410, 350), (364, 292), (354, 134), (332, 90), (548, 104)]
INNER = [(600, 108), (644, 130), (818, 122), (812, 142), (806, 282), (774, 322), (632, 322), (600, 352),
         (568, 322), (426, 322), (394, 282), (388, 142), (382, 122), (556, 130)]
LIGHT = (-0.48, -0.88)  # towards the light: from the top left


def frame():
    out = []
    # facets lit by their slope: tops bright, the right and the bottom in shade
    for i in range(len(OUTER)):
        o0, o1, i1, i0 = OUTER[i], OUTER[(i + 1) % len(OUTER)], INNER[(i + 1) % len(INNER)], INNER[i]
        dx, dy = o1[0] - o0[0], o1[1] - o0[1]
        n = math.hypot(dx, dy)
        lit = (dy * LIGHT[0] - dx * LIGHT[1]) / n  # outward normal (dy, -dx) towards the light
        c = lerp_hex("#4c576c", "#f4f8fc", (lit + 1) / 2 * 0.92 + 0.04)
        out.append(poly([o0, o1, i1, i0], fill=c, stroke="#2b3142", stroke_width=1.6, stroke_linejoin="round"))
        if lit > 0.35:  # a bright edge along the lit outer rims
            ux, uy = dx / n, dy / n
            nx, ny = -dy / n, dx / n  # inward
            a, b = (o0[0] + nx * 4 + ux * 3, o0[1] + ny * 4 + uy * 3), (o1[0] + nx * 4 - ux * 3, o1[1] + ny * 4 - uy * 3)
            out.append(poly([a, b], close=False, fill="none", stroke="#ffffff", stroke_width=2.2, stroke_opacity=.85, stroke_linecap="round"))
    # chips and cracks in the stone
    for pts in [[(360, 176), (370, 186), (365, 196), (374, 206)], [(842, 228), (832, 236), (838, 246)],
                [(470, 336), (480, 343), (476, 348)], [(730, 333), (741, 340), (752, 337)], [(700, 98), (712, 105), (724, 101)]]:
        out.append(poly(pts, close=False, fill="none", stroke="#2b3142", stroke_width=1.8, stroke_linecap="round", stroke_linejoin="round"))
    out.append(poly(OUTER, fill="none", stroke=INK, stroke_width=7, stroke_linejoin="round"))
    return out


RUNES = [  # small engraved runes, in a 0..10 x 0..16 box
    [[(2, 0), (2, 16)], [(2, 4), (8, 0)], [(2, 9), (8, 5)]],
    [[(2, 16), (2, 0), (8, 4), (2, 8), (8, 16)]],
    [[(5, 0), (5, 16)], [(0, 4), (5, 9), (10, 4)]],
    [[(0, 16), (5, 0), (10, 16)], [(2, 9), (8, 9)]],
    [[(5, 0), (10, 5), (5, 10), (0, 5), (5, 0)], [(5, 10), (0, 16)], [(5, 10), (10, 16)]],
    [[(2, 0), (2, 16)], [(8, 0), (8, 16)], [(2, 0), (8, 8), (2, 16)]],
]


def panel():
    out = [poly(INNER, fill="url(#panel)")]
    out.append(ellipse(CX, 236, 230, 120, fill="url(#tealHaze)"))
    # a band of runes engraved along the inside of the panel
    band, k, runes = [], 0, []
    ring = INNER + [INNER[0]]
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        ux, uy = (x1 - x0) / L, (y1 - y0) / L
        nx, ny = -uy, ux  # inward
        s = 14.0
        while s < L - 14:
            px, py = x0 + ux * s + nx * 17, y0 + uy * s + ny * 17
            if py > 140:  # not under the devil and the top line of letters
                ang = math.degrees(math.atan2(uy, ux))
                g = RUNES[k % len(RUNES)]
                k += 1
                d = " ".join("M " + " L ".join(f"{fmt(x - 5)},{fmt(y - 8)}" for x, y in stroke) for stroke in g)
                runes.append(f'<path d="{d}" transform="translate({fmt(px)},{fmt(py)}) rotate({fmt(ang)}) scale(.9)"/>')
            s += 26
    rune_markup = "".join(runes)
    out.append((f'<g fill="none" stroke="#3ff2c8" stroke-width="5" stroke-opacity=".35" stroke-linecap="round" stroke-linejoin="round" filter="url(#blur3)">{rune_markup}</g>', Box()))
    out.append((f'<g fill="none" stroke="#8ffbe0" stroke-width="2" stroke-opacity=".75" stroke-linecap="round" stroke-linejoin="round">{rune_markup}</g>', Box()))
    # the frame's inner edge throws a shadow onto the panel
    out.append((f'<clipPath id="panelClip"><path d="M {" L ".join(f"{x},{y}" for x, y in INNER)} Z"/></clipPath>', Box()))
    out.append((f'<path d="M {" L ".join(f"{x},{y}" for x, y in INNER)} Z" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="22" clip-path="url(#panelClip)" filter="url(#blur7)"/>', Box()))
    out.append(poly(INNER, fill="none", stroke=INK, stroke_width=4.5, stroke_linejoin="round"))
    return out


def gem(cx, cy, r, bezel=True):
    out = []
    if bezel:
        out.append(ellipse(cx, cy, r + 5, r + 5, fill="url(#silver)", stroke=INK, stroke_width=3))
    out.append(ellipse(cx, cy, r, r, fill="url(#gem)", stroke=INK, stroke_width=2.5))
    out.append(ellipse(cx - r * .35, cy - r * .4, r * .32, r * .2, fill="#ffffff", fill_opacity=.9))
    return out


def cubic(p, t):
    u = 1 - t
    return (u ** 3 * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t ** 3 * p[3][0],
            u ** 3 * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t ** 3 * p[3][1])


def vine(segs, side=1, seed=0):
    """A thorny vine along cubic segments [(p0, p1, p2, p3), ...]."""
    d = f"M {fmt(segs[0][0][0])},{fmt(segs[0][0][1])} " + " ".join(
        "C " + " ".join(f"{fmt(x)},{fmt(y)}" for x, y in s[1:]) for s in segs)
    thorns, run, nxt = [], 0.0, 16.0 + seed * 7
    for s in segs:
        prev = s[0]
        for i in range(1, 61):
            p = cubic(s, i / 60)
            step = math.hypot(p[0] - prev[0], p[1] - prev[1])
            run += step
            if run >= nxt and step > 0:
                ux, uy = (p[0] - prev[0]) / step, (p[1] - prev[1]) / step
                nx, ny = -uy * side, ux * side
                tip = (p[0] + nx * 14 - ux * 6, p[1] + ny * 14 - uy * 6)
                thorns.append(poly([(p[0] - ux * 5.5, p[1] - uy * 5.5), tip, (p[0] + ux * 5.5, p[1] + uy * 5.5)],
                                   fill="#2f5f50", stroke=INK, stroke_width=2.2, stroke_linejoin="round"))
                side, nxt = -side, nxt + 21
            prev = p
    return thorns + [path(d, fill="none", stroke=INK, stroke_width=14, stroke_linecap="round"),
                     path(d, fill="none", stroke="#2f6353", stroke_width=8, stroke_linecap="round"),
                     (f'<path d="{d}" fill="none" stroke="#8ad3b6" stroke-width="2" stroke-linecap="round" stroke-opacity=".9" transform="translate(-.8,-1.6)"/>', Box())]


VINE_TOP = [((474, 110), (440, 84), (372, 66), (346, 96)), ((346, 96), (324, 122), (334, 160), (360, 168)),
            ((360, 168), (384, 175), (398, 154), (386, 142)), ((386, 142), (378, 134), (364, 138), (368, 150))]
VINE_LOW = [((358, 258), (338, 290), (350, 334), (384, 342)), ((384, 342), (414, 350), (440, 336), (468, 346)),
            ((468, 346), (486, 352), (488, 368), (474, 370))]


def ledge():
    out = [path("M 296,352 L 904,352 C 916,352 920,362 912,370 L 902,381 L 298,381 L 288,370 C 280,362 284,352 296,352 Z",
                fill="url(#ledge)", stroke=INK, stroke_width=6, stroke_linejoin="round")]
    out.append(poly([(302, 357), (898, 357)], close=False, fill="none", stroke="#fff", stroke_width=2, stroke_opacity=.8, stroke_linecap="round"))
    for x in (380, 820):
        out.append(poly([(x, 354), (x, 379)], close=False, fill="none", stroke="#3a4255", stroke_width=1.6))
    return out


def flame_d(x, top):
    return (f"M {x},{top} C {x + 9},{top + 15} {x + 14},{top + 25} {x + 12},{top + 35} C {x + 10},{top + 46} {x - 10},{top + 46} "
            f"{x - 12},{top + 35} C {x - 14},{top + 25} {x - 9},{top + 15} {x},{top} Z")


def candle(x, top):
    """A candle standing on the ledge (top = top of the wax), with its flame."""
    out = [path(f"M {x - 14},{top + 6} C {x - 10},{top - 1} {x + 10},{top - 1} {x + 14},{top + 6} L {x + 14},354 L {x - 14},354 Z",
                fill="url(#wax)", stroke=INK, stroke_width=4, stroke_linejoin="round")]
    for dx, ln in ((-8, 16), (5, 24)):  # drips
        out.append(path(f"M {x + dx - 3},{top + 3} L {x + dx - 3},{top + ln} C {x + dx - 3},{top + ln + 5} {x + dx + 3},{top + ln + 5} "
                        f"{x + dx + 3},{top + ln} L {x + dx + 3},{top + 3} Z", fill="#fffaf0", stroke=INK, stroke_width=2))
    out.append(ellipse(x, top + 4, 11, 3.5, fill="#fff6e2", stroke=INK, stroke_width=2))
    out.append(poly([(x, top + 3), (x + 1, top - 7)], close=False, fill="none", stroke=INK, stroke_width=2.6, stroke_linecap="round"))
    out.append(use(f"flame{'L' if x < CX else 'R'}", Box([(x - 14, top - 52), (x + 14, top - 6)]).grow(2),
                   fill="url(#flame)", stroke="#b8460c", stroke_width=2))
    out.append(ellipse(x, top - 17, 4, 7.5, fill="#fffef6", fill_opacity=.95))
    return out


CANDLES = ((330, 304), (870, 296))


def title_glyphs():
    """TOTAL / WIN in Creepster as outlines: (path data per line, its box)."""
    font = TTFont(FONT)
    gs, cmap, cap = font.getGlyphSet(), font.getBestCmap(), font["OS/2"].sCapHeight
    out = []
    for text, base, cap_h, track in (("TOTAL", 222, 106, 7), ("WIN", 350, 122, 9)):
        s = cap_h / cap

        def draw(pen_for, x0):
            x = x0
            for ch in text:
                g = cmap[ord(ch)]
                gs[g].draw(TransformPen(pen_for, (s, 0, 0, -s, x, base)))
                x += gs[g].width * s + track

        bp = BoundsPen(gs)
        draw(bp, 0)
        x0 = CX - (bp.bounds[0] + bp.bounds[2]) / 2
        sp = SVGPathPen(gs, ntos=fmt)
        draw(sp, x0)
        bp = BoundsPen(gs)
        draw(bp, x0)
        out.append((sp.getCommands(), Box([bp.bounds[:2], bp.bounds[2:]])))
    return out


def title(lines):
    (dT, bT), (dW, bW) = lines
    box = bT | bW
    out = [use("titleShape", box.grow(8), transform="translate(0,9)", fill="#2a1104", stroke=INK, stroke_width=16, stroke_linejoin="round"),
           use("titleShape", box.grow(8), fill="none", stroke=INK, stroke_width=16, stroke_linejoin="round"),
           use("titleShape", box.grow(4), fill="none", stroke="#7a3a08", stroke_width=7, stroke_linejoin="round"),
           use("tT", bT, fill="url(#goldT)"), use("tW", bW, fill="url(#goldW)")]
    # gloss on the upper part of each letter
    out.append(('<clipPath id="titleClip"><use href="#titleShape"/></clipPath>', Box()))
    for b in (bT, bW):
        x0, y0, x1, y1 = b.v
        out.append((f'<rect x="{fmt(x0)}" y="{fmt(y0)}" width="{fmt(x1 - x0)}" height="{fmt((y1 - y0) * .42)}" fill="url(#gloss)" clip-path="url(#titleClip)"/>', Box()))
    out.append(use("titleShape", box, fill="none", stroke="#fff3c0", stroke_width=1.2, stroke_opacity=.55))
    return out


def base(lines):
    out = ledge()
    for x, top in CANDLES:
        out += candle(x, top)
    out += frame() + panel()
    out += gem(375, 212, 8) + gem(825, 212, 8)
    out += vine(VINE_TOP) + vine(VINE_LOW, side=-1, seed=1)
    m = mirror(vine(VINE_TOP, side=-1, seed=2) + vine(VINE_LOW, seed=3))
    out.append(m)
    out += title(lines)
    return out


# ---------------------------------------------------------------- wings
S, WR, F1, F2, F3, F4 = (384, 196), (176, 52), (22, 150), (70, 262), (186, 306), (316, 290)
BONE = {F2: (110, 150), F3: (170, 180), F4: (250, 170)}
SCAL = ((103, 139), (144, 206), (230, 229))  # handles of the scallops between the finger tips, pulled towards the wrist  # quadratic handles of the finger bones from the wrist


def P(*pts):
    return " ".join(f"{fmt(x)},{fmt(y)}" for x, y in pts)


def wing():
    lead = f"M {P(S)} C {P((330, 110), (250, 52), WR)} C {P((120, 52), (60, 90), F1)}"
    rim = f"Q {P(SCAL[0], F2)} Q {P(SCAL[1], F3)} Q {P(SCAL[2], F4)} Q {P((372, 262), S)} Z"
    out = [path(f"{lead} {rim}", fill="url(#wing)")]
    out.append(path(f"{lead} {rim}", fill="url(#wingEdge)"))
    # every second panel a little darker, for depth
    out.append(path(f"M {P(WR)} Q {P(BONE[F2], F2)} Q {P(SCAL[1], F3)} Q {P(BONE[F3], WR)} Z", fill="#250a52", fill_opacity=.16))
    out.append(path(f"M {P(WR)} Q {P(BONE[F4], F4)} Q {P((372, 262), S)} C {P((330, 110), (250, 52), WR)} Z", fill="#250a52", fill_opacity=.12))
    # veins
    for a, b, c in (((136, 92), (92, 140), (62, 196)), ((150, 120), (132, 190), (122, 252)), ((200, 118), (212, 190), (218, 262)),
                    ((252, 110), (290, 170), (322, 230))):
        out.append(path(f"M {P(a)} Q {P(b, c)}", fill="none", stroke="#2a0d5c", stroke_width=1.6, stroke_opacity=.35, stroke_linecap="round"))
    # highlight under the leading edge
    out.append((f'<path d="M {P((350, 146))} C {P((310, 96), (240, 62), (180, 62))} C {P((130, 60), (80, 90), (42, 136))}" fill="none" stroke="#e4ccff" stroke-width="3" stroke-opacity=".55" stroke-linecap="round" transform="translate(0,6)"/>', Box()))
    out.append(path(f"{lead} {rim}", fill="none", stroke=INK, stroke_width=7, stroke_linejoin="round"))
    # bones: the arm and three fingers, dark with a light edge
    for d, w in ((f"M {P(S)} C {P((330, 110), (250, 52), WR)}", 13), (f"M {P(WR)} C {P((120, 52), (60, 90), F1)}", 9)) + tuple(
            (f"M {P(WR)} Q {P(h, f)}", 8) for f, h in BONE.items()):
        out.append(path(d, fill="none", stroke=INK, stroke_width=w, stroke_linecap="round"))
        out.append(path(d, fill="none", stroke="#4b2a78", stroke_width=w - 5, stroke_linecap="round"))
        out.append((f'<path d="{d}" fill="none" stroke="#b99ae6" stroke-width="1.6" stroke-linecap="round" transform="translate(-1,-1.2)"/>', Box()))
    # thumb claw at the wrist
    out.append(path(f"M {P((170, 56))} C {P((162, 44), (164, 32), (174, 22))} C {P((176, 34), (182, 44), (190, 52))} Z",
                    fill="#efe6fb", stroke=INK, stroke_width=3, stroke_linejoin="round"))
    out.append(ellipse(WR[0], WR[1], 9, 9, fill="#5a3690", stroke=INK, stroke_width=3))
    return out


# ---------------------------------------------------------------- devil's head
def devil():
    out = []
    horn = "M 554,64 C 530,54 514,30 522,2 C 532,22 550,30 578,40 Z"
    for side in (1, -1):
        sh = [path(horn, fill="url(#horn)", stroke=INK, stroke_width=4, stroke_linejoin="round")]
        for d in ("M 536,40 C 544,40 550,44 553,50", "M 529,24 C 535,27 540,30 543,34"):
            sh.append(path(d, fill="none", stroke=INK, stroke_width=2, stroke_linecap="round"))
        out.append(group(sh) if side == 1 else mirror(sh))
    head = "M 548,100 C 538,66 560,30 600,28 C 640,30 662,66 652,100 C 646,114 626,118 600,124 C 574,118 554,114 548,100 Z"
    out.append(path(head, fill="url(#devilSkin)", stroke=INK, stroke_width=5, stroke_linejoin="round"))
    out.append(ellipse(586, 44, 17, 8, fill="#ffffff", fill_opacity=.28, transform="rotate(-20 586 44)"))
    # angry brow, eyes, a grin with fangs, a gem on the forehead
    out.append(path("M 560,72 C 578,74 592,80 600,90 C 608,80 622,74 640,72 L 636,80 C 622,82 610,88 600,98 C 590,88 578,82 564,80 Z",
                    fill="#120a1c"))
    out.append(use("eyes", Box([(562, 78), (638, 104)]), fill="url(#eye)", stroke=INK, stroke_width=3, stroke_linejoin="round"))
    for x in (583, 617):
        out.append(path(f"M {x},86 C {x - 1.5},91 {x - 1.5},95 {x},100", fill="none", stroke=INK, stroke_width=2.6, stroke_linecap="round"))
    out.append(path("M 576,108 C 590,115 610,115 624,108", fill="none", stroke=INK, stroke_width=3, stroke_linecap="round"))
    for x in (588, 612):
        out.append(poly([(x - 4, 112), (x + 4, 112), (x, 121)], fill="#fff8ee", stroke=INK, stroke_width=1.8, stroke_linejoin="round"))
    out += gem(600, 56, 6, bezel=False)
    return out


EYES = ("M 564,84 C 574,79 590,84 596,94 C 586,101 570,98 564,84 Z", "M 636,84 C 626,79 610,84 604,94 C 614,101 630,98 636,84 Z")


# ---------------------------------------------------------------- cape, crosses, ghosts
def cape():
    out = [path("M 566,354 L 634,354 C 646,390 660,430 668,478 L 652,470 L 640,492 L 626,474 L 612,496 L 600,478 L 588,496 "
                "L 574,474 L 560,492 L 548,470 L 532,478 C 540,430 554,390 566,354 Z", fill="url(#capeCloth)", stroke=INK, stroke_width=5.5, stroke_linejoin="round")]
    for d in ("M 584,372 C 580,410 574,446 572,472", "M 616,372 C 620,410 626,446 628,472"):
        out.append(path(d, fill="none", stroke="#2c0f66", stroke_width=3, stroke_opacity=.75, stroke_linecap="round"))
    for d in ("M 600,376 C 600,412 600,446 600,474", "M 572,380 C 566,412 558,440 552,462"):
        out.append(path(d, fill="none", stroke="#d6b8ff", stroke_width=2.4, stroke_opacity=.6, stroke_linecap="round"))
    out.append(poly([(600, 344), (617, 361), (600, 380), (583, 361)], fill="url(#silver)", stroke=INK, stroke_width=3.5, stroke_linejoin="round"))
    out.append(poly([(600, 351), (610, 361), (600, 372), (590, 361)], fill="url(#gem)", stroke=INK, stroke_width=2, stroke_linejoin="round"))
    out.append(ellipse(597, 357, 2.6, 1.8, fill="#fff"))
    return out


def cross(x, y):
    sh = [ellipse(0, 6, 6, 6, fill="none", stroke=INK, stroke_width=6), ellipse(0, 6, 6, 6, fill="none", stroke="#dfe6ef", stroke_width=2.5),
          poly([(0, 13), (10, 23), (9, 40), (36, 40), (47, 48), (36, 56), (9, 56), (9, 104), (0, 118), (-9, 104), (-9, 56),
                (-36, 56), (-47, 48), (-36, 40), (-9, 40), (-10, 23)], fill="url(#lavender)", stroke=INK, stroke_width=5, stroke_linejoin="round"),
          poly([(0, 22), (0, 108)], close=False, fill="none", stroke="#ffffff", stroke_width=2, stroke_opacity=.6, stroke_linecap="round"),
          poly([(-40, 48), (40, 48)], close=False, fill="none", stroke="#ffffff", stroke_width=2, stroke_opacity=.6, stroke_linecap="round"),
          poly([(-1, 116), (8, 103), (8, 57)], close=False, fill="none", stroke="#4a3a86", stroke_width=2, stroke_opacity=.5)]
    sh.append(poly([(0, 37), (11, 48), (0, 59), (-11, 48)], fill="url(#gem)", stroke=INK, stroke_width=2.5, stroke_linejoin="round"))
    sh.append(ellipse(-3, 44, 3, 2, fill="#fff"))
    return group(sh, [("translate", x, y)])


def ghost(ops):
    body = ("M 0,-72 C 38,-72 62,-42 62,-2 L 62,44 C 62,58 52,66 42,58 C 34,51 26,52 22,62 C 16,74 2,74 -4,62 "
            "C -9,52 -18,50 -26,58 C -36,68 -58,64 -60,48 L -62,-2 C -62,-42 -38,-72 0,-72 Z")
    sh = [path("M -58,4 C -76,0 -86,14 -80,24 C -74,32 -62,26 -58,20 Z", fill="url(#ghost)", stroke=INK, stroke_width=5, stroke_linejoin="round"),
          path("M 58,-2 C 74,-14 90,-4 86,8 C 82,20 66,18 60,12 Z", fill="url(#ghost)", stroke=INK, stroke_width=5, stroke_linejoin="round"),
          path(body, fill="url(#ghost)"),
          path("M 40,-56 C 62,-36 66,10 60,44 C 54,58 44,60 38,54 C 50,20 52,-20 40,-56 Z", fill="#4fb89c", fill_opacity=.35),
          path(body, fill="none", stroke=INK, stroke_width=6, stroke_linejoin="round"),
          ellipse(-26, -48, 14, 7, fill="#ffffff", fill_opacity=.85, transform="rotate(-32 -26 -48)"),
          ellipse(-44, -26, 3.5, 6, fill="#ffffff", fill_opacity=.6, transform="rotate(-20 -44 -26)")]
    for ex in (-20, 20):
        sh += [ellipse(ex, -12, 10, 15, fill=INK), ellipse(ex - 3.5, -18, 4.4, 4.4, fill="#fff"), ellipse(ex + 3, -5, 2, 2, fill="#fff")]
    sh += [path("M -12,14 C -12,33 12,33 12,14 C 4,18 -4,18 -12,14 Z", fill="#3a1530", stroke=INK, stroke_width=3, stroke_linejoin="round"),
           path("M -6,25 C -4,30 5,30 7,25 C 3,22 -2,22 -6,25 Z", fill="#ff7da8"),
           ellipse(-38, 8, 9, 5, fill="#ff9ec4", fill_opacity=.6), ellipse(38, 8, 9, 5, fill="#ff9ec4", fill_opacity=.6)]
    return group(sh, ops)


# ---------------------------------------------------------------- the rig
def tracks():
    """Pivot and motion per part: the same moves as the mockup rig (examples/total-win/rig.json), in these units."""
    k = 1200 / 692
    return {
        "wingL": ([372, 190], [{"prop": "rotate", "wave": "flap", "amount": 10, "cycles": 2}, {"prop": "scaley", "amount": .05, "cycles": 2, "phase": .25}],
                  [{"prop": "rotate", "keys": [[.12, -75], [.34, 0, "back"]]}, {"prop": "alpha", "keys": [[.12, 0], [.17, 1, "linear"]]}]),
        "wingR": ([828, 190], [{"prop": "rotate", "wave": "flap", "amount": -10, "cycles": 2}, {"prop": "scaley", "amount": .05, "cycles": 2, "phase": .25}],
                  [{"prop": "rotate", "keys": [[.12, 75], [.34, 0, "back"]]}, {"prop": "alpha", "keys": [[.12, 0], [.17, 1, "linear"]]}]),
        "base": ([600, 225], [],
                 [{"prop": "scale", "keys": [[0, .3], [.16, 1, "back"]]},
                  {"prop": "scaley", "keys": [[.16, 1], [.2, .94, "out"], [.27, 1.03, "inout"], [.34, 1, "inout"]]},
                  {"prop": "scalex", "keys": [[.16, 1], [.2, 1.05, "out"], [.27, .985, "inout"], [.34, 1, "inout"]]},
                  {"prop": "alpha", "keys": [[0, 0], [.06, 1, "linear"]]}]),
        "devil": ([600, 76], [{"prop": "y", "amount": round(2.5 * k, 2), "cycles": 2, "phase": .5}],
                  [{"prop": "y", "keys": [[.14, -120], [.32, 0, "bounce"]]}, {"prop": "alpha", "keys": [[.14, 0], [.18, 1, "linear"]]}]),
        "cape": ([600, 356], [{"prop": "rotate", "amount": 2, "cycles": 2, "phase": .1}, {"prop": "scaley", "amount": .025, "cycles": 2, "phase": .35}],
                 [{"prop": "scaley", "keys": [[.16, 0], [.34, 1, "back"]]}, {"prop": "alpha", "keys": [[.16, 0], [.2, 1, "linear"]]}]),
        "crossL": ([440, 378], [{"prop": "rotate", "amount": 6, "cycles": 2}],
                   [{"prop": "rotate", "keys": [[.3, 45], [.62, 0, "elastic"]]}, {"prop": "alpha", "keys": [[.3, 0], [.34, 1, "linear"]]}]),
        "crossR": ([760, 378], [{"prop": "rotate", "amount": 6, "cycles": 2, "phase": .5}],
                   [{"prop": "rotate", "keys": [[.33, -45], [.65, 0, "elastic"]]}, {"prop": "alpha", "keys": [[.33, 0], [.37, 1, "linear"]]}]),
        "ghostL": ([238, 460], [{"prop": "y", "amount": round(5 * k, 2), "cycles": 2}, {"prop": "rotate", "amount": 5, "cycles": 2, "phase": .25},
                                {"prop": "scaley", "amount": .04, "cycles": 4, "phase": .1}],
                   [{"prop": "x", "keys": [[.24, -260], [.46, 0, "back"]]}, {"prop": "alpha", "keys": [[.24, 0], [.32, 1, "linear"]]},
                    {"prop": "rotate", "keys": [[.24, -25], [.46, 0, "back"]]}]),
        "ghostR": ([962, 308], [{"prop": "y", "amount": round(5 * k, 2), "cycles": 2, "phase": .4}, {"prop": "rotate", "amount": -5, "cycles": 2, "phase": .65},
                                {"prop": "scaley", "amount": .04, "cycles": 4, "phase": .5}],
                   [{"prop": "x", "keys": [[.28, 260], [.5, 0, "back"]]}, {"prop": "alpha", "keys": [[.28, 0], [.36, 1, "linear"]]},
                    {"prop": "rotate", "keys": [[.28, 25], [.5, 0, "back"]]}]),
    }


def build():
    lines = title_glyphs()
    parts = {  # in z order, back to front
        "wingL": group(wing()),
        "wingR": mirror(wing()),
        "base": group(base(lines)),
        "devil": group(devil()),
        "cape": group(cape()),
        "crossL": cross(440, 372),
        "crossR": cross(760, 372),
        "ghostL": ghost([("translate", 238, 392), ("rotate", -10)]),
        "ghostR": ghost([("translate", 962, 250), ("rotate", 10), ("scale", -.86, .86)]),
    }
    flames = {f"flame{'L' if x < CX else 'R'}": (flame_d(x, top - 52), Box([(x - 14, top - 52), (x + 14, top - 6)])) for x, top in CANDLES}
    title_box = lines[0][1] | lines[1][1]
    shapes = (f'<path id="tT" d="{lines[0][0]}"/><path id="tW" d="{lines[1][0]}"/><g id="titleShape"><use href="#tT"/><use href="#tW"/></g>'
              f'<g id="eyes"><path d="{EYES[0]}"/><path d="{EYES[1]}"/></g>'
              + "".join(f'<path id="{k}" d="{d}"/>' for k, (d, _) in flames.items()))
    effects = {  # glow layers, drawn additively over their part
        "fx-flash": (f'<use href="#base" filter="url(#fxWhite)"/>', parts["base"][1].grow(42)),
        "fx-letters": (f'<use href="#titleShape" fill="#ffcf5a" filter="url(#blur7)"/>', title_box.grow(28)),
        "fx-eyes": (f'<use href="#eyes" fill="#5dff9a" filter="url(#blur7)"/>', Box([(562, 78), (638, 104)]).grow(28)),
        "fx-candleL": (f'<use href="#flameL" fill="#ffb347" filter="url(#blur9)"/>', flames["flameL"][1].grow(34)),
        "fx-candleR": (f'<use href="#flameR" fill="#ffb347" filter="url(#blur9)"/>', flames["flameR"][1].grow(34)),
    }
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">\n'
           f'<!-- made by tools/sprites/total_win_svg.py; edit there -->\n<defs>{DEFS}{shapes}\n'
           + "".join(f'<g id="{k}">{m}</g>\n' for k, (m, _) in parts.items())
           + "".join(f'<g id="{k}">{m}</g>\n' for k, (m, _) in effects.items())
           + "</defs>\n" + "".join(f'<use href="#{k}"/>' for k in parts) + "\n</svg>\n")

    tr = tracks()
    rig = {"w": W, "h": H, "pad": .08, "intro": 3.3, "loop": 4.17, "fade": .12, "shake": {"amount": 4.8, "cycles": 14, "duration": .25},
           "svg": "emblem.svg", "aura": {"filter": "aura", "margin": AURA_BLUR * 3, "amount": .9, "min": .55, "cycles": 2},
           "parts": [], "effects": []}
    for name, (_, box) in parts.items():
        pivot, loop, intro = tr[name]
        rig["parts"].append({"name": name, "box": box.rect(2), "pivot": pivot, "loop": loop, "intro": intro})
    fx = [("fx-flash", {"part": "base", "amount": .45, "loop": False, "flash": [[.08, 0], [.15, 1], [.45, 0]]}),
          ("fx-letters", {"part": "base", "amount": .4, "min": .15, "cycles": 2}),
          ("fx-eyes", {"part": "devil", "amount": .9, "min": .3, "cycles": 4, "flash": [[.3, 0], [.35, 1.8], [.55, 1]]}),
          ("fx-candleL", {"part": "base", "wave": "flicker", "amount": .6, "cycles": 9}),
          ("fx-candleR", {"part": "base", "wave": "flicker", "amount": .6, "cycles": 11, "phase": .3})]
    for name, e in fx:
        rig["effects"].append({"type": "glow", "svg": name, **e, "box": effects[name][1].rect()})
    rig["effects"] += [{"type": "shine", "part": "base", "rect": [360, 92, 840, 360], "amount": .75, "cycles": 1, "sweep": .35, "phase": .55, "width": .07, "angle": 25},
                       {"type": "sparkles", "rect": [336, 50, 864, 380], "count": 16, "size": 7.2, "color": "#fff3c4", "cycles": 1, "seed": 7}]
    return svg, rig


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=os.path.join(WEB, "assets", "total-win"))
    args = ap.parse_args()
    svg, rig = build()
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "emblem.svg"), "w", encoding="utf-8", newline="\n") as f:
        f.write(svg)
    with open(os.path.join(args.out, "rig.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(rig, f, separators=(",", ":"))
    print(f"emblem.svg ({len(svg) // 1024} KB) and rig.json ({len(rig['parts'])} parts, {len(rig['effects'])} effects) in {args.out}")


if __name__ == "__main__":
    main()
