# Total Win: the brief (template A, filled in)

```
Animate this picture in parts and put it into the game: emblem.png (cut from the TOTAL WIN mockup)

WHAT IT IS
- Subject: the TOTAL WIN emblem: plaque with the title, bat wings, devil head, cape, two crosses, two ghosts
- Used for: total win screen after the free spins
- Colours: bring into the game's palette: violet wings and cape, silver stone frame, gold letters,
  dark teal plaque with teal glowing runes, mint ghosts, lavender crosses with green gems, green eyes

PARTS AND HOW THEY MOVE
- plaque (with the letters, vines and candles): loop still; intro pops in first and lands with a squash
- wings: loop slow full beats from the shoulders (2 per loop); intro unfold from folded, with overshoot
- devil head: loop bobs a little; intro drops in with a bounce, eyes flare when it lands
- cape: loop sways; intro unrolls downwards
- crosses: loop swing like pendulums; intro swing in and settle (elastic)
- ghosts: loop bob, tilt and squash; intro fly in from the sides, tilted into the flight
- Must stay still: the letters

ORDER OF THE INTRO
- plaque, wings, devil, cape, ghosts, crosses last; intro 3.3 s, loop 4.2 s

EFFECTS
- Glow: devil eyes pulse green; candle flames flicker; the gold letters pulse warm; white flash at the landing
- Shine: one sweep across the plaque per loop
- Sparkles: 16 warm sparkles; rays, aura and embers from the game

IN THE GAME
- When: after free spins with a win
- With it: the amount counts up, "N free spins played · X× bet", fanfare, click or turbo skips
```

How it was made:

1. `clean.json`: the silhouette is cut at the outer black outline and the red glow of the mockup is peeled off;
   the devil's lit dome, the right candle and the cape are kept whole (no full outline of their own); five pockets
   of glow enclosed by the art are dropped.
2. `recolor.json`: gradient maps by brightness per part and colour class (letters are found as whole areas between
   outlines), so the shading stays and no hue seams appear.
3. `rig.json`: the parts (GrabCut seeds), then the cuts snapped onto the outlines; tracks per part, and `web` for the
   effects and timing in the browser.
4. `py tools\sprites\rig.py export examples\total-win\emblem.png examples\total-win\rig.json --out <folder>`
   redraws everything at 3x with crisp outlines and writes `atlas.webp` (all parts on one sheet) and `rig.json`
   for `ghost-duels-web/rigplayer.js`.
