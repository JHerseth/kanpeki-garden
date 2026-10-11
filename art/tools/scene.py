"""Mockup of the stage art on the garden background, at game size.

    python scripts/build_assets.py && python art/tools/scene.py

Writes the scenes to art/tools/out/mockup/. The mockup page is garden_mockup.html; publish it with
those images next to it.
"""
import os
from PIL import Image
from frames import frames, mature, REPO

S, Y, M, D, X = 0, 1, 2, 3, 4      # sprout, young, mature, dying, dead
# (key, stage, anchor x, anchor y) on the 2000 x 1116 background
MIXED = [
  # left beds: lettuce and napa growing
  ("lettuce", Y, 185, 532), ("lettuce", M, 255, 532), ("lettuce", M, 325, 532),
  ("napa", S, 180, 645), ("napa", Y, 250, 645), ("napa", M, 325, 645),
  # small beds
  ("pansy", M, 555, 535), ("tulip_yellow", Y, 668, 535), ("tulip_yellow", M, 715, 535),
  ("rose_pink", S, 535, 645), ("nemophila", S, 580, 645),
  # top long bed: flowers in bloom
  ("rose_pink", M, 800, 428), ("marguerite", M, 855, 428), ("phlox", M, 910, 428), ("viola", M, 965, 428),
  # middle long bed
  ("buttercup", M, 795, 538), ("nemophila", M, 850, 538), ("wildflower", M, 905, 538), ("hibiscus", M, 965, 538),
  # bottom long bed: neglected
  ("hydrangea", D, 800, 648), ("lupine", D, 860, 648), ("violet", X, 915, 648), ("pansy", X, 965, 648),
  # tall bed: berry bushes
  ("blueberry", M, 1060, 560), ("berry_red", Y, 1060, 650),
  # right small bed
  ("clover4", M, 1165, 535), ("violet", M, 1215, 535),
  # wild corners
  ("fiddlehead", M, 150, 250), ("fiddlehead", Y, 205, 262), ("ivy_sprig", M, 600, 262),
  ("mushroom_orange", M, 720, 975), ("moss", M, 640, 990), ("lupine", M, 140, 860), ("hydrangea", M, 1460, 900),
  ("marguerite", D, 1540, 905), ("buttercup", Y, 470, 880),
  # trees
  ("apple", M, 1560, 410), ("sakura", M, 1790, 385), ("maple", M, 300, 1085),
  ("pear_tree", Y, 600, 1095), ("orange_tree", S, 1300, 1060),
]
DECOR = [("gnome", 1250, 690), ("lantern", 1335, 560), ("watering_can2", 455, 660), ("birdbath", 1150, 880)]

cache = {}
def frame(key, st):
    if key not in cache: cache[key] = frames(key)
    return cache[key][st]

def render(plants, path):
    bg = Image.open(os.path.join(REPO, "art/background.jpg")).convert("RGBA")
    items = []
    for key, st, x, y in plants:
        im, (ax, ay) = frame(key, st)
        items.append((y, im, round(x - ax), round(y - ay)))
    for key, x, y in DECOR:
        im, (ax, ay) = mature(key)
        items.append((y, im, round(x - ax), round(y - ay)))
    for _, im, x, y in sorted(items, key=lambda t: t[0]):
        bg.alpha_composite(im, (x, y))
    bg.convert("RGB").save(path, quality=88)
    return bg

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "mockup")
os.makedirs(OUT, exist_ok=True)
full = render(MIXED, os.path.join(OUT, "mixed.webp"))
full.crop((1250, 60, 2000, 460)).convert("RGB").save(os.path.join(OUT, "trees_close.webp"), quality=90)
render([(k, M, x, y) for k, st, x, y in MIXED], os.path.join(OUT, "mature.webp"))
render([(k, X if i % 3 == 2 else D, x, y) for i, (k, st, x, y) in enumerate(MIXED)], os.path.join(OUT, "neglected.webp"))
full.crop((100, 330, 1300, 700)).convert("RGB").save(os.path.join(OUT, "closeup.webp"), quality=90)
print("wrote", OUT)
