# Ghost Duels sound effects from ElevenLabs

Plan, rules and replacement log for swapping the game's sound effects (`ghost-duels-web/assets/sfx/*.mp3`) for sounds generated with ElevenLabs. The request for every sound (prompt, length, prompt influence, number of takes) and the bar it has to clear are in [`sfx.json`](sfx.json).

## Goal

Every sound should add excitement: it hits instantly and lands hard, and wins feel rewarding. Each one still has to fit its job in the game. A reel stop that plays 7 times per spin has to be short and dry, and a big win can be huge. Losses (a life lost, runes crumbling) stay short and dramatic, never sad.

Musical frame:
- The game's scale is A Phrygian and the music ("Spooky Carousel") is in A minor at about 96 BPM, so tension sounds are in **A minor**.
- Wins resolve to **A major**.
- Palette: haunted bells, ghost choir, pipe organ, bone and wood, chains, thunder, green spectral magic.

## Sound direction v4 (2026-11-11)

The music moved to a polished cinematic adventure score on 2026-11-10 (`music.json` v4/v5: celesta and harp hook, cello and bass clarinet, taiko and frame drums, brass, A minor at 100 BPM), and the v3 effects (hand-made, playful-spooky: wood, bone, accordion, music box) no longer sat in its world. v4 moves the effects into the music's orchestra. `fs_land` (v4), `connect` and `trove` were already made in it; `crystal` and `toll` stay (exact pitch). The other 20 sounds get new prompts in `sfx.json` (two directions each, four takes; `v4_first_take` marks the first v4 take of a sound, older takes stay for comparison).

Shared rules (every prompt carries them):
- **Instruments:** celesta, harp, glockenspiel, plucked and tremolo strings, warm French horns and brass, taiko and timpani, a soft wordless choir, glassy spectral shimmer. No synths, no electronic or arcade sounds.
- **Feel:** polished and premium, cinematic, never horror. The duel sounds keep the fighting-game punch the game asked for in October (impacts, sword rings, K.O.), made of orchestral drums, brass and steel.
- **Room, key, limits:** as v3: one torch-lit stone crypt with a short dark reverb (about 1 s), musical parts on A (A minor, wins in A major), no sub rumble, no piercing highs, soft attacks on the frequent sounds.

## Sound direction v3 (2026-11-08)

Some sounds did not fit together: they came from different "rooms" (reverbs), sat in different keys, and some were much brighter or louder than their neighbours. Version 3 gives every sound and the music one shared direction. It replaces the palette above; the timings and the judge's limits stay as they were. All prompts in `sfx.json` are rewritten in it. `crystal` and `toll` stay, because they need an exact pitch.

### Shared rules (every prompt carries them; the tool sends prompts as written)

A playful-spooky pirate ghost slot game in a torch-lit stone crypt. Hand-made and organic, warm:
- **Materials:** old wood, bone, iron chains, brass, glass and crystal, soft pipe organ, a distant ghost choir, green spectral shimmer.
- **Tone:** cartoon-gothic, never horror. Eerie but friendly, no screams, no gore, no harsh noise.
- **Room:** every sound sits in the same small stone crypt, with a short dark reverb of about 1 second, dry enough to stay clear.
- **Key:** musical parts are tuned to A (A minor; wins resolve to A major).
- **Sound limits:** no sub-bass rumble, no piercing highs above about 10 kHz, and soft attacks on anything that plays often.
- **Takes:** single clean takes, with no background music and no voices with words.

Frequent sounds (click, spin, land, crystal) are short, warm and quiet. Only the rare ones (big win, the devil, the free-spins sting) get to be big.

### Music (for a music generator; not made by tools/elevenlabs_sfx.py)

Base game, replacing `ghost-duels-web/assets/spooky-carousel.mp3`:

```
Loopable background music for a cozy-spooky pirate ghost slot game, 90 seconds, A minor, 96 BPM, 3/4 waltz
feel like a haunted carnival carousel aboard a ghost ship. Lead: music box and celesta playing a simple,
memorable minor melody; under it pizzicato strings, a soft accordion or concertina, warm tuba or bass clarinet
on the downbeats, light brushed hand drum. Now and then a wordless ghost choir "ooh" and a soft pipe organ
chord, creaking ship wood and faint wind as texture. Mysterious and charming, never scary or tense, no big
build-ups, no drops, constant medium-low energy so it can play for an hour without tiring. Leaves room in the
upper mids for game chimes. Seamless loop: the end flows back into the beginning. Instrumental only.
```

Free spins (Ghost Crates), the same piece more excited:

```
Same piece, same key and tempo, but more excited: a lively 6/8 sea-shanty feel, faster music-box runs, the
accordion and pizzicato driving, the ghost choir more present, a low tom pulse. Treasure-hunt anticipation,
still friendly. 60-second seamless loop, instrumental.
```

### Mixing

- **Loudness:** one target for all effects, peaks at −1 dBFS (as `apply` already finishes them).
- **Music level:** the music sits about 12 dB under the effects and keeps ducking under the big moments, as the game does today.
- **Balance:** frequent sounds stay well below the rare ones.

## What gets replaced

| File | Job in the game | Plan |
| --- | --- | --- |
| `click` | Button press | Generate 2 takes |
| `spin` | Spin pressed, the old board falls out | Generate 3 takes |
| `land` | A reel stops (7 per spin, pitched up per reel) | Generate 3 takes |
| `land_heavy` | VS reel or crate slams down | Generate 3 takes |
| `chime` | Note source for every win arpeggio, played as A5 and transposed | **Keep** (needs an exact single pitch) |
| `crystal` | Note source for runes, played as A5 and transposed | **Keep** (same reason) |
| `tumble` | Winning symbols vanish | Generate 2 takes |
| `charge` | Small VS charges before it bursts | Generate 2 takes |
| `burst` | VS reel bursts open; also the duel slam (rate 1.15) | Generate 3 takes |
| `clash` | Duel fighters collide | Generate 3 takes |
| `wail` | A fighter is knocked out | Generate 2 takes |
| `toll` | Deep bell; also an octave up under character wins and crates | Generate 2 takes, retune to exactly A2 |
| `sting` | Pirate wins a duel | Generate 3 takes |
| `sting_devil` | Devil wins; devil challenger (rate 0.92); layer on the max win | Generate 3 takes |
| `fanfare` | Free spins triggered | Generate 3 takes |
| `bigwin` | Big win (20× bet or more) | Generate 3 takes |
| `heartbeat` | Bonus: a life is lost | Generate 2 takes |
| `crumble` | Bonus end: runes crumble | Generate 2 takes |
| `challenger` | Pirate challenger enters | Generate 2 takes |
| `banner` | Banner appears | Generate 3 takes |
| `fs_land` | FS symbol lands (loudest; up to an octave higher per FS) | Generate 3 takes |
| `edge` | Tease under a reel when one FS is missing (2.4 s, pitched up per reel) | Generate 3 takes |

The first batch was 52 generations and about 123 s of audio. It was planned at about 4,900 credits (ElevenLabs' docs say 40 credits per second when the length is set) but cost about 1,230, roughly 10 per second.

## Running it

The tool is [`tools/elevenlabs_sfx.py`](../../tools/elevenlabs_sfx.py). It runs in its own Python environment on D: (numpy, miniaudio, lameenc, pillow), separate from math-sdk's. The API key comes from the Windows user variable `ELEVENLABS_API_KEY`.

```powershell
$py = "D:\GhostDuels\audio-tools\venv\Scripts\python.exe"
& $py tools\elevenlabs_sfx.py generate [name ...]   # missing takes; shows the credit cost and asks first
& $py tools\elevenlabs_sfx.py judge [name ...]      # scores, spectrograms, compare.html
& $py tools\elevenlabs_sfx.py apply spin t2         # backup, finish, replace, log
```

To get more takes of a sound, raise its `takes` in `sfx.json` (or change its prompt) and run `generate` with its name.

## How a take is judged

The game's code sets hard limits, and the judge checks each take against them and against the old file:

1. **Attack:** the time from the first sound to the peak. Clicks and reel stops need a few milliseconds, impacts about 15 ms. A slow fade-in is rejected.
2. **Length:** the audible length has to fit the slot the game gives it (`max_audible_s`). A reel stop at more than 0.3 s smears in turbo.
3. **Single hit** (reel stop, toll): exactly one strike, no double hits.
4. **Clipping:** no samples at full scale in the raw take.
5. **Punch:** the peak-to-loudness ratio (crest factor). Impacts need a clear transient.
6. **Phone check:** enough energy between 300 Hz and 5 kHz. Phone speakers drop deep bass, so an impact that is only a low boom disappears on a phone.
7. **Pitched sounds and the game's pitch shifts:** the sound is rendered at the highest rate the game uses (e.g. `fs_land` an octave up, `land` +24%) and checked for harsh highs. `toll` has to be within 1 semitone of A2 before retuning.
8. **Key:** for sounds marked `tonal`, how well the pitch content matches A major or A minor.
9. **Shape:** risers (`charge`, `edge`) have to get louder towards the end, and `edge` has to peak around 2.4 s.
10. **A spectrogram picture** of every take, which Claude looks at for artifacts such as metallic warbling, noise bursts or cut-off tails.

Claude can't listen. These checks catch takes that are measurably wrong and rank the rest. **You pick by ear** on a local comparison page that plays the old sound and every take side by side, also at the pitch the game uses. Then the pick is tested in the running game, where duels, bonus and big wins can be forced through `force/...` links.

## Finishing a picked take

1. Cut the leading silence.
2. Fade the tail to the allowed length.
3. Retune `toll` to A2.
4. Match the loudness to the old file. The game's volume per sound was tuned to the old levels, so this keeps the mix balanced.
5. Keep peaks at −1 dBFS.
6. Save as MP3, 44.1 kHz, 160 kbps, under the old file name.

## Backups and rollback

Before a file in `assets/sfx/` is overwritten, the current one is copied to `audio-src/sfx-old/<name>_old.mp3`. If a sound is replaced a second time, the earlier backup becomes `<name>_old2.mp3` and so on. The backups stay outside `ghost-duels-web/`, because everything in that folder is uploaded to Stake.

To roll back, copy `audio-src/sfx-old/<name>_old.mp3` back to `ghost-duels-web/assets/sfx/<name>.mp3`. Git history has every version too.

`tools/sound_design.py` rebuilds the designed sounds and would overwrite replaced files. Before the first replacement it gets a skip list, so it leaves ElevenLabs picks alone.

Takes and the comparison page live in `audio-src/elevenlabs/takes/` and `compare.html` while you choose. Both are git-ignored and can be deleted once the picks are applied. What stays in the repo:
- the sound the game uses, in `assets/sfx/`
- the original, in `audio-src/sfx-old/`
- the prompt, settings, model, date and score of every used take, in [`applied.json`](applied.json)

ElevenLabs gives a different result every time, so a deleted take can't be made again exactly.

## Replacement log

**v4 (2026-11-11):** 20 sounds from the sound-direction-v4 prompts (cinematic orchestral), 96 takes in two rounds, about 1,300 credits. Picks were made among the v4 takes only (older takes stay in `takes/` and still score high in `compare.html`).
- **Second round** for `land` (every first-round take was nearly silent, peaks around −35 dB), `charge` (none built up to its end), `edge` (peaked too early or had no phone range) and `bigwin` (slow attacks, clipping).
- **Known compromises:** `burst` attacks in 45 ms (the judge wants 15); `sting` reads as C major (the relative major of the music's A minor, so it sits fine over it); `land` is a quiet take raised to the old loudness and capped at 0.26 s (`finish.max_s`), because it rang for half a second.
- **Best score over all takes (asked for the same day):** `fanfare` → `fanfare_t16` (100), `bigwin` → `bigwin_t5` (100) and `edge` → `edge_t4` (85) replaced the v4 picks; these three are takes from earlier directions. `edge_t4` has almost nothing in the phone range (300 Hz–5 kHz), so it may be faint on phone speakers; `edge_t6` (80) was the v4 alternative.
- **Sharper `connect` and `fs_land` (same day):** six new takes each with harder attacks. `fs_land_t7` (5 ms attack, crest 22 dB, the punchiest) and `connect_t7` (0 ms attack, 0.32 s). No `connect` take had a clear note, so the game now layers the chime (exact A5) under each pop, a scale step higher per cell: the connection climbs a melody while the pop itself only rises a little.
- **`tumble` as a burst (same day):** the winning symbols now burst when they vanish instead of a soft poof: `tumble_t6` (green spirit-fire explosion, 2 ms attack), played at volume .55 instead of .4.
- **Kept:** `trove` (made in the v4 direction on 2026-11-11), `crystal` and `toll` (exact pitch).
- **Rollback:** every replaced file is in `audio-src/sfx-old/` (the newest `<name>_old*.mp3` is the v3 sound; `land_old5.mp3` is the uncapped first v4 apply).

**v3 (2026-11-08):** 19 sounds from the sound-direction-v3 prompts, 120 takes in two rounds, about 2,000 credits.
- **Kept:** `sting` (no take came out clearly in A major; an off-key sting is what v3 is meant to remove), `toll` (the designed bell, exactly A2) and `crystal`.
- **Licence:** these takes were generated on the **ElevenLabs free plan**. The free plan is generally for non-commercial use; check the licence before release, and generate again on a paid plan if needed.
- **Music:** the Music API needs a paid plan, so `music.json` is not generated yet.

| File | Version | Replaced with | Why this take | Backup |
| --- | --- | --- | --- | --- |
| `click` | v2 | `click_t1.mp3` (0.11 s): "Short crisp UI click for a slot game button: a dry wooden tap with a tiny bone rattle and …" | Crisp tap plus a bright tick, more defined than the soft synth click. (score 100, fits its job) | `audio-src/sfx-old/click_old.mp3` |
| `spin` | v2 | `spin_t4.mp3` (0.45 s): "One-shot slot machine spin: a sharp punchy thud hits instantly at the very first moment, t…" | Instant hard hit with a bone rattle instead of a soft whoosh; shorter, so it never drags on repeat. (score 85: slow attack 18 ms (max 15)) | `audio-src/sfx-old/spin_old.mp3` |
| `land` | v2 | `land_t1.mp3` (0.35 s): "One-shot slot reel stop: a single hard, punchy coffin-lid knock with a crisp bone snap and…" | Sharp single knock with more mid-range than the old low thud, so reel stops read on phone speakers. (score 92: long: 0.48 s audible (fits 0.3 s, gets faded)) | `audio-src/sfx-old/land_old.mp3` |
| `land_heavy` | v2 | `land_heavy_t4.mp3` (0.69 s): "Instant heavy impact: a stone tomb slab slams down hard, a deep boom and cracking stone at…" | Tight heavy boom that hits at once; the old slab had a softer, chain-led start. (score 90: little punch (crest 6.4 dB)) | `audio-src/sfx-old/land_heavy_old.mp3` |
| `clash` | v2 | `clash_t1.mp3` (0.66 s): "One-shot ghost duel clash: two blades collide with a huge metallic impact, a shockwave boo…" | Clean metal impact with ringing, more weight than the synth clash. (score 82: long: 1.2 s audible (fits 1.0 s, gets faded); 50 clipped samples) | `audio-src/sfx-old/clash_old.mp3` |
| `wail` | v2 | `wail_t2.mp3` (2.02 s): "One-shot knockout: a heavy punchy hit, then a ghost's long descending wail fading away as …" | Punchy hit first, then a long descending ghost wail; a clear knockout moment. (score 100, fits its job) | `audio-src/sfx-old/wail_old.mp3` |
| `crumble` | v2 | `crumble_t1.mp3` (0.84 s): "Old stone runes crumbling to dust: a short dry grinding crumble with falling grit and a so…" | Natural dry stone crumble, short and understated for a small loss. (score 100, fits its job) | `audio-src/sfx-old/crumble_old.mp3` |
| `banner` | v2 | `banner_t1.mp3` (1.15 s): "Banner reveal: a fast rising spectral whoosh into a bright haunted bell hit with a sparkle…" | Fast rising whoosh into a bright bell; announces with more snap. (score 90: 193 clipped samples) | `audio-src/sfx-old/banner_old.mp3` |
| `bigwin` | v2 | `bigwin_t3.mp3` (4.7 s): "BIG WIN slot jackpot stinger: an explosive braam with a huge haunted bell and gong blast, …" | Eventful jackpot stinger with impacts, bells, coins and a final sweep: bigger than the old organ swell. (score 80: 389 clipped samples; weak A major (-0.03), sounds like E minor) | `audio-src/sfx-old/bigwin_old.mp3` |
| `sting_devil` | v2 | `sting_devil_t6.mp3` (3.25 s): "Starts with an instant massive demonic hit: a brass and choir braam slams at the very firs…" | Massive demonic hit that lands at once and rings long; also lifts the max win and the devil's entrance. (score 100, fits its job) | `audio-src/sfx-old/sting_devil_old.mp3` |
| `challenger` | v2 | `challenger_t3.mp3` (1.93 s): "Ghost pirate challenger entrance that starts instantly with a cannon boom, then a deep shi…" | Cannon boom first, then horn, chains and organ: an entrance that grabs attention. (score 90: 25 clipped samples) | `audio-src/sfx-old/challenger_old.mp3` |
| `bigwin` | v3 | `bigwin_t4.mp3` (4.13 s): "BIG WIN money payout: starts instantly with a loud cash register cha-ching, then a huge ca…" | Money payout instead of an orchestral stinger: a cash register cha-ching and a dense cascade of coin clinks into the tray, with a ringing bell, settling over 4 s. (score 90: 123 clipped samples) | v2 not kept; the original is `audio-src/sfx-old/bigwin_old.mp3` |
| `charge` | v2 | `charge_t6.mp3` (0.93 s): "Fast energy charge-up riser: a reversed sparkle shimmer and a crackling electric hum swell…" | A real build-up at last: a rising energy sweep that grows louder and cuts off at its peak, handing straight over to the burst. (score 100, fits its job) | `audio-src/sfx-old/charge_old.mp3` |
| `burst` | v2 | `burst_t2.mp3` (1.29 s): "Instant explosion: a massive punchy boom and a crack of green lightning, flying debris and…" | Full-bodied boom with a lightning crack that hits at once; the old blast swelled in. (score 90: 16 clipped samples) | `audio-src/sfx-old/burst_old.mp3` |
| `sting` | v2 | `sting_t3.mp3` (2.06 s): "Win stinger for a slot game: an instant bright chime hit, a fast ascending bell arpeggio a…" | Instant bell hit and a fast arpeggio into a chord: snappier than the old choir swell (minor, like the old one). (score 90: weak A major (-0.21), sounds like F minor) | `audio-src/sfx-old/sting_old.mp3` |
| `fanfare` | v2 | `fanfare_t6.mp3` (3.84 s): "Epic bonus reveal: an instant cinematic braam hit, a magical sparkle explosion and a fast …" | Big explosion straight into a bright bell arpeggio; the half-second gap between them is cut out (finish: close_gaps_s). (score 65: slow attack 72 ms (max 25); 156 clipped samples) | `audio-src/sfx-old/fanfare_old.mp3` |
| `fs_land` | v2 | `fs_land_t3.mp3` (0.95 s): "Bonus symbol landing: an instant punchy hit with a golden coin ring and a crystal sparkle,…" | Punchy hit with a golden coin ring; highs softened by 6 dB above 7 kHz so it stays smooth when the game raises it up to an octave (finish: high_shelf). (score 80: 14 clipped samples; harsh at the game's top pitch (x2)) | `audio-src/sfx-old/fs_land_old.mp3` |
| `fs_land` | v1 again | Reverted on 2026-10-30: the magical scatter sample (`audio-src/sfx-old/fs_land_old.mp3`) is back in the game, by request; removed from `applied.json`, so `tools/sound_design.py` builds it again | |
| `edge` | v2 | `edge_t5.mp3` (2.56 s): "Suspense riser for a slot game: quiet at first and growing louder and higher for two and a…" | Builds steadily and peaks at 2.4 s, then stops, exactly as the tease needs; the old one was a designed drone. (score 100: 865 ms silence before it (trimmed when applied)) | `audio-src/sfx-old/edge_old.mp3` |
| `charge` | v3 | `charge_t2.mp3` (0.5 s): "Fighting game VS build-up: a reversed ghostly whoosh pulled in from both sides, a tighteni…" | VS wind-up: rises steadily for 0.4 s and cuts off at its peak, right as the burst hits (the judge's 'does not build' counts the silent rest of the 1 s file). (score 60: 38 clipped samples; does not build: loudest at 0.4 s) | `audio-src/sfx-old/charge_old2.mp3` |
| `burst` | v3 | `burst_t6.mp3` (0.84 s): "Two ghosts collide head-on: an instant thunderous boom and a bright metallic shing, a burs…" | VS reveal like a fighting game's versus screen: an instant boom with a bright metallic shing, crackling energy and a short spectral howl. (score 100, fits its job) | `audio-src/sfx-old/burst_old2.mp3` |
| `fs_land` | v2 | `fs_land_t4.mp3` (1.15 s): "Slot scatter symbol lands: an instant soft thump with one clear magical bell note, celesta…" | Scatter as a clear bell note on E (the fifth of A minor) over a soft thump with a sparkle; the game steps it up a whole tone per scatter, so it climbs like a scale. (score 90: 45 clipped samples) | `audio-src/sfx-old/fs_land_old.mp3` (the magical scatter sample) |
| `fanfare` | v3 | `fanfare_t5.mp3` (2.74 s): "Casino victory jingle: an instant shiny bell glissando rising into a triumphant trumpet fa…" | Happy instead of menacing (the old take opened with a dark cinematic braam): bright bells into a trumpet fanfare and a warm C major chord (relative major of the game's A minor), coins and sparkles, no low drone. (score 63: slow attack 38 ms (max 25); 185 clipped samples; weak A major (-0.11), sounds like E minor) | `audio-src/sfx-old/fanfare_old2.mp3` |
| `charge` | v4 | `charge_t5.mp3` (0.49 s): "Ghostly charge-up: a reversed ghost choir and a reversed haunted bell swelling from silenc…" | (score 70: does not build: loudest at 0.41 s; 485 ms silence before it (trimmed when applied)) | `audio-src/sfx-old/charge_old3.mp3` (David's VS sound) |
| `burst` | v4 | `burst_t6.mp3` (0.99 s): "Instant dark magic burst: a deep thunder boom, a shattering tombstone and a gust of howlin…" | (score 70: slow attack 80 ms (max 15)) | `audio-src/sfx-old/burst_old3.mp3` (David's VS sound) |
| `bigwin` | v4 | `bigwin_t5.mp3` (2.99 s): "Spooky jackpot: an instant thunder crack and a big pipe organ fanfare in A major, haunted …" | (score 100, fits its job) | `audio-src/sfx-old/bigwin_old2.mp3` |
| `chime` | v2 | `chime_t2.mp3` (1.54 s): "One single note on an old cursed music box: a pure ringing bell tone with a faint ghostly …" | (score 75: +8.9 semitones from A (retune would change its character)) | `audio-src/sfx-old/chime_old.mp3` |
| `fanfare` | v4 | `fanfare_t6.mp3` (4.39 s): "Monster party sting: an instant thunder clap and a mischievous minor-key organ riff, a bon…" | (score 100, fits its job) | `audio-src/sfx-old/fanfare_old3.mp3` |
| `fanfare` | v5 | `fanfare_t12.mp3` (4.28 s): "Gothic horror win: an instant thunder boom, a sinister harpsichord and pipe organ riff in …" | (score ?, fits its job) | `audio-src/sfx-old/fanfare_old4.mp3` |
| `fanfare` | v6 | `fanfare_t16.mp3` (2.0 s): "Spooky ghost sting: an instant deep thunder crack, a chilling ghost wail sweeping overhead…" | (score ?, fits its job) | `audio-src/sfx-old/fanfare_old5.mp3` |
| `spin` | v3 | `spin_t2.mp3` (0.93 s): "Spin start in a haunted pirate crypt: an instant muffled thump of a wooden crate, a short …" | (score 100, fits its job) | `audio-src/sfx-old/spin_old2.mp3` |
| `land` | v3 | `land_t1.mp3` (0.28 s): "One reel stop in a pirate ghost slot game: a single soft but clear knock of a wooden chest…" | (score 100, fits its job) | `audio-src/sfx-old/land_old2.mp3` |
| `land_heavy` | v3 | `land_heavy_t1.mp3` (0.48 s): "A heavy iron-bound treasure chest dropping onto crypt stone: an instant deep wooden thud w…" | (score 100, fits its job) | `audio-src/sfx-old/land_heavy_old2.mp3` |
| `chime` | v3 | `chime_t2.mp3` (0.98 s): "One single note on an old music box, pitch A5: a pure, warm ringing tone with a faint airy…" | (score 100, fits its job) | `audio-src/sfx-old/chime_old2.mp3` |
| `tumble` | v2 | `tumble_t1.mp3` (0.6 s): "Winning symbols dissolving into green ghost dust: an instant soft pop, a sandy sparkling w…" | (score 100, fits its job) | `audio-src/sfx-old/tumble_old.mp3` |
| `charge` | v5 | `charge_t3.mp3` (0.96 s): "Green spectral energy charging up: a soft hum and a whispering ghost choir rising in pitch…" | (score 100, fits its job) | `audio-src/sfx-old/charge_old4.mp3` |
| `burst` | v5 | `burst_t3.mp3` (0.59 s): "Instant dark-magic pop: a deep round thump, old glass shattering into sparkles and a brief…" | (score 100, fits its job) | `audio-src/sfx-old/burst_old4.mp3` |
| `clash` | v3 | `clash_t2.mp3` (0.58 s): "Duel impact: an instant clang of iron on iron with a deep wooden thud underneath and a sho…" | (score 100, fits its job) | `audio-src/sfx-old/clash_old2.mp3` |
| `sting_devil` | v3 | `sting_devil_t2.mp3` (4.33 s): "Devilish jackpot sting: an instant warm brass-and-choir hit in A minor, a deep organ pedal…" | (score 100, fits its job) | `audio-src/sfx-old/sting_devil_old2.mp3` |
| `bigwin` | v5 | `bigwin_t6.mp3` (3.2 s): "Spooky jackpot in A major: an instant bright bell and brass hit, a celesta and pizzicato r…" | (score 100, fits its job) | `audio-src/sfx-old/bigwin_old3.mp3` |
| `crumble` | v3 | `crumble_t1.mp3` (0.88 s): "Old rune stones crumbling to dust: a short dry grinding crumble with falling grit and a so…" | (score 92: long: 1.0 s audible (fits 0.9 s, gets faded)) | `audio-src/sfx-old/crumble_old2.mp3` |
| `challenger` | v3 | `challenger_t1.mp3` (2.69 s): "The skeleton pirate captain challenges: an instant warm cannon boom, a creaking ship and r…" | (score 100, fits its job) | `audio-src/sfx-old/challenger_old2.mp3` |
| `banner` | v3 | `banner_t2.mp3` (1.55 s): "A rolled parchment banner unfurling with a soft whoosh, ending on a warm music-box and bel…" | (score 100, fits its job) | `audio-src/sfx-old/banner_old2.mp3` |
| `fs_land` | v3 | `fs_land_t1.mp3` (0.93 s): "Bonus symbol lands: an instant soft wooden thump with one clear magical bell note on A, ce…" | (score 100, fits its job) | `audio-src/sfx-old/fs_land_old2.mp3` |
| `edge` | v3 | `edge_t1.mp3` (2.86 s): "Suspense riser for a pirate ghost slot game: quiet at first and growing louder and higher …" | (score 100, fits its job) | `audio-src/sfx-old/edge_old2.mp3` |
| `click` | v3 | `click_t6.mp3` (0.07 s): "Tiny UI click: an instant sharp tap of a brass compass lid snapping shut with a faint wood…" | (score 92: long: 0.48 s audible (fits 0.15 s, gets faded)) | `audio-src/sfx-old/click_old2.mp3` |
| `wail` | v3 | `wail_t3.mp3` (2.32 s): "Cartoon ghost knocked out: starts instantly with a hard punchy hit at the very first momen…" | (score 100, fits its job) | `audio-src/sfx-old/wail_old2.mp3` |
| `heartbeat` | v2 | `heartbeat_t10.mp3` (0.8 s): "Two quick knocks on a wooden coffin lid like a heartbeat, crisp mid-range, a small glass c…" | (score 100: 292 ms silence before it (trimmed when applied)) | `audio-src/sfx-old/heartbeat_old.mp3` |
| `fanfare` | v7 | `fanfare_t9.mp3` (1.29 s): "Free spins sting with root note A, in A minor: starts instantly with a soft thunder boom, …" | (score 100, fits its job) | `audio-src/sfx-old/fanfare_old6.mp3` |
| `land` | v4 | `land_t4.mp3` (0.1 s): "One single clean wooden 'tock': a soft, round knock of a small wooden block, one hit only,…" | Cleaner: one round, slightly tonal wooden tock instead of a knock plus a click; all in the phone range, almost no noise (score 80: slow attack 20 ms (max 10)) | `audio-src/sfx-old/land_old3.mp3` |
| `totalwin` | v1 | `totalwin_t3.mp3` (3.92 s): "Treasure found: a happy pirate fanfare in A major, an instant brass and fiddle flourish, a…" | the only take whose held chord is a clear major triad (C-E-G mids, the relative major of the A-minor music), so it reads happy; t6 scores higher but its F/D-minor chord can sound dark (score 63: slow attack 38 ms (max 25); 11 clipped samples; weak A major (0.19), sounds like E minor) | new sound (as loud as `fanfare`) |
| `charge` | v6 | the file of commit `39c4def` (0.5 s), restored | VS duel in a fighting-game style again: the Nov 3 fighting wind-up (taiko roll and rising strings into a hard cut) | `audio-src/sfx-old/charge_old5.mp3` (the v3 sound) |
| `burst` | v6 | the file of commit `39c4def` (0.84 s), restored | VS duel in a fighting-game style again: the Nov 3 "fighting game VS slam" (steel on steel, taiko and bass boom, lightning crack); none of today's 4 new takes beat it (judge 100 vs at most 75) | `audio-src/sfx-old/burst_old5.mp3` (the v3 sound) |
| `clash` | v4 | the file of commit `39c4def` (0.66 s), restored | VS duel in a fighting-game style again: the Oct 29 battle-arena clash (blades, shockwave boom, ringing metal) | `audio-src/sfx-old/clash_old3.mp3` (the v3 sound) |
| `wail` | v4 | the file of commit `39c4def` (2.02 s), restored | VS duel in a fighting-game style again: the Oct 29 knockout (heavy punchy hit, then the banished ghost) | `audio-src/sfx-old/wail_old3.mp3` (the v3 sound) |
| `challenger` | v4 | the file of commit `39c4def` (1.93 s), restored | VS duel in a fighting-game style again: the Oct 29 challenger entrance (cannon boom, ship horn, chains, organ) | `audio-src/sfx-old/challenger_old3.mp3` (the v3 sound) |
| `fs_land` | v4 | `fs_land_t2.mp3` (0.66 s): "Treasure chest symbol slams down: an instant heavy wooden and iron thud with a timpani hit…" | (score 100, fits its job) | `audio-src/sfx-old/fs_land_old3.mp3` |
| `connect` | v1 | `connect_t2.mp3` (0.51 s): "One single plucked harp and celesta note at A5 with a soft bubble pop on the attack and a …" | (score 100, fits its job) | new sound (as loud as `tumble`) |
| `trove` | v1 | `trove_t1.mp3` (4.4 s): "Cinematic orchestral transition, 6 seconds: a rising rush of wind and ghostly whispers wit…" | (score 90: 113 clipped samples) | new sound (as loud as `fanfare`) |
| `click` | v4 | `click_t2.mp3` (0.03 s): "Tiny premium UI click: an instant crisp tap of a small brass latch with a faint glassy pin…" | (score 90: harsh at the game's top pitch (x1)) | `audio-src/sfx-old/click_old3.mp3` |
| `spin` | v4 | `spin_t3.mp3` (0.84 s): "Slot spin start in a cinematic orchestral pirate crypt game: an instant soft taiko tap and…" | (score 85: slow attack 18 ms (max 15)) | `audio-src/sfx-old/spin_old3.mp3` |
| `land` | v5 | `land_t5.mp3` (0.3 s): "A LOUD, close-up single knock of a hard wooden block struck with a mallet: one strong hit …" | (score 92: long: 0.48 s audible (fits 0.3 s, gets faded)) | `audio-src/sfx-old/land_old4.mp3` |
| `land_heavy` | v4 | `land_heavy_t4.mp3` (0.39 s): "A huge carved stone reel slamming down: an instant orchestral bass drum and low brass stab…" | (score 100, fits its job) | `audio-src/sfx-old/land_heavy_old3.mp3` |
| `chime` | v4 | `chime_t10.mp3` (1.33 s): "One single soft harp and glass-bell note together, pitch A5, round and sweet, gentle shimm…" | (score 100, fits its job) | `audio-src/sfx-old/chime_old3.mp3` |
| `tumble` | v3 | `tumble_t1.mp3` (0.53 s): "Winning symbols dissolving into glowing spectral dust: an instant soft airy pop, a short s…" | (score 100, fits its job) | `audio-src/sfx-old/tumble_old2.mp3` |
| `charge` | v7 | `charge_t12.mp3` (0.77 s): "Rising tension swell for one second: from near silence to full volume, a fast ascending ha…" | (score 100: 175 ms silence before it (trimmed when applied)) | `audio-src/sfx-old/charge_old6.mp3` |
| `burst` | v7 | `burst_t8.mp3` (0.84 s): "Huge versus-screen slam: an instant thunderous timpani and low brass hit, a sharp metallic…" | (score 74: slow attack 45 ms (max 15)) | `audio-src/sfx-old/burst_old6.mp3` |
| `clash` | v5 | `clash_t1.mp3` (0.92 s): "Two cursed blades clashing hard in a cinematic duel: an instant bright steel-on-steel ring…" | (score 100, fits its job) | `audio-src/sfx-old/clash_old4.mp3` |
| `wail` | v5 | `wail_t1.mp3` (2.07 s): "Cinematic knockout: an instant huge final impact of taiko, timpani and low brass, a sword …" | (score 82: slow attack 32 ms (max 20)) | `audio-src/sfx-old/wail_old4.mp3` |
| `sting` | v3 | `sting_t2.mp3` (2.19 s): "Short heroic win sting in A major: a snare flam into a full brass and strings A major chor…" | (score 80: 43 clipped samples; weak A major (-0.19), sounds like C major) | `audio-src/sfx-old/sting_old2.mp3` |
| `sting_devil` | v4 | `sting_devil_t2.mp3` (3.37 s): "Villain entrance in A minor: a thunderous timpani hit, menacing low horns and trombones in…" | (score 100, fits its job) | `audio-src/sfx-old/sting_devil_old3.mp3` |
| `fanfare` | v8 | `fanfare_t19.mp3` (1.34 s): "Free spins triggered, root note A, A minor: starts instantly with a big timpani and taiko …" | (score 90: 97 clipped samples) | `audio-src/sfx-old/fanfare_old7.mp3` |
| `bigwin` | v6 | `bigwin_t11.mp3` (2.1 s): "Big win, A major: starts at full volume at the very first millisecond with a huge orchestr…" | (score 90: 104 clipped samples) | `audio-src/sfx-old/bigwin_old4.mp3` |
| `totalwin` | v2 | `totalwin_t2.mp3` (1.84 s): "Treasure counted, A major: an instant orchestral hit into a heroic horn melody, bright glo…" | (score 90: 81 clipped samples) | `audio-src/sfx-old/totalwin_old.mp3` |
| `heartbeat` | v3 | `heartbeat_t2.mp3` (0.95 s): "Lost a life: two muted timpani heartbeats, a quick descending harp glissando and a faint g…" | (score 100, fits its job) | `audio-src/sfx-old/heartbeat_old2.mp3` |
| `crumble` | v4 | `crumble_t2.mp3` (0.53 s): "Runes falling apart: a brief gritty crackle of stone, a soft descending celesta trickle an…" | (score 100, fits its job) | `audio-src/sfx-old/crumble_old3.mp3` |
| `challenger` | v5 | `challenger_t1.mp3` (1.63 s): "A new challenger enters a cinematic duel: an instant dramatic full-orchestra brass hit, a …" | (score 90: 132 clipped samples) | `audio-src/sfx-old/challenger_old4.mp3` |
| `banner` | v4 | `banner_t1.mp3` (1.57 s): "Announcement: a soft rising swell of strings and spectral air into a bright harp, celesta …" | (score 100, fits its job) | `audio-src/sfx-old/banner_old3.mp3` |
| `edge` | v4 | `edge_t6.mp3` (2.33 s): "Near-miss tension: a rising violin and viola tremolo that climbs in pitch and volume for t…" | (score 80: 15 clipped samples; peaks at 1.95 s (wanted 2.0-2.6 s); 197 ms silence before it (trimmed when applied)) | `audio-src/sfx-old/edge_old3.mp3` |
| `land` | v6 | `land_t5.mp3` (0.24 s): "A LOUD, close-up single knock of a hard wooden block struck with a mallet: one strong hit …" | (score 92: long: 0.48 s audible (fits 0.3 s, gets faded)) | `audio-src/sfx-old/land_old5.mp3` |
| `fanfare` | v9 | `fanfare_t16.mp3` (2.0 s): "Spooky ghost sting: an instant deep thunder crack, a chilling ghost wail sweeping overhead…" | (score 100, fits its job) | `audio-src/sfx-old/fanfare_old8.mp3` |
| `bigwin` | v7 | `bigwin_t5.mp3` (2.99 s): "Spooky jackpot: an instant thunder crack and a big pipe organ fanfare in A major, haunted …" | (score 100, fits its job) | `audio-src/sfx-old/bigwin_old5.mp3` |
| `edge` | v5 | `edge_t4.mp3` (3.02 s): "Near-miss tension riser: a slow crescendo of tremolo strings and choir rising in pitch for…" | (score 85: mostly outside phone range (0% in 300 Hz-5 kHz)) | `audio-src/sfx-old/edge_old4.mp3` |
| `connect` | v2 | `connect_t7.mp3` (0.35 s): "One single sharp, bright plucked note at A5: a crisp pizzicato violin and celesta struck t…" | (score 80: no clear pitch) | `audio-src/sfx-old/connect_old.mp3` |
| `fs_land` | v5 | `fs_land_t7.mp3` (0.83 s): "Bonus symbol slams onto the reel: an instant hard, sharp strike at the very first millisec…" | (score 100, fits its job) | `audio-src/sfx-old/fs_land_old4.mp3` |
| `tumble` | v4 | `tumble_t6.mp3` (0.59 s): "Ghost symbols explode into green spirit fire: an instant snappy fireball pop with a crackl…" | (score 100, fits its job) | `audio-src/sfx-old/tumble_old3.mp3` |

v1 is the original designed sound (`tools/sound_design.py`; `fs_land` is an ElevenLabs sample processed there). v2 is the first ElevenLabs replacement.

### Not replaced (2026-10-29)

| File | Takes tried | Why the current sound stays |
| --- | --- | --- |
| `chime`, `crystal` | none | Not to be replaced: note sources the game transposes into melodies, so they need an exact single A5 |
| `toll` | 2 | Not to be replaced: the game needs exactly A2 (it also plays it an octave up). Both takes came out around E, 5 semitones off |
| `tumble` | 11 (3 rounds) | Every take is either thin high hiss (almost nothing in the range phone speakers play) or a tiny blip. It plays on every win, so a harsh one would wear on players |
| `heartbeat` | 11 (3 rounds) | The takes come out mostly deep bass and quiet; the current crack and sigh carry better on phone speakers |

Round 3 (2026-10-29) tried two or three directions per sound and replaced `charge`, `burst`, `sting`, `fanfare`, `fs_land` and `edge`. `fanfare` and `fs_land` needed a fix when they were finished (`finish` in `sfx.json`): a silent gap was cut out of the fanfare, and the FS sound's highs were softened because the game plays it up to an octave higher.

Unused takes are deleted once the picks are applied. All three rounds together used about 2,000 credits for 130 takes.

## To keep in mind

- **License.** ElevenLabs' help center says free-plan output has no commercial license, and a real-money slot is commercial. Sounds generated on the free plan can be used to prototype, but they need a paid plan (Starter is the cheapest with a commercial license) before they ship. Generating the final takes after upgrading avoids any doubt about earlier output. This also applies to the existing `fs_land` sample.
- **Repetition.** `spin`, `land` and `click` play thousands of times, so they have to stay short and not too bright. Two or three alternating takes per sound would keep them fresh; that needs a small change in the sound module.
- **Mix headroom.** Up to 7 reel stops, win chimes and a stinger can overlap. A limiter on the master bus would stop the sum from clipping.
- **Escalation.** Small win, character win, big win, free spins and max win must clearly step up in size. The ladder only works if every step is bigger than the one below.
- **Wins smaller than the bet.** Today every win plays chimes, even one that pays less than the bet. Some regulators (for example the UK) don't allow celebrating those as wins. Stake doesn't list this rule, but a quieter sound for wins under the bet is worth deciding on.
- **Download size.** The 22 files are 708 KB now. The goal is to stay near 1 MB, because the sounds load with the game.
- **API limits.** The minimum length is 0.5 s, so clicks and reel stops are trimmed afterwards. On the free plan the best format is MP3 at 128 kbps (192 kbps needs Creator, WAV at 44.1 kHz needs Pro), so takes are decoded and encoded once more.
