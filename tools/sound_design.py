"""Ghost Duels sound effects, designed from scratch with numpy and written as MP3 to ghost-duels-web/assets/sfx/.

    math-sdk\\env\\Scripts\\python.exe tools\\sound_design.py          (needs numpy and lameenc)

Every sound is layered synthesis put through a generated stereo "crypt" reverb: haunted bells with inharmonic
partials, vowel-formant ghost voices and choir, a drawbar pipe organ, filtered-noise whooshes, knocks and thunder.
Results are deterministic (fixed random seed). Pitched sounds are recorded at A5 (880 Hz) or A3 (220 Hz) so the game
can transpose them with playbackRate. Edit a recipe below and rerun to change a sound.
"""

import math
import os
import wave

import lameenc
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ghost-duels-web", "assets", "sfx")
SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "audio-src")
rng = np.random.default_rng(1313)


# ---------------------------------------------------------------- building blocks
def n(sec):
    return int(round(sec * SR))


def t_axis(sec):
    return np.arange(n(sec)) / SR


def env_ad(sec, a, d, curve=4.0):
    """Attack then exponential-ish decay over the whole length."""
    t = t_axis(sec)
    e = np.where(t < a, t / max(a, 1e-6), np.exp(-curve * (t - a) / max(d, 1e-6)))
    return e


def env_adsr(sec, a, d, s, r):
    t = t_axis(sec)
    e = np.ones_like(t) * s
    e[t < a] = t[t < a] / max(a, 1e-6)
    m = (t >= a) & (t < a + d)
    e[m] = 1 - (1 - s) * (t[m] - a) / max(d, 1e-6)
    m = t >= sec - r
    e[m] *= np.clip((sec - t[m]) / max(r, 1e-6), 0, 1)
    return e


def osc(freq, sec, kind="sine", phase=0.0):
    """freq may be a number or an array (glides, vibrato). Band-limited saw/square by additive harmonics."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n(sec),)).copy()
    ph = 2 * np.pi * np.cumsum(f) / SR + phase
    if kind == "sine":
        return np.sin(ph)
    out = np.zeros_like(ph)
    top = max(1, int(min(9000 / max(float(f.min()), 20), 60)))
    for k in range(1, top + 1):
        if kind == "square" and k % 2 == 0:
            continue
        amp = 1 / k
        fade = np.clip((12000 - f * k) / 3000, 0, 1)  # roll off harmonics near Nyquist-ish
        out += amp * fade * np.sin(k * ph)
    return out * (0.6 if kind == "saw" else 0.9)


def noise(sec, color="white"):
    w = rng.standard_normal(n(sec))
    if color == "brown":
        b = np.cumsum(w)
        b -= np.convolve(b, np.ones(2001) / 2001, mode="same")  # remove drift
        return b / (np.abs(b).max() + 1e-9)
    if color == "pink":
        spec = np.fft.rfft(w)
        f = np.fft.rfftfreq(len(w), 1 / SR)
        spec[1:] /= np.sqrt(f[1:])
        p = np.fft.irfft(spec, len(w))
        return p / (np.abs(p).max() + 1e-9)
    return w / 3


def biquad(x, kind, freq, q=0.707, gain_db=0.0, block=64):
    """RBJ biquad; freq may be an array (updated every `block` samples) for sweeps."""
    x = np.asarray(x, dtype=float)
    fr = np.broadcast_to(np.asarray(freq, dtype=float), x.shape)
    y = np.empty_like(x)
    x1 = x2 = y1 = y2 = 0.0
    A = 10 ** (gain_db / 40)
    for s in range(0, len(x), block):
        f0 = min(max(float(fr[s]), 10.0), SR * 0.45)
        w0 = 2 * math.pi * f0 / SR
        cw, sw = math.cos(w0), math.sin(w0)
        al = sw / (2 * q)
        if kind == "lp":
            b0, b1, b2, a0, a1, a2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + al, -2 * cw, 1 - al
        elif kind == "hp":
            b0, b1, b2, a0, a1, a2 = (1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + al, -2 * cw, 1 - al
        elif kind == "bp":
            b0, b1, b2, a0, a1, a2 = al, 0.0, -al, 1 + al, -2 * cw, 1 - al
        elif kind == "peak":
            b0, b1, b2, a0, a1, a2 = 1 + al * A, -2 * cw, 1 - al * A, 1 + al / A, -2 * cw, 1 - al / A
        else:
            raise ValueError(kind)
        b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
        for i in range(s, min(s + block, len(x))):
            xi = x[i]
            yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2, x1, y2, y1 = x1, xi, y1, yi
            y[i] = yi
    return y


def sweep(f0, f1, sec, shape="exp"):
    t = np.linspace(0, 1, n(sec))
    return f0 * (f1 / f0) ** t if shape == "exp" else f0 + (f1 - f0) * t


def vibrato(f, sec, depth=0.02, rate=5.5, delay=0.15):
    t = t_axis(sec)
    ramp = np.clip((t - delay) / 0.3, 0, 1)
    return f * (1 + depth * ramp * np.sin(2 * np.pi * rate * t + rng.uniform(0, 6)))


def pad_to(x, sec):
    out = np.zeros(n(sec))
    out[: min(len(x), len(out))] = x[: len(out)]
    return out


def place(dst, src, at):
    i = n(at)
    m = min(len(src), len(dst) - i)
    if m > 0:
        dst[i:i + m] += src[:m]
    return dst


# ---------------------------------------------------------------- instruments
def bell(f, sec, vol=1.0, bright=1.0):
    """Haunted church/handbell: inharmonic partials; high partials die first."""
    parts = [(0.5, 0.35, 1.0), (1.0, 1.0, 0.8), (1.19, 0.45, 0.6), (1.5, 0.30, 0.5), (2.0, 0.55, 0.45),
             (2.74, 0.35 * bright, 0.30), (3.0, 0.20 * bright, 0.25), (4.07, 0.18 * bright, 0.18), (5.4, 0.10 * bright, 0.12)]
    out = np.zeros(n(sec))
    for r, a, k in parts:
        e = env_ad(sec, 0.002, sec * k, curve=5)
        beat = 1 + 0.004 * np.sin(2 * np.pi * (0.7 + r) * t_axis(sec))  # slow shimmer
        out += a * e * osc(f * r * beat, sec)
    strike = biquad(noise(0.03), "bp", f * 3, 2) * env_ad(0.03, 0.0005, 0.03, 6)
    return vol * (out / len(parts) * 2 + pad_to(strike, sec) * 0.6)


VOWELS = {"oo": [(300, 1.0, 6), (870, 0.4, 8), (2240, 0.12, 10)],
          "ah": [(730, 1.0, 6), (1090, 0.6, 8), (2440, 0.25, 10)],
          "oh": [(500, 1.0, 6), (860, 0.5, 8), (2550, 0.15, 10)]}


def voice(freq, sec, vowel="ah", breath=0.15):
    """Glottal saw through three formant filters, plus breath noise: ghost voices and choir."""
    src = osc(freq, sec, "saw") + breath * noise(sec)
    out = np.zeros(n(sec))
    for fc, g, q in VOWELS[vowel]:
        out += g * biquad(src, "bp", fc, q)
    return out


def choir(notes_hz, sec, vowel="ah", vol=1.0):
    out = np.zeros(n(sec))
    for f in notes_hz:
        for det in (-0.006, 0.0, 0.007):
            out += voice(vibrato(f * (1 + det), sec, 0.012, 5 + rng.uniform(-0.6, 0.6), 0.2), sec, vowel, 0.2)
    e = env_adsr(sec, 0.35, 0.3, 0.8, sec * 0.45)
    return vol * out * e / (len(notes_hz) * 3)


def organ(notes_hz, sec, vol=1.0):
    """Drawbar pipe organ with a slow swell and tremulant."""
    t = t_axis(sec)
    trem = 1 + 0.06 * np.sin(2 * np.pi * 5.8 * t)
    out = np.zeros(n(sec))
    for f in notes_hz:
        for h, a in ((0.5, 0.6), (1, 1.0), (2, 0.7), (3, 0.35), (4, 0.4), (6, 0.15), (8, 0.18)):
            out += a * osc(f * h * (1 + rng.uniform(-0.0015, 0.0015)), sec)
    e = env_adsr(sec, 0.25, 0.2, 0.9, sec * 0.35)
    return vol * biquad(out * trem * e, "lp", 3200, 0.7) / (len(notes_hz) * 3)


def thump(f0, f1, sec, vol=1.0):
    return vol * osc(sweep(f0, f1, sec), sec) * env_ad(sec, 0.002, sec * 0.5, 5)


def whoosh(f0, f1, sec, q=1.2, vol=1.0, color="pink"):
    nz = noise(sec, color)
    t = np.linspace(0, 1, n(sec))
    swell = np.sin(np.pi * np.clip(t, 0, 1)) ** 1.5
    return vol * biquad(nz, "bp", sweep(f0, f1, sec), q) * swell


# ---------------------------------------------------------------- crypt reverb
def make_ir(sec=2.8, dark=3500.0):
    out = []
    for ch in range(2):
        nz = rng.standard_normal(n(sec))
        t = t_axis(sec)
        e = np.exp(-3.6 * t / sec) * np.clip(t / 0.012, 0, 1)
        ir = biquad(nz * e, "lp", dark, 0.6)
        for d, g in ((0.017, 0.5), (0.031, 0.35), (0.047, 0.28), (0.071, 0.2)):  # early stone reflections
            k = n(d + ch * 0.003)
            ir[k] += g
        out.append(ir / np.abs(ir).max())
    return np.stack(out)


IR = make_ir()


def reverb(mono, wet=0.35, tail=2.8, width=1.0):
    """Mono dry source -> stereo with the crypt tail, `tail` seconds long (short for clicks, long for bells)."""
    ir = IR[:, : n(tail)] * np.linspace(1, 0, n(tail)) ** 2
    L = len(mono) + ir.shape[1]
    size = 1 << (L - 1).bit_length()
    X = np.fft.rfft(mono, size)
    tails = [np.fft.irfft(X * np.fft.rfft(ir[c], size), size)[:L] for c in range(2)]
    tails = [tl / (np.abs(tl).max() + 1e-9) * np.abs(mono).max() for tl in tails]
    dry = np.concatenate([mono, np.zeros(ir.shape[1])])
    left = dry * (1 - wet * 0.5) + tails[0] * wet
    right = dry * (1 - wet * 0.5) + (tails[1] * width + tails[0] * (1 - width)) * wet
    st = np.stack([left, right])
    # trim the silent end
    mag = np.abs(st).max(axis=0)
    last = np.nonzero(mag > 10 ** (-54 / 20) * mag.max())[0]  # cut where it falls 54 dB below the peak
    return st[:, : (last[-1] + 1 if len(last) else st.shape[1])]


def fade_out(st, sec=0.08):
    k = min(n(sec), st.shape[1])
    st[:, -k:] *= np.linspace(1, 0, k)
    return st


# ---------------------------------------------------------------- recipes (one per game sound)
def s_click():
    sec = 0.09
    x = biquad(noise(sec), "bp", 2600, 6) * env_ad(sec, 0.0008, 0.03, 6) * 1.2
    x += osc(1450, sec) * env_ad(sec, 0.001, 0.025, 6) * 0.5
    x += osc(sweep(420, 300, sec), sec) * env_ad(sec, 0.001, 0.04, 6) * 0.35  # bone body
    return reverb(x, 0.12, .25)


def s_spin():
    """Old board falls away: a ghostly gust, a low whoomp and a faint 'ooh'."""
    sec = 0.85
    x = whoosh(380, 2600, sec * 0.5, 1.1, 1.0)
    x = pad_to(x, sec) + place(np.zeros(n(sec)), whoosh(2600, 300, sec * 0.55, 1.0, 0.9), sec * 0.3)
    x += pad_to(thump(140, 48, 0.35, 0.8), sec)
    ooh = voice(vibrato(sweep(330, 250, sec), sec, 0.02, 6, 0.05), sec, "oo", 0.4) * env_adsr(sec, 0.12, 0.2, 0.6, 0.35) * 0.35
    return reverb(x + ooh, 0.3, .8)


def s_land():
    """A reel comes to rest: a coffin-lid knock. Pitched per reel by the game."""
    sec = 0.32
    x = thump(170, 70, sec, 1.0)
    wood = sum(a * osc(f, sec) * env_ad(sec, 0.001, d, 6) for f, a, d in ((420, 0.6, 0.12), (690, 0.4, 0.08), (1130, 0.25, 0.05)))
    x += wood * 0.6 + biquad(noise(sec), "bp", 1000, 3) * env_ad(sec, 0.0005, 0.03, 6) * 1.4
    return reverb(x, 0.18, .35)


def s_land_heavy():
    """VS reel or crate slams down: a stone slab, rattling chains."""
    sec = 1.0
    x = thump(110, 34, 0.7, 1.2)
    x = pad_to(x, sec) + pad_to(biquad(noise(0.25, "brown"), "lp", 400, 0.7) * env_ad(0.25, 0.002, 0.12, 5), sec) * 1.2
    chain = np.zeros(n(sec))
    for i in range(9):
        at = 0.05 + i * 0.045 + rng.uniform(-0.01, 0.01)
        f = rng.uniform(2400, 5200)
        ping = sum(osc(f * r, 0.12) * env_ad(0.12, 0.0005, 0.04, 6) * a for r, a in ((1, 1), (1.47, 0.5), (2.09, 0.3)))
        place(chain, ping * (0.5 - i * 0.04), at)
    return reverb(x + chain * 0.45, 0.32, 1.0)


def s_chime():
    """Haunted bell at A5 (880 Hz): wins (the game plays it at several pitches)."""
    sec = 2.2
    x = bell(880, sec, 1.0, 1.0) + pad_to(bell(1762, sec * 0.6, 0.15, 0.6), sec)
    whisper = biquad(noise(sec), "bp", 5200, 2) * env_adsr(sec, 0.05, 0.2, 0.3, 1.2) * 0.05
    return reverb(x + whisper, 0.45, 2.0)


def s_crystal():
    """Glassy soul-tink at A5: runes landing and being collected."""
    sec = 1.1
    x = sum(a * osc(880 * r, sec) * env_ad(sec, 0.001, sec * k, 6) for r, a, k in ((1, 1, 0.6), (2.0, 0.5, 0.4), (3.01, 0.3, 0.25), (4.2, 0.2, 0.15), (5.43, 0.12, 0.1)))
    x += pad_to(biquad(noise(0.02), "hp", 6000, 0.7) * 0.4, sec)
    return reverb(x, 0.5, 1.2)


def s_tumble():
    """Winning symbols vanish: a ghostly 'poof' and a dry crumble."""
    sec = 0.7
    x = whoosh(3000, 250, sec * 0.6, 0.9, 1.0, "white")
    x = pad_to(x, sec) + pad_to(thump(260, 90, 0.18, 0.4), sec)
    for i in range(7):
        g = biquad(noise(0.04), "bp", rng.uniform(700, 2200), 4) * env_ad(0.04, 0.001, 0.02, 6) * 0.5
        place(x, g, 0.08 + i * 0.05 + rng.uniform(0, 0.02))
    return reverb(x, 0.3, .6)


def s_charge():
    """The small VS charges before it bursts: an eerie theremin rise over a hissing riser."""
    sec = 0.55
    f = sweep(240, 980, sec)
    x = osc(vibrato(f, sec, 0.03, 9, 0), sec, "sine") * env_adsr(sec, 0.15, 0.1, 0.9, 0.05) * 0.6
    x += whoosh(500, 6000, sec, 2.5, 0.7, "white")
    return reverb(x, 0.3, .5)


def s_burst():
    """The VS reel bursts open: thunder from below, a smoke blast, a ringing shard."""
    sec = 2.2
    x = pad_to(thump(80, 26, 1.0, 1.4), sec)
    rumble = biquad(noise(sec, "brown"), "lp", 260, 0.8) * env_ad(sec, 0.01, 1.2, 4) * 1.4
    crack = biquad(noise(0.3), "hp", 2000, 0.7) * env_ad(0.3, 0.001, 0.08, 5) * 0.9
    blast = whoosh(3500, 300, 0.9, 0.8, 0.8, "white")
    x += rumble + pad_to(crack, sec) + pad_to(blast, sec) + pad_to(bell(1318, 1.2, 0.12, 0.5), sec)
    return reverb(x, 0.4, 2.2)


def s_clash():
    """Two fighters collide: crossing blades, a hit, metallic ringing."""
    sec = 1.1
    x = np.zeros(n(sec))
    for f, a, d in ((2380, 1.0, 0.5), (3710, 0.7, 0.35), (5120, 0.5, 0.25), (6890, 0.35, 0.18), (1570, 0.5, 0.6)):
        x += a * osc(f * (1 + 0.003 * np.sin(2 * np.pi * 7 * t_axis(sec))), sec) * env_ad(sec, 0.0005, d, 5)
    x = x * 0.35 + pad_to(biquad(noise(0.08), "hp", 3000, 0.7), sec) * 0.9
    x += pad_to(thump(130, 50, 0.25, 0.9), sec)
    return reverb(x, 0.38, 1.2)


def s_wail():
    """A fighter is knocked out: a descending ghost 'oooh'."""
    sec = 1.6
    f = vibrato(sweep(560, 230, sec), sec, 0.035, 6.2, 0.05)
    x = voice(f, sec, "oo", 0.35) * env_adsr(sec, 0.08, 0.3, 0.75, 0.6)
    x += voice(f * 2.01, sec, "oo", 0.5) * env_adsr(sec, 0.1, 0.3, 0.5, 0.6) * 0.25
    return reverb(x, 0.55, 1.5)


def s_toll():
    """A deep church-bell toll (A2)."""
    sec = 4.0
    x = bell(110, sec, 1.0, 0.8) + pad_to(thump(70, 50, 1.2, 0.35), sec)
    return reverb(x, 0.55, 2.8)


def s_sting():
    """A duel is won: a choir 'aah' chord (A minor) with a bell."""
    sec = 2.4
    a3 = 220
    x = choir([a3, a3 * 2 ** (3 / 12), a3 * 2 ** (7 / 12), a3 * 2], sec, "ah", 1.0)
    x += pad_to(bell(880, 2.0, 0.35, 0.8), sec)
    return reverb(x, 0.5, 2.4)


def s_sting_devil():
    """The devil wins: a tritone choir, organ pedal and a growl."""
    sec = 3.0
    a2 = 110
    x = choir([a2, a2 * 2 ** (6 / 12), a2 * 2], sec, "oh", 1.0)
    x += organ([55, 55 * 2 ** (6 / 12)], sec, 0.9)
    growl = osc(vibrato(sweep(62, 48, sec), sec, 0.05, 17, 0), sec, "saw") * env_adsr(sec, 0.05, 0.3, 0.6, 1.0)
    x += biquad(growl, "lp", 600, 0.9) * 0.5 + pad_to(bell(220 * 2 ** (6 / 12), 2.6, 0.4, 0.7), sec)
    return reverb(x, 0.5, 2.6)


def s_fanfare():
    """Free spins triggered: an organ swell, a church toll and a choir, bells tumbling down."""
    sec = 4.2
    a2 = 110
    org = pad_to(organ([a2, a2 * 2, a2 * 2 ** (15 / 12), a2 * 2 ** (19 / 12)], 1.6, 1.0), sec)
    org += place(np.zeros(n(sec)), organ([a2 * 2 ** (-4 / 12), a2 * 2 ** (8 / 12), a2 * 2, a2 * 2 ** (17 / 12)], 2.4, 1.0), 1.4)
    x = org + pad_to(bell(110, 4.0, 0.9, 0.8), sec) + place(np.zeros(n(sec)), choir([220, 220 * 2 ** (3 / 12), 330, 440], 2.6, "ah", 0.8), 1.2)
    for i, semi in enumerate((24, 22, 20, 19, 17, 15, 12)):
        place(x, bell(440 * 2 ** (semi / 12), 1.4, 0.18, 1.0), 0.4 + i * 0.1)
    return reverb(x, 0.5, 2.8)


def s_bigwin():
    """Big win: toll, choir and organ, then a cascade of bells."""
    sec = 4.6
    x = pad_to(bell(110, 4.4, 1.0, 0.8), sec)
    x += pad_to(choir([220, 277.2, 330, 440, 554.4], 3.6, "ah", 1.0), sec)
    x += pad_to(organ([110, 220, 277.2, 330], 3.6, 0.8), sec)
    for i in range(10):
        semi = (24, 19, 22, 17, 20, 15, 19, 12, 17, 24)[i]
        place(x, bell(440 * 2 ** (semi / 12), 1.4, 0.16, 1.0), 0.5 + i * 0.12)
    return reverb(x, 0.45, 2.8)


def s_heartbeat():
    """A life is lost: lub-dub, a crack, a fading sigh."""
    sec = 1.4
    x = np.zeros(n(sec))
    place(x, thump(78, 42, 0.22, 1.2), 0.0)
    place(x, thump(66, 38, 0.26, 1.0), 0.22)
    place(x, biquad(noise(0.08), "bp", 3000, 1.2) * env_ad(0.08, 0.0005, 0.03, 6) * 0.8, 0.05)
    sigh = voice(vibrato(sweep(380, 250, 0.9), 0.9, 0.03, 6, 0), 0.9, "oo", 0.6) * env_adsr(0.9, 0.1, 0.2, 0.6, 0.4) * 0.35
    place(x, sigh, 0.4)
    return reverb(x, 0.35, 1.0)


def s_crumble():
    """Runes without a crate crumble to dust: grinding stone, falling grit."""
    sec = 0.9
    x = biquad(noise(sec, "brown"), "lp", 500, 0.8) * env_ad(sec, 0.01, 0.4, 4) * 0.8
    for i in range(16):
        g = biquad(noise(0.03), "bp", rng.uniform(900, 3500), 5) * env_ad(0.03, 0.0005, 0.015, 6) * rng.uniform(0.2, 0.5)
        place(x, g, 0.02 + i * 0.045 + rng.uniform(0, 0.02))
    return reverb(x, 0.3, .7)


def s_challenger():
    """A challenger enters (the pirate): a low ship's horn over a dark organ."""
    sec = 1.8
    horn = voice(vibrato(np.full(n(sec), 110.0), sec, 0.008, 4.5, 0.3), sec, "oh", 0.1) * env_adsr(sec, 0.2, 0.3, 0.8, 0.5)
    x = horn * 1.2 + organ([55, 82.4], sec, 0.6)
    return reverb(x, 0.45, 1.8)


def s_banner():
    """A banner appears: a rising whoosh into a bell."""
    sec = 2.0
    x = pad_to(whoosh(300, 3200, 0.45, 0.9, 0.8), sec)
    place(x, bell(880, 1.5, 0.6, 0.9), 0.4)
    return reverb(x, 0.45, 1.6)


def load_wav(name):
    """A 16-bit WAV from audio-src/ as a stereo float array at SR (stdlib wave plus FFT resampling)."""
    with wave.open(os.path.join(SRC, name)) as w:
        sr, ch = w.getframerate(), w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float).reshape(-1, ch).T / 32768
    if ch == 1:
        x = np.vstack([x, x])
    if sr != SR:
        m = int(round(x.shape[1] * SR / sr))
        X = np.fft.rfft(x, axis=1)[:, : m // 2 + 1]
        x = np.fft.irfft(X, m, axis=1) * m / x.shape[1]
    return x


def s_fs_land():
    """An FS symbol lands (the game raises it 2 semitones for each further FS): the magical scatter sample
    (audio-src/fs_scatter.wav) made sharp - mud below 450 Hz thinned, presence and air lifted, a crisp glassy
    attack, a little weight underneath, gentle saturation so it cuts through, and the tail shortened to 1.6 s."""
    x = load_wav("fs_scatter.wav")
    sec = 1.6
    x = x[:, : n(sec)]
    x = np.stack([biquad(biquad(biquad(biquad(c, "hp", 170, 0.7), "peak", 420, 0.9, -4),
                                "peak", 3200, 0.8, 5), "peak", 8500, 0.6, 7) for c in x])
    t = t_axis(sec)
    x *= 1 + 1.4 * np.exp(-t / 0.035)  # transient: the first few hundredths of a second stand out
    x *= np.clip((sec - t) / 0.6, 0, 1) ** 1.5  # tighter tail
    x = x / np.abs(x).max()
    # crisp attack on top: a glassy ping on the sample's own partials (it rings on ~595 Hz), a short bright noise
    # tick (own random generator, so the other sounds stay as they were), and a soft low thump for weight
    hit = pad_to(osc(2380, 0.25) * env_ad(0.25, 0.0005, 0.08, 6) * 0.35, sec) + pad_to(osc(3570, 0.18) * env_ad(0.18, 0.0005, 0.05, 6) * 0.2, sec)
    tick = np.random.default_rng(595).standard_normal(n(0.05)) / 3
    hit += pad_to(biquad(tick, "hp", 5500, 0.7) * env_ad(0.05, 0.0003, 0.015, 7) * 1.1, sec)
    hit += pad_to(thump(110, 45, 0.3, 0.55), sec)
    st = x + hit
    st = np.tanh(st * 1.8) / np.tanh(1.8)  # gentle saturation: denser, louder at the same peak
    wet = reverb(st.mean(0), 0.15, 0.6)[:, : n(sec)]
    return st * 0.85 + pad_to_st(wet, sec) * 0.25


def pad_to_st(st, sec):
    out = np.zeros((2, n(sec)))
    out[:, : min(st.shape[1], n(sec))] = st[:, : n(sec)]
    return out


def s_edge():
    """Suspense under a teasing reel (one more FS needed), 2.4 s plus tail; the game raises it for each further reel.
    A low drone swelling, a heartbeat that speeds up, a dissonant high tremolo, a rising whoosh and a whispering choir."""
    sec, body = 3.0, 2.4
    t = t_axis(sec)
    swell = np.clip(t / body, 0, 1) ** 1.6 * np.where(t < body, 1, np.exp(-6 * (t - body)))
    drone = biquad(osc(55 * (1 + 0.004 * np.sin(2 * np.pi * 0.7 * t)), sec, "saw") + osc(82.4, sec, "saw") * 0.6, "lp", 380, 0.9)
    x = drone * (0.35 + 0.65 * swell) * 0.9
    beat_at = 0.05
    for i in range(7):  # heartbeat: lub-dub pairs, closer together each time
        place(x, thump(70, 40, 0.16, 1.1), beat_at)
        place(x, thump(62, 38, 0.18, 0.85), beat_at + 0.16)
        beat_at += 0.5 * 0.82 ** i
        if beat_at > body - 0.15:
            break
    trem = (osc(880, sec) + osc(932.3, sec) * 0.8 + osc(1318.5, sec) * 0.35) * (0.55 + 0.45 * np.sin(2 * np.pi * 13 * t))
    x += biquad(trem, "lp", 4000, 0.7) * swell * 0.28
    x += pad_to(whoosh(250, 4200, body, 1.4, 0.55, "pink"), sec) * np.clip(t / body, 0, 1)
    x += choir([220, 233.1, 329.6], sec, "oo", 0.7) * swell * 0.8
    return reverb(x, 0.4, 1.6)


SOUNDS = {
    "click": s_click, "spin": s_spin, "land": s_land, "land_heavy": s_land_heavy, "chime": s_chime, "crystal": s_crystal,
    "tumble": s_tumble, "charge": s_charge, "burst": s_burst, "clash": s_clash, "wail": s_wail, "toll": s_toll,
    "sting": s_sting, "sting_devil": s_sting_devil, "fanfare": s_fanfare, "bigwin": s_bigwin, "heartbeat": s_heartbeat,
    "crumble": s_crumble, "challenger": s_challenger, "banner": s_banner, "fs_land": s_fs_land, "edge": s_edge,
}


def write_mp3(name, st):
    st = fade_out(st)
    st = st / (np.abs(st).max() + 1e-9) * 10 ** (-1 / 20)  # peak at -1 dBFS; the game sets the level
    pcm = (np.clip(st.T, -1, 1) * 32767).astype("<i2").tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(128); enc.set_in_sample_rate(SR); enc.set_channels(2); enc.set_quality(2)
    data = enc.encode(pcm) + enc.flush()
    with open(os.path.join(OUT, name + ".mp3"), "wb") as f:
        f.write(data)
    return len(data), st.shape[1] / SR


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for name, fn in SOUNDS.items():
        st = fn()
        assert np.isfinite(st).all(), name
        size, dur = write_mp3(name, st)
        total += size
        print(f"{name:12} {dur:5.2f}s {size // 1024:4d} KB")
    print(f"total {total // 1024} KB -> {OUT}")
