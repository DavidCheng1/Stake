"""Turn one picture (or a few key drawings) into an animated sprite sheet, 100 frames in a 10 x 10 grid by default.

    py tools\\sprites\\make_sheet.py picture.png --recipe tools\\sprites\\recipes\\idle-character.json
    py tools\\sprites\\make_sheet.py --keys pose1.png pose2.png pose3.png --recipe my-recipe.json --name lich-cheer
    ... --frames 100 --cols 10 --size 512 --fps 24 --once --out sprites-out\\name --upscale off

`py` is the sprite environment, D:\\GhostDuels\\sprite-tools\\venv\\Scripts\\python.exe (numpy, pillow,
opencv-python-headless, onnxruntime). The AI tools live next to it (folder SPRITE_TOOLS, default D:\\GhostDuels\\sprite-tools):
  isnet-anime.onnx                       cuts the subject out when the picture has no transparency
  realesrgan\\realesrgan-ncnn-vulkan.exe  upscales a small picture 4x with clean outlines before it is animated
  rife\\rife-ncnn-vulkan.exe              draws the in-betweens when several key drawings are given (--keys)
Each one is optional: without it the step falls back to plain resizing or crossfading and says so.

One picture is animated by the recipe: global motions (breathe, sway, float, rotate, shake, pop), local warps inside
regions (wobble for cloth, hair or smoke, flame for rising fire) and light effects (glow, flicker, shine, particles,
rays). Every looping motion repeats a whole number of times per loop, so the last frame runs into the first without a
jump. Regions are [x0, y0, x1, y1] as fractions of the picture (0,0 top left, 1,1 bottom right).

Writes into the output folder: sheet.png (lossless) and sheet.webp, anim.webp (animated, plays like the Lich King
idle), sheet.json (frame size, grid, fps) and preview.html (player with fps, frame stepping, onion skin, backgrounds).
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TOOLS = os.environ.get("SPRITE_TOOLS", r"D:\GhostDuels\sprite-tools")
ESRGAN = os.path.join(TOOLS, "realesrgan", "realesrgan-ncnn-vulkan.exe")
RIFE = os.path.join(TOOLS, "rife", "rife-ncnn-vulkan.exe")
ISNET = os.path.join(TOOLS, "isnet-anime.onnx")
SS = 2  # frames are rendered at twice their size and scaled down, for smooth edges


def note(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------- pictures in and out
def load_rgba(path):
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32) / 255


def save_rgba(arr, path):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(path)


def premul(img):
    out = img.copy()
    out[..., :3] *= out[..., 3:]
    return out


def unpremul(img):
    out = img.copy()
    a = out[..., 3:]
    out[..., :3] = np.where(a > 1e-4, out[..., :3] / np.maximum(a, 1e-4), 0)
    return np.clip(out, 0, 1)


def bleed(img):
    """Fill the colour under transparent pixels with the nearby edge colour (upscalers and interpolators see RGB only)."""
    p, a = premul(img), img[..., 3]
    out = img.copy()
    for sigma in (2, 8, 32):
        num = cv2.GaussianBlur(p[..., :3], (0, 0), sigma)
        den = cv2.GaussianBlur(a, (0, 0), sigma)[..., None]
        fill = num / np.maximum(den, 1e-4)
        k = (den[..., 0] > 1e-3) & (out[..., 3] < 0.5) & (a < 0.5)
        out[..., :3][k] = fill[k]
    out[..., 3] = a
    return out


def has_alpha(img):
    return (img[..., 3] < 0.98).mean() > 0.01


def cutout(img):
    """Separate the subject from its background with the isnet-anime model (made for illustrations)."""
    if not os.path.exists(ISNET):
        note(f"  no {ISNET}: the picture keeps its background")
        return img
    import onnxruntime as ort

    sess = ort.InferenceSession(ISNET, providers=["CPUExecutionProvider"])
    h, w = img.shape[:2]
    # the model takes RGB 0..1 as it is (with the usual mean subtracted it finds nothing)
    x = cv2.resize(img[..., :3], (1024, 1024), interpolation=cv2.INTER_LINEAR).transpose(2, 0, 1)[None]
    m = sess.run(None, {sess.get_inputs()[0].name: x.astype(np.float32)})[0][0, 0]
    m = cv2.resize(m / max(float(m.max()), 1e-6), (w, h), interpolation=cv2.INTER_AREA if w < 1024 else cv2.INTER_CUBIC)
    m = smoothstep(0.08, 0.45, m)  # levels measured on a picture with known transparency
    out = img.copy()
    out[..., 3] *= m
    return out


def run_tool(args, what):
    try:
        subprocess.run(args, check=True, capture_output=True, timeout=3600)
        return True
    except (OSError, subprocess.SubprocessError) as e:
        note(f"  {what} failed ({e}); falling back")
        return False


def resize(img, w, h):
    """Resize straight-alpha RGBA through premultiplied alpha (no dark fringes)."""
    p = premul(img)
    interp = cv2.INTER_AREA if w < img.shape[1] else cv2.INTER_CUBIC
    return unpremul(np.clip(cv2.resize(p, (w, h), interpolation=interp), 0, 1))


def upscale4(imgs, tmp):
    """Real-ESRGAN (anime model) 4x on the colour; the alpha is scaled smoothly and sharpened a little."""
    d_in, d_out = os.path.join(tmp, "up_in"), os.path.join(tmp, "up_out")
    os.makedirs(d_in), os.makedirs(d_out)
    for i, im in enumerate(imgs):
        save_rgba(np.dstack([bleed(im)[..., :3], np.ones(im.shape[:2], np.float32)]), os.path.join(d_in, f"{i:04d}.png"))
    if not run_tool([ESRGAN, "-i", d_in, "-o", d_out, "-n", "realesrgan-x4plus-anime", "-f", "png"], "Real-ESRGAN"):
        return None
    out = []
    for i, im in enumerate(imgs):
        rgb = load_rgba(os.path.join(d_out, f"{i:04d}.png"))[..., :3]
        a = cv2.resize(im[..., 3], (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_CUBIC)
        a = np.clip((a - 0.5) * 1.15 + 0.5, 0, 1)
        out.append(np.dstack([rgb, a]))
    return out


def interpolate(keys, count, loop, tmp):
    """RIFE draws the in-betweens of the key drawings: `count` frames from the first key to the last
    (to the first again when looping). Colour and alpha go through separately."""
    seq = keys + [keys[0]] if loop else keys
    total = count + 1 if loop else count
    if os.path.exists(RIFE):
        res = []
        for part in ("rgb", "alpha"):
            d_in, d_out = os.path.join(tmp, f"rife_{part}_in"), os.path.join(tmp, f"rife_{part}_out")
            os.makedirs(d_in), os.makedirs(d_out)
            for i, k in enumerate(seq):
                pic = bleed(k)[..., :3] if part == "rgb" else np.repeat(k[..., 3:], 3, axis=2)
                save_rgba(np.dstack([pic, np.ones(k.shape[:2], np.float32)]), os.path.join(d_in, f"{i + 1:08d}.png"))
            if not run_tool([RIFE, "-i", d_in, "-o", d_out, "-n", str(total), "-m", os.path.join(os.path.dirname(RIFE), "rife-v4.6"),
                             "-f", "%08d.png"], "RIFE"):
                break
            files = sorted(os.listdir(d_out))
            res.append([load_rgba(os.path.join(d_out, f))[..., :3] for f in files])
        if len(res) == 2 and len(res[0]) >= total:
            frames = [np.dstack([c, a[..., 0]]) for c, a in zip(res[0], res[1])]
            return frames[:count]
    note("  no RIFE: crossfading between the key drawings instead (in-betweens will look like dissolves)")
    frames = []
    for i in range(count):
        x = i * (len(seq) - 1) / (total - 1)
        j = min(int(x), len(seq) - 2)
        f = x - j
        frames.append(unpremul(premul(seq[j]) * (1 - f) + premul(seq[j + 1]) * f))
    return frames


# ---------------------------------------------------------------- motion helpers
def smooth_noise(h, w, sigma, rng):
    """A periodic, smooth random field (std 1): blurred white noise in the frequency domain, so it tiles."""
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    g = np.exp(-2 * (math.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))
    f = np.fft.irfft2(np.fft.rfft2(rng.standard_normal((h, w))) * g, s=(h, w))
    return (f / (f.std() + 1e-9)).astype(np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def ease_out_back(t, s=1.7):
    t = min(max(t, 0.0), 1.0) - 1
    return 1 + (s + 1) * t ** 3 + s * t ** 2


def hex_rgb(c, default=(1, 1, 1)):
    if not c:
        return np.array(default, np.float32)
    c = c.lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    return np.array([int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


class Canvas:
    """Where the picture sits in the (supersampled) frame, and conversions from picture fractions to pixels."""

    def __init__(self, src_w, src_h, size, pad, aspect=None):
        fit = size * SS / (1 + 2 * pad)
        self.k = fit / max(src_w, src_h)
        self.sw, self.sh = round(src_w * self.k), round(src_h * self.k)
        padpx = round(pad * max(self.sw, self.sh))
        self.w, self.h = self.sw + 2 * padpx, self.sh + 2 * padpx
        self.w += (-self.w) % (2 * SS)  # final frame size even
        self.h += (-self.h) % (2 * SS)
        self.ox, self.oy = (self.w - self.sw) // 2, (self.h - self.sh) // 2
        self.Y, self.X = np.mgrid[0:self.h, 0:self.w].astype(np.float32)
        self.S = max(self.sw, self.sh)  # picture size: amounts are fractions of it

    def pt(self, fx, fy):
        return self.ox + fx * self.sw, self.oy + fy * self.sh

    def region(self, rect, feather=0.08):
        if not rect:
            return np.ones((self.h, self.w), np.float32)
        x0, y0 = self.pt(rect[0], rect[1])
        x1, y1 = self.pt(rect[2], rect[3])
        f = max(1.0, feather * self.S)
        return (smoothstep(x0 - f, x0 + f, self.X) * (1 - smoothstep(x1 - f, x1 + f, self.X)) *
                smoothstep(y0 - f, y0 + f, self.Y) * (1 - smoothstep(y1 - f, y1 + f, self.Y))).astype(np.float32)

    def place(self, img):
        out = np.zeros((self.h, self.w, 4), np.float32)
        out[self.oy:self.oy + self.sh, self.ox:self.ox + self.sw] = premul(resize(img, self.sw, self.sh))
        return out


def stamp(layer, x, y, sx, sy, color, alpha):
    """Add a soft (gaussian) dot of light to a premultiplied layer."""
    rx, ry = int(3 * sx) + 1, int(3 * sy) + 1
    x0, x1 = max(0, int(x) - rx), min(layer.shape[1], int(x) + rx + 1)
    y0, y1 = max(0, int(y) - ry), min(layer.shape[0], int(y) + ry + 1)
    if x0 >= x1 or y0 >= y1 or alpha <= 0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    g = np.exp(-((xx - x) ** 2 / (2 * sx * sx) + (yy - y) ** 2 / (2 * sy * sy))) * alpha
    layer[y0:y1, x0:x1, :3] += g[..., None] * color
    layer[y0:y1, x0:x1, 3] += g


def over(fg, bg):
    return fg + bg * (1 - fg[..., 3:])


# ---------------------------------------------------------------- the animation
class Animator:
    def __init__(self, recipe, cv, n, loop, bbox, seed=7):
        self.r, self.cv, self.n, self.loop = recipe, cv, n, loop
        self.rng = np.random.default_rng(seed)
        self.bbox = bbox  # subject bounds in canvas px: x0, y0, x1, y1
        anchor = recipe.get("anchor", "bottom")
        bx0, by0, bx1, by1 = bbox
        self.anchor = {"bottom": ((bx0 + bx1) / 2, by1), "center": ((bx0 + bx1) / 2, (by0 + by1) / 2),
                       "top": ((bx0 + bx1) / 2, by0)}.get(anchor) if isinstance(anchor, str) else cv.pt(*anchor)
        self.motions = [dict(m) for m in recipe.get("motions", [])]
        for m in self.motions:  # random fields and particles are made once, so every frame uses the same ones
            kind = m["type"]
            if kind in ("wobble", "flame"):
                sig = m.get("scale", 0.08 if kind == "wobble" else 0.05) * cv.S
                m["_f"] = [smooth_noise(cv.h, cv.w, sig, self.rng) for _ in range(4 if kind == "wobble" else 2)]
                m["_w"] = cv.region(m.get("region"), m.get("feather", 0.08))
                if kind == "flame" and m.get("region"):  # flames wiggle most at their tips
                    y0 = cv.pt(0, m["region"][1])[1]
                    y1 = cv.pt(0, m["region"][3])[1]
                    m["_w"] *= np.clip((y1 - cv.Y) / max(y1 - y0, 1), 0, 1) ** 0.8
            elif kind == "particles":
                k = m.get("count", 30)
                rect = m.get("region") or [(bx0 - cv.ox) / cv.sw, (by0 - cv.oy) / cv.sh, (bx1 - cv.ox) / cv.sw, (by1 - cv.oy) / cv.sh]
                x0, y0 = cv.pt(rect[0], rect[1])
                x1, y1 = cv.pt(rect[2], rect[3])
                m["_p"] = dict(x=self.rng.uniform(x0, x1, k), y=self.rng.uniform(y0, y1, k), ph=self.rng.uniform(0, 1, k),
                               size=self.rng.uniform(0.6, 1.4, k), drift=self.rng.uniform(-1, 1, k), y0=y0, y1=y1,
                               cyc=self.rng.integers(1, 3, k) * m.get("cycles", 1))
            elif kind in ("flicker", "move") or (kind in ("glow", "shine") and m.get("region")):
                m["_w"] = cv.region(m.get("region"), m.get("feather", 0.1 if kind != "move" else 0.03))
            elif kind == "flap":  # turns a region (a wing) about its pivot, more the further from the pivot
                px, py = cv.pt(*m["pivot"])
                reach = m.get("reach", 0.12) * cv.S
                m["_w"] = cv.region(m.get("region"), m.get("feather", 0.04)) * smoothstep(0, reach, np.hypot(cv.X - px, cv.Y - py))

    def t(self, i):
        return i / self.n if self.loop else i / max(self.n - 1, 1)

    def theta(self, m, i):
        return 2 * math.pi * (m.get("cycles", 1) * self.t(i) + m.get("phase", 0))

    def frame(self, src, i):
        cv, t = self.cv, self.t(i)
        ax, ay = self.anchor
        # 1. geometry: forward affine (scale, rotation, translation) about the anchor, inverted for the lookup
        sx = sy = 1.0
        rot, tx, ty = 0.0, 0.0, 0.0
        pop_scale, pop_alpha = 1.0, 1.0
        for m in self.motions:
            kind, a, th = m["type"], m.get("amount", 0), self.theta(m, i)
            if kind == "breathe":
                sy *= 1 + a * math.sin(th)
                sx *= 1 - a * 0.5 * math.sin(th)
            elif kind == "pulse":
                sx *= 1 + a * math.sin(th)
                sy *= 1 + a * math.sin(th)
            elif kind == "float":
                ty += a * cv.S * math.sin(th)
            elif kind == "rotate":
                rot += math.radians(a) * math.sin(th)
            elif kind == "shake":
                # a few summed sines with whole cycles: jittery but still seamless
                k = m.get("cycles", 12)
                env = 1.0 if self.loop or "duration" not in m else max(0.0, 1 - t / m["duration"])
                tx += a * cv.S * env * (math.sin(2 * math.pi * k * t) + 0.5 * math.sin(2 * math.pi * (k + 3) * t + 1.3))
                ty += a * cv.S * env * (math.cos(2 * math.pi * (k + 1) * t) + 0.5 * math.sin(2 * math.pi * (k + 5) * t + 0.4))
            elif kind == "pop" and not self.loop:
                d = m.get("duration", 0.25)
                pop_scale = m.get("from", 0.3) + (1 - m.get("from", 0.3)) * ease_out_back(t / d, m.get("overshoot", 1.7))
                pop_alpha = min(1.0, t / (d * 0.4 + 1e-9))
        c, s = math.cos(rot), math.sin(rot)
        # inverse: p_src = A^-1 (p - anchor - translate) + anchor
        dx, dy = cv.X - ax - tx, cv.Y - ay - ty
        if pop_scale != 1.0:
            cx, cy = (self.bbox[0] + self.bbox[2]) / 2, (self.bbox[1] + self.bbox[3]) / 2
            dx = (cv.X - cx) / pop_scale + cx - ax - tx
            dy = (cv.Y - cy) / pop_scale + cy - ay - ty
        qx = (c * dx + s * dy) / sx + ax
        qy = (-s * dx + c * dy) / sy + ay
        # 2. bends and local warps
        for m in self.motions:
            kind, a, th = m["type"], m.get("amount", 0), self.theta(m, i)
            if kind == "sway":
                hgt = np.clip((ay - qy) / max(ay - self.bbox[1], 1), 0, 1) ** m.get("stiffness", 1.5)
                qx = qx - a * cv.S * math.sin(th) * hgt
            elif kind == "flap":
                px, py = cv.pt(*m["pivot"])
                ang = math.radians(a) * math.sin(th) * m["_w"]
                ca, sa = np.cos(ang), np.sin(ang)
                ddx, ddy = qx - px, qy - py
                qx, qy = px + ca * ddx + sa * ddy, py - sa * ddx + ca * ddy
            elif kind == "move":
                qx = qx - m["_w"] * m.get("dx", 0) * cv.S * math.sin(th)
                qy = qy - m["_w"] * m.get("dy", 0) * cv.S * math.sin(th)
            elif kind == "wobble":
                A, B, C, D = m["_f"]
                w = m["_w"] * a * cv.S
                qx = qx + w * (A * math.cos(th) + B * math.sin(th))
                qy = qy + w * (C * math.cos(th) + D * math.sin(th)) * m.get("vertical", 1.0)
            elif kind == "flame":
                F, G = m["_f"]
                shift = m.get("cycles", 2) * cv.h * t * m.get("speed", 1.0)
                lo = int(math.floor(shift)) % cv.h
                f = shift - math.floor(shift)
                fx = np.roll(F, -lo, 0) * (1 - f) + np.roll(F, -lo - 1, 0) * f  # the field flows upwards
                fy = np.roll(G, -lo, 0) * (1 - f) + np.roll(G, -lo - 1, 0) * f
                w = m["_w"] * a * cv.S
                qx, qy = qx + w * fx, qy + w * fy * 0.6
        img = cv2.remap(src, qx.astype(np.float32), qy.astype(np.float32), cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0)) * pop_alpha
        # 3. light on the subject
        for m in self.motions:
            kind, a, th = m["type"], m.get("amount", 0), self.theta(m, i)
            if kind == "flicker":
                k = 1 + a * (0.6 * math.sin(th) + 0.4 * math.sin(3 * th + 1.7)) * m["_w"]
                img[..., :3] *= k[..., None]
            elif kind == "shine":
                ang = math.radians(m.get("angle", 25))
                bx0, by0, bx1, by1 = self.bbox
                u = ((cv.X - bx0) * math.cos(ang) + (cv.Y - by0) * math.sin(ang))
                u /= max((bx1 - bx0) * abs(math.cos(ang)) + (by1 - by0) * abs(math.sin(ang)), 1)
                frac = (m.get("cycles", 1) * t + m.get("phase", 0)) % 1
                sweep = m.get("sweep", 0.4)
                if frac < sweep:
                    cpos = -0.25 + 1.5 * frac / sweep
                    band = np.exp(-((u - cpos) / m.get("width", 0.08)) ** 2) * a * m.get("_w", 1)
                    img[..., :3] += band[..., None] * hex_rgb(m.get("color")) * img[..., 3:]
        glow = np.zeros_like(img)
        for m in self.motions:
            if m["type"] == "glow":
                a, th = m.get("amount", 0.6), self.theta(m, i)
                base = m.get("min", 0.35)
                pulse = a * (base + (1 - base) * (0.5 + 0.5 * math.sin(th)))
                straight = unpremul(img)
                lum = straight[..., :3].max(2)
                e = smoothstep(m.get("threshold", 0.7), 1.0, lum) * img[..., 3] * m.get("_w", 1)
                if m.get("color"):
                    col = hex_rgb(m["color"])
                    sim = np.exp(-((straight[..., :3] - col) ** 2).sum(2) / m.get("match", 0.25))
                    e *= sim if m.get("match_color", False) else 1
                    light = e[..., None] * col
                else:
                    light = e[..., None] * straight[..., :3]
                bloom = cv2.GaussianBlur(light, (0, 0), m.get("radius", 0.03) * cv.S) * m.get("spread", 2.5)
                glow[..., :3] += (bloom + light * 0.6) * pulse
        lum = np.clip(glow[..., :3].max(2), 0, 1)
        glow[..., 3] = lum * 0.85  # light outside the subject shows as a semi-transparent halo
        # 4. layers behind and in front
        back = np.zeros_like(img)
        front = np.zeros_like(img)
        for m in self.motions:
            kind = m["type"]
            if kind == "aura":  # a soft coloured glow around the whole outline, behind it
                base = m.get("min", 0.6)
                pulse = m.get("amount", 0.6) * (base + (1 - base) * (0.5 + 0.5 * math.sin(self.theta(m, i))))
                blur = cv2.GaussianBlur(img[..., 3], (0, 0), m.get("radius", 0.02) * cv.S)
                inten = np.clip(blur * m.get("spread", 1.6), 0, 1) * pulse
                back[..., :3] += inten[..., None] * hex_rgb(m.get("color", "#3ff2d0"))
                back[..., 3] += inten
            elif kind == "rays":
                bx0, by0, bx1, by1 = self.bbox
                cx, cy = cv.pt(*m["center"]) if "center" in m else ((bx0 + bx1) / 2, (by0 + by1) / 2)
                nr = m.get("count", 12)
                phi = np.arctan2(cv.Y - cy, cv.X - cx)
                spin = 2 * math.pi / nr * m.get("cycles", 1) * t * (1 if m.get("clockwise", True) else -1)
                ray = (0.5 + 0.5 * np.cos(nr * (phi - spin))) ** m.get("sharpness", 6)
                rad = np.hypot(cv.X - cx, cv.Y - cy) / (m.get("radius", 0.7) * cv.S)
                inten = ray * np.clip(1 - rad, 0, 1) ** 1.5 * m.get("amount", 0.5)
                col = hex_rgb(m.get("color", "#ffe9a8"))
                back[..., :3] += inten[..., None] * col
                back[..., 3] += inten
            elif kind == "particles":
                layer = front if m.get("layer", "front") == "front" else back
                p, ks = m["_p"], m.get("kind", "embers")
                col = hex_rgb(m.get("color", "#ffb347"))
                r0 = m.get("size", 0.008) * cv.S
                for j in range(len(p["x"])):
                    if ks == "sparkles":
                        tw = max(0.0, math.sin(2 * math.pi * (p["cyc"][j] * t + p["ph"][j]))) ** 4
                        r = r0 * p["size"][j]
                        stamp(layer, p["x"][j], p["y"][j], r * 0.7, r * 0.7, col, tw)
                        stamp(layer, p["x"][j], p["y"][j], r * 4, r * 0.25, col, tw * 0.8)
                        stamp(layer, p["x"][j], p["y"][j], r * 0.25, r * 4, col, tw * 0.8)
                        continue
                    f = (m.get("cycles", 1) * t + p["ph"][j]) % 1  # life: 0 born at the bottom, 1 gone at the top
                    rise = m.get("rise", 0.5) * cv.S
                    y = p["y1"] - f * rise + (p["y"][j] - p["y1"]) * 0.3
                    x = p["x"][j] + p["drift"][j] * 0.04 * cv.S * math.sin(2 * math.pi * (f * 2 + p["ph"][j]))
                    life = math.sin(math.pi * f) ** 1.5
                    if ks == "wisps":
                        r = r0 * 6 * p["size"][j] * (0.6 + f)
                        stamp(layer, x, y, r, r * 1.3, col, life * 0.18)
                    else:  # embers
                        r = r0 * p["size"][j]
                        stamp(layer, x, y, r * 2.5, r * 2.5, col, life * 0.25)
                        stamp(layer, x, y, r * 0.8, r * 0.8, np.minimum(col + 0.4, 1), life)
        back[..., 3] = np.clip(back[..., 3], 0, 1)
        front[..., 3] = np.clip(front[..., 3], 0, 1)
        back *= pop_alpha  # rays and particles appear with the subject
        front *= pop_alpha
        out = over(front, over(glow, over(img, back)))
        out[..., 3] = np.clip(out[..., 3], 0, 1)
        return out


# ---------------------------------------------------------------- outputs
PREVIEW = """<!doctype html><html><head><meta charset="utf-8"><title>%(name)s - sprite preview</title>
<style>
body{margin:0;background:#15121c;color:#ddd;font:14px system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px}
#stage{background:repeating-conic-gradient(#2a2733 0 25%%,#1f1c27 0 50%%) 0 0/24px 24px;border:1px solid #444;max-width:96vw}
#stage.dark{background:#000}#stage.game{background:url("%(bg)s") center/cover}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center}button,select,input{font:inherit}
code{color:#9fd}
</style></head><body>
<div class="row"><b>%(name)s</b> <span>%(frames)d frames, %(fw)dx%(fh)d, %(cols)dx%(rows)d grid</span></div>
<canvas id="stage"></canvas>
<div class="row"><button id="play">Pause</button><button id="prev">&lt;</button><button id="next">&gt;</button>
<input id="slider" type="range" min="0" max="%(last)d" value="0" style="width:320px"><span id="num">0</span></div>
<div class="row"><label>fps <input id="fps" type="number" value="%(fps)d" min="1" max="60" style="width:56px"></label>
<label><input id="once" type="checkbox" %(once)s> play once</label>
<label><input id="onion" type="checkbox"> onion skin</label>
<label>background <select id="bgsel"><option value="">checker</option><option value="dark">black</option><option value="game">game</option></select></label>
<label>zoom <select id="zoom"><option>0.5</option><option selected>1</option><option>1.5</option><option>2</option></select></label></div>
<div class="row"><span>Keys: space play/pause, arrows step, O onion skin</span></div>
<script>
const M = %(meta)s, img = new Image(), cv = document.getElementById("stage"), cx = cv.getContext("2d");
let f = 0, playing = true, last = 0;
const $ = id => document.getElementById(id);
function draw() {
  cv.width = M.frameWidth; cv.height = M.frameHeight; const z = +$("zoom").value;
  cv.style.width = M.frameWidth * z + "px";
  const blit = (k, a) => { cx.globalAlpha = a; cx.drawImage(img, (k %% M.cols) * M.frameWidth, Math.floor(k / M.cols) * M.frameHeight, M.frameWidth, M.frameHeight, 0, 0, M.frameWidth, M.frameHeight); };
  if ($("onion").checked) { blit((f - 1 + M.frames) %% M.frames, .3); blit((f + 1) %% M.frames, .15); }
  blit(f, 1); cx.globalAlpha = 1; $("slider").value = f; $("num").textContent = f;
}
function tick(t) {
  if (playing && t - last >= 1000 / +$("fps").value) {
    last = t;
    if (f === M.frames - 1 && $("once").checked) playing = false, $("play").textContent = "Play"; else f = (f + 1) %% M.frames;
    draw();
  }
  requestAnimationFrame(tick);
}
const step = d => { playing = false; $("play").textContent = "Play"; f = (f + d + M.frames) %% M.frames; draw(); };
$("play").onclick = () => { playing = !playing; if (playing && f === M.frames - 1) f = 0; $("play").textContent = playing ? "Pause" : "Play"; };
$("prev").onclick = () => step(-1); $("next").onclick = () => step(1);
$("slider").oninput = e => { playing = false; $("play").textContent = "Play"; f = +e.target.value; draw(); };
$("bgsel").onchange = e => cv.className = e.target.value; ["onion", "zoom"].forEach(id => $(id).onchange = draw);
addEventListener("keydown", e => { if (e.key === " ") { e.preventDefault(); $("play").click(); } if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); if (e.key === "o") { $("onion").checked ^= 1; draw(); } });
img.onload = () => { draw(); requestAnimationFrame(tick); }; img.src = "sheet.png";
</script></body></html>
"""


def write_outputs(frames, out, name, cols, fps, loop, quality=85):
    os.makedirs(out, exist_ok=True)
    n = len(frames)
    rows = math.ceil(n / cols)
    fh, fw = frames[0].shape[:2]
    if max(fw * cols, fh * rows) > 16383:
        sys.exit(f"the sheet would be {fw * cols} x {fh * rows} px; WebP allows 16383 at most: use a smaller --size or more --cols")
    sheet = np.zeros((fh * rows, fw * cols, 4), np.float32)
    for i, f in enumerate(frames):
        r, c = divmod(i, cols)
        sheet[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw] = f
    u8 = (np.clip(sheet, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(u8, "RGBA").save(os.path.join(out, "sheet.png"), optimize=True)
    Image.fromarray(u8, "RGBA").save(os.path.join(out, "sheet.webp"), quality=90, method=4)
    pics = [Image.fromarray((np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA") for f in frames]
    pics[0].save(os.path.join(out, "anim.webp"), save_all=True, append_images=pics[1:], duration=round(1000 / fps),
                 loop=0 if loop else 1, quality=quality, method=4, background=(0, 0, 0, 0))
    meta = {"name": name, "frames": n, "cols": cols, "rows": rows, "frameWidth": fw, "frameHeight": fh, "fps": fps,
            "loop": loop, "sheet": "sheet.webp", "anim": "anim.webp"}
    with open(os.path.join(out, "sheet.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    bg = "game-bg.webp"  # the game's background, copied next to the preview for its "game" backdrop
    game_bg = os.path.join(ROOT, "ghost-duels-web", "assets", "bg.webp")
    if os.path.exists(game_bg):
        shutil.copyfile(game_bg, os.path.join(out, bg))
    with open(os.path.join(out, "preview.html"), "w", encoding="utf-8") as f:
        f.write(PREVIEW % dict(name=name, frames=n, fw=fw, fh=fh, cols=cols, rows=rows, last=n - 1, fps=fps,
                               once="" if loop else "checked", bg=bg, meta=json.dumps(meta)))
    sizes = {p: os.path.getsize(os.path.join(out, p)) // 1024 for p in ("sheet.png", "sheet.webp", "anim.webp")}
    note(f"{n} frames of {fw}x{fh} in a {cols}x{rows} grid -> {out}")
    note("  " + ", ".join(f"{p} {kb} KB" for p, kb in sizes.items()) + "; open preview.html to watch it")


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image", nargs="?", help="the picture to animate")
    ap.add_argument("--keys", nargs="+", help="several key drawings instead of one picture, in order")
    ap.add_argument("--recipe", help="JSON with the motions (see tools/sprites/recipes)")
    ap.add_argument("--rig", help="rig JSON: the picture split into parts that move separately (see rig.py)")
    ap.add_argument("--name")
    ap.add_argument("--out", help="output folder (default sprites-out/<name>)")
    ap.add_argument("--frames", type=int)
    ap.add_argument("--cols", type=int)
    ap.add_argument("--size", type=int, help="longest side of one frame in px, padding included")
    ap.add_argument("--fps", type=int)
    ap.add_argument("--pad", type=float, help="empty margin around the picture, as a fraction of its size")
    ap.add_argument("--once", action="store_true", help="a one-shot animation (intro, win title) instead of a loop")
    ap.add_argument("--cutout", choices=["auto", "on", "off"], help="auto: only when the picture has no transparency")
    ap.add_argument("--upscale", choices=["auto", "on", "off"], help="auto: Real-ESRGAN when the picture is smaller than the frame")
    args = ap.parse_args()
    if not args.image and not args.keys:
        ap.error("give a picture or --keys")
    recipe = {}
    if args.recipe:
        with open(args.recipe, encoding="utf-8") as f:
            recipe = json.load(f)
    opt = lambda k, d: getattr(args, k) if getattr(args, k) not in (None, False) else recipe.get(k, d)
    frames_n, cols, size, fps, pad = opt("frames", 100), opt("cols", 10), opt("size", 512), opt("fps", 24), opt("pad", 0.12)
    loop = not opt("once", False)
    paths = args.keys or [args.image]
    name = args.name or recipe.get("name") or os.path.splitext(os.path.basename(paths[0]))[0]
    out = args.out or os.path.join(ROOT, "sprites-out", name)
    tmp = tempfile.mkdtemp(prefix="sprite_", dir=os.environ.get("SPRITE_TMP") or (TOOLS if os.path.isdir(TOOLS) else None))
    try:
        keys = [load_rgba(p) for p in paths]
        h0, w0 = keys[0].shape[:2]
        keys = [k if k.shape[:2] == (h0, w0) else resize(k, w0, h0) for k in keys]
        cut = opt("cutout", "auto")
        if cut == "on" or (cut == "auto" and not has_alpha(keys[0])):
            note("cutting out the subject (isnet-anime)")
            keys = [cutout(k) for k in keys]
        cv = Canvas(w0, h0, size, pad)
        up = opt("upscale", "auto")
        if up == "on" or (up == "auto" and cv.k > 1.1):
            if os.path.exists(ESRGAN):
                note(f"upscaling 4x with Real-ESRGAN (the picture is {w0}x{h0}, the frame needs {cv.sw}x{cv.sh})")
                big = upscale4(keys, tmp)
                if big:
                    keys = big
            else:
                note("  no Real-ESRGAN: plain upscaling")
        rig_path = args.rig or (recipe.get("rig") and os.path.join(os.path.dirname(os.path.abspath(args.recipe)), recipe["rig"]))
        if rig_path:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import rig as rigmod

            with open(rig_path, encoding="utf-8") as f:
                spec = json.load(f)
            if spec.get("split_from"):  # find the parts on another version of the picture (the original colours)
                spec["_split_img"] = load_rgba(os.path.join(os.path.dirname(os.path.abspath(rig_path)), spec["split_from"]))
            note(f"splitting the picture into {len(spec['parts'])} parts (rig)")
            rig = rigmod.Rig(spec, keys[0], cv, frames_n, loop, keys[0].shape[1] / w0, cache_dir=out)
            rest = rigmod.Rig.frame(rig, 0) if loop else None
            if rest is None:  # a one-shot starts empty: measure the parts at rest
                rig.loop = True
                rest = rig.frame(0)
                rig.loop = False
            ys, xs = np.nonzero(rest[..., 3] > 0.05)
            anim = Animator(recipe, cv, frames_n, loop, (xs.min(), ys.min(), xs.max(), ys.max()), recipe.get("seed", 7))
            frames = []
            for i in range(frames_n):
                f = anim.frame(rig.frame(i), i)
                frames.append(unpremul(cv2.resize(f, (cv.w // SS, cv.h // SS), interpolation=cv2.INTER_AREA)))
                if (i + 1) % 20 == 0:
                    note(f"  frame {i + 1}/{frames_n}")
            write_outputs(frames, out, name, cols, fps, loop, recipe.get("quality", 85))
            return
        if len(keys) > 1:
            note(f"drawing {frames_n} frames between {len(keys)} key drawings (RIFE)")
            srcs = interpolate(keys, frames_n, loop, tmp)
        else:
            srcs = keys * frames_n
        placed_first = cv.place(srcs[0])
        ys, xs = np.nonzero(placed_first[..., 3] > 0.05)
        bbox = (xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) else (cv.ox, cv.oy, cv.ox + cv.sw, cv.oy + cv.sh)
        anim = Animator(recipe, cv, frames_n, loop, bbox, recipe.get("seed", 7))
        frames, cache = [], {}
        for i, s in enumerate(srcs):
            key = id(s)
            if key not in cache:
                cache = {key: placed_first if i == 0 else cv.place(s)}
            f = anim.frame(cache[key], i)
            small = cv2.resize(f, (cv.w // SS, cv.h // SS), interpolation=cv2.INTER_AREA)
            frames.append(unpremul(small))
            if (i + 1) % 20 == 0:
                note(f"  frame {i + 1}/{frames_n}")
        write_outputs(frames, out, name, cols, fps, loop, recipe.get("quality", 85))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
