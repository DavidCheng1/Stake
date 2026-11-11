"""Turn a generated clip (Gemini Omni mp4) into a seamless looping WebM for the game, plus its first frame as a still.

    python tools/video/loop.py <clip.mp4> <out.webm> [--strip X:W] [--size 384x1536] [--fade 1.0] [--still out.webp]
        [--trim 0.15] [--crf 32]

The clip's frames are decoded, cropped (--strip X:W keeps the columns X..X+W, e.g. the 1:4 reel strip of a 9:16 clip that
was padded around a narrow picture), scaled to --size, and closed into a loop: its last --fade seconds are crossfaded
into its first ones, so the frame after the last is a natural continuation. The loop then starts on the frame closest to
the clip's first frame (the calm starting pose), and --still writes exactly that frame, so a page can show the still
first and start the clip on it without a visible switch. --trim drops seconds at the end (models often stall there).

Encoded with ffmpeg (VP9, every frame at an even rate). Recording a canvas in the browser (MediaRecorder) is not used:
it drops frames and freezes when the machine is busy. ffmpeg is taken from $FFMPEG, the imageio-ffmpeg package
(pip install imageio-ffmpeg) or the PATH. Needs numpy and pillow (math-sdk's environment).
"""

import argparse
import json
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image


def ffmpeg():
    exe = os.environ.get("FFMPEG")
    if not exe:
        try:
            import imageio_ffmpeg
            exe = imageio_ffmpeg.get_ffmpeg_exe()
        except ImportError:
            exe = shutil.which("ffmpeg")
    if not exe:
        sys.exit("ffmpeg not found: set FFMPEG, pip install imageio-ffmpeg, or put ffmpeg on the PATH")
    return exe


def probe(exe, path):
    """width, height and frame rate of the clip's video stream (from ffmpeg's banner)."""
    err = subprocess.run([exe, "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    import re
    m = re.search(r"Video: .*?, (\d+)x(\d+)[, ].*?([\d.]+) fps", err)
    if not m:
        sys.exit("could not read the clip's size and frame rate:\n" + err)
    return int(m.group(1)), int(m.group(2)), float(m.group(3))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("clip")
    p.add_argument("out")
    p.add_argument("--strip", help="X:W, the columns to keep")
    p.add_argument("--size", default="384x1536")
    p.add_argument("--fade", type=float, default=1.0)
    p.add_argument("--trim", type=float, default=0.15)
    p.add_argument("--still")
    p.add_argument("--crf", type=int, default=32)
    a = p.parse_args()
    exe = ffmpeg()
    w, h, fps = probe(exe, a.clip)
    W, H = map(int, a.size.split("x"))
    vf = []
    if a.strip:
        x, sw = map(int, a.strip.split(":"))
        vf.append(f"crop={sw}:{h}:{x}:0")
    vf.append(f"scale={W}:{H}:flags=lanczos")
    raw = subprocess.run([exe, "-hide_banner", "-loglevel", "error", "-i", a.clip, "-vf", ",".join(vf), "-fps_mode", "passthrough",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    B = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.float32)
    B = B[:max(2, len(B) - round(a.trim * fps))]
    N, K = len(B), round(a.fade * fps)
    if N < 3 * K:
        sys.exit(f"clip too short for a {a.fade} s fade ({N} frames)")
    L = N - K
    sm = lambda t: t * t * (3 - 2 * t)
    loop = [B[L + i] * (1 - sm((i + 1) / (K + 1))) + B[i] * sm((i + 1) / (K + 1)) if i < K else B[i] for i in range(L)]
    # start on the unblended frame most like the clip's first frame (its calm pose); a seamless loop stays seamless
    diff = lambda f, g: float(np.abs(f[::4, ::4] - g[::4, ::4]).mean())
    r = min(range(K, L), key=lambda k: diff(loop[k], B[0]))
    loop = loop[r:] + loop[:r]
    frames = [np.clip(f + .5, 0, 255).astype(np.uint8) for f in loop]
    steps = [diff(loop[i], loop[(i + 1) % L]) for i in range(L)]
    enc = subprocess.Popen([exe, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-framerate", f"{fps:g}", "-i", "-", "-an", "-c:v", "libvpx-vp9", "-crf", str(a.crf), "-b:v", "0", "-row-mt", "1",
                            "-deadline", "good", "-cpu-used", "1", "-g", str(round(fps * 2)), "-pix_fmt", "yuv420p", a.out], stdin=subprocess.PIPE)
    for f in frames:
        enc.stdin.write(f.tobytes())
    enc.stdin.close()
    if enc.wait():
        sys.exit("ffmpeg failed")
    if a.still:
        Image.fromarray(frames[0]).save(a.still, "WEBP", quality=90, method=6)
    print(json.dumps({"out": a.out, "bytes": os.path.getsize(a.out), "frames": L, "seconds": round(L / fps, 2), "fps": fps,
                      "starts_at_clip_frame": int(r), "median_step": round(float(np.median(steps)), 2), "max_step": round(max(steps), 2),
                      "seam_step": round(steps[-1], 2), "still": a.still}))


if __name__ == "__main__":
    main()
