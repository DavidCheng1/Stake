# Night Drive: concept for our next Stake Engine slot

Working title **Night Drive**: an original 1980s neon coastal-city night, a getaway car on a palm boulevard,
synthwave. Status: concept art, round 2 (November 2026). No math, no frontend yet. Goal: **a 3-star game**.

## Prompt for Claude (to paste on the home machine)

> We are starting our next Stake Engine slot, working title Night Drive. Read `night-drive/README.md` and look at the
> pictures in `night-drive/concept/` first. The concept and the decisions so far are written there. Ghost Duels is
> done (resubmitted), so leave it as it is.
>
> Round 2 is painted (`night-drive/concept/round2/`, see "Round 2" below): the 5 x 5 grid, the background and all
> 12 symbols. Next steps:
> 0. Paint the wild again: the car in `round2/sym-wild.webp` looks like a real supercar (a Countach). It must be our
>    own design: rounder, retro-futuristic, a bubble canopy, unmistakably ours. Then check the free-spins draft below
>    with me, and the math after that.
> 1. (done in round 2) Paint the reel grid again with the image-gen skill: `night-drive/prompts/nd-grid2.txt`, 4:3, green backdrop,
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
- **Layout:** 5 x 5 (the user's choice), left-to-right ways (3125). Simple to read, simple math. **The reel grid is its own picture, without a
  dashboard.** The controls (spin, bet, balance) are our own HTML UI, not painted into the board.
- **Symbol style: B, 80s cartoon cel** (`concept/symbols-A-vs-B.webp`). Flat 2-tone cel shading, thick black
  outlines, a clear silhouette, a limited palette. Style A (airbrush) and the first sheet
  (`concept/symbols-sheet-first-try.webp`) looked too AI-generated: generic sheen and random sparkles.
- **Logo direction:** `concept/logo.webp` (chrome "NIGHT" with a sunset gradient, pink neon "Drive" script).
- **Key art / background mood:** `concept/keyart.webp`. The car in it is only a placeholder (it looks like a
  DeLorean). We design our own.
- **Board mood:** `concept/board-mood.webp` (neon frame over the boulevard). It is for the feeling only: its painted
  dashboard is not used.

## Prototype (2026-11-26): `night-drive-web/`

A first playable look. Serve it with `math-sdk\env\Scripts\python.exe -m http.server 8099 --bind 127.0.0.1` in
`night-drive-web/`, then open http://127.0.0.1:8099/. It plays everything below:
- 5 x 5 ways;
- the car wild with ×2/×3/×5 (cars in one win multiply);
- Drive-By;
- The Chase with driving cars and Nitro +1 spin;
- both buys and Chance ×3;
- the intro (logo, three feature cards in `assets/card.webp`, prompt `prompts/nd-card.txt`, a tap starts the sound);
- the controls: the menu (game info, music and effects volume, sound on or off), the gold Bonus button with the
  logo, spin with autoplay and turbo beside it, and the bet with arrows;
- every bonus is confirmed with its cost first, and ends on a summary that waits for Continue (it goes on by
  itself after 3.5 s in autoplay);
- sound, the filmed symbol animations, the animated background, the main character's videos.
- the background: filmed again at 1080p (`prompts/nd-bgloop2.txt`): nothing travels across the picture (clouds stay,
  palms sway round their resting pose), closed into a seamless loop with tools/video/loop.py (6.6 s), interpolated to
  48 fps; `assets/bg.webp` is its first frame. The symbol player blends each frame into the next, so the sheets (idle
  12 fps, win 24 fps) move smoothly at the screen's rate;
- every win pays at least 0.10× the bet (`MIN_WIN`), so no win shows as 0.00; pay scale K 0.038, The Chase 76×,
  Super Chase 235×;
- fonts (bundled, SIL OFL, `assets/fonts`): Audiowide for labels, buttons and numbers, Mr Dafoe (script) for accents;
- the supercar in side profile (`assets/sidecar.webm`, a filmed loop with alpha from `prompts/nd-sidecar.txt` take 01
  and `prompts/nd-sidecar-video.txt`; `sidecar.webp` is its still): it races along a row in a Drive-By and whenever 3 or
  more cars stand in one row (base game, and each new line in The Chase); the cars it passes flash. Test hook
  `window.__force = "line"`;
- the win screen (Big 20×, Mega 50×, Epic 100×, Max Win at the cap): painted titles in `assets/win/` (prompts
  `prompts/nd-win-*.txt`), a striped synthwave sun, a neon floor, sparks; the count climbs through the tiers, a tap
  skips to the end, a second tap closes it;
- the start of The Chase: a filmed clip (`assets/fsi.webm`, Gemini Omni from `prompts/nd-fsintro.txt` take 02 and
  `prompts/nd-fsintro-video2.txt` take 04, with the car's own picture as a second reference so it stays our cartoon car):
  the getaway car comes at us down a neon boulevard and roars past. It plays inside the grid (`assets/fsi-grid.webm`,
  cropped square, `gridPass()`); the full-screen version (`fsi.webm`, `carPass()`) and the built scene are fallbacks;
  then the way in inside the grid: the symbols are pulled into the vanishing point, a neon warp tunnel, the
  car blasts out, a flash, the title in the grid; during The Chase a neon road runs under the reels.

The math is a **placeholder in the browser**. `simulate(n, buys, boost)` in the console gives about 96 %: free spins
about every 176 spins, 45 % of the RTP; Drive-By about every 33 spins; Chase 81×, Super Chase 250×. Chance ×3
(`BOOST` in game.js: sunset weight 1.97, 2× the bet per spin) starts free spins about every 55 spins. Test hook:
`window.__force = "driveby"`, `"chase"` or `"tease"` (two sunsets, the anticipation without a third) before a spin.
Anticipation: with two sunsets on the board, the reels still to come spin on as a blur and stop one by one
(1.5 s each, slowing), the world darkens and the reel about to stop glows (sound `tease`). Not in it yet:
- the real math (math-sdk) and the RGS;
- social wording (`social=true`) and currencies;
- portrait layout;
- the Stake review checks (`tools/review/run_review.py`).

The wild is now our own car (`prompts/nd-sym-wild2.txt`, take 01: bubble canopy, a light bar instead of headlights,
tail fins).

## Round 2 (2026-11-26): 5 x 5, background, symbol set

`concept/round2/`:
- `mockup.webp`: background + grid + symbols on 5 x 5.
- `background.webp`: the chosen background. Its calm middle (sun, sea) sits behind the grid. Palms, waves, neon and
  light trails are painted apart, so they can be animated (a seamless loop video with tools/video/loop.py, like
  Ghost Duels' VS field).
- `grid-5x5.webp`: square open cells. The glass tint comes from CSS.
- `sym-*.webp` (the driver and the tape are in `concept/symbol-B-*.webp`): the set in style B.
  - **High:** driver, captain, club owner, DJ.
  - **Mid:** speedboat, cassette, flamingo, briefcase.
  - **Low:** sunglasses, roller skate, neon palm, neon heart.
  - **Wild:** the getaway car. Redo it: it looks like a real car.
  - **Scatter:** the sunset badge.
- The prompts are `prompts/nd-grid3.txt`, `prompts/nd-bg.txt` and `prompts/nd-sym-*.txt`. `bash night-drive/paint.sh`
  paints the whole batch.
- **Every symbol gets real animation:** an idle loop and a win clip (Gemini image_to_video from the still, keyed into
  sprite sheets like `tools/sprites/symanim.py`, which needs a path option for this game). About $0.42 a symbol.

**Inspiration: Paperclip Gaming** (Stake-exclusive studio). We take principles, never their designs:
- few features, made very well;
- wilds with multipliers as the heart of the game;
- a living, animated world behind the reels;
- vibrant, clear themes.

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

- Seamless music loop: `math-sdk\env\Scripts\python.exe tools\audio_loop.py audio-src\night-drive\music-unlooped\<song>.mp3 night-drive-web\assets\<song>.mp3`
  (finds the best-matching phrase, cuts there, crossfades the seam; the game skips the MP3 padding).
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
