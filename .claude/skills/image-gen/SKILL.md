---
name: image-gen
description: Paints new game art (symbols, tiles, frames, characters, icons, backgrounds, UI pieces) with Google's Gemini image models through tools/imagegen/gen.py, in the style of the existing assets, with the backdrop cut away. Use when asked to create, draw, paint, design or redo an image or asset, to make art "like this" from an inspiration picture, or for new symbols, multipliers, runes or frames.
---

# Image generation (Gemini)

`py` below is `math-sdk\env\Scripts\python.exe` (it has numpy and pillow; nothing else is needed).

## Setup (once per computer)

The user makes a key at https://aistudio.google.com/apikey and sets it as a user variable (PowerShell):

```
[Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "<key>", "User")
```

The tool also reads it from the user variables without a restart. Never print it, write it to a file or put it in the repo. If it is missing, the tool says how to set it; tell the user that, don't ask them to paste the key into the chat.

## Routine

1. **Look first.** Read the inspiration picture(s) and the game's current version of the thing (screenshot it in the game with `tools/review/cdp.py` when it is on screen, e.g. the bonus via the mock RGS `rgs_url=…/force/bonus`). Note what to take from the inspiration (layout, proportions, how big the number is, the frame) and what must stay ours (characters, colours, the painted cartoon style of `ghost-duels-web/assets`).
2. **Never copy another game.** Inspiration pictures are for layout and feel only: don't pass them as references or describe their characters, logo or exact look. References are our own assets.
3. **Separate art from text.** Numbers and words that change (values, multipliers, amounts) stay HTML text in the game, styled in CSS, so they are sharp, translatable and can count up. Paint only the art: frames, characters, objects, backgrounds. Say "no text, no letters, no numbers" in the prompt.
4. **Write the prompt** in `imagegen-out/<name>/prompt.txt`: what it is and where it sits in the game (size on screen: a reel cell is about 110 px on desktop), the style ("hand-painted cartoon slot game art, thick dark outlines, rich shading, spooky crypt, ghostly green glow, matching the reference pictures"), the view (front, centred, square, the subject filling about 90 % of the canvas), what each reference is for, and what to leave out.
5. **Paint 2–4 takes** with style references:
   `py tools\imagegen\gen.py <name> @imagegen-out\<name>\prompt.txt --ref ghost-duels-web\assets\pirate.webp ghost-duels-web\assets\bg.webp --n 3`
   It first prints the cost note; run it again with `--yes`. Each picture costs a few cents. Tell the user how many you paint; ask before more than about 12 in one go.
   The backdrop is magenta by default and cut away into `take-NN-cut.png`; use `--bg green` for pink or purple art and `--bg none` for backgrounds and full scenes. `--aspect`, `--size 2K` and `--model` (default `gemini-nano-banana-2.1`; `gemini-3-pro-image` for the hardest style matches) are there when needed.
6. **Judge** `imagegen-out/<name>/contact.png` (Read it): style match, clean outline, nothing cut off at the canvas edge, no stray text, the backdrop fully gone (no pink or green fringe). Vary the prompt and paint again; usually two or three rounds. A take whose backdrop came back off-colour can be cut again: `py tools\imagegen\gen.py cut <take.png> --bg magenta`.
7. **Into the game**: scale the pick to about 2× its largest size on screen, save as WebP (quality ~88, with alpha) into `ghost-duels-web/assets`, wire it in, and check it in the browser with screenshots at desktop and phone size (tools/review). Then refresh `_UPLOAD_TO_STAKE/2_frontend` (`tools/release/package.py ghost_duels ghost-duels-web "Ghost Duels" --frontend-only`) when the user wants it in the upload.
8. **Hand over**: the contact sheet, which take you used and why, the prompt (it is in `takes.json` next to the takes, with model and references, so a pick can be painted again or varied), and how many pictures were painted.

`imagegen-out/` is ignored by git; only the finished assets go into the repo.
