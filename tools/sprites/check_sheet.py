"""Check a sprite sheet made by make_sheet.py: how smooth the steps are, whether the loop closes, and a strip of frames.

    py tools\\sprites\\check_sheet.py sprites-out\\<name> [--frames 0,12,25,50,75,99] [--bg 25,18,35]

Prints the mean and largest change between neighbouring frames and the change from the last frame back to the first
(for a loop it should be about the same as a normal step), and writes strip.png into the folder: the chosen frames
side by side on a dark background, to look at.
"""

import argparse
import json
import os

import numpy as np
from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--frames", help="frame numbers for the strip, comma separated")
    ap.add_argument("--bg", default="25,18,35")
    args = ap.parse_args()
    meta = json.load(open(os.path.join(args.folder, "sheet.json"), encoding="utf-8"))
    sheet = np.asarray(Image.open(os.path.join(args.folder, "sheet.png")).convert("RGBA")).astype(np.float32)
    fw, fh, cols, n = meta["frameWidth"], meta["frameHeight"], meta["cols"], meta["frames"]

    def frame(i):
        r, c = divmod(i, cols)
        return sheet[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw]

    steps = [float(np.abs(frame(i + 1) - frame(i)).mean()) for i in range(n - 1)]
    big = int(np.argmax(steps))
    print(f"{n} frames {fw}x{fh}: step change mean {np.mean(steps):.2f}, largest {steps[big]:.2f} (frames {big}->{big + 1})")
    if meta.get("loop", True):
        seam = float(np.abs(frame(0) - frame(n - 1)).mean())
        verdict = "closes cleanly" if seam <= max(steps) * 1.2 else "JUMPS: the loop does not close"
        print(f"loop seam {n - 1}->0: {seam:.2f} - {verdict}")
    picks = [int(x) for x in args.frames.split(",")] if args.frames else sorted({0, n // 8, n // 4, n // 2, 3 * n // 4, n - 1})
    bg = np.array([int(v) for v in args.bg.split(",")], np.float32)
    strip = np.empty((fh, fw * len(picks), 3), np.float32)
    for k, i in enumerate(picks):
        f = frame(i)
        a = f[..., 3:] / 255
        strip[:, k * fw:(k + 1) * fw] = f[..., :3] * a + bg * (1 - a)
    scale = min(1.0, 1800 / strip.shape[1])
    out = Image.fromarray(strip.astype(np.uint8)).resize((int(strip.shape[1] * scale), int(fh * scale)))
    out.save(os.path.join(args.folder, "strip.png"))
    print(f"strip.png: frames {', '.join(map(str, picks))}")


if __name__ == "__main__":
    main()
