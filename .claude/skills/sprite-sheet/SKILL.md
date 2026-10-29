---
name: sprite-sheet
description: Turns a picture (or a few key drawings) into an animated sprite sheet for the game, 100 frames in a 10x10 grid by default, with a preview player. Cuts the subject out, upscales it (Real-ESRGAN), draws in-betweens of key drawings (RIFE) and animates with a recipe (breathe, sway, float, wobble, flame, glow, shine, particles, rays, pop). Use when asked for a sprite sheet, an animation of a picture, an animated win screen or title, an idle loop, or to animate an asset.
---

# Sprite sheet

The user gives a picture and a brief, ideally filled in from `tools/sprites/PROMPT_TEMPLATE.md`. Ask for that template only when the brief is missing what you cannot sensibly default: what moves, loop or once, where it is used.

## Setup (once per computer)

Everything lives outside the repo in `SPRITE_TOOLS` (default `D:\GhostDuels\sprite-tools`; C: is nearly full on the main PC):

```
<python 3.12> -m venv D:\GhostDuels\sprite-tools\venv
D:\GhostDuels\sprite-tools\venv\Scripts\python.exe -m pip install numpy pillow opencv-python-headless onnxruntime
isnet-anime.onnx          https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-anime.onnx
realesrgan\               unzip https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip
rife\                     unzip https://github.com/nihui/rife-ncnn-vulkan/releases/download/20221029/rife-ncnn-vulkan-20221029-windows.zip
```

Set `PIP_CACHE_DIR`, `TMP` and `SPRITE_TMP` to a folder on D: while installing and rendering. The two `.exe` tools run on the GPU (Vulkan, a GTX 1050 Ti is enough). Running them needs the user's permission once; without them the script falls back to plain resizing and crossfades and says so. `py` below is `D:\GhostDuels\sprite-tools\venv\Scripts\python.exe`.

## Routine

1. **Look at the picture** (Read it). Note what the subject is, whether it has transparency, its size, and where the parts are that should move: cloth, hair, flames, eyes, gems, the text of a title. Write their regions as `[x0, y0, x1, y1]` fractions of the picture.
2. **Rig it when it has separate parts** (wings, characters, hanging items, a title plaque): this is the default for artwork with distinct pieces. Warping one flat picture looks dragged and stretched; the user rejected that. Split it with a rig (`tools/sprites/rig.py`, see below) so every part moves as a solid piece about its own pivot, and use the recipe only for light effects on top. Plain warp recipes are for soft things only: smoke, cloth, hair, breathing.
3. **Write a recipe** in `sprites-out/<name>/recipe.json`, starting from the closest preset in `tools/sprites/recipes`:
   - `idle-character`: breathing, sway, cloth wobble, glow, wisps (a loop)
   - `floating-symbol`: float, tilt, glow, shine, sparkles (a loop)
   - `win-title`: pop in with overshoot and shake, rays, shine, glow, sparkles (`"once": true`)
   - `win-title-loop`: the title after its intro: breathing, rays, shine, sparkles, embers (a loop)
   Map each line of the brief to a motion. Keep it subtle: big warps look rubbery.
4. **Render**: `py tools\sprites\make_sheet.py <picture> --recipe sprites-out\<name>\recipe.json --name <name>` (several key drawings: `--keys a.png b.png c.png`). 100 frames take about 3 minutes.
5. **Check**: `py tools\sprites\check_sheet.py sprites-out\<name>`, then Read `strip.png`. A loop must close cleanly; nothing important may be cut off at the frame edge (raise `pad`); glow must not wash out the subject (raise `threshold`, lower `amount`). Fix the recipe and render again until it matches the brief. Usually it takes two or three rounds.
6. **Hand over**: the folder, `preview.html` to open (play, step with the arrow keys, onion skin, game background), what each motion does and what to change for more or less. Say plainly what a single picture cannot do: new poses, turning, limbs moving independently. That needs key drawings (`--keys`), which RIFE in-betweens.
7. **Into the game**, only when asked. A rigged picture goes in live (next section): sharp at any size and a few hundred KB. Otherwise `anim.webp` is used as an `<img>` like `assets/lich-idle.webp`; or `sheet.webp` + `sheet.json` with a canvas or CSS `steps()` player. Mind the download size for the Stake upload: 100 frames at 512 px are about 5 MB; use `--size 384` or fewer frames where that is enough. Copy assets into `ghost-duels-web/assets`, then refresh `_UPLOAD_TO_STAKE/2_frontend`.

## Rigs: parts that move separately

`rig.json` lists the parts in picture pixels (draw a 20 px grid over the picture and Read it to find them): `rect` around the part, `fg` polygons surely inside it, `bg` polygons surely not (neighbouring parts of a similar colour), `z` (higher is in front), `pivot` (where it hinges: a wing's root, the top of a hanging cross, the bottom of a ghost). The part named `base` gets everything else; give it a `core` polygon around its own outline so glow and shadow around the moving parts go to them. Hidden areas behind front parts are filled in, so nothing tears open.

Check the split before rendering: `py tools\sprites\rig.py split <picture> <rig.json> --out <folder>`, then Read `overlay.png` (each part tinted, with its pivot dot). Fix rects and seeds until every part is whole and nothing belongs to the wrong part.

Tracks per part: `loop` (`prop` rotate/x/y/scale/scalex/scaley/alpha, `wave` sin/flap/bounce, `amount`, whole `cycles`, `phase`) and `intro` (`keys` [time, value, ease] with eases linear, in, out, inout, back, elastic, bounce). Put `"rig": "rig.json"` in the recipe (path next to the recipe). Good motion: wings flap from the root (flap wave, 8 to 10 degrees, a slight scaley for depth), hanging things swing like pendulums, floating characters bob and tilt with some squash, and parts arrive one after another in the intro (unfold, drop with a bounce, fly in with back easing, swing in with elastic).

## Live in the game: export instead of a sheet

A rig shown large (win screens, titles) belongs in the game as its parts, not as a video: a sheet of frames is fixed at its frame size, gets blurry when the browser stretches it, and costs several MB. `py tools\sprites\rig.py export <picture> <rig.json> --out <folder> --scale 3` writes all parts on one sprite sheet (`atlas.webp`, with the light layers of the glows) and a `rig.json` that `ghost-duels-web/rigplayer.js` plays on a canvas (`RigPlayer.load(dir)`, `RigPlayer.play(canvas, rig, {intro, still})`, which returns `introDone`, `skipIntro()`, `stop()`).

The user wants it polished: precise cuts, no fringes. For cartoon art with black outlines put `"clean": "clean.json"` and `"recolor": "recolor.json"` into the rig; the export then:

- **cuts the silhouette at the outer outline** (`tools/sprites/clean.py`): the outside is flooded through everything that isn't dark, so glow halos and background leftovers go; glow-coloured rims are peeled off (`glow` hue and sat, `peel` px) but never through a black pixel. Shapes without a full outline (a lit dome, a flame, a red cape that looks like the glow) need `keep` polygons; pockets of glow enclosed by the art go with `drop` points. Check the cut: green marks what was removed (a debug overlay on magenta shows it best), and fix leaks with `keep` before anything else.
- **redraws at 3x**: the colours without their outlines are upscaled smoothly, the outlines and the silhouette are drawn on top as crisp shapes, and an even outline (`stroke`) runs all round where the picture's own was cut off.
- **recolours by gradient maps** (`"map": [dark ... light]` in recolor rules): one palette per part and colour class, by brightness, so the shading stays and there are no hue seams (hue shifting a small picture gives rainbow fringes). Rules can pick whole areas between outlines (`"region": {"rect", "area", "sat", "val"}`), which separates e.g. letters from a frame of the same colour.
- **snaps the cuts onto the outlines** (`rig.snap_owner`): an area between outlines goes wholly to the part owning most of it, the shared line to the front part; tiny pieces cut off from a part join their neighbour. Hidden areas are filled from the part's own colours up to `extend` px (keep it small, 6, for big parts, or the fill shows when the parts in front move).

Real-ESRGAN (`--big`) is the alternative for painted art without outlines. The browser part goes under `"web"` in rig.json, in picture px: `pad`, `intro_seconds`, `loop_seconds`, `fade` (intro fade-in as a fraction), `shake` (`amount` px, `cycles`, `duration`), and `effects`: `glow` (`rect`, `part` or the part owning most of the rect, `color` or the part's own colours, `threshold`, `radius` px, `amount`, `min`, `cycles`, `phase`, `wave` sin or flicker, `flash` keys that scale it during the intro, `"loop": false` for intro only), `shine` (`part`, `rect`, `amount`, `cycles`, `sweep`, `phase`, `width`, `angle`), `sparkles` (`rect`, `count`, `size` px, `color`, `cycles`, `seed`). Rays, aura and embers belong to the game. Check with headless screenshots at intro and loop moments, and look at the atlas on a checkerboard.

`tools/sprites/examples/total-win` is the worked example (`brief.md` is the filled-in template); the game's Total Win screen plays it from `ghost-duels-web/assets/total-win`.

## Recipe reference

Top level: `frames` (100), `cols` (10), `size` (longest frame side in px, 512), `fps` (24), `pad` (empty margin, 0.12), `once` (false), `anchor` (`bottom`, `center`, `top` or `[fx, fy]`), `cutout`/`upscale` (`auto`, `on`, `off`), `seed`.

Every motion has `type`, `amount`, `cycles` (whole repeats per loop, so the loop closes) and `phase` (0 to 1). Amounts are fractions of the picture's size unless noted.

| type | does | extra keys |
|---|---|---|
| breathe | vertical stretch about the anchor, with a slight inverse width | |
| pulse | even scale about the anchor (a heartbeat for titles) | |
| flap | turns a region about a pivot, more toward its far end (wings, arms, banners); mirror with a negative amount, `amount` in degrees | `pivot` [fx, fy], `region`, `reach` (0.12: no turn this close to the pivot) |
| move | shifts one part inside a region (a ghost bobbing) | `region`, `dx`, `dy`, `feather` (0.03) |
| sway | bends sideways, more toward the top | `stiffness` (1.5) |
| float | bobs up and down | |
| rotate | tilts about the anchor, `amount` in degrees | |
| shake | jitter (`cycles` around 12) | `duration` (once: fades out) |
| pop | once only: scales in with overshoot and fades in | `duration` (0.25), `from` (0.3), `overshoot` (1.7) |
| wobble | smooth noise warp inside a region (cloth, hair, smoke) | `region`, `scale` (0.08), `feather`, `vertical` |
| flame | upward-flowing warp, strongest at the region's top | `region`, `scale` (0.05), `speed` |
| glow | pulsing bloom from the bright parts | `threshold` (0.7), `color`, `match_color`, `radius` (0.03), `spread`, `min`, `region` |
| flicker | brightness flicker in a region (torch light, eyes) | `region` |
| shine | a light band sweeping across the subject | `angle` (25), `width` (0.08), `sweep` (0.4 of each cycle), `color`, `region` |
| particles | `kind`: `embers` (rising sparks), `sparkles` (twinkling stars), `wisps` (ghostly smoke) | `count`, `color`, `size`, `rise`, `region`, `layer` (`front`/`back`) |
| rays | rotating light rays behind the subject | `count` (12), `color`, `radius` (0.7), `sharpness`, `center`, `clockwise` |

## Intro plus loop

For a screen that pops in and then idles (win screens), make two sheets from the same motion list: the loop, and the intro with `"once": true` plus `pop`/`shake` appended at the end. Keep the order and the whole-number `cycles` identical: then the intro's last frame equals the loop's first frame, and the game swaps from one to the other without a jump. `tools/sprites/examples/total-win` is a worked example: the cut-out emblem from a design screenshot, its rig (wings, devil head, plaque, cape, crosses, ghosts) with an intro where the parts arrive one after another, and the intro and loop recipes with the light effects.
