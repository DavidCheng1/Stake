"""Turn a generated clip (Gemini Omni mp4) into a WebM that plays once (a fight, the punch, the way into the free spins).

    python tools/video/clip.py <clip.mp4> <out.webm> [--crop X:Y:W:H] [--size 800x600] [--start 0] [--end 6] [--crf 33]
        [--kbps 650]

The clip is cropped (--crop, in the clip's pixels), scaled to --size, cut to --start..--end seconds and encoded with
ffmpeg as VP9 at the clip's own frame rate, every frame kept at an even rate. --kbps caps the bitrate (constrained
quality: --crf as long as it stays under the cap), for clips full of fast motion that --crf alone keeps large.
For loops use loop.py, which closes the
clip into a seamless loop. Recording a canvas in the browser (MediaRecorder) is not used: it drops frames and freezes
when the machine is busy. ffmpeg comes from loop.py's lookup ($FFMPEG, imageio-ffmpeg or the PATH).
"""

import argparse
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from loop import ffmpeg  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("clip")
    p.add_argument("out")
    p.add_argument("--crop", help="X:Y:W:H, the part of the frame to keep")
    p.add_argument("--size", help="WxH of the result (default: the crop's or the clip's size)")
    p.add_argument("--start", type=float, default=0)
    p.add_argument("--end", type=float)
    p.add_argument("--crf", type=int, default=33)
    p.add_argument("--kbps", type=int, help="bitrate cap in kbit/s")
    a = p.parse_args()
    vf = []
    if a.crop:
        x, y, w, h = a.crop.split(":")
        vf.append(f"crop={w}:{h}:{x}:{y}")
    if a.size:
        vf.append("scale=" + a.size.replace("x", ":") + ":flags=lanczos")
    cmd = [ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{a.start:g}"]
    if a.end is not None:
        cmd += ["-to", f"{a.end:g}"]
    cmd += ["-i", a.clip, "-an"] + (["-vf", ",".join(vf)] if vf else []) + [
        "-c:v", "libvpx-vp9", "-crf", str(a.crf), "-b:v", f"{a.kbps}k" if a.kbps else "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "1",
        "-pix_fmt", "yuv420p", a.out]
    subprocess.run(cmd, check=True)
    print(f"{a.out}: {os.path.getsize(a.out) // 1024} KB")


if __name__ == "__main__":
    main()
