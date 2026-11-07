# Ghost Duels sound effects from ElevenLabs

Plan, rules and replacement log for swapping the game's sound effects (`ghost-duels-web/assets/sfx/*.mp3`) for sounds generated with ElevenLabs. The request for every sound (prompt, length, prompt influence, number of takes) and the bar it has to clear are in [`sfx.json`](sfx.json).

## Goal

Every sound should add excitement: it hits instantly and lands hard, and wins feel rewarding. Each one still has to fit its job in the game. A reel stop that plays 7 times per spin has to be short and dry, and a big win can be huge. Losses (a life lost, runes crumbling) stay short and dramatic, never sad.

Musical frame:
- The game's scale is A Phrygian and the music ("Spooky Carousel") is in A minor at about 96 BPM, so tension sounds are in **A minor**.
- Wins resolve to **A major**.
- Palette: haunted bells, ghost choir, pipe organ, bone and wood, chains, thunder, green spectral magic.

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
