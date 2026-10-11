"""Image-generator prompts for the garden's plant life-cycle strips (sprout, young, mature, dying, dead).

    python art/tools/prompts/build.py

Writes art/tools/out/prompts/: index.html (page.html with the prompts filled in), data.json and
refs/<key>.png, each plant's reference sprite. Open index.html, or host that folder as a web page.
Plants are listed in plants.py; a plant whose strip is already in art/stages/ starts ticked as done.
"""
import json, os, sys, html
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from frames import var, mature                 # the built catalog and frames: run scripts/build_assets.py first
from plants import PLANTS, SKIPPED, COVERED, REDO, NEW_ITEMS, SHEET40, NEW_PLANTS, NEW_SHOP, SHEET40_REFS
import numpy as np
from collections import deque
PLANTS = PLANTS + SHEET40 + NEW_PLANTS
NEW_ITEMS = {**NEW_ITEMS, **NEW_SHOP}
SHEET40_KEYS = {p[0] for p in SHEET40}

def sheet40_mature(col, y0, y1):
    """The mature (3rd) frame of one plant on the 40-plant sheet, its glowing background keyed out."""
    a = np.asarray(Image.open(os.path.join(REPO, "art/stages/sheet40.png")).convert("RGB")).astype(int)
    x0 = [0, 310, 620, 928, 1236][col]
    c = a[y0:y1, x0 + 8:x0 + 302]
    H, W, _ = c.shape
    bg = np.zeros((H, W), bool); q = deque()
    for y in range(H):
        for x in (0, W - 1): bg[y, x] = 1; q.append((y, x))
    for x in range(W):
        for y in (0, H - 1): bg[y, x] = 1; q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < H and 0 <= nx < W and not bg[ny, nx] and np.abs(c[ny, nx] - c[y, x]).sum() <= 10:
                bg[ny, nx] = 1; q.append((ny, nx))
    fg = ~bg
    # the mature frame sits under its "Mature" label, centred about 149 px into the column
    sx0, sx1 = 149 - 36, 149 + 36
    win = np.zeros_like(fg)
    win[:, sx0 - 6:sx1 + 6] = fg[:, sx0 - 6:sx1 + 6]
    # only the frame itself: the largest connected shape in the window, not slivers of its neighbours
    lab = np.zeros(fg.shape, int); best = None
    for y0_, x0_ in zip(*np.nonzero(win)):
        if lab[y0_, x0_]: continue
        n = lab.max() + 1; q = deque([(y0_, x0_)]); lab[y0_, x0_] = n; pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < H and 0 <= nx < W and win[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n; q.append((ny, nx))
        if best is None or len(pts) > len(best): best = pts
    keep = np.zeros_like(fg)
    for y, x in best: keep[y, x] = True
    xs_ = np.nonzero(keep.any(0))[0]; sx0, sx1 = xs_.min(), xs_.max() + 1
    rgba = np.dstack([c, keep * 255]).astype(np.uint8)[:, sx0:sx1]
    ys = np.nonzero(keep[:, sx0:sx1].any(1))[0]
    return Image.fromarray(rgba[ys.min():ys.max() + 1], "RGBA")


HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(HERE, "..", "out", "prompts")           # publish this folder: index.html + refs/

src = open(os.path.join(REPO, "catalog.js"), encoding="utf-8").read()
E = {e[0]: e for e in var(src, "KG_CATALOG")}
REMOVED = var(src, "KG_REMOVED")                  # key -> [name, English name, price]: the SKIPPED ones, out of the shop
plant_tabs = {"花", "やさい", "草木", "木", "はちうえ"}
all_plants = {k for k, e in E.items() if e[3] in plant_tabs}
listed = ({p[0] for p in PLANTS} | set(COVERED)) - (set(NEW_ITEMS) - set(E))   # less new plants not in the shop yet
assert all_plants == listed, (all_plants - listed, listed - all_plants)
assert {s[0] for s in SKIPPED} == set(REMOVED), set(REMOVED) ^ {s[0] for s in SKIPPED}

SEEDLING = "a tiny green seedling with two round seed leaves just out of the soil, about a quarter of the mature height."
DEAD_TREE = "a bare dead tree: grey-brown trunk and branches with no leaves, a few dry leaves on the ground."
S = {
 "flower": dict(
   sprout=SEEDLING,
   young="the plant about two-thirds grown, with fresh light-green leaves and closed green buds showing a hint of {y}.",
   mature="{m}, in full bloom: the fullest, healthiest frame.",
   dying="the mature plant in late autumn: same size, but stems drooping, leaves yellow, orange and brown with curled edges, flowers faded, wilted and hanging, a few petals and leaves fallen on the soil.",
   dead="dry, shrivelled brown stems collapsed over the soil; only browns and greyish tans, no petals left."),
 "leafy": dict(
   sprout=SEEDLING,
   young="the plant about two-thirds grown, with fresh light-green leaves.",
   mature="{m}: the fullest, healthiest frame.",
   dying="the mature plant in late autumn: same size, but drooping, leaves turning yellow, rust and brown with curled edges, a few dead leaves on the soil.",
   dead="dry, shrivelled brown leaves and stems collapsed over the soil."),
 "fungus": dict(
   sprout="a tiny pale mushroom button just breaking through the soil.",
   young="small mushrooms about two-thirds grown, caps still round and closed.",
   mature="{m}, caps fully open: the fullest, healthiest frame.",
   dying="the same mushrooms slumping, caps curled up at the edges, faded and browning, one leaning over.",
   dead="shrivelled, dark-brown collapsed mushroom remains on the soil."),
 "fruitbush": dict(
   sprout=SEEDLING,
   young="a smaller bush, about two-thirds grown, with fresh light-green leaves, small white blossoms and {y}.",
   mature="{m}, berries ripe: the fullest, healthiest frame.",
   dying="the mature bush in late autumn: same size, leaves yellow, orange and brown and thinning, a few shrivelled berries left, fallen leaves and berries on the soil.",
   dead="a bare, dry, brown twiggy bush with no leaves or berries."),
 "veg": dict(
   sprout=SEEDLING,
   young="{y}",
   mature="{m}, ready to harvest: the fullest, healthiest frame.",
   dying="the mature plant in late autumn: same size, outer leaves wilted, yellow and brown, flopping onto the soil.",
   dead="a collapsed heap of dry, brown, shrivelled leaves on the soil."),
 "bush": dict(
   sprout=SEEDLING,
   young="a smaller bush, about two-thirds of the mature size, with fresh light-green leaves.",
   mature="{m}: the fullest, healthiest frame.",
   dying="the mature bush in late autumn: same size, leaves yellow, orange and brown, thinning out, fallen leaves on the soil.",
   dead="a bare, dry, brown twiggy bush with no leaves, a few dry leaves on the soil."),
 "bamboo": dict(
   sprout="a single short green bamboo shoot with a pointed tip, poking out of the soil.",
   young="three thin green bamboo canes about half the mature height, with a few leaves.",
   mature="{m}: the fullest, healthiest frame.",
   dying="the same grove in late autumn: canes turning yellow, leaves yellow-brown and dropping, fallen leaves on the soil.",
   dead="dry, pale-tan canes, some cracked and leaning, no leaves."),
 "bamboolog": dict(
   sprout="the log alone with one short green bamboo shoot with a pointed tip poking out of the soil behind it.",
   young="three thin green bamboo canes about half the mature height behind the log, with a few leaves.",
   mature="{m}: the fullest, healthiest frame.",
   dying="the same grove in late autumn behind the same log: canes turning yellow, leaves yellow-brown and dropping, a few fallen leaves on the log and the soil.",
   dead="dry, pale-tan canes behind the log, some cracked and leaning, no leaves, dry leaves on the log."),
 "topiary": dict(
   sprout="a tiny evergreen seedling, a little tuft of needles on a short stem.",
   young="a small young evergreen shrub, about half the mature height, loosely shaped.",
   mature="{m}: the fullest, healthiest frame.",
   dying="the same shape gone patchy: needles browning in patches, ragged overgrown edges, dry bits on the soil.",
   dead="a dry, rusty-brown, ragged husk of the shape with bare twigs showing through."),
 "tree": dict(
   sprout="a small sapling seedling with two or three leaves, about one-eighth of the mature height.",
   young="a young tree about half the mature height, with a thin trunk and a small crown.",
   mature="{m}: the fullest, healthiest frame.",
   dying="the mature tree in late autumn: same size, leaves yellow, orange and brown, crown thinning, fallen leaves on the ground.",
   dead=DEAD_TREE),
 "evergreen": dict(
   sprout="a tiny fir seedling, a little tuft of needles on a short stem.",
   young="a young fir about half the mature height, a small neat cone.",
   mature="{m}: the fullest, healthiest frame.",
   dying="the mature fir with its needles turning rusty orange-brown, branches thinning and drooping, needles on the ground.",
   dead="a dead fir: grey trunk with brittle, bare, broken branches and a few clumps of brown needles."),
 "palm": dict(
   sprout="a small palm seedling with two or three narrow leaves.",
   young="a young palm about half the mature height, with a short trunk and a few fronds.",
   mature="{m}: the fullest, healthiest frame.",
   dying="the mature palm with fronds yellowing and browning, the lower fronds hanging down limp.",
   dead="a bare grey-brown trunk with a few dry brown fronds hanging from the top."),
 "bonsai": dict(
   sprout="a tiny seedling in the tray's soil.",
   young="a small young bonsai with a thin trunk and a few small foliage pads.",
   mature="{m}: the fullest, healthiest frame.",
   dying="the foliage pads turning yellow-brown and thinning, needles fallen on the tray's soil.",
   dead="a bare, dry, grey-brown twisted trunk with no foliage."),
 "potted": dict(
   sprout="a tiny green seedling with two round seed leaves in the container's soil.",
   young="a smaller version of the plant, about two-thirds grown, with fresh light-green leaves.",
   mature="{m}: the fullest, healthiest frame.",
   dying="the plant drooping over the rim, leaves yellow and brown with curled edges, a few dead leaves on the soil.",
   dead="dry, shrivelled brown stems and leaves slumped in the container."),
 "hanging": dict(
   sprout="the same hanging container with a tiny green seedling in its soil.",
   young="a smaller plant, about half the mature trailing length, with fresh light-green leaves.",
   mature="{m}: the fullest, healthiest frame.",
   dying="the plant gone limp, leaves yellow and brown, strands thinning, a few dead leaves falling.",
   dead="dry, brittle brown strands hanging from the container."),
 "trailing": dict(
   sprout="one short ivy shoot with two or three small leaves hanging from the top edge.",
   young="a few strands of ivy about half the mature length, fresh light-green leaves.",
   mature="{m}: the fullest, healthiest frame.",
   dying="strands thinning, leaves turning red, yellow and brown, a few leaves falling.",
   dead="bare, dry brown stems hanging down with a couple of shrivelled leaves."),
}
GROUND = "Each frame stands on a small oval mound of dark-brown soil, the same size in every frame."
CONTAINER = "The container is identical in every frame: same size, same position. Only the plant changes. No soil mound."
BASE = "Every frame uses the same scale and stands on the same ground line, 60 px above the bottom edge."
TOP = "Every frame uses the same scale and hangs from the same point: the top of the hanger sits 60 px below the top edge in every frame."

def prompt(key, name, kind, H, m, ov):
    st = dict(S[kind])
    y = ov.get("young", "")
    for k in ("sprout", "dying", "dead"):
        if k in ov:
            st[k] = ov[k]
    if kind in ("flower",) and y and len(y.split()) > 3:
        st["young"] = f"the plant about two-thirds grown, with fresh light-green leaves and {y}."
    elif kind in ("flower", "fruitbush", "veg"):
        st["young"] = st["young"].format(y=y)
    elif y:
        st["young"] = y
    st["mature"] = st["mature"].format(m=m)
    cap = lambda s: s[0].upper() + s[1:]
    hang = kind in ("hanging", "trailing")
    anchor = TOP if hang else BASE
    holder = ("The hollow log is identical in every frame: same size, same position, a reddish-brown log with bark and a dark hollow end facing the viewer, lying across the front of a small oval mound of dark-brown soil. Only the bamboo behind it changes." if kind == "bamboolog" else
              CONTAINER if kind in ("potted", "bonsai", "hanging") else
              "There is no pot or soil mound; the ivy hangs from a thin top edge." if kind == "trailing" else GROUND)
    return f"""Game sprite sheet: the life cycle of a {name.lower()} in 5 frames, from sprout to dead.

Canvas: 1536 × 1024 px PNG with a transparent background (a real alpha channel). No checkerboard pattern, no background colour, no glow or vignette, no ground shadow outside the {'container' if kind in ('potted','bonsai','hanging') else 'soil'}, no text or labels. If transparency is impossible, fill the whole background with one flat colour, #FF00FF, with no gradient or glow.

Layout: one row of 5 frames, left to right, each centred in its own fifth of the canvas (columns about 307 px wide). Frames never touch or overlap; falling leaves and petals stay inside their own column. {anchor} The mature frame is about {H} px tall and at most 290 px wide; if it would be wider, shrink all five frames equally.

Style: match the attached style reference sheet. Cute, detailed pixel art for a cozy farming game: crisp square pixels, a dark brown-black outline around every shape, rich saturated colours with 3–4 shading steps, light from the top left, three-quarter front view. No blur, no painterly brushwork. {holder}

Frames:
1. Sprout: {cap(st['sprout'])}
2. Young: {cap(st['young'])}
3. Mature: {cap(st['mature'])}
4. Dying (late autumn): {cap(st['dying'])}
5. Dead: {cap(st['dead'])}

The mature frame should look like the attached reference sprite."""

os.makedirs(os.path.join(OUT, "refs"), exist_ok=True)
items = []
for key, name, group, kind, H, m, ov in PLANTS:
    if key in SHEET40_REFS:
        # not sold yet: its mature frame on the 40-plant sheet, for its look only
        jp, price = NEW_ITEMS[key]
        ref = sheet40_mature(*SHEET40_REFS[key])
        ref = ref.resize((ref.width * 3, ref.height * 3), Image.NEAREST)
    elif key in NEW_ITEMS:
        # no current sprite: the mature apple tree from the tree sheet, for its look only
        jp, price = NEW_ITEMS[key]
        sheet = Image.open(os.path.join(REPO, "art/stages/old/trees_smooth.png")).convert("RGBA")
        ref = sheet.crop((292, 14, 506, 286))
    else:
        # its picture in the game: the mature frame once its strip is in, else the sheet sprite
        jp, price = E[key][1], E[key][4]
        ref, _ = mature(key, 1)
        ref = ref.resize((ref.width * 3, ref.height * 3), Image.NEAREST)
    ref.save(os.path.join(OUT, "refs", key + ".png"))
    text = prompt(key, name, kind, H, m, ov)
    if key in NEW_ITEMS:
        text = text.replace("The mature frame should look like the attached reference sprite.",
                            ("The attached reference shows what the mature plant should look like; copy its shape and colours, but draw it in the detailed pixel-art style of the style reference sheet, not as a simple glossy icon."
                             if key in SHEET40_REFS else
                             "The attached reference shows what the mature tree should look like; copy its shape and colours, but draw it in the pixel-art style of the style reference sheet, not smooth."))
    note = ("New" + ("" if key in E else ": not in the shop yet") + " (" + NEW_ITEMS[key][0] + ", " + str(NEW_ITEMS[key][1]) + ")"
            if key in NEW_SHOP
            else "Redo: replaces the simpler version from the 40-plant sheet" if key in SHEET40_KEYS
            else "Redo: was left out as a decoration; now gets a life cycle in the new style" if key == "bamboo_log"
            else "Redo: replaces the smooth version from the tree sheet" if key in REDO else "")
    if key == "bamboo_log":
        text = text.replace("the life cycle of a bamboo and log", "the life cycle of a bamboo grove growing behind a hollow log")
    have = os.path.exists(os.path.join(REPO, "art/stages", key + ".png"))
    items.append(dict(key=key, name=name, jp=jp, group=group, price=price, note=note, prompt=text, have=have))
skipped = [dict(key=k, name=n, jp=REMOVED[k][0], why=wy) for k, n, wy in SKIPPED]
data = dict(items=items, skipped=skipped, covered=[E[k][1] for k in COVERED])
json.dump(data, open(os.path.join(OUT, "data.json"), "w", encoding="utf-8"), ensure_ascii=False)
page = open(os.path.join(HERE, "page.html"), encoding="utf-8").read()
a = page.index("const DATA = ")
b = page.index(";\n", a)
page = page[:a] + "const DATA = " + json.dumps(data, ensure_ascii=False) + page[b:]
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page)
print(len(items), "prompts,", sum(i["have"] for i in items), "already have a strip; wrote", os.path.normpath(OUT))
