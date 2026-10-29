"""Ghost Duels sound effects from ElevenLabs: generate takes, judge them, apply a pick (with a backup).

    D:\\GhostDuels\\audio-tools\\venv\\Scripts\\python.exe tools\\elevenlabs_sfx.py generate [name ...] [--yes]
    D:\\GhostDuels\\audio-tools\\venv\\Scripts\\python.exe tools\\elevenlabs_sfx.py judge [name ...]
    D:\\GhostDuels\\audio-tools\\venv\\Scripts\\python.exe tools\\elevenlabs_sfx.py apply <name> <take>

generate  requests the missing takes of each sound in audio-src/elevenlabs/sfx.json and keeps them, with their prompt
          and settings, in audio-src/elevenlabs/takes/<name>/. Shows the credit cost first and asks (--yes skips that).
judge     measures every take against its job (attack, length, single hit, clipping, punch, phone range, highs at the
          game's highest pitch, key, riser shape), scores and ranks them, draws spectrograms and writes
          audio-src/elevenlabs/compare.html to listen to the old sound and every take side by side.
apply     copies the current file to audio-src/sfx-old/<name>_old.mp3 (then _old2, ...), finishes the take (trim, fade,
          retune, loudness of the old file, peaks at -1 dBFS) into ghost-duels-web/assets/sfx/<name>.mp3, notes it in
          the replacement log (README.md) and in applied.json, which tools/sound_design.py then leaves alone.

Needs numpy, miniaudio, lameenc and pillow: the audio-tools environment on D:, not math-sdk's. The API key is read
from the ELEVENLABS_API_KEY environment variable (on Windows also from the user variables, without a restart).
"""

import datetime
import html
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request

import lameenc
import miniaudio
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.join(ROOT, "audio-src", "elevenlabs")
SPEC = os.path.join(HERE, "sfx.json")
TAKES = os.path.join(HERE, "takes")
APPLIED = os.path.join(HERE, "applied.json")
README = os.path.join(HERE, "README.md")
COMPARE = os.path.join(HERE, "compare.html")
SFX = os.path.join(ROOT, "ghost-duels-web", "assets", "sfx")
OLD = os.path.join(ROOT, "audio-src", "sfx-old")
API = "https://api.elevenlabs.io/v1"
SR = 44100
CREDITS_PER_SECOND = 10  # measured on the first batch (about 1,230 credits for 123 s); ElevenLabs' docs say up to 40


# ---------------------------------------------------------------- spec, files, API

def spec():
    with open(SPEC, encoding="utf-8") as f:
        s = json.load(f)
    return s["defaults"], {x["name"]: x for x in s["sounds"]}


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save_json(path, data):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def api_key():
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key and os.name == "nt":
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
                key = winreg.QueryValueEx(k, "ELEVENLABS_API_KEY")[0]
        except OSError:
            pass
    if not key:
        sys.exit("ELEVENLABS_API_KEY is not set (Windows: [Environment]::SetEnvironmentVariable(\"ELEVENLABS_API_KEY\", \"...\", \"User\")).")
    return key


def request(path, body=None, query=""):
    req = urllib.request.Request(API + path + query, headers={"xi-api-key": api_key(), "Content-Type": "application/json"},
                                 data=None if body is None else json.dumps(body).encode(), method="GET" if body is None else "POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def credits_left():
    """Credits left this period, or None if the key may not read the account."""
    try:
        s = json.loads(request("/user/subscription"))
        return s["character_limit"] - s["character_count"]
    except urllib.error.HTTPError:
        return None


# ---------------------------------------------------------------- generate

def take_paths(name):
    folder = os.path.join(TAKES, name)
    meta = load_json(os.path.join(folder, "takes.json"), [])
    return folder, meta


def generate(names, yes=False):
    defaults, sounds = spec()
    todo = []
    for name in names or sounds:
        s = sounds[name]
        if "gen" not in s:
            print(f"{name:12} kept (no generation planned)")
            continue
        folder, meta = take_paths(name)
        have = len([m for m in meta if os.path.exists(os.path.join(folder, m["file"]))])
        todo += [(name, i) for i in range(have + 1, s["gen"]["takes"] + 1)]
    if not todo:
        print("Nothing to generate: every planned take exists.")
        return
    seconds = sum(sounds[n]["gen"]["duration_s"] for n, _ in todo)
    cost = round(seconds * CREDITS_PER_SECOND)
    left = credits_left()
    print(f"{len(todo)} takes, {seconds:.1f} s of audio, about {cost} credits" + (f" ({left} left)" if left is not None else ""))
    if left is not None and cost > left:
        sys.exit("Not enough credits for this batch: generate fewer sounds (name them) or lower 'takes' in sfx.json.")
    if not yes and input("Generate? [y/N] ").strip().lower() != "y":
        return
    for n, (name, i) in enumerate(todo, 1):
        s, g = sounds[name], sounds[name]["gen"]
        folder, meta = take_paths(name)
        os.makedirs(folder, exist_ok=True)
        # several directions ("prompts"): take 1 uses the first, take 2 the second, ... and round again
        prompt = g["prompts"][(i - 1) % len(g["prompts"])] if g.get("prompts") else g["prompt"]
        body = {"text": prompt, "duration_seconds": g["duration_s"], "prompt_influence": g["prompt_influence"],
                "model_id": g.get("model_id", defaults["model_id"])}
        if g.get("loop"):
            body["loop"] = True
        fmt = g.get("output_format", defaults["output_format"])
        for attempt in range(6):
            try:
                audio = request("/sound-generation", body, "?output_format=" + fmt)
                break
            except urllib.error.HTTPError as e:
                detail = e.read().decode(errors="replace")[:300]
                if e.code in (429, 500, 502, 503, 504) and attempt < 5:
                    time.sleep(2 ** attempt * 3)
                    continue
                sys.exit(f"{name} take {i}: HTTP {e.code} {detail}")
        file = f"{name}_t{i}.mp3"
        with open(os.path.join(folder, file), "wb") as f:
            f.write(audio)
        meta = [m for m in meta if m["file"] != file] + [{
            "file": file, "prompt": prompt, "duration_s": g["duration_s"], "prompt_influence": g["prompt_influence"],
            "model_id": body["model_id"], "output_format": fmt, "date": datetime.datetime.now().isoformat(timespec="seconds"), "bytes": len(audio)}]
        save_json(os.path.join(folder, "takes.json"), meta)
        print(f"[{n}/{len(todo)}] {file} ({len(audio) // 1024} KB)", flush=True)
    after = credits_left()
    if left is not None and after is not None:
        print(f"credits used: {left - after} (estimated {cost}), {after} left")


# ---------------------------------------------------------------- measuring

def decode(path):
    d = miniaudio.decode_file(path, output_format=miniaudio.SampleFormat.FLOAT32, nchannels=2, sample_rate=SR)
    return np.frombuffer(d.samples, dtype=np.float32).reshape(-1, 2).T.copy()


def db(v):
    return 20 * np.log10(max(float(v), 1e-9))


def envelope(m, win=0.005, hop=0.0025):
    w, h = int(SR * win), int(SR * hop)
    frames = 1 + max(0, (len(m) - w) // h)
    idx = np.arange(w)[None, :] + h * np.arange(frames)[:, None]
    return np.sqrt((m[idx] ** 2).mean(1) + 1e-12), hop


def chroma_key(m):
    """Correlation of the pitch content with A major and A minor (Krumhansl profiles), plus the best key overall."""
    n_fft, hop = 8192, 4096
    if len(m) < n_fft:
        m = np.pad(m, (0, n_fft - len(m)))
    f = np.fft.rfftfreq(n_fft, 1 / SR)
    ok = (f > 55) & (f < 2000)
    pc = (np.round(12 * np.log2(f[ok] / 440.0)) % 12).astype(int)
    c = np.zeros(12)
    win = np.hanning(n_fft)
    for i in range(0, len(m) - n_fft + 1, hop):
        np.add.at(c, pc, np.abs(np.fft.rfft(m[i:i + n_fft] * win))[ok])
    maj = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    mnr = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    names = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"]
    best = max(((np.corrcoef(np.roll(c, -r), p)[0, 1], names[r] + " " + k) for r in range(12) for p, k in ((maj, "major"), (mnr, "minor"))))
    return {"A major": float(np.corrcoef(c, maj)[0, 1]), "A minor": float(np.corrcoef(c, mnr)[0, 1]), "best": best[1], "best_r": float(best[0])}


def low_pitch(m, onset):
    """Strongest partial between 70 and 300 Hz while a bell rings (0.3-2.3 s after the strike), in Hz."""
    seg = m[onset + int(.3 * SR): onset + int(2.3 * SR)]
    if len(seg) < SR // 2:
        return None
    n = 1 << 17
    spec_ = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n))
    f = np.fft.rfftfreq(n, 1 / SR)
    ok = (f > 70) & (f < 300)
    return float(f[ok][np.argmax(spec_[ok])])


def measure(x, sound):
    m = x.mean(0)
    peak = float(np.abs(x).max())
    on = int(np.argmax(np.abs(m) > peak * 10 ** (-30 / 20))) if peak > 0 else 0
    tail = np.nonzero(np.abs(m) > peak * 10 ** (-40 / 20))[0]
    end = int(tail[-1]) if len(tail) else on
    env, hop = envelope(m)
    env_db = 20 * np.log10(env / env.max())
    i_on = int(on / (SR * hop))
    attack = float(np.argmax(env[i_on:i_on + int(.25 / hop)]) * hop * 1000)
    # separate hits: on a 10 ms envelope, a jump of 12 dB within 50 ms to near the loudest level; hits closer than
    # 80 ms merge (a bell's beating or a reverb tail is not a new hit)
    env10, hop10 = envelope(m, .01, .005)
    e10 = 20 * np.log10(env10 / env10.max())
    hits, last, look = 0, -1e9, int(.05 / hop10)
    for i in range(look, len(e10)):
        if e10[i] > -12 and e10[i] - e10[i - look:i].min() > 12 and (i - last) * hop10 > .08:
            hits += 1
            last = i
    hits = max(hits, 1)
    w = int(SR * .05)
    wins = np.array([np.sqrt((m[i:i + w] ** 2).mean()) for i in range(0, max(1, len(m) - w), w)])
    loud = wins[wins > wins.max() / 10]
    loud_db = db(np.sqrt((loud ** 2).mean()))
    t_loudest = float(np.argmax(wins) * .05 - on / SR)
    spec_ = np.abs(np.fft.rfft(m[:1 << 18])) ** 2
    f = np.fft.rfftfreq(min(len(m), 1 << 18), 1 / SR)
    total = spec_[(f > 40) & (f < 16000)].sum() + 1e-12
    # phone range weighted like hearing (A-weighting), so deep bass, which the ear barely weighs, does not dominate
    f2 = np.maximum(f, 1) ** 2
    aw = (12194 ** 2 * f2 ** 2 / ((f2 + 20.6 ** 2) * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2))) ** 2
    heard = spec_ * aw
    phone = float(heard[(f > 300) & (f < 5000)].sum() / (heard[(f > 40) & (f < 16000)].sum() + 1e-12))
    rmax = max(sound.get("use", {}).get("rates", [1, 1])[-1] if isinstance(sound.get("use", {}).get("rates"), list) else 1, 1)
    r = {
        "length_s": round(x.shape[1] / SR, 2), "lead_ms": round(on / SR * 1000), "attack_ms": round(attack),
        "audible_s": round((end - on) / SR, 2), "hits": hits, "clipped": int((np.abs(x) >= .999).sum()),
        "peak_db": round(db(peak), 1), "loud_db": round(loud_db, 1), "crest_db": round(db(peak) - loud_db, 1),
        "phone_share": round(phone, 2),
        "highs_at_top_rate": round(float(spec_[(f > 9000 / rmax) & (f < 16000)].sum() / total), 2), "top_rate": rmax,
        "centroid_hz": round(float((f * spec_).sum() / (spec_.sum() + 1e-12))),
        "loudest_at_s": round(t_loudest, 2), "loudest_pos": round(t_loudest / max((end - on) / SR, .01), 2),
        "ends_cut": bool(np.abs(m[-int(SR * .03):]).max() > peak * 10 ** (-30 / 20)),
    }
    j = sound.get("judge", {})
    if j.get("tonal"):
        r["key"] = {k: round(v, 2) if isinstance(v, float) else v for k, v in chroma_key(m[on:]).items()}
    if j.get("pitch_hz"):
        p = low_pitch(m, on)
        r["pitch_hz"] = round(p, 1) if p else None
        if p:  # distance to the nearest A, in semitones (an octave off is fine)
            semis = 12 * np.log2(p / j["pitch_hz"])
            r["pitch_off_semis"] = round(float(semis - 12 * round(semis / 12)), 2)
    return r


def score(r, sound):
    """Start at 100 and take points off for every way the take misses its job; notes say why."""
    j, s, notes = sound.get("judge", {}), 100, []
    impact = j.get("max_attack_ms", 99) <= 15
    if "max_attack_ms" in j and r["attack_ms"] > j["max_attack_ms"]:
        over = r["attack_ms"] / j["max_attack_ms"]
        s -= min(30, 8 + 6 * over); notes.append(f"slow attack {r['attack_ms']} ms (max {j['max_attack_ms']})")
    if r["audible_s"] > j.get("max_audible_s", 99) * 1.1:
        s -= 8; notes.append(f"long: {r['audible_s']} s audible (fits {j['max_audible_s']} s, gets faded)")
    if j.get("single_hit") and r["hits"] > 1:
        s -= 35; notes.append(f"{r['hits']} hits, one wanted")
    if r["clipped"] > 10:
        s -= 10; notes.append(f"{r['clipped']} clipped samples")
    if impact and r["crest_db"] < 9:
        s -= 10; notes.append(f"little punch (crest {r['crest_db']} dB)")
    if r["phone_share"] < .25:
        s -= 15; notes.append(f"mostly outside phone range ({int(r['phone_share'] * 100)}% in 300 Hz-5 kHz)")
    if r["highs_at_top_rate"] > .3:
        s -= 10; notes.append(f"harsh at the game's top pitch (x{r['top_rate']})")
    if j.get("rising") and r["loudest_at_s"] < .55 * j.get("max_audible_s", r["audible_s"]):
        s -= 30; notes.append(f"does not build: loudest at {r['loudest_at_s']} s")
    if j.get("peak_at_s"):
        lo, hi = j["peak_at_s"]
        if not lo <= r["loudest_at_s"] <= hi:
            s -= 10; notes.append(f"peaks at {r['loudest_at_s']} s (wanted {lo}-{hi} s)")
    if j.get("tonal") and "key" in r:
        k = r["key"]
        want = j["tonal"]
        if k[want] < .5:
            s -= 10; notes.append(f"weak {want} ({k[want]}), sounds like {k['best']}")
    if j.get("pitch_hz"):
        off = r.get("pitch_off_semis")
        if off is None:
            s -= 20; notes.append("no clear pitch")
        elif abs(off) > 1:
            s -= 25; notes.append(f"{off:+.1f} semitones from A (retune would change its character)")
    if r["lead_ms"] > 150:
        notes.append(f"{r['lead_ms']} ms silence before it (trimmed when applied)")
    return max(0, round(s)), notes


# ---------------------------------------------------------------- pictures and the comparison page

STOPS = [(0, (0, 0, 4)), (.3, (60, 15, 110)), (.6, (190, 55, 80)), (.85, (250, 150, 30)), (1, (252, 255, 164))]


def colour(v):
    v = np.clip(v, 0, 1)
    out = np.zeros(v.shape + (3,))
    for (a, ca), (b, cb) in zip(STOPS, STOPS[1:]):
        k = ((v >= a) & (v <= b))[..., None]
        t = ((v - a) / (b - a))[..., None]
        out = np.where(k, np.array(ca) + (np.array(cb) - np.array(ca)) * t, out)
    return out.astype(np.uint8)


def spectrogram(x, path, r, sound):
    """Log-frequency spectrogram (40 Hz-16 kHz, 80 dB range); green line: start, red line: the length it may have."""
    m = x.mean(0)
    n_fft, hop = 1024, 256
    frames = max(1, (len(m) - n_fft) // hop)
    win = np.hanning(n_fft)
    S = np.abs(np.array([np.fft.rfft(m[i * hop:i * hop + n_fft] * win) for i in range(frames)])).T
    f = np.fft.rfftfreq(n_fft, 1 / SR)
    rows = 140
    edges = np.geomspace(40, 16000, rows + 1)
    img = np.array([S[(f >= lo) & (f < hi)].max(0) if ((f >= lo) & (f < hi)).any() else S[np.argmin(abs(f - lo))] for lo, hi in zip(edges, edges[1:])])[::-1]
    img = 20 * np.log10(img / (img.max() + 1e-12) + 1e-12)
    width = max(120, int(len(m) / SR * 160))
    im = Image.fromarray(colour((img + 80) / 80)).resize((width, rows))
    d = ImageDraw.Draw(im)
    x0 = r["lead_ms"] / 1000 * 160
    d.line([(x0, 0), (x0, rows)], fill=(80, 255, 120))
    ma = sound.get("judge", {}).get("max_audible_s")
    if ma:
        d.line([(x0 + ma * 160, 0), (x0 + ma * 160, rows)], fill=(255, 60, 60))
    im.save(path)


def page(rows):
    """compare.html: per sound the old file and every take, with score, notes and spectrogram; 'game pitch' plays a
    take at the highest rate the game uses (preservesPitch off), like the game does."""
    css = """body{margin:0;background:#101014;color:#e8e8ee;font:14px/1.45 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:16px}
h1{font-size:22px}h2{font-size:18px;margin:28px 0 4px}.role{color:#9a9aa8;margin:0 0 10px}.t{background:#1a1a22;border:1px solid #2a2a36;border-radius:8px;padding:10px 12px;margin:8px 0}
.t.best{border-color:#5bd38a}.hd{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.sc{font-weight:700;min-width:64px}.sc.g{color:#5bd38a}.sc.m{color:#f0c050}.sc.b{color:#f06060}
audio{height:32px}button{background:#2a2a36;color:#e8e8ee;border:1px solid #3a3a48;border-radius:6px;padding:4px 10px;cursor:pointer}.n{color:#c8c8d4;margin:6px 0 0}.m{color:#8a8a98;font-size:12px}
img{display:block;max-width:100%;margin-top:8px;border-radius:4px;image-rendering:pixelated}.old{border-style:dashed}code{color:#b8b8ff}"""
    js = """function gp(b,r){const a=b.closest('.t').querySelector('audio');a.preservesPitch=false;a.playbackRate=r;a.currentTime=0;a.play();a.onended=()=>{a.playbackRate=1}}"""
    out = [f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Ghost Duels SFX takes</title><style>{css}</style><script>{js}</script></head><body><main>",
           "<h1>Ghost Duels sound effects: old vs ElevenLabs takes</h1><p class='m'>Score = the measured fit to the sound's job (attack, length, hits, punch, phone range, highs at game pitch, key, riser shape). Listen before picking: the score cannot hear. Green line in a spectrogram: start; red line: the length the game gives it.</p>"]
    for name, sound, old, takes in rows:
        out.append(f"<h2>{name}</h2><p class='role'>{sound['role']}</p>")
        rate = sound.get("use", {}).get("rates", [1, 1])
        top = rate[-1] if isinstance(rate, list) else 1
        btn = lambda: f"<button onclick='gp(this,{top})'>game pitch ×{top}</button>" if top != 1 else ""
        if old:
            src, r = old
            out.append(f"<div class='t old'><div class='hd'><span class='sc'>current</span><audio controls preload='none' src='{src}'></audio>{btn()}</div>"
                       f"<div class='m'>attack {r['attack_ms']} ms · audible {r['audible_s']} s · loud {r['loud_db']} dB · crest {r['crest_db']} dB</div><img src='{src_img(name, 'current')}' alt=''></div>")
        best = max((t[2] for t in takes), default=None)
        for file, r, sc, notes, prompt in takes:
            cls = "g" if sc >= 80 else "m" if sc >= 60 else "b"
            out.append(f"<div class='t{' best' if sc == best else ''}'><div class='hd'><span class='sc {cls}'>{sc}</span><code>{file}</code><audio controls preload='none' src='takes/{name}/{file}'></audio>{btn()}</div>"
                       f"<p class='n'>{'; '.join(notes) or 'fits its job'}</p><div class='m'>{html.escape(prompt)}</div><div class='m'>attack {r['attack_ms']} ms · audible {r['audible_s']} s · hits {r['hits']} · loud {r['loud_db']} dB · crest {r['crest_db']} dB · phone {int(r['phone_share'] * 100)}%"
                       + (f" · key: {r['key']['best']}" if 'key' in r else "") + (f" · pitch {r.get('pitch_hz')} Hz ({r.get('pitch_off_semis')} st from A)" if 'pitch_hz' in r else "")
                       + f"</div><img src='takes/{name}/{file[:-4]}.png' alt=''></div>")
    out.append("</main></body></html>")
    with open(COMPARE, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(out))


def src_img(name, which):
    return f"takes/{name}/{name}_{which}.png"


def current_file(name):
    """The sound the game uses before any ElevenLabs take: the backup if one was applied, else assets/sfx."""
    applied = load_json(APPLIED, {})
    if name in applied:
        return os.path.join(OLD, applied[name]["backup"])
    return os.path.join(SFX, name + ".mp3")


def judge(names):
    _, sounds = spec()
    rows = []
    for name in names or sounds:
        s = sounds[name]
        if "gen" not in s:
            continue
        folder, meta = take_paths(name)
        takes = []
        for m in meta:
            p = os.path.join(folder, m["file"])
            if not os.path.exists(p):
                continue
            x = decode(p)
            r = measure(x, s)
            sc, notes = score(r, s)
            spectrogram(x, p[:-4] + ".png", r, s)
            takes.append((m["file"], r, sc, notes, m["prompt"]))
            m["judge"] = {"score": sc, "notes": notes, **r}
        save_json(os.path.join(folder, "takes.json"), meta)
        old = None
        cur = current_file(name)
        if os.path.exists(cur):
            os.makedirs(folder, exist_ok=True)
            x = decode(cur)
            r = measure(x, s)
            spectrogram(x, os.path.join(folder, f"{name}_current.png"), r, s)
            old = (os.path.relpath(cur, HERE).replace("\\", "/"), r)
        takes.sort(key=lambda t: -t[2])
        rows.append((name, s, old, takes))
        if takes:
            print(f"{name:12} " + "  ".join(f"{t[0][len(name) + 1:-4]}:{t[2]}" for t in takes)
                  + f"   best {takes[0][0]}: {'; '.join(takes[0][3]) or 'fits its job'}")
    page(rows)
    print("comparison page:", COMPARE)


# ---------------------------------------------------------------- apply

def resample(x, rate):
    """Plays x at `rate` (pitch and speed together, like playbackRate)."""
    n = int(x.shape[1] / rate)
    t = np.arange(n) * rate
    return np.stack([np.interp(t, np.arange(x.shape[1]), c) for c in x])


def close_gaps(x, min_gap):
    """Removes silences (40 dB below the peak) longer than min_gap seconds inside the sound, keeping 20 ms of each."""
    m = x.mean(0)
    env, hop = envelope(m, .01, .005)
    quiet = env < env.max() * 10 ** (-40 / 20)
    loud = np.nonzero(~quiet)[0]
    cuts, i = [], loud[0]
    while i < loud[-1]:
        if quiet[i]:
            j = i
            while j < loud[-1] and quiet[j]:
                j += 1
            if (j - i) * hop > min_gap:
                cuts.append((int((i * hop + .02) * SR), int((j * hop - .02) * SR)))
            i = j
        i += 1
    keep, last, fade = [], 0, int(SR * .01)
    for a, b in cuts:
        seg = x[:, last:a].copy()
        seg[:, -fade:] *= np.linspace(1, 0, fade)
        keep.append(seg)
        last = b
    seg = x[:, last:].copy()
    if cuts:
        seg[:, :fade] *= np.linspace(0, 1, fade)
    return np.concatenate(keep + [seg], axis=1)


def high_shelf(x, hz, gain_db):
    """Turns everything above hz down by gain_db, with a one-octave slope, so a sound stays smooth when the game
    plays it higher."""
    n = x.shape[1]
    f = np.fft.rfftfreq(n, 1 / SR)
    k = np.clip((np.log2(np.maximum(f, 1) / hz) + .5), 0, 1)  # 0 half an octave below hz, 1 half an octave above
    g = 10 ** (gain_db * k / 20)
    return np.stack([np.fft.irfft(np.fft.rfft(c) * g, n) for c in x])


def finish(x, sound, old_loud):
    j = sound.get("judge", {})
    opt = sound.get("finish", {})
    if opt.get("close_gaps_s"):
        x = close_gaps(x, opt["close_gaps_s"])
    if opt.get("high_shelf"):
        x = high_shelf(x, *opt["high_shelf"])
    r = measure(x, sound)
    if j.get("pitch_hz") and r.get("pitch_off_semis") is not None:
        x = resample(x, 2 ** (-r["pitch_off_semis"] / 12))
        r = measure(x, sound)
    start = max(0, int((r["lead_ms"] - 3) / 1000 * SR))  # keep 3 ms before the first sound
    keep = j.get("max_audible_s", r["audible_s"]) + .12
    x = x[:, start:start + int(min(r["audible_s"] + .1, keep) * SR)]
    fade = min(int(SR * .15), x.shape[1] // 6)
    x[:, -fade:] *= np.linspace(1, 0, fade) ** 2
    x[:, :int(SR * .002)] *= np.linspace(0, 1, int(SR * .002))
    # the old file's loudness (the game's volumes were tuned to it); peaks stay at -1 dBFS, a soft knee takes the rest
    gain = 10 ** ((old_loud - measure(x, sound)["loud_db"]) / 20)
    x = x * gain
    ceil = 10 ** (-1 / 20)
    over = np.abs(x) > ceil * .8
    if over.any():
        knee = ceil * .8
        x = np.where(over, np.sign(x) * (knee + (ceil - knee) * np.tanh((np.abs(x) - knee) / (ceil - knee))), x)
    return np.clip(x, -ceil, ceil)


def write_mp3(x, path):
    pcm = (x.T * 32767).astype("<i2").tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(160); enc.set_in_sample_rate(SR); enc.set_channels(2); enc.set_quality(2)
    data = enc.encode(pcm) + enc.flush()
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


def apply(name, take, why_text=""):
    _, sounds = spec()
    s = sounds[name]
    folder, meta = take_paths(name)
    file = take if take.endswith(".mp3") else f"{name}_{take if take.startswith('t') else 't' + take}.mp3"
    m = next((m for m in meta if m["file"] == file), None)
    if not m:
        sys.exit(f"no take {file} in {folder}")
    target = os.path.join(SFX, name + ".mp3")
    old_x = decode(target)
    old_loud = measure(old_x, s)["loud_db"]
    os.makedirs(OLD, exist_ok=True)
    k, backup = 1, f"{name}_old.mp3"
    while os.path.exists(os.path.join(OLD, backup)):
        k += 1
        backup = f"{name}_old{k}.mp3"
    shutil.copy2(target, os.path.join(OLD, backup))
    x = finish(decode(os.path.join(folder, file)), s, old_loud)
    size = write_mp3(x, target)
    r = measure(decode(target), s)
    applied = load_json(APPLIED, {})
    version = applied.get(name, {}).get("version", 1) + 1
    first_backup = applied.get(name, {}).get("backup", backup)
    applied[name] = {"take": file, "version": version, "backup": first_backup, "date": datetime.date.today().isoformat()}
    save_json(APPLIED, applied)
    why = m.get("judge", {})
    row = (f"| `{name}` | v{version} | `{file}` ({r['audible_s']} s): \"{m['prompt'][:90]}…\" | {why_text + ' ' if why_text else ''}(score {why.get('score', '?')}"
           f"{': ' + '; '.join(why.get('notes', [])) if why.get('notes') else ', fits its job'}) | `audio-src/sfx-old/{backup}` |")
    # the new row goes at the end of the replacement log table
    with open(README, encoding="utf-8") as f:
        lines = [ln for ln in f.read().split("\n") if not ln.startswith("| (nothing replaced yet)")]
    k = lines.index("## Replacement log")
    while not lines[k].startswith("| ---"):
        k += 1
    k += 1
    while k < len(lines) and lines[k].startswith("|"):
        k += 1
    lines.insert(k, row)
    with open(README, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print(f"{name}: {file} -> assets/sfx/{name}.mp3 ({size // 1024} KB, loud {r['loud_db']} dB, old {old_loud} dB); backup audio-src/sfx-old/{backup}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args or args[0] not in ("generate", "judge", "apply"):
        sys.exit(__doc__)
    if args[0] == "generate":
        generate(args[1:], yes="--yes" in sys.argv)
    elif args[0] == "judge":
        judge(args[1:])
    else:
        if len(args) != 3:
            sys.exit("apply <name> <take> [--why=\"reason for the log\"], e.g. apply spin t2")
        apply(args[1], args[2], next((a[6:] for a in sys.argv if a.startswith("--why=")), ""))
