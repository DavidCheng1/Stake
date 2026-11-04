"""Builds the two images of the phone (portrait) control panel from the game's own art.

  hud-bg.webp   the crypt scene behind the controls: the background's two side wings (the gargoyle
                pillar on the left, the ruins and chains on the right), which a phone crops away above,
                joined in the middle by a soft fog seam. Cut above the painted dashboard.
  bb-logo.webp  the Maestro Studios logo, small, for the round Buy Bonus button.

Run: python tools/make_phone_assets.py   (needs Pillow; rerun after bg.webp or studio-logo.webp changes)
"""
from pathlib import Path
from PIL import Image, ImageFilter

A = Path(__file__).resolve().parent.parent / "ghost-duels-web" / "assets"


def hud_bg():
    src = Image.open(A / "bg.webp").convert("RGB")  # art units below: the 1024x572 layout grid
    k = src.width / 1024
    h = int(468 * k)  # stop above the painted dashboard
    left = src.crop((0, 0, int(208 * k), h))  # left of the torch on the reel frame
    right = src.crop((int(842 * k), 0, src.width, h))  # right of the frame's brick base
    ov = int(64 * k)
    w = left.width + right.width - ov
    base = Image.new("RGB", (w, h)); base.paste(left, (0, 0))
    over = Image.new("RGB", (w, h)); over.paste(right, (left.width - ov, 0))
    m = Image.new("L", (w, h), 0); m.paste(255, (left.width, 0, w, h))
    m.paste(Image.linear_gradient("L").rotate(90, expand=True).resize((ov, h)), (left.width - ov, 0))  # 0 -> 255, left to right
    out = Image.composite(over, base, m)
    # fog over the seam: a blurred copy tinted towards the scene's mist green, in a soft vertical band
    fog = Image.blend(out.filter(ImageFilter.GaussianBlur(11 * k)), Image.new("RGB", (w, h), (60, 120, 110)), .25)
    band = Image.new("L", (w, h), 0)
    cx, bw = left.width - ov // 2, int(70 * k)
    band.paste(255, (cx - bw // 2, 0, cx + bw // 2, h))
    out = Image.composite(fog, out, band.filter(ImageFilter.GaussianBlur(bw / 3)))
    out.save(A / "hud-bg.webp", quality=80, method=6)
    print("hud-bg.webp", out.size)


def bb_logo():
    im = Image.open(A / "studio-logo.webp").convert("RGBA")
    im = im.resize((420, round(420 * im.height / im.width)), Image.LANCZOS)
    im.save(A / "bb-logo.webp", quality=88, method=6)
    print("bb-logo.webp", im.size)


if __name__ == "__main__":
    hud_bg()
    bb_logo()
