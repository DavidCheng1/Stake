"""Plays an animated WebP faster (or slower) by rewriting its frame durations; the pictures are not touched.

  python tools/retime_webp.py <file.webp> <factor>      factor 1.5 = 1.5x as fast, written in place
  python tools/retime_webp.py <file.webp>               only prints the frame count and total length

Each frame's duration is the 24-bit field at offset 12 of its ANMF chunk. Factors stack when rerun on the
same file, so note what was applied. ghost-duels-web/assets/vs-break.webp: 1.5x then 1.2x (1.8x) on 2026-11-04 (from 3.90 s,
the original is in commit cd1304a), to match VS_NORMAL in game.js.
"""
import struct
import sys


def frames(b):
    assert b[:4] == b"RIFF" and b[8:12] == b"WEBP", "not a WebP"
    i = 12
    while i < len(b):
        tag, n = b[i:i + 4], struct.unpack("<I", b[i + 4:i + 8])[0]
        if tag == b"ANMF":
            yield i + 8 + 12  # the duration field
        i += 8 + n + (n & 1)


def main():
    path = sys.argv[1]
    b = bytearray(open(path, "rb").read())
    at = list(frames(b))
    dur = [int.from_bytes(b[o:o + 3], "little") for o in at]
    print(f"{len(at)} frames, {sum(dur) / 1000:.2f} s")
    if len(sys.argv) < 3:
        return
    f = float(sys.argv[2])
    new = [max(11, round(d / f)) for d in dur]  # browsers treat 10 ms or less as 100 ms
    for o, d in zip(at, new):
        b[o:o + 3] = d.to_bytes(3, "little")
    open(path, "wb").write(b)
    print(f"now {sum(new) / 1000:.2f} s")


if __name__ == "__main__":
    main()
