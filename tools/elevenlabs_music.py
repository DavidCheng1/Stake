"""Ghost Duels background music from ElevenLabs Music: generate takes, listen to them, make a pick a seamless loop.

    math-sdk\\env\\Scripts\\python.exe tools\\elevenlabs_music.py generate [name ...] [--takes N] [--yes]
    math-sdk\\env\\Scripts\\python.exe tools\\elevenlabs_music.py page
    math-sdk\\env\\Scripts\\python.exe tools\\elevenlabs_music.py loop <name> <take>

generate  requests takes of each track in audio-src/elevenlabs/music.json (prompt, length, model) and keeps them, with
          their settings, in audio-src/elevenlabs/music-takes/<name>/. Shows the credits left first and asks (--yes
          skips that); prints the credits used after.
page      writes audio-src/elevenlabs/music-takes/compare.html: the current music and every take, to listen side by side.
loop      makes take NN of a track the game's music: the end is crossfaded into the start (equal power, 3 s) so it loops
          without a seam, the loudness matches the current music, peaks stay at -1 dBFS. The file it replaces is kept in
          audio-src/music-old/ first (name_old.mp3, then _old2, ...).

Needs numpy, miniaudio and lameenc (math-sdk's environment) and the ELEVENLABS_API_KEY, like tools/elevenlabs_sfx.py,
whose helpers it uses.
"""

import datetime
import html
import json
import os
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from elevenlabs_sfx import API, ROOT, SR, api_key, credits_left, decode, write_mp3  # noqa: E402

HERE = os.path.join(ROOT, "audio-src", "elevenlabs")
SPEC = os.path.join(HERE, "music.json")
TAKES = os.path.join(HERE, "music-takes")
OLD = os.path.join(ROOT, "audio-src", "music-old")
XFADE_S = 3.0


def spec():
    with open(SPEC, encoding="utf-8") as f:
        s = json.load(f)
    return s["defaults"], {t["name"]: t for t in s["tracks"]}


def compose(track, defaults):
    body = {"prompt": track["prompt"], "music_length_ms": track["length_ms"],
            "model_id": track.get("model_id", defaults["model_id"]),
            "force_instrumental": track.get("force_instrumental", defaults.get("force_instrumental", True))}
    query = "?" + urllib.parse.urlencode({"output_format": track.get("output_format", defaults["output_format"])})
    req = urllib.request.Request(API + "/music" + query, data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": api_key(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            return r.read(), body
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:800]}") from None


def generate(names, takes=None, yes=False):
    defaults, tracks = spec()
    todo = [tracks[n] for n in (names or tracks)]
    total_s = sum(t["length_ms"] / 1000 * (takes or t.get("takes", 1)) for t in todo)
    left = credits_left()
    print(f"{len(todo)} track(s), {total_s:.0f} s of music in all; credits left: {left if left is not None else 'unknown'}")
    if not yes:
        print("Run again with --yes to generate.")
        return
    for t in todo:
        folder = os.path.join(TAKES, t["name"])
        os.makedirs(folder, exist_ok=True)
        log_path = os.path.join(folder, "takes.json")
        log = json.load(open(log_path, encoding="utf-8")) if os.path.exists(log_path) else []
        for _ in range(takes or t.get("takes", 1)):
            n = len(log) + 1
            try:
                data, body = compose(t, defaults)
            except RuntimeError as e:
                print(f"{t['name']} take {n}: failed: {e}")
                break
            file = f"take-{n:02d}.mp3"
            with open(os.path.join(folder, file), "wb") as f:
                f.write(data)
            log.append({"take": file, "time": datetime.datetime.now().isoformat(timespec="seconds"), **body})
            with open(log_path, "w", encoding="utf-8") as f:
                json.dump(log, f, indent=1, ensure_ascii=False)
            print(f"{t['name']} take {n}: {len(data) // 1024} KB -> {os.path.join(folder, file)}")
    after = credits_left()
    if left is not None and after is not None:
        print(f"credits used: {left - after}, {after} left")
    page()


def page():
    _, tracks = spec()
    rows = []
    for name, t in tracks.items():
        cur = os.path.join(ROOT, t["file"])
        rows.append(f"<h2>{html.escape(name)}</h2><p>{html.escape(t['prompt'])}</p>")
        if os.path.exists(cur):
            rows.append(f"<div class='t'><b>now in the game</b> <audio controls preload='none' src='{html.escape(os.path.relpath(cur, TAKES).replace(os.sep, '/'))}'></audio></div>")
        folder = os.path.join(TAKES, name)
        for f in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
            if f.endswith(".mp3"):
                rows.append(f"<div class='t'><b>{html.escape(f[:-4])}</b> <audio controls preload='none' src='{name}/{f}'></audio></div>")
    css = "body{font:15px system-ui;background:#0b1714;color:#dfe;max-width:900px;margin:24px auto;padding:0 16px}h2{color:#7fe3b5}p{color:#9bb}.t{margin:8px 0;display:flex;gap:12px;align-items:center}b{min-width:120px}"
    os.makedirs(TAKES, exist_ok=True)
    path = os.path.join(TAKES, "compare.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"<!doctype html><meta charset='utf-8'><title>Ghost Duels music takes</title><style>{css}</style><h1>Ghost Duels music</h1>{''.join(rows)}")
    print(path)


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)))


def loop(name, take):
    _, tracks = spec()
    t = tracks[name]
    src = os.path.join(TAKES, name, take if take.endswith(".mp3") else f"take-{int(take.lstrip('t')):02d}.mp3")
    x = decode(src)
    # trim silence at both ends (the game loops between the first and last audible sample anyway)
    loud = np.nonzero(np.abs(x).max(0) > 1e-3)[0]
    x = x[:, loud[0]:loud[-1] + 1]
    n, xf = x.shape[1], int(XFADE_S * SR)
    if n < 4 * xf:
        sys.exit(f"{src}: too short to loop ({n / SR:.1f} s)")
    # the last XFADE_S seconds fade into the first ones: the file then ends just before where it began
    k = np.linspace(0, np.pi / 2, xf, dtype=np.float32)
    out = x[:, :n - xf].copy()
    out[:, :xf] = x[:, :xf] * np.sin(k) + x[:, n - xf:] * np.cos(k)
    target = os.path.join(ROOT, t["file"])
    if os.path.exists(target):  # as loud as the music it replaces
        out *= rms(decode(target)) / max(rms(out), 1e-9)
        os.makedirs(OLD, exist_ok=True)
        base = os.path.splitext(os.path.basename(target))[0]
        i, keep = 1, os.path.join(OLD, f"{base}_old.mp3")
        while os.path.exists(keep):
            i += 1
            keep = os.path.join(OLD, f"{base}_old{i}.mp3")
        shutil.copy2(target, keep)
        print(f"kept the current file as {keep}")
    peak = float(np.abs(out).max())
    ceil = 10 ** (-1 / 20)
    if peak > ceil:
        out *= ceil / peak
    size = write_mp3(out, target)
    print(f"{name}: {src} -> {target} ({out.shape[1] / SR:.1f} s loop, {size // 1024} KB)")


def main():
    a = sys.argv[1:]
    if not a or a[0] not in ("generate", "page", "loop"):
        sys.exit(__doc__)
    if a[0] == "generate":
        takes = None
        if "--takes" in a:
            i = a.index("--takes")
            takes = int(a[i + 1])
            del a[i:i + 2]
        yes = "--yes" in a
        generate([x for x in a[1:] if x != "--yes"], takes, yes)
    elif a[0] == "page":
        page()
    else:
        loop(a[1], a[2])


if __name__ == "__main__":
    main()
