# Night Drive: concept for our next Stake Engine slot

Working title **Night Drive**: an original 1980s neon coastal-city night, a getaway car on a palm boulevard,
synthwave. Status: concept art (November 2026). No math, no frontend yet.

## Prompt for Claude (to paste on the home machine)

> We are starting our next Stake Engine slot, working title Night Drive. Read `night-drive/README.md` and look at the
> pictures in `night-drive/concept/` first. The concept and the decisions so far are written there. Ghost Duels is
> done (resubmitted), so leave it as it is.
>
> Next steps:
> 1. Paint the reel grid again with the image-gen skill: `night-drive/prompts/nd-grid2.txt`, 4:3, green backdrop,
>    2 takes. It must have square cells (5 wide, 4 tall) and open cells (the game tints them in CSS). Keep the art-deco
>    chrome corners of `concept/grid-first-try.webp`. Show it over `concept/keyart.webp` as a mock-up.
> 2. Paint the full symbol set in **style B** (cartoon cel, see "Style B" below), one symbol per picture on a green
>    backdrop, 2 takes each:
>    - 4 character busts: the driver (already done: `concept/symbol-B-driver.webp`), a boat captain, a club owner,
>      a DJ;
>    - 4 objects: speedboat, cassette (done: `concept/symbol-B-tape.webp`), flamingo, briefcase;
>    - the wild (our own getaway car) and the scatter (sunset badge);
>    - a test of the low symbols as neon signs.
>
>    Ask me before more than about 12 pictures in one go. Then show the whole set together on the night background.
> 3. Copy the picks back into `night-drive/concept/` as WebP. Write new prompts to `night-drive/prompts/`. Update this
>    README (decisions, what is open). Commit and push.
>
> Rules: everything original. No "Miami Vice" (name, logo, music, look-alike characters, the cop duo), no real car
> (the first car looked like a DeLorean, so design our own), no drugs or "vice". Characters are adults. Separate art
> from text: values and words are HTML, never painted (only the logo has painted letters).

## Decisions so far

- **Theme:** an original 80s neon coastal city at night: palms, ocean, a synthwave sun, art-deco hotels with neon
  (abstract signs, no readable names), chrome, light trails. Colours: hot pink, cyan, sunset orange, deep violet.
- **Layout:** 5 x 4, 1024 ways. Simple to read, simple math. **The reel grid is its own picture, without a
  dashboard.** The controls (spin, bet, balance) are our own HTML UI, not painted into the board.
- **Symbol style: B, 80s cartoon cel** (`concept/symbols-A-vs-B.webp`). Flat 2-tone cel shading, thick black
  outlines, a clear silhouette, a limited palette. Style A (airbrush) and the first sheet
  (`concept/symbols-sheet-first-try.webp`) looked too AI-generated: generic sheen and random sparkles.
- **Logo direction:** `concept/logo.webp` (chrome "NIGHT" with a sunset gradient, pink neon "Drive" script).
- **Key art / background mood:** `concept/keyart.webp`. The car in it is only a placeholder (it looks like a
  DeLorean). We design our own.
- **Board mood:** `concept/board-mood.webp` (neon frame over the boulevard). It is for the feeling only: its painted
  dashboard is not used.

## Game idea (draft, nothing fixed)

- **Signature feature: the getaway car (wild).** A car drives across the reels and leaves a neon trail of wilds.
  That is the one big cinematic animation.
- **Free spins, "The Chase":** the car moves one reel per spin, and a multiplier rises per lap. The way in is one
  painted clip in the reel field (as in Ghost Duels' portal: Gemini image_to_video from a still of the empty board).
- **Big win:** neon signs light up letter by letter, and the synthwave builds.
- **Modes:** base, 1 boost, 1 bonus buy. **The bonus ends as soon as max win is reached.**
- **Symbols:** 4 character busts (high), 4 objects (mid), low symbols as neon signs, wild (car), scatter.
- **Still open:** a twist that sets it apart from the usual synthwave slots (Stake checks "distinct from existing
  titles"). Ideas: a VHS tape framing device (respins rewind, Side B = free spins; mind photosensitivity), rainy comic
  noir, a speedboat chase in the bay instead of the boulevard.

## What we learned from Ghost Duels (do it this way from day 1)

1. **Lock the style first** (this folder), then produce. Ghost Duels changed its style mid-way, and assets had to be
   redone.
2. **One signature feature,** not several systems at once (clusters + VS reels + hold & win cost a lot of edge-case
   fixing).
3. **Videos:** encode with ffmpeg (`tools/video/clip.py` for one-shot clips, `tools/video/loop.py` for loops),
   never with the browser's MediaRecorder (dropped frames, freezes). Play from the asset URL, never from `blob:`
   URLs (Stake's page blocks them).
4. **Plan the animations for each symbol from the start:** idle, land, win, burst (`tools/sprites/symanim.py`:
   Gemini image_to_video from the still, keyed and cut into sprite sheets).
5. **Math first** (math-sdk, `templates/stake-3star`), the review tool (`tools/review`) from the first playable
   build on.

## Tools and commands

- Paint (image-gen skill): `math-sdk\env\Scripts\python.exe tools\imagegen\gen.py <name> @night-drive\prompts\<file>.txt --aspect 1:1 --bg green --n 2`
  The takes land in `imagegen-out/<name>/` (not in git: copy the picks into `night-drive/concept/`).
  Use `--bg green` for symbols and the grid (the art is pink and cyan), and `--bg none` for scenes.
- The prompts of every picture are in `prompts/`, so a pick can be painted again or varied.
- Costs: images a few cents each. Videos about $0.07 per second (later, for the symbol animations and the signature
  clips). The AI Studio prepaid credit needs topping up first: it ran out on 2026-11-24.

### Style B (put it into every symbol prompt)

> Painted in a 1980s Saturday-morning cartoon cel style: flat cel shading with exactly two tones per colour, thick
> even black outlines, bold simple shapes and a clear silhouette, a limited palette of hot pink, cyan, sunset orange
> and deep violet, like a hand-painted animation cel. Not a glossy 3D render, no gradients noise, no extra detail.
> On a plain flat pure green background. No text, no letters, no numbers, no frame, no border, no badge.

## Files

- `concept/styleboard.webp`: everything from the first round on one board.
- `concept/keyart.webp`, `keyart-alt.webp`: key art and background mood.
- `concept/logo.webp`: logo direction.
- `concept/board-mood.webp`: board mood (not its dashboard).
- `concept/symbol-B-*.webp`: the chosen symbol style. `symbol-A-*.webp` is the airbrush variant, which was dropped.
- `concept/symbols-A-vs-B.webp`: the comparison.
- `concept/grid-first-try*.webp`: first grid: good corners, but cells too wide and green-tinted glass.
- `prompts/*.txt`: the prompt of each picture (`nd-grid2.txt` is the next grid try, not painted yet).
