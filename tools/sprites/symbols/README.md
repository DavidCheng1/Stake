# Character win rigs

When a character symbol (devil, pirate, witch, blue) wins, its parts move: the rig plays over the still symbol for
1.4 s (`playSymRig` in game.js) and the still picture comes back after it.

- `<id>.webp`: the clean picture (512 px, no halo; the symbol files in assets have their halo painted in).
- `<id>.json`: the parts (rect, fg/bg seeds, pivot, z), the body's `core`, and the win motion as `intro` tracks.

Check the cut, then export to the game:

```
math-sdk\env\Scripts\python.exe tools\sprites\rig.py split tools\sprites\symbols\devil.webp tools\sprites\symbols\devil.json --out <folder>
math-sdk\env\Scripts\python.exe tools\sprites\rig.py export tools\sprites\symbols\devil.webp tools\sprites\symbols\devil.json --out ghost-duels-web\assets\sym-rigs\devil --scale 1
```

`web.pad` (0.2) is the room around the symbol the parts may swing into; the game sizes the canvas from it. The rig
tool needs OpenCV (`pip install opencv-python-headless` in math-sdk's environment).
