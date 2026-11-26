r"""Night Drive sounds from ElevenLabs: sound effects (sound generation) and music (Music API), as set out in
audio-src/night-drive/audio.json.

    math-sdk\env\Scripts\python.exe tools\night_drive_audio.py [name ...] [--takes N]

Every take is kept in audio-src/night-drive/takes/<name>/take-NN.mp3; the first take is copied to
night-drive-web/assets/sfx/<name>.mp3 (music to night-drive-web/assets/<name>.mp3) unless the file is there already.
Pick another take by copying it over. Uses the ELEVENLABS_API_KEY like tools/elevenlabs_sfx.py.
"""

import json
import os
import shutil
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from elevenlabs_sfx import api_key, credits_left  # noqa: E402

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


def main():
    a = sys.argv[1:]
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
        dst = os.path.join(WEB, "sfx", e["name"] + ".mp3") if kind == "sfx" else os.path.join(WEB, e["name"] + ".mp3")
        first = os.path.join(d, "take-01.mp3")
        if not os.path.exists(dst) and os.path.exists(first):
            shutil.copy(first, dst)
    print("credits left:", credits_left())


if __name__ == "__main__":
    main()
