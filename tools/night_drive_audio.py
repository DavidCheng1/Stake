r"""Night Drive sounds from ElevenLabs: sound effects (sound generation) and music (Music API), as set out in
audio-src/night-drive/audio.json.

    math-sdk\env\Scripts\python.exe tools\night_drive_audio.py [name ...] [--takes N]

Every take is kept in audio-src/night-drive/takes/<name>/take-NN.mp3. Music: the first take is copied to
night-drive-web/assets/<name>.mp3 unless the file is there already. Sound effects: --finish picks the best take of
each (not clipped, the least harsh: the smallest share of energy above 5 kHz) and finishes it into
night-drive-web/assets/sfx/<name>.mp3: highs above 5 kHz softened (-6 dB per octave), a 5 ms fade in and a 60 ms
fade out (no clicks), peaks at -4 dBFS. Uses the ELEVENLABS_API_KEY like tools/elevenlabs_sfx.py.
"""

import json
import os
import shutil
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from elevenlabs_sfx import SR, api_key, credits_left, decode, write_mp3  # noqa: E402
import numpy as np  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(ROOT, "audio-src", "night-drive")
WEB = os.path.join(ROOT, "night-drive-web", "assets")
API = "https://api.elevenlabs.io/v1"


def post(path, body):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": api_key(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:500]}") from None


def sfx(entry, style):
    return post("/sound-generation?output_format=mp3_44100_128", {"text": f"{entry['prompt']}. {style}.",
                "duration_seconds": entry["s"], "prompt_influence": 0.6, "model_id": "eleven_text_to_sound_v2"})


def music(entry):
    try:
        return post("/music?output_format=mp3_44100_128", {"prompt": entry["prompt"], "music_length_ms": entry["ms"],
                    "model_id": "music_v1", "force_instrumental": True})
    except RuntimeError as e:  # no Music API on this plan: a 30 s seamless loop from the sound-effects model
        print(f"  music API: {e}; using a 30 s sound-generation loop")
        return post("/sound-generation?output_format=mp3_44100_128", {"text": entry["prompt"], "duration_seconds": 30,
                    "loop": True, "prompt_influence": 0.6, "model_id": "eleven_text_to_sound_v3"})


def harsh(x):
    """Share of the energy above 5 kHz."""
    f = np.abs(np.fft.rfft(x.mean(0))) ** 2; hz = np.fft.rfftfreq(x.shape[1], 1 / SR)
    return float(f[hz > 5000].sum() / max(f.sum(), 1e-12))


def finish(name):
    d = os.path.join(HERE, "takes", name)
    best = None
    for t in sorted(f for f in os.listdir(d) if f.endswith(".mp3")):
        x = decode(os.path.join(d, t)); pk = float(np.abs(x).max())
        clipped = int((np.abs(x).max(0) > .985).sum()) > 20  # real clipping: many samples at the limit, not a single peak
        score = harsh(x) + (1 if clipped else 0) + (1 if pk < .02 else 0)  # clipped or nearly silent takes come last
        if best is None or score < best[0]:
            best = (score, t, x)
    score, t, x = best
    hz = np.fft.rfftfreq(x.shape[1], 1 / SR)
    gain = 10 ** (-6 * np.log2(np.maximum(hz, 5000) / 5000) / 20)
    x = np.fft.irfft(np.fft.rfft(x, axis=1) * gain, n=x.shape[1], axis=1).astype(np.float32)
    a, b = int(.005 * SR), int(.06 * SR)
    x[:, :a] *= np.linspace(0, 1, a, dtype=np.float32); x[:, -b:] *= np.linspace(1, 0, b, dtype=np.float32)
    x *= 10 ** (-4 / 20) / max(float(np.abs(x).max()), 1e-6)
    write_mp3(x, os.path.join(WEB, "sfx", name + ".mp3"))
    print(f"{name}: {t} (highs {score:.3f})")


def main():
    a = sys.argv[1:]
    if "--finish" in a:
        a.remove("--finish")
        spec = json.load(open(os.path.join(HERE, "audio.json"), encoding="utf-8"))
        for e in spec["sfx"]:
            if not a or e["name"] in a:
                finish(e["name"])
        return
    takes = 1
    if "--takes" in a:
        i = a.index("--takes"); takes = int(a[i + 1]); del a[i:i + 2]
    spec = json.load(open(os.path.join(HERE, "audio.json"), encoding="utf-8"))
    todo = [("sfx", e) for e in spec["sfx"]] + [("music", e) for e in spec["music"]]
    if a:
        todo = [t for t in todo if t[1]["name"] in a]
    print("credits left:", credits_left())
    os.makedirs(os.path.join(WEB, "sfx"), exist_ok=True)
    for kind, e in todo:
        d = os.path.join(HERE, "takes", e["name"]); os.makedirs(d, exist_ok=True)
        for _ in range(takes):
            n = len([f for f in os.listdir(d) if f.endswith(".mp3")]) + 1
            try:
                data = sfx(e, spec["style"]) if kind == "sfx" else music(e)
            except RuntimeError as err:
                print(f"{e['name']}: failed: {err}"); break
            path = os.path.join(d, f"take-{n:02d}.mp3"); open(path, "wb").write(data)
            print(f"{e['name']} take {n}: {len(data) // 1024} KB")
        dst = os.path.join(WEB, e["name"] + ".mp3")
        first = os.path.join(d, "take-01.mp3")
        if kind == "music" and not os.path.exists(dst) and os.path.exists(first):
            shutil.copy(first, dst)
    print("credits left:", credits_left())


if __name__ == "__main__":
    main()
