"""Game art from Google's Gemini image models ("Nano Banana"): pictures from a prompt plus reference pictures.

    math-sdk\\env\\Scripts\\python.exe tools\\imagegen\\gen.py <name> "<prompt>" [--ref a.webp b.png ...] [--n 3]
        [--aspect 1:1] [--size 1K] [--bg magenta|green|none] [--model gemini-nano-banana-2.1] [--yes]
    math-sdk\\env\\Scripts\\python.exe tools\\imagegen\\gen.py cut <picture> [--bg magenta|green] [--out file.png]
    math-sdk\\env\\Scripts\\python.exe tools\\imagegen\\gen.py sheet <name>

generate  writes imagegen-out/<name>/take-01.png, take-02.png ... (raw, as the model painted them) and, unless --bg none,
          take-01-cut.png with the backdrop cut away: the prompt asks for a flat magenta (or green) backdrop, which is
          keyed out from the picture's border inwards, so the same colour inside the art stays. Each take's prompt,
          model and references go into takes.json next to it, so a pick can be painted again or varied.
cut       keys out the backdrop of any picture (for a take that came back with a slightly different backdrop colour).
sheet     contact.png: all takes of a name side by side on a checkerboard, to judge them in one look.

Reference pictures (--ref) carry the game's style: pass existing assets (ghost-duels-web/assets/*.webp) and say in the
prompt what to take from each. Up to 14 per request.

Uses only the standard library, numpy and pillow (math-sdk's environment). The API key is read from the GEMINI_API_KEY
environment variable (on Windows also from the user variables, without a restart). It never goes into the repo.
"""

import argparse
import base64
import datetime
import io
import json
import os
import sys
import urllib.error
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "imagegen-out")
API = "https://generativelanguage.googleapis.com/v1beta"
API_REVISION = "2026-05-20"
DEFAULT_MODEL = "gemini-nano-banana-2.1"
BACKDROPS = {"magenta": (255, 0, 255), "green": (0, 255, 0)}
BACKDROP_TEXT = ("Paint it on a perfectly flat, uniform, pure {name} ({hex}) background that fills the whole canvas edge "
                 "to edge: no gradient, no shadow on the background, no floor, no vignette, no frame around the canvas. "
                 "Do not use that {name} colour anywhere in the subject.")


# ---------------------------------------------------------------- key and requests

def api_key():
    key = os.environ.get("GEMINI_API_KEY")
    if not key and os.name == "nt":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
                key = winreg.QueryValueEx(k, "GEMINI_API_KEY")[0]
        except OSError:
            pass
    if not key:
        sys.exit("GEMINI_API_KEY is not set. Make a key at https://aistudio.google.com/apikey, then in PowerShell:\n"
                 "  [Environment]::SetEnvironmentVariable(\"GEMINI_API_KEY\", \"<your key>\", \"User\")")
    return key


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers={
        "x-goog-api-key": api_key(), "Content-Type": "application/json", "Api-Revision": API_REVISION})
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:1500]}") from None


def ref_part(path):
    """A reference picture as PNG bytes (webp is converted; very big pictures are scaled to 1536 px)."""
    im = Image.open(path)
    im.load()
    if max(im.size) > 1536:
        im.thumbnail((1536, 1536), Image.LANCZOS)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA")
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def find_images(node, out):
    """Every base64 image in a response, in order, skipping the model's interim 'thought' pictures."""
    if isinstance(node, dict):
        if node.get("thought") is True or "thought" in str(node.get("type", "")):
            return
        mime = node.get("mime_type") or node.get("mimeType") or ""
        if isinstance(node.get("data"), str) and mime.startswith("image/"):
            out.append(node["data"])
            return
        for v in node.values():
            find_images(v, out)
    elif isinstance(node, list):
        for v in node:
            find_images(v, out)


def paint(prompt, refs, model, aspect, size):
    """One picture. generateContent first (it answers with PNG, best for a clean cut); the Interactions API, which
    only answers with JPEG, when that fails. A dropped connection is tried once more."""
    parts = [ref_part(p) for p in refs]
    calls = [
        (f"{API}/models/{model}:generateContent",
         {"contents": [{"parts": [{"text": prompt}] + [{"inline_data": {"mime_type": "image/png", "data": d}} for d in parts]}],
          "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect, "imageSize": size}}}),
        (f"{API}/interactions",
         {"model": model,
          "input": [{"type": "text", "text": prompt}] + [{"type": "image", "mime_type": "image/png", "data": d} for d in parts],
          "response_format": {"type": "image", "mime_type": "image/jpeg", "aspect_ratio": aspect, "image_size": size}}),
    ]
    errors = []
    for url, body in calls:
        for attempt in range(2):
            try:
                res = post(url, body)
            except (ConnectionError, TimeoutError, urllib.error.URLError) as e:
                errors.append(f"{url.rsplit('/', 1)[-1]}: {e}")
                continue
            except RuntimeError as e:
                errors.append(f"{url.rsplit('/', 1)[-1]}: {e}")
                break
            found = []
            find_images(res, found)
            if found:
                return Image.open(io.BytesIO(base64.b64decode(found[-1]))).convert("RGB")
            errors.append("no picture in the answer: " + json.dumps(res)[:800])
            break
    raise RuntimeError(" | ".join(errors))


# ---------------------------------------------------------------- backdrop removal

def cut(im, bg="magenta"):
    """Key out a flat backdrop from the border inwards, plus enclosed pockets of almost exactly the backdrop colour;
    similar colours enclosed by the art (a pink rune on magenta) stay.

    The backdrop is found by flooding from the border through pixels close to the backdrop colour. Along its edge the
    alpha follows the colour distance (anti-aliased outlines stay soft), and the backdrop colour spilled into those
    edge pixels is taken out again."""
    key = np.array(BACKDROPS[bg], float)
    rgb = np.asarray(im.convert("RGB"), float)
    h, w, _ = rgb.shape
    dist = np.sqrt(((rgb - key) ** 2).sum(-1)) / np.sqrt(3 * 255 ** 2)
    near = Image.fromarray(((dist < .2) * 255).astype(np.uint8))
    # flood the 'near' mask from every border pixel that is near the backdrop
    flood = near.copy()
    for x, y in [(x, 0) for x in range(0, w, 8)] + [(x, h - 1) for x in range(0, w, 8)] + \
                [(0, y) for y in range(0, h, 8)] + [(w - 1, y) for y in range(0, h, 8)]:
        if flood.getpixel((x, y)) == 255:
            ImageDraw.floodfill(flood, (x, y), 128)
    # plus pockets the art encloses that are almost exactly the backdrop (the prompt keeps that colour out of the art)
    back = (np.asarray(flood) == 128) | (dist < .1)
    band = np.asarray(Image.fromarray((back * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
    alpha = np.ones((h, w))
    alpha[back] = 0
    edge = band & ~back
    alpha[edge] = np.clip((dist[edge] - .06) / (.3 - .06), 0, 1)
    # despill: in edge pixels, pull the backdrop's own channels down to the strongest other channel
    out = rgb.copy()
    e = band
    if bg == "magenta":
        cap = np.maximum(out[..., 1], np.minimum(out[..., 0], out[..., 2]) * (1 - .6))
        out[..., 0][e] = np.minimum(out[..., 0][e], np.maximum(cap[e], out[..., 1][e] + 40))
        out[..., 2][e] = np.minimum(out[..., 2][e], np.maximum(cap[e], out[..., 1][e] + 40))
    else:
        out[..., 1][e] = np.minimum(out[..., 1][e], np.maximum(out[..., 0][e], out[..., 2][e]) + 20)
    rgba = np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)
    res = Image.fromarray(rgba, "RGBA")
    box = res.getbbox()
    return res.crop(box) if box else res


# ---------------------------------------------------------------- commands

def checker(w, h, s=16):
    im = Image.new("RGB", (w, h), (60, 60, 66))
    d = ImageDraw.Draw(im)
    for y in range(0, h, s):
        for x in range((y // s) % 2 * s, w, 2 * s):
            d.rectangle([x, y, x + s - 1, y + s - 1], fill=(90, 90, 98))
    return im


def sheet(name):
    folder = os.path.join(OUT, name)
    takes = sorted(f for f in os.listdir(folder) if f.startswith("take-") and f.endswith(".png") and "-cut" not in f)
    tiles = []
    for t in takes:
        cutf = os.path.join(folder, t[:-4] + "-cut.png")
        im = Image.open(cutf if os.path.exists(cutf) else os.path.join(folder, t)).convert("RGBA")
        im.thumbnail((360, 360), Image.LANCZOS)
        tile = checker(380, 404)
        tile.paste(im, ((380 - im.width) // 2, (380 - im.height) // 2), im)
        ImageDraw.Draw(tile).text((8, 384), t[:-4], fill=(255, 255, 255))
        tiles.append(tile)
    if not tiles:
        sys.exit(f"no takes in {folder}")
    cols = min(4, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    con = Image.new("RGB", (cols * 380, rows * 404), (30, 30, 34))
    for i, t in enumerate(tiles):
        con.paste(t, (i % cols * 380, i // cols * 404))
    path = os.path.join(folder, "contact.png")
    con.save(path)
    print(path)


def generate(a):
    folder = os.path.join(OUT, a.name)
    os.makedirs(folder, exist_ok=True)
    log_path = os.path.join(folder, "takes.json")
    log = json.load(open(log_path, encoding="utf-8")) if os.path.exists(log_path) else []
    prompt = a.prompt
    if a.prompt.startswith("@"):
        with open(a.prompt[1:], encoding="utf-8") as f:
            prompt = f.read().strip()
    if a.bg != "none":
        r, g, b = BACKDROPS[a.bg]
        prompt += "\n\n" + BACKDROP_TEXT.format(name=a.bg, hex=f"#{r:02X}{g:02X}{b:02X}")
    for p in a.ref:
        if not os.path.exists(p):
            sys.exit(f"reference not found: {p}")
    if not a.yes:
        print(f"{a.n} picture(s) with {a.model} ({a.size}, {a.aspect}), {len(a.ref)} reference(s). "
              "Each costs a few cents on the Gemini API. Run again with --yes to go ahead.")
        return
    n0 = len([f for f in os.listdir(folder) if f.startswith("take-") and "-cut" not in f])
    for i in range(a.n):
        name = f"take-{n0 + i + 1:02d}"
        try:
            im = paint(prompt, a.ref, a.model, a.aspect, a.size)
        except RuntimeError as e:
            print(f"{name}: failed: {e}")
            continue
        im.save(os.path.join(folder, name + ".png"))
        if a.bg != "none":
            cut(im, a.bg).save(os.path.join(folder, name + "-cut.png"))
        log.append({"take": name, "time": datetime.datetime.now().isoformat(timespec="seconds"), "model": a.model,
                    "aspect": a.aspect, "size": a.size, "bg": a.bg, "refs": [os.path.relpath(p, ROOT) for p in a.ref],
                    "prompt": prompt})
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(log, f, indent=1, ensure_ascii=False)
        print(f"{name}: {im.width}x{im.height} -> {os.path.join(folder, name)}.png")
    sheet(a.name)


VIDEO_MODEL = "gemini-omni-1.2-flash"


def find_video(node):
    """The base64 video in an Interactions answer (a model_output step's content item of type video)."""
    if isinstance(node, dict):
        mime = node.get("mime_type") or node.get("mimeType") or ""
        if isinstance(node.get("data"), str) and mime.startswith("video/"):
            return node["data"]
        for v in node.values():
            found = find_video(v)
            if found:
                return found
    elif isinstance(node, list):
        for v in node:
            found = find_video(v)
            if found:
                return found
    return None


def get(url):
    req = urllib.request.Request(url, headers={"x-goog-api-key": api_key(), "Api-Revision": API_REVISION})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def render_video(body):
    """A video takes minutes: the request runs in the background (it answers at once with the interaction's id) and is
    polled until it is done, so no connection has to stay open that long."""
    import time
    res = post(f"{API}/interactions", {**body, "background": True})
    iid, t0 = res.get("id"), time.time()
    while res.get("status") not in ("completed", "failed", "cancelled", None) or (iid and not find_video(res) and res.get("status") != "failed"):
        if time.time() - t0 > 900:
            raise RuntimeError(f"still {res.get('status')} after 15 minutes ({iid})")
        time.sleep(8)
        try:
            res = get(f"{API}/interactions/{iid}")
        except (ConnectionError, urllib.error.URLError, TimeoutError):
            continue  # a dropped poll is retried
        if res.get("status") == "completed" and find_video(res):
            break
    if res.get("status") == "failed":  # the reason, without the echoed prompt and pictures that would bury it
        why = {**res, "steps": [s for s in res.get("steps", []) if s.get("type") != "user_input"]}
        raise RuntimeError("failed: " + json.dumps(why)[:1500])
    return res


def video(a):
    """video <name> <prompt or @file> [--ref ...] [--duration 5] [--aspect 9:16] [--res 720p] [--n 1] [--yes]:
    take-NN.mp4 in imagegen-out/<name> with Gemini Omni (about $0.07 per second), logged in takes.json."""
    folder = os.path.join(OUT, a.name)
    os.makedirs(folder, exist_ok=True)
    prompt = open(a.prompt[1:], encoding="utf-8").read().strip() if a.prompt.startswith("@") else a.prompt
    if not a.yes:
        print(f"{a.n} video(s) of {a.duration} s with {VIDEO_MODEL} ({a.aspect}, {a.res}), {len(a.ref)} reference(s), "
              f"about ${0.07 * a.duration * a.n:.2f}. Run again with --yes to go ahead.")
        return
    log_path = os.path.join(folder, "takes.json")
    log = json.load(open(log_path, encoding="utf-8")) if os.path.exists(log_path) else []
    n0 = len([f for f in os.listdir(folder) if f.startswith("take-") and f.endswith(".mp4")])
    for i in range(a.n):
        body = {"model": VIDEO_MODEL,
                "input": [{"type": "text", "text": prompt}] + [{"type": "image", "mime_type": "image/png", "data": ref_part(r)} for r in a.ref],
                "response_format": {"type": "video", "aspect_ratio": a.aspect, "duration": f"{a.duration}s", "resolution": a.res}}
        if a.task:  # e.g. image_to_video: the first reference picture is the clip's first frame
            body["generation_config"] = {"video_config": {"task": a.task}}
        try:
            res = render_video(body)
        except (RuntimeError, ConnectionError, urllib.error.URLError, TimeoutError) as e:
            print(f"video {n0 + i + 1}: failed: {e}")
            continue
        data = find_video(res)
        if not data:
            print("no video in the answer: " + json.dumps(res)[:800])
            continue
        name = f"take-{n0 + i + 1:02d}.mp4"
        with open(os.path.join(folder, name), "wb") as f:
            f.write(base64.b64decode(data))
        log.append({"take": name, "time": datetime.datetime.now().isoformat(timespec="seconds"), "model": VIDEO_MODEL,
                    "aspect": a.aspect, "duration": a.duration, "res": a.res, "refs": [os.path.relpath(r, ROOT) for r in a.ref], "prompt": prompt})
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(log, f, indent=1, ensure_ascii=False)
        print(f"{name} -> {os.path.join(folder, name)}")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "video":
        p = argparse.ArgumentParser()
        p.add_argument("cmd")
        p.add_argument("name")
        p.add_argument("prompt")
        p.add_argument("--ref", nargs="*", default=[])
        p.add_argument("--duration", type=int, default=5)
        p.add_argument("--aspect", default="9:16")
        p.add_argument("--res", default="720p")
        p.add_argument("--n", type=int, default=1)
        p.add_argument("--task", help="image_to_video: the first --ref is the first frame")
        p.add_argument("--yes", action="store_true")
        video(p.parse_args())
        return
    if len(sys.argv) > 1 and sys.argv[1] == "cut":
        p = argparse.ArgumentParser()
        p.add_argument("cmd")
        p.add_argument("picture")
        p.add_argument("--bg", default="magenta", choices=list(BACKDROPS))
        p.add_argument("--out")
        a = p.parse_args()
        out = a.out or os.path.splitext(a.picture)[0] + "-cut.png"
        cut(Image.open(a.picture), a.bg).save(out)
        print(out)
        return
    if len(sys.argv) > 1 and sys.argv[1] == "sheet":
        sheet(sys.argv[2])
        return
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("name", help="folder under imagegen-out")
    p.add_argument("prompt", help="the prompt, or @file.txt")
    p.add_argument("--ref", nargs="*", default=[], help="reference pictures (style, character, layout)")
    p.add_argument("--n", type=int, default=2, help="how many takes")
    p.add_argument("--aspect", default="1:1")
    p.add_argument("--size", default="1K", help="1K, 2K or 4K")
    p.add_argument("--bg", default="magenta", choices=list(BACKDROPS) + ["none"], help="backdrop to paint on and cut away")
    p.add_argument("--model", default=os.environ.get("GEMINI_IMAGE_MODEL", DEFAULT_MODEL))
    p.add_argument("--yes", action="store_true", help="skip the cost note and paint")
    generate(p.parse_args())


if __name__ == "__main__":
    main()
