#!/usr/bin/env python3
"""Build the garden game's media from the art in art/:

    python scripts/build_assets.py

    art/sprites.png       sprite sheet with transparency (1678x937)
    art/stages/<key>.png  one plant's life cycle as a strip of frames (Git LFS)
    art/decor/<key>.png   a decoration that isn't on the sheet, as one picture (Git LFS)
    art/background.jpg    garden map (2000x1116)
 -> media/_garden_sprites<n>.webp   every frame packed in atlases of at most ATLAS_MAX px a side
    media/_garden_bg.webp
    catalog.js                   KG_CATALOG: per item its shop data and frames (format in the file),
                                        KG_REMOVED: {key: [name, price]} for items taken out of the shop
    art/removed/<key>.png        the crops of those items, kept as a backup (rewritten only if their pixels change)
    media/_garden.js             catalog.js + KG_VERSION + garden.js, the file the card templates load

    python scripts/build_assets.py --js   # only rebuild _garden.js after editing garden.js

Either build's _garden.js says KG_VERSION = "dev"; scripts/release.py stamps a release's version in (VERSION_DEV).

Sprites are the opaque regions of the sheet. Where two touch (a hanging pot's string reaching
the flower above, a tree's shadow), they are split along the sheet's rows or the CUTS below.
Each catalog entry names the centre of its sprite; the bamboo grove is six stalk pieces, joined.
The sheet is drawn smaller than the background, so the game draws sprites at SCALE.

A plant with a strip in art/stages/ gets the strip's frames instead of its sheet sprite:
growth frames, then dying and dead, left to right (STRIP_FRAMES frames unless FRAME_COUNT says
otherwise). The strip is split into its largest shapes, not at empty columns, as neighbouring frames
overlap in x; smaller loose pieces (falling petals and leaves) go to the nearest frame. Each frame is
anchored at the bottom centre of its soil mound or pot (a trailing strand may hang below), or at the
hook of a hanging plant, and all frames of a plant share one scale: the mature frame's height is GROW x
the sheet sprite's, or for a potted plant the pot is as wide as on the sheet (POT_W). Plants without
a strip stay in the catalog with their sheet sprite, so one the player owns still shows, but are not sold.

A decoration with a picture in art/decor/ is one frame: every opaque piece of it (loose leaves
too), anchored at the bottom centre of its ground patch and scaled to DECOR_W garden pixels wide.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(REPO, "art")
STAGES = os.path.join(ART, "stages")
DECOR = os.path.join(ART, "decor")
OUT = REPO
MEDIA = os.path.join(OUT, "media")

BANDS = [0, 94, 188, 283, 375, 470, 567]                 # rows of the top grid on the sheet
CUTS = [(990, 1150, 567, 752), (1260, 1360, 567, 827)]   # x0, x1, below y, cut y: palm | basin, lantern | well
# Sprites on the sheet left out on purpose, as near-copies of another:
# second hanging ivy, second bluebell, second small purple flower
SKIP = [(575, 234), (580, 51), (1612, 53)]
SCALE = 1.19                                             # sheet pixels -> background pixels
# Taken out of the shop because they have no growth-stage art. They stay in CATALOG
# so the sheet still accounts for every sprite; their crops are kept in art/removed/, and the game
# refunds any the player already owns (KG_REMOVED).
REMOVED = {"tomato_ripe", "carrot_bed", "radish_bed", "potato_bed", "potato_plant", "grass_tall2",
           "monstera_small", "sprout_pot", "sprout_pot2", "seedling_box", "seed_tray"}

# Stage strips. Plants are the items in these tabs; かざり holds decorations and tools.
PLANT_TABS = {"花", "はちうえ", "やさい", "草木", "木"}
STRIP_FRAMES = 5                 # frames in a strip: 3 growth (sprout, young, mature), dying, dead
FRAME_COUNT = {}                 # key -> frames, for a strip with another number of growth frames
GROW = 1.1                       # a mature frame is this x the sheet sprite's height
# No sheet sprite: size it like this one, a plant of the same kind and price
SIZE_AS = {"apple": "pear_tree",
           "marigold": "buttercup",        # a bushy little flower, 20
           "primrose": "pansy",            # flowers on a low rosette of leaves, 20
           "forget_me_not": "nemophila",   # a low clump of small blue flowers, 20
           "cotton": "hibiscus",           # a flowering shrub, 50
           "chili": "eggplant",            # a fruiting bush of the same family, 100
           "zucchini": "pumpkin",          # a sprawling squash, 100
           "grape_vine": "tomato"}         # a climber on its support, 100
HANGING = {"hang_fern", "hang_ivy", "hang_spider", "basket", "ivy_hanging"}   # anchored at the top
# Hanging, but no hook, and leaves stick up above the stems so the top edge moves (by up to 37 px): these
# keep the rows they were drawn on, where every frame's stems start on one line.
HOOKLESS = {"ivy_hanging"}
# Potted plants are scaled by their pot, not their height: the width of the pot (its rim, or the tray,
# box, bowl or glass) on the sheet, measured by eye where leaves hide part of it. The strip's pot is
# the widest row of its first frame, where the sprout hides nothing.
POT_W = {"aloe": 60, "cactus": 59, "flytrap": 49, "jade": 63, "pot_fern": 54, "pot_leafy": 56, "pot_palm": 54,
         "pot_spiky": 65, "pot_yellow": 57, "snake_plant": 59, "succulent": 62, "flower_bowl": 88,
         "flowerbox": 93, "planter_white": 88, "terrarium": 73, "bonsai": 76,
         "hang_fern": 52, "hang_ivy": 46, "hang_spider": 48, "basket": 75}
# Scaled by pot width, the hanging baskets come out up to twice as tall as their sheet sprites (long cords,
# trailing leaves): they get this x their pot-width scale.
POT_SCALE = {"basket": 0.75, "hang_fern": 0.75, "hang_ivy": 0.75, "hang_spider": 0.75}
# Decorations from their own picture: width in the garden (background pixels), chosen by eye for each
DECOR_W = {"bench": 180}         # ~105 tall: the seat at about the gnome's waist
ATLAS_MAX = 2048                 # px a side, well inside what phone WebViews take as one texture

# Prices by size: 20 small flowers, clover, mushrooms, small things ·
# 50 big flowers, pots, hanging plants · 100 vegetables, bushes, hedges, bamboo, ferns · 200 trees.
# Decorations and tools are priced by size on the same scale.
CATALOG = [
    # key, name, shop tab, price, centre of the sprite on the sheet
    ("rose_pink", "ピンクのバラ", "花", 20, [(57, 53)]),
    ("rose_red", "赤いバラ", "花", 20, [(163, 51)]),
    ("tulip_yellow", "黄色いチューリップ", "花", 20, [(266, 53)]),
    ("dandelion", "タンポポ", "花", 20, [(368, 49)]),
    ("bluebell", "ブルーベル", "花", 20, [(475, 51)]),
    ("lavender", "ラベンダー", "花", 20, [(682, 49)]),
    ("daisy", "デイジー", "花", 20, [(784, 51)]),
    ("marguerite", "マーガレット", "花", 20, [(884, 51)]),
    ("tulip_orange", "オレンジのチューリップ", "花", 20, [(988, 54)]),
    ("pansy", "パンジー", "花", 20, [(1090, 53)]),
    ("clover", "クローバー", "花", 20, [(1195, 49)]),
    ("violet", "スミレ", "花", 20, [(1299, 52)]),
    ("mushroom_orange", "キノコ", "花", 20, [(1405, 51)]),
    ("wildflower", "のはらの花", "花", 20, [(1509, 49)]),
    ("phlox", "フロックス", "花", 50, [(59, 143)]),
    ("nemophila", "ネモフィラ", "花", 20, [(164, 144)]),
    ("buttercup", "キンポウゲ", "花", 20, [(269, 143)]),
    ("clover4", "よつばのクローバー", "花", 20, [(367, 145)]),
    ("viola", "ビオラ", "花", 50, [(475, 143)]),
    ("pansy_purple", "むらさきのパンジー", "花", 20, [(582, 144)]),
    ("poppy", "ポピー", "花", 20, [(682, 146)]),
    ("lily", "ユリ", "花", 50, [(785, 144)]),
    ("heather", "ヒース", "花", 50, [(884, 142)]),
    ("fiddlehead", "ゼンマイ", "花", 20, [(989, 146)]),
    ("ivy_sprig", "ツタ", "花", 20, [(1091, 142)]),
    ("moss", "コケ", "花", 20, [(1197, 143)]),
    ("shiitake", "シイタケ", "花", 20, [(1305, 146)]),
    ("amanita", "ベニテングタケ", "花", 20, [(1407, 143)]),
    ("onion", "タマネギ", "やさい", 100, [(1510, 142)]),
    ("grass_tuft", "くさ", "花", 20, [(1614, 145)]),
    ("marigold", "マリーゴールド", "花", 20, []),   # stage art only
    ("primrose", "サクラソウ", "花", 20, []),       # stage art only
    ("forget_me_not", "ワスレナグサ", "花", 20, []),  # stage art only
    ("hydrangea", "アジサイ", "花", 50, [(60, 234)]),
    ("sunflower", "ヒマワリ", "花", 50, [(165, 234)]),
    ("lupine", "ルピナス", "花", 50, [(269, 235)]),
    ("hibiscus", "ハイビスカス", "花", 50, [(372, 235)]),
    ("cotton", "ワタ", "花", 50, []),               # stage art only
    ("ivy_hanging", "たれさがるツタ", "はちうえ", 50, [(477, 233)]),
    ("basket", "花のつりかご", "はちうえ", 50, [(681, 235)]),
    ("sprout_pot", "めが出たはち", "はちうえ", 50, [(783, 242)]),
    ("sprout_pot2", "ふたばのはち", "はちうえ", 50, [(884, 241)]),
    ("flowerbox", "花のプランター", "はちうえ", 50, [(991, 236)]),
    ("cactus", "サボテン", "はちうえ", 50, [(1094, 236)]),
    ("aloe", "アロエ", "はちうえ", 50, [(1197, 239)]),
    ("succulent", "たにくしょくぶつ", "はちうえ", 50, [(1302, 243)]),
    ("jade", "カネノナルキ", "はちうえ", 50, [(1406, 237)]),
    ("snake_plant", "サンスベリア", "はちうえ", 50, [(1509, 238)]),
    ("leafy_bush", "はっぱのしげみ", "草木", 100, [(1615, 236)]),
    ("pot_leafy", "はちうえの木", "はちうえ", 50, [(57, 327)]),
    ("pot_yellow", "黄色い花のはち", "はちうえ", 50, [(162, 329)]),
    ("hang_ivy", "ツタのつりばち", "はちうえ", 50, [(267, 328)]),
    ("pot_fern", "シダのはち", "はちうえ", 50, [(372, 327)]),
    ("hang_fern", "シダのつりばち", "はちうえ", 50, [(475, 325)]),
    ("pot_palm", "ヤシのはち", "はちうえ", 50, [(580, 327)]),
    ("hang_spider", "オリヅルラン", "はちうえ", 50, [(680, 327)]),
    ("pot_spiky", "とげとげのはち", "はちうえ", 50, [(781, 328)]),
    ("flytrap", "ハエトリソウ", "はちうえ", 50, [(885, 329)]),
    ("planter_white", "白いプランター", "はちうえ", 50, [(990, 325)]),
    ("flower_bowl", "花のボウル", "はちうえ", 50, [(1094, 328)]),
    ("seedling_box", "なえばこ", "はちうえ", 50, [(1199, 329)]),
    ("seed_tray", "なえのトレー", "はちうえ", 50, [(1305, 329)]),
    ("terrarium", "テラリウム", "はちうえ", 50, [(1407, 328)]),
    ("soil_bag", "土のふくろ", "かざり", 20, [(1509, 330)]),
    ("watering_can", "じょうろ", "かざり", 20, [(1615, 334)]),
    ("berry_red", "赤いみの木", "やさい", 100, [(59, 424)]),
    ("tomato", "トマト", "やさい", 100, [(160, 423)]),
    ("cabbage", "キャベツ", "やさい", 100, [(265, 423)]),
    ("pumpkin", "カボチャ", "やさい", 100, [(369, 423)]),
    ("carrot", "ニンジン", "やさい", 100, [(475, 423)]),
    ("strawberry", "イチゴ", "やさい", 100, [(581, 424)]),
    ("corn", "トウモロコシ", "やさい", 100, [(683, 422)]),
    ("eggplant", "ナス", "やさい", 100, [(785, 423)]),
    ("radish", "ラディッシュ", "やさい", 100, [(886, 423)]),
    ("lettuce", "レタス", "やさい", 100, [(988, 422)]),
    ("grass_tall", "くさむら", "草木", 100, [(1198, 424)]),
    ("monstera", "モンステラ", "草木", 100, [(1303, 424)]),
    ("monstera_small", "小さなモンステラ", "草木", 100, [(1404, 425)]),
    ("fern", "シダ", "草木", 100, [(1510, 423)]),
    ("banana_leaf", "バショウ", "草木", 100, [(1615, 423)]),
    ("blueberry", "ブルーベリー", "やさい", 100, [(57, 520)]),
    ("tomato_ripe", "まっかなトマト", "やさい", 100, [(160, 517)]),
    ("napa", "はくさい", "やさい", 100, [(265, 518)]),
    ("carrot_bed", "ニンジンばたけ", "やさい", 100, [(369, 522)]),
    ("radish_bed", "ラディッシュばたけ", "やさい", 100, [(475, 522)]),
    ("potato_bed", "ジャガイモばたけ", "やさい", 100, [(581, 517)]),
    ("potato_plant", "ジャガイモのめ", "やさい", 100, [(682, 518)]),
    ("wheat", "こむぎ", "やさい", 100, [(783, 515)]),
    ("shrub", "しげみ", "草木", 100, [(884, 521)]),
    ("potatoes", "ジャガイモ", "やさい", 100, [(989, 518)]),
    ("chili", "トウガラシ", "やさい", 100, []),     # stage art only
    ("zucchini", "ズッキーニ", "やさい", 100, []),  # stage art only
    ("grape_vine", "ブドウ", "やさい", 100, []),    # stage art only
    ("bamboo", "たけ", "草木", 100, [(1064, 422), (1092, 422), (1121, 422), (1064, 517), (1091, 517), (1120, 517)]),
    ("grass_tall2", "ながいくさ", "草木", 100, [(1198, 521)]),
    ("topiary", "うずまきの木", "草木", 100, [(1304, 518)]),
    ("cone_bush", "さんかくの木", "草木", 100, [(1403, 517)]),
    ("rose_bush", "バラのしげみ", "草木", 100, [(1508, 520)]),
    ("branches", "かれえだ", "かざり", 20, [(1616, 522)]),
    ("orange_tree", "オレンジの木", "木", 200, [(84, 691)]),
    ("sakura", "さくら", "木", 200, [(238, 689)]),
    ("maple", "もみじ", "木", 200, [(401, 687)]),
    ("pear_tree", "ナシの木", "木", 200, [(580, 686)]),
    ("apple", "りんごの木", "木", 200, []),       # stage art only
    ("fir", "モミの木", "木", 200, [(751, 680)]),
    ("willow", "ヤナギ", "木", 200, [(915, 672)]),
    ("palm", "ヤシの木", "木", 200, [(1067, 663)]),
    ("birch", "シラカバ", "木", 200, [(1201, 659)]),
    ("bonsai", "ぼんさい", "木", 200, [(1344, 665)]),
    ("bamboo_log", "たけとまるた", "草木", 100, [(1493, 658)]),
    ("stump", "きりかぶ", "かざり", 50, [(1616, 699)]),
    ("stone_basin", "いしのみずばち", "かざり", 100, [(1092, 796)]),
    ("stepping_stones", "とびいし", "かざり", 50, [(1200, 795)]),
    ("lantern", "ランタン", "かざり", 50, [(1300, 787)]),
    ("birdhouse", "とりのいえ", "かざり", 100, [(1403, 787)]),
    ("trellis", "トレリス", "かざり", 50, [(1506, 792)]),
    ("trellis_vine", "ツタのトレリス", "かざり", 100, [(1617, 792)]),
    ("wheelbarrow", "手おしぐるま", "かざり", 50, [(66, 871)]),
    ("watering_can2", "ブリキのじょうろ", "かざり", 20, [(163, 881)]),
    ("shovel", "スコップ", "かざり", 20, [(265, 874)]),
    ("trowel", "シャベル", "かざり", 20, [(364, 874)]),
    ("fence", "さく", "かざり", 20, [(464, 877)]),
    ("gate", "もん", "かざり", 50, [(575, 873)]),
    ("birdbath", "とりのみずあび", "かざり", 100, [(685, 868)]),
    ("gnome", "こびと", "かざり", 100, [(777, 870)]),
    ("bench", "ベンチ", "かざり", 100, []),         # own picture: art/decor/
    ("compost", "たいひばこ", "かざり", 50, [(884, 874)]),
    ("well", "いど", "かざり", 200, [(986, 851)]),
    ("hose", "ホース", "かざり", 20, [(1090, 883)]),
    ("firewood", "まき", "かざり", 20, [(1197, 883)]),
    ("well_small", "小さないど", "かざり", 100, [(1304, 875)]),
    ("shears", "せんていばさみ", "かざり", 20, [(1403, 877)]),
    ("seeds", "たねのふくろ", "かざり", 20, [(1503, 887)]),
    ("pond", "小さな池", "かざり", 100, [(1614, 888)]),
]


def label(mask):
    """Connected regions of a boolean image (4-neighbours) -> (labels, n): 1..n per region, 0 elsewhere.
    Joins runs of pixels row by row, so a whole strip takes a moment."""
    H = mask.shape[0]
    edge = np.diff(np.pad(mask, ((0, 0), (1, 1))).astype(np.int8), axis=1)
    ry, rs = np.nonzero(edge == 1)                 # runs [rs, re) on row ry, row by row, left to right
    re = np.nonzero(edge == -1)[1]
    first = np.searchsorted(ry, np.arange(H + 2)).tolist()
    rs, re = rs.tolist(), re.tolist()
    parent = list(range(len(rs)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for y in range(H - 1):                         # join the runs that touch a run on the next row
        a, a1, b, b1 = first[y], first[y + 1], first[y + 1], first[y + 2]
        while a < a1 and b < b1:
            if rs[a] < re[b] and rs[b] < re[a]:
                parent[root(a)] = root(b)
            if re[a] <= re[b]:
                a += 1
            else:
                b += 1
    ids = np.unique([root(i) for i in range(len(rs))], return_inverse=True)[1] + 1
    lab = np.zeros(mask.shape, np.int32)
    for y, x0, x1, i in zip(ry.tolist(), rs, re, ids.tolist()):
        lab[y, x0:x1] = i
    return lab, len(set(ids.tolist()))


def regions(lab, n):
    """Pixels of each labelled region -> [(ys, xs)] for labels 1..n."""
    ys, xs = np.nonzero(lab)
    ids = lab[ys, xs]
    order = np.argsort(ids, kind="stable")
    cut = np.searchsorted(ids[order], np.arange(1, n + 2))
    return [(ys[order[cut[i]:cut[i + 1]]], xs[order[cut[i]:cut[i + 1]]]) for i in range(n)]


def pieces(alpha):
    """Sprites on the sheet -> [((x0, y0, x1, y1), ys, xs)]: opaque regions with their pixels,
    split where two sprites touch."""
    out = []
    for ys, xs in regions(*label(alpha > 40)):
        if len(ys) < 600:
            continue
        side = np.searchsorted(BANDS, ys, side="right") if ys.max() < BANDS[-1] else np.zeros_like(ys)
        for x0, x1, below, cut in CUTS:
            if ys.min() >= below and xs.min() >= x0 - 20 and xs.max() <= x1 + 20:
                side = (ys >= cut).astype(int)
        # split only where both sides hold a real sprite; small overhangs stay put
        groups = [g for g in np.unique(side) if (side == g).sum() >= 600]
        if len(groups) <= 1:
            groups, side = [0], np.zeros_like(ys)
        for g in groups:
            m = side == g if len(groups) > 1 else np.ones_like(ys, bool)
            gy, gx = ys[m], xs[m]
            out.append(((int(gx.min()), int(gy.min()), int(gx.max()), int(gy.max())), gy, gx))
    return out


def sheet_sprites():
    """CATALOG -> {key: RGBA crop of its sprite on the sheet}, for every entry that has one."""
    rgba = np.asarray(Image.open(os.path.join(ART, "sprites.png")).convert("RGBA")).copy()
    rgba[..., 3] = np.where(rgba[..., 3] >= 235, 255, rgba[..., 3])   # the sheet's "opaque" is ~245
    found = pieces(rgba[..., 3])
    boxes = [b for b, _, _ in found]
    centre = [((x0 + x1) / 2, (y0 + y1) / 2) for x0, y0, x1, y1 in boxes]
    crops, used = {}, set()
    for key, name, tab, price, points in CATALOG:
        if not points:
            continue
        hit = set()
        for px, py in points:
            d, i = min((abs(cx - px) + abs(cy - py), i) for i, (cx, cy) in enumerate(centre))
            assert d < 30, f"no sprite near {key} {px},{py}"
            hit.add(i)
        assert not used & hit, f"{key} reuses a sprite"
        used |= hit
        x0 = min(boxes[i][0] for i in hit)
        y0 = min(boxes[i][1] for i in hit)
        x1 = max(boxes[i][2] for i in hit)
        y1 = max(boxes[i][3] for i in hit)
        # only this sprite's pixels (plus its faint edge), not whatever else falls in the box
        own = np.zeros(rgba.shape[:2], bool)
        for i in hit:
            own[found[i][1], found[i][2]] = True
        grown = own.copy()
        for _ in range(3):
            g = grown.copy()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                g |= np.roll(np.roll(grown, dy, 0), dx, 1)
            grown = g
        part = rgba.copy()
        part[..., 3] = np.where(grown, part[..., 3], 0)
        crops[key] = Image.fromarray(part, "RGBA").crop((x0, y0, x1 + 1, y1 + 1))
    for px, py in SKIP:
        used.add(min((abs(cx - px) + abs(cy - py), i) for i, (cx, cy) in enumerate(centre))[1])
    unused = [boxes[i] for i in range(len(boxes)) if i not in used]
    assert not unused, f"sprites missing from the catalog: {unused}"
    return crops


def cut(key):
    """A strip -> its frames left to right, [(RGBA array, mask, top row on the strip)] cropped to each frame."""
    rgba = np.asarray(Image.open(os.path.join(STAGES, key + ".png")).convert("RGBA")).copy()
    rgba[..., 3] = np.where(rgba[..., 3] < 40, 0, rgba[..., 3])           # faint glow haze
    lab, n = label(rgba[..., 3] > 0)
    count = FRAME_COUNT.get(key, STRIP_FRAMES)
    assert n >= count, f"{key}: {n} shapes for {count} frames"
    parts = regions(lab, n)
    size = np.array([len(ys) for ys, xs in parts])
    span = [(xs.min(), xs.max() + 1, xs.mean()) for ys, xs in parts]
    big = sorted(np.argsort(-size)[:count], key=lambda i: span[i][2])    # the largest shapes are the frames
    loose = np.sort(size)[-count - 1] if n > count else 0
    assert size[big].min() > 2 * loose, (f"{key}: the smallest frame ({size[big].min()} px) is not clearly larger "
                                         f"than a loose piece ({loose} px): check the strip or FRAME_COUNT")
    owner = np.zeros(n + 1, int)
    for i, (x0, x1, cx) in enumerate(span):                               # petals, leaves: nearest frame
        owner[i + 1] = min(range(count), key=lambda f: max(span[big[f]][0] - cx, cx - span[big[f]][1], 0))
    owner = np.where(lab > 0, owner[lab], -1)
    frames = []
    for f in range(count):
        ys, xs = np.nonzero(owner == f)
        box = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
        m = owner[box] == f
        frames.append((np.where(m[..., None], rgba[box], 0).astype(np.uint8), m, ys.min()))
    return frames


def ground_anchor(m):
    """Bottom centre of a frame's soil mound (or pot), not its lowest pixel: the last row as wide as
    the mound, so a trailing strand can hang below."""
    width = m.sum(1)
    low = width[int(len(width) * 0.6):]
    base = np.nonzero(width >= 0.3 * low.max())[0].max()
    xs = np.nonzero(m[max(base - 6, 0)])[0]
    return (xs.min() + xs.max() + 1) / 2, base + 1


def hook_anchor(m, top=0, rows=12):
    """Top centre of a hanging plant: the middle of its hook (the top rows), or of the `rows` below `top`."""
    xs = np.nonzero(m[top:top + rows].any(0))[0]
    return (xs.min() + xs.max() + 1) / 2, top


def resample(a, ax, ay, f):
    """Scale an RGBA frame by f so its anchor lands on a whole pixel -> (image, anchor x, anchor y)."""
    pad = math.ceil(1 / f) + 2
    im = Image.fromarray(np.pad(a, ((pad, pad), (pad, pad), (0, 0))), "RGBA").convert("RGBa")   # premultiplied
    ax, ay = ax + pad, ay + pad
    AX, AY = math.floor(ax * f), math.floor(ay * f)
    x0, y0 = ax - AX / f, ay - AY / f
    w, h = math.floor((im.width - x0) * f), math.floor((im.height - y0) * f)
    out = im.resize((w, h), Image.LANCZOS, box=(x0, y0, x0 + w / f, y0 + h / f)).convert("RGBA")
    l, t, r, b = out.getchannel("A").getbbox()
    return out.crop((l, t, r, b)), AX - l, AY - t


def strip_frames(key, sheet):
    """A plant's strip -> [(image, anchor x, anchor y)] in atlas pixels, one scale for all frames."""
    frames = cut(key)
    mature = frames[-3][1]
    if key in HOOKLESS:
        line = max(y0 for _, _, y0 in frames)                 # the first strip row every frame reaches
        anchors = [hook_anchor(m, line - y0, 40) for _, m, y0 in frames]
    elif key in HANGING:
        anchors = [hook_anchor(m) for _, m, _ in frames]
    else:
        anchors = [ground_anchor(m) for _, m, _ in frames]
    if key in POT_W:
        pot = frames[0][1]
        f = POT_W[key] / max(np.ptp(np.nonzero(r)[0]) + 1 for r in pot if r.any()) * POT_SCALE.get(key, 1)
    elif key in HANGING:
        f = GROW * sheet[SIZE_AS.get(key, key)].height / (mature.shape[0] - anchors[-3][1])
    else:
        f = GROW * sheet[SIZE_AS.get(key, key)].height / anchors[-3][1]
    out = [resample(a, ax, ay, f) for (a, _, _), (ax, ay) in zip(frames, anchors)]
    if key in HANGING:
        # the anchor sits as far below the hook as the mature frame's bottom, so a placed plant keeps
        # its spot (and its depth order) as it grows, and every frame hangs from the same hook
        im, ax, ay = out[-3]
        drop = im.height - ay
        out = [(i, x, y + drop) for i, x, y in out]
    return out


def decor_frame(key):
    """A decoration's own picture -> (image, anchor x, anchor y) in atlas pixels, DECOR_W garden pixels wide."""
    assert key in DECOR_W, f"{key}: a picture in art/decor/ but no width in DECOR_W"
    rgba = np.asarray(Image.open(os.path.join(DECOR, key + ".png")).convert("RGBA")).copy()
    rgba[..., 3] = np.where(rgba[..., 3] < 40, 0, rgba[..., 3])           # faint glow haze, as on the strips
    ys, xs = np.nonzero(rgba[..., 3])
    a = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    m = a[..., 3] > 0
    # the patch is drawn in perspective, its lowest rows off to one side: centre on its widest row instead
    low = int(len(m) * 0.6)
    xs = np.nonzero(m[low + np.argmax(m[low:].sum(1))])[0]
    ax, ay = (xs.min() + xs.max() + 1) / 2, ground_anchor(m)[1]
    return resample(a, ax, ay, DECOR_W[key] / SCALE / a.shape[1])


def pack(sizes, side, pad=2):
    """Shelf packing, tallest first, into as many atlases as it takes -> [(atlas, x, y)], [(w, h)]."""
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i][1])
    pos, atlases, x, y, shelf = [None] * len(sizes), [], pad, pad, 0
    for i in order:
        w, h = sizes[i]
        if x + w + pad > side:
            x, y, shelf = pad, y + shelf + pad, 0
        if y + h + pad > side:
            atlases.append((side, y + shelf + pad if shelf else y))
            x, y, shelf = pad, pad, 0
        pos[i] = (len(atlases), x, y)
        x += w + pad
        shelf = max(shelf, h)
    atlases.append((side, y + shelf + pad))
    return pos, atlases


def save_png(im, path):
    """Save im to path as a PNG, unless the file there already holds the same picture -> whether it wrote.
    A PNG's bytes depend on the zlib that compressed it, so another machine's build would otherwise
    change a committed file whose pixels are the same."""
    try:
        with Image.open(path) as old:
            if old.size == im.size and old.mode == im.mode and old.tobytes() == im.tobytes():
                return False
    except OSError:                     # not there, or not a picture: write it
        pass
    im.save(path, "PNG")
    return True


# The bundle's version line, between catalog.js and garden.js; scripts/release.py replaces it with a release's
VERSION_DEV = '// KG_VERSION: the release this file was built for, or "dev" for a local build\nvar KG_VERSION = "dev";\n'


def bundle_js():
    """_garden.js's text: catalog.js, VERSION_DEV and garden.js, in ASCII."""
    catalog, garden = (open(os.path.join(OUT, f), encoding="utf-8").read() for f in ("catalog.js", "garden.js"))
    js = "\n".join([catalog, VERSION_DEV, garden])
    # ASCII only (Japanese as \u escapes): servers may send the file without a charset
    return "".join(c if ord(c) < 128 else "\\u%04x" % ord(c) for c in js)


def bundle():
    path = os.path.join(MEDIA, "_garden.js")
    os.makedirs(MEDIA, exist_ok=True)
    with open(path, "w", encoding="ascii") as f:
        f.write(bundle_js())
    print(f"wrote {path}")


HEADER = """\
// Generated by scripts/build_assets.py; rebuild it there.
// KG_ATLAS: [file, width, height] per atlas in the media folder.
// KG_SCALE: atlas pixels -> garden pixels.
// KG_CATALOG: [key, name, shop tab, price, sold, frames] per item, in shop order.
//   sold: false for a plant whose stage art hasn't come yet; it stays here so one the player owns still shows.
//   frames: [[atlas, x, y, w, h, ax, ay], ...]: the frame's box on KG_ATLAS[atlas], and its anchor (ax, ay),
//     in the same pixels from the box's top-left: the point that goes on the item's place in the garden.
//     That is the bottom centre of the soil mound, pot or ground patch (or of the sprite, for a sheet sprite);
//     for a hanging plant, a point as far below its hook as its mature frame reaches, so ay can be > h.
//   One frame: no life cycle (decorations, tools, plants without stage art). More: the growth frames,
//     then dying, then dead. A plant starts at frames[0]; the last growth frame, frames[n - 3], is mature
//     and shows the plant in the shop and in もちもの.
"""


def main():
    # the game has no HANGING: it keeps every はちうえ item still (no sway), hanging plants with them
    assert all(tab == "はちうえ" for key, _, tab, *_ in CATALOG if key in HANGING), "a hanging plant outside はちうえ"
    sheet = sheet_sprites()
    removed_dir = os.path.join(ART, "removed")
    os.makedirs(removed_dir, exist_ok=True)
    items, frames, refunds, unsold = [], [], {}, []
    for key, name, tab, price, points in CATALOG:
        if key in REMOVED:
            save_png(sheet[key], os.path.join(removed_dir, key + ".png"))
            refunds[key] = [name, price]
            continue
        strip, picture = (os.path.exists(os.path.join(d, key + ".png")) for d in (STAGES, DECOR))
        assert not (strip and picture), f"{key}: both a strip and a decoration picture"
        if strip:
            assert tab in PLANT_TABS, f"{key}: a strip for a decoration"
            own = strip_frames(key, sheet)
        elif picture:
            assert tab not in PLANT_TABS, f"{key}: a decoration picture for a plant"
            own = [decor_frame(key)]
        else:
            assert key in sheet, f"{key}: no sprite, strip or picture"
            im = sheet[key]
            own = [(im, im.width / 2 if im.width % 2 else im.width // 2, im.height)]   # bottom centre; int when whole
            if tab in PLANT_TABS:
                unsold.append(key)
        items.append([key, name, tab, price, tab not in PLANT_TABS or len(own) > 1, len(frames), len(own)])
        frames += own
    assert set(refunds) == REMOVED, f"not in CATALOG: {REMOVED - set(refunds)}"
    pos, sizes = pack([im.size for im, _, _ in frames], ATLAS_MAX)
    atlases = [Image.new("RGBA", s, (0, 0, 0, 0)) for s in sizes]
    boxes = []
    for (im, ax, ay), (a, x, y) in zip(frames, pos):
        atlases[a].paste(im, (x, y))
        boxes.append([a, x, y, im.width, im.height, ax, ay])
    os.makedirs(MEDIA, exist_ok=True)
    for old in os.listdir(MEDIA):
        if old.startswith("_garden_sprites"):
            os.remove(os.path.join(MEDIA, old))
    files = [f"_garden_sprites{i + 1}.webp" for i in range(len(atlases))]
    for im, f in zip(atlases, files):
        im.save(os.path.join(MEDIA, f), quality=90, method=6)
    Image.open(os.path.join(ART, "background.jpg")).convert("RGB").save(
        os.path.join(MEDIA, "_garden_bg.webp"), quality=85, method=6)
    entries = [[key, name, tab, price, sold, boxes[i:i + n]] for key, name, tab, price, sold, i, n in items]
    with open(os.path.join(OUT, "catalog.js"), "w", encoding="utf-8") as f:
        f.write(HEADER)
        f.write("var KG_ATLAS = " + json.dumps([[name, im.width, im.height] for name, im in zip(files, atlases)]) + ";\n")
        f.write(f"var KG_SCALE = {SCALE};\n")
        f.write("var KG_CATALOG = [\n" + ",\n".join(json.dumps(e, ensure_ascii=False) for e in entries) + "\n];\n")
        f.write("// No longer sold: key -> [name, price], refunded if the player still has one\n")
        f.write(f"var KG_REMOVED = {json.dumps(dict(sorted(refunds.items())), ensure_ascii=False)};\n")
    staged = sum(n > 1 for *_, n in items)
    print(f"{len(entries)} items ({staged} from strips, {len(unsold)} plants not sold: {' '.join(unsold)}), "
          f"{len(frames)} frames")
    for f, im in zip(files + ["_garden_bg.webp"], atlases + [None]):
        size = f"{im.width}x{im.height}, " if im else ""
        print(f, size + str(os.path.getsize(os.path.join(MEDIA, f)) // 1024), "KB")


if __name__ == "__main__":
    if "--js" not in sys.argv:
        main()
    bundle()
