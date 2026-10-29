# Animation requests

Two templates: **A** for artwork made of parts (win screens, titles, characters with wings, props): the parts move
separately and the game plays them live, sharp at any size. **B** for a classic sprite sheet (a fixed list of frames).
Copy one, fill it in, and send it together with the picture. Short answers are fine; leave out what you don't care about.

## A. Animation in parts (recommended for win screens and titles)

```
Animate this picture in parts and put it into the game: <attach it, or give the path>

WHAT IT IS
- Subject: <e.g. the BIG WIN plaque / the MEGA WIN title / the Lich King>
- Used for: <total win screen / big win / mega win / epic win / free spins intro / idle decoration ...>
- Colours: <keep as drawn / bring into the game's palette (violet, teal glow, gold, stone) / other>

PARTS AND HOW THEY MOVE (one line per part, front to back is fine)
- <part>: loop <how it moves while idle>; intro <how it arrives>
  e.g. "wings: loop flap slowly from the shoulders; intro unfold from folded"
  e.g. "ghosts left and right: loop bob up and down and tilt; intro fly in from the sides"
  e.g. "hanging crosses: loop swing like pendulums; intro swing in and settle"
  e.g. "plaque with the text: stays still; intro pops in first"
- Must stay still: <e.g. the text, the frame>

ORDER OF THE INTRO
- <e.g. plaque first, then the wings unfold, the head drops in, the ghosts fly in, the crosses last>
- Length: <intro about 3 seconds / shorter / longer>; loop: <about 4 seconds>

EFFECTS
- Glow: <colour and where, e.g. "eyes pulse green", "candles flicker">
- Shine: <a light sweep across the plaque, how often>
- Sparkles / embers / rays: <colour, in front or behind>

IN THE GAME
- When: <after free spins / at wins over 20x / ...>
- With it: <counting amount, subtitle text, sound, how long it stays, click to skip>
```

Tips for the best result:
- **Sharpness comes from the picture's size.** Send the biggest version you have (2000 px wide or more is ideal). A
  small or screenshotted picture is upscaled with Real-ESRGAN first, which helps, but a big original is better.
- **Best of all: the parts as separate layers** (a PSD, or one transparent PNG per part, all the same canvas size).
  Then nothing has to be cut out or filled in behind the parts, and they are pixel-perfect.
- Parts that overlap a lot in the picture (a wing behind a ghost) still work: the hidden area is filled in, but a
  separate layer is cleaner.
- Moves are solid: a part turns, slides, squashes and fades. For a real pose change (an arm waving, a head turning)
  send 2 to 6 drawings of the poses.

## B. Sprite sheet (fixed frames)

```
Make a sprite sheet from this picture: <attach it, or give the path>

WHAT IT IS
- Subject: <e.g. the witch symbol / the Lich King cheering>
- Used for: <idle loop behind the reels, symbol, banner, button ...>
- Shown at about: <size on screen, e.g. 600 px wide on desktop>

TIMING
- Loop or once: <loop / once (an intro that ends on the last frame) / both: intro, then a loop>
- Frames and speed: <100 frames at 24 fps = about 4 seconds / other>

MOVEMENT (most important first)
- <part>: <how it moves> e.g. "robe: flutters gently in a wind from the left"
- <part>: <how it moves> e.g. "skull eyes: green glow pulses twice per loop"
- Must stay still: <e.g. the text, the feet, the frame border>

EFFECTS
- Light: <glow colour and where, a shine sweeping across, light rays behind ...>
- Particles: <embers / sparkles / ghostly wisps, colour, in front or behind>
- Intro (once only): <pops in / drops in / fades in, shake on landing ...>

LOOK
- Mood: <e.g. spooky but fun, energetic, slow and creepy>
- Background: <keep transparent (default) / keep the picture's background>

OUTPUT
- Frame size: <default 512 px longest side; win titles 640>
- Grid: <10 x 10 (default)>
- Also put it into the game: <yes, where / no, only the sheet>
```

Tips:
- A PNG with a transparent background gives the cleanest edges. Otherwise the background is cut out automatically.
- A sheet is a fixed size: shown bigger than its frames it gets blurry, and big sheets are heavy (several MB).
  For anything shown large, template A is sharper and much smaller.
