r"""Turn a song into a seamless loop for Web Audio.

    math-sdk\env\Scripts\python.exe tools\audio_loop.py <in.mp3> <out.mp3> [--keep 0.6] [--fade 0.08]

A generated song rarely loops: its length is not a whole number of bars, so the beat stumbles where it starts over.
This finds the loop end E: the point in the last part of the song (after --keep of it) whose next 4 seconds sound most
like the song's first 4 seconds (24-band spectrum, so the drums and the chords both match), then the sample where the
waveform lines up best. The loop is [0, E); its first --fade seconds are crossfaded with what follows E, so the seam is
smooth. MP3 adds a little silence at both ends (encoder delay and padding): the game trims digital silence off the
decoded buffer and sets loopStart/loopEnd (night-drive-web/game.js, sound.start).
"""

import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from elevenlabs_sfx import SR, decode, write_mp3  # noqa: E402

HOP = 256


def envelope(m):
    n = len(m) // HOP
    e = np.sqrt((m[:n * HOP].reshape(n, HOP) ** 2).mean(1))
    d = np.maximum(np.diff(np.log(e + 1e-4), prepend=0), 0)
    return d - d.mean()


def tempo(env):
    ac = np.correlate(env, env, "full")[len(env) - 1:]
    lo, hi = int(60 / 180 * SR / HOP), int(60 / 70 * SR / HOP)
    lag = lo + int(np.argmax(ac[lo:hi]))
    return lag * HOP  # samples per beat (coarse)


def bands(m):
    n = (len(m) - 2048) // 512
    win = np.hanning(2048).astype(np.float32)
    fr = np.stack([m[i * 512:i * 512 + 2048] * win for i in range(n)])
    mag = np.abs(np.fft.rfft(fr, axis=1))
    edges = np.unique(np.geomspace(2, mag.shape[1] - 1, 25).astype(int))
    b = np.stack([mag[:, lo:hi].mean(1) for lo, hi in zip(edges[:-1], edges[1:])], 1)
    b = np.log(b + 1e-4)
    return (b - b.mean(0)) / (b.std(0) + 1e-6)  # per band: how it changes, not the overall tone


def ncc(a, b):
    a = a - a.mean(); b = b - b.mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("inp"); p.add_argument("out")
    p.add_argument("--keep", type=float, default=0.6)
    p.add_argument("--fade", type=float, default=0.08)
    a = p.parse_args()
    x = decode(a.inp)  # (2, n)
    m = x.mean(0)
    beat = tempo(envelope(m))
    # coarse: a 4 s phrase compared by its spectrum (24 log bands per 512 samples), so drums and chords both match
    spec = bands(m)
    fw = int(4 * SR / 512)
    head = spec[:fw].ravel()
    best = []
    for f in range(int(len(spec) * a.keep), len(spec) - fw - 2):
        best.append((ncc(spec[f:f + fw].ravel(), head), f))
    best.sort(reverse=True)
    # fine: the waveform around the best few, every 2 samples
    cand = []
    for score, f in best[:6]:
        c = f * 512
        for e in range(max(0, c - 1024), c + 1024, 2):
            if e + 4096 + int(a.fade * SR) >= len(m):
                continue
            cand.append((score + .5 * ncc(m[e:e + 4096], m[:4096]), e))
    score, E = max(cand)
    F = int(a.fade * SR)
    y = x[:, :E].copy()
    w = np.linspace(0, 1, F, dtype=np.float32)
    y[:, :F] = x[:, :F] * w + x[:, E:E + F] * (1 - w)
    peak = np.abs(y).max()
    if peak > .98:
        y *= .98 / peak
    write_mp3(y, a.out)
    print(f"{os.path.basename(a.inp)}: beat {beat / SR * 1000:.0f} ms ({60 * SR / beat:.1f} BPM), loop {E / SR:.3f} s "
          f"of {x.shape[1] / SR:.2f} s ({E / beat:.2f} beats), match {score:.2f} -> {a.out}")


if __name__ == "__main__":
    main()
