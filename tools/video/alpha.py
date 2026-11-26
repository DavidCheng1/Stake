"""Turn a generated clip filmed on a flat green or magenta backdrop (Gemini Omni image_to_video) into a WebM with an
alpha channel: a character that stands over the game's background (Night Drive's main character).

    python tools/video/alpha.py <clip.mp4> <out.webm> [--size 551x980] [--loop 0.8] [--trim 0.15] [--crf 30] [--still out.webp]

Every frame is keyed like the symbol animations (tools/sprites/symanim.py key(): the backdrop colour is unmixed, so
soft edges keep their own colour), scaled to --size and encoded with ffmpeg as VP9 with alpha (yuva420p), every frame
at an even rate. --loop closes the clip into a seamless loop: its last LOOP seconds are crossfaded into its first ones.
--trim drops seconds at the end (models often stall there). --still writes the first frame, keyed, as WebP.
Browsers without VP9 alpha (Safari) show the still instead (the page keeps it under the video).
"""

import argparse
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "sprites"))
from loop import ffmpeg  # noqa: E402
import symanim  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("clip")
    p.add_argument("out")
    p.add_argument("--size", default="551x980")
    p.add_argument("--loop", type=float, default=0)
    p.add_argument("--trim", type=float, default=0.15)
    p.add_argument("--crf", type=int, default=30)
    p.add_argument("--still")
    a = p.parse_args()
    W, H = (int(v) for v in a.size.split("x"))
    import cv2
    cap = cv2.VideoCapture(a.clip); fps = round(cap.get(cv2.CAP_PROP_FPS) or 24); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    keep = max(2, n - round(a.trim * fps)) if a.trim else n
    out = []  # keyed and scaled frames, 8-bit RGBA, one at a time (full-size float frames would need gigabytes)
    while len(out) < keep:
        ok, f = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(f, cv2.COLOR_BGR2RGB).astype(np.float32)
        out.append(Image.fromarray(symanim.key(rgb), "RGBA").resize((W, H), Image.LANCZOS))
    if a.loop:
        k = round(a.loop * fps)
        body = out[:len(out) - k]
        for i in range(k):  # premultiplied crossfade of the end into the start
            w = (i + 1) / (k + 1)
            A = np.asarray(out[len(out) - k + i], np.float32) / 255; B = np.asarray(body[i], np.float32) / 255
            pa, pb = A[..., :3] * A[..., 3:], B[..., :3] * B[..., 3:]
            al = A[..., 3:] * (1 - w) + B[..., 3:] * w
            m = np.concatenate([(pa * (1 - w) + pb * w) / np.maximum(al, 1e-6), al], -1)
            body[i] = Image.fromarray((np.clip(m, 0, 1) * 255 + .5).astype(np.uint8), "RGBA")
        out = body
    if a.still:
        out[0].save(a.still, quality=90, method=6)
    enc = subprocess.Popen([ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba",
                            "-s", f"{W}x{H}", "-framerate", str(fps), "-i", "-", "-an", "-c:v", "libvpx-vp9",
                            "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-crf", str(a.crf), "-b:v", "0", "-row-mt", "1",
                            "-deadline", "good", "-cpu-used", "1", a.out], stdin=subprocess.PIPE)
    for im in out:
        enc.stdin.write(im.tobytes())
    enc.stdin.close()
    enc.wait()
    print(f"{a.out}: {len(out)} frames, {len(out) / fps:.2f} s, {os.path.getsize(a.out) // 1024} KB")


if __name__ == "__main__":
    main()
