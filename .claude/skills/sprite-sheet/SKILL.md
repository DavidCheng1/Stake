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
2. **Write a recipe** in `sprites-out/<name>/recipe.json`, starting from the closest preset in `tools/sprites/recipes`:
   - `idle-character`: breathing, sway, cloth wobble, glow, wisps (a loop)
   - `floating-symbol`: float, tilt, glow, shine, sparkles (a loop)
   - `win-title`: pop in with overshoot and shake, rays, shine, glow, sparkles (`"once": true`)
   - `win-title-loop`: the title after its intro: breathing, rays, shine, sparkles, embers (a loop)
   Map each line of the brief to a motion. Keep it subtle: big warps look rubbery.
3. **Render**: `py tools\sprites\make_sheet.py <picture> --recipe sprites-out\<name>\recipe.json --name <name>` (several key drawings: `--keys a.png b.png c.png`). 100 frames take about 3 minutes.
4. **Check**: `py tools\sprites\check_sheet.py sprites-out\<name>`, then Read `strip.png`. A loop must close cleanly; nothing important may be cut off at the frame edge (raise `pad`); glow must not wash out the subject (raise `threshold`, lower `amount`). Fix the recipe and render again until it matches the brief. Usually it takes two or three rounds.
5. **Hand over**: the folder, `preview.html` to open (play, step with the arrow keys, onion skin, game background), what each motion does and what to change for more or less. Say plainly what a single picture cannot do: new poses, turning, limbs moving independently. That needs key drawings (`--keys`), which RIFE in-betweens.
6. **Into the game**, only when asked: `anim.webp` is used as an `<img>` like `assets/lich-idle.webp`; or `sheet.webp` + `sheet.json` with a canvas or CSS `steps()` player. Mind the download size for the Stake upload: 100 frames at 512 px are about 5 MB; use `--size 384` or fewer frames where that is enough. Copy assets into `ghost-duels-web/assets`, then refresh `_UPLOAD_TO_STAKE/2_frontend`.

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

For a screen that pops in and then idles (win screens), make two sheets from the same motion list: the loop, and the intro with `"once": true` plus `pop`/`shake` appended at the end. Keep the order and the whole-number `cycles` identical: then the intro's last frame equals the loop's first frame, and the game swaps from one to the other without a jump. `tools/sprites/examples/total-win` is a worked example (the cut-out emblem and both recipes): a design screenshot cropped to the emblem, cut out, a leftover background patch removed, and wings, ghosts, eyes, candles, shine, rays and embers animated.
