"""The built frames, read back from catalog.js and the atlases in media/, and a contact
sheet to check them: every plant's frames stepped through on one baseline, at 1.5 x garden size, so
a jump in anchor or scale shows.

    python scripts/build_assets.py && python art/tools/frames.py

Writes art/tools/out/frames/sheet<n>.png. The red line is each plant's anchor (the soil line,
or for a hanging plant the bottom of its mature frame), the blue tick its anchor x.
"""
import json
import os

from PIL import Image, ImageDraw

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MEDIA = os.path.join(REPO, "media")


def var(src, name):
    """The JSON value of `var name = ...;` in catalog.js."""
    i = src.index(f"var {name} = ") + len(name) + 7
    return json.loads(src[i:src.index(";\n", i)])


src = open(os.path.join(REPO, "catalog.js"), encoding="utf-8").read()
SCALE = var(src, "KG_SCALE")
ATLAS = var(src, "KG_ATLAS")
CAT = {e[0]: e for e in var(src, "KG_CATALOG")}
_atlas = {}


def frames(key, scale=SCALE):
    """An item's frames as [(RGBA image, (anchor x, anchor y))], scaled to garden pixels."""
    out = []
    for a, x, y, w, h, ax, ay in CAT[key][5]:
        if a not in _atlas:
            _atlas[a] = Image.open(os.path.join(MEDIA, ATLAS[a][0])).convert("RGBA")
        im = _atlas[a].crop((x, y, x + w, y + h))
        out.append((im.resize((round(w * scale), round(h * scale)), Image.LANCZOS), (ax * scale, ay * scale)))
    return out


def mature(key, scale=SCALE):
    """The frame that shows an item in the shop: its mature frame, or its only one."""
    fs = frames(key, scale)
    return fs[len(fs) - 3] if len(fs) > 1 else fs[0]


def sheet(keys, path, zoom=1.5, gap=12):
    rows = []
    for key in keys:
        fs = frames(key, SCALE * zoom)
        up = max(ay for _, (ax, ay) in fs)
        down = max(im.height - ay for im, (ax, ay) in fs)
        left = max(ax for _, (ax, ay) in fs)
        right = max(im.width - ax for im, (ax, ay) in fs)
        cell = round(left + right) + gap
        row = Image.new("RGBA", (cell * len(fs) + 160, round(up + max(down, 0)) + 2 * gap + 14), (214, 214, 206, 255))
        d = ImageDraw.Draw(row)
        base = gap + 14 + up
        d.text((4, 2), key, fill=(0, 0, 0, 255))
        d.line([(0, base), (row.width, base)], fill=(220, 40, 40, 255))
        for i, (im, (ax, ay)) in enumerate(fs):
            x = gap / 2 + left + i * cell
            row.alpha_composite(im, (round(x - ax), round(base - ay)))
            d.line([(x, base - 4), (x, base + 4)], fill=(40, 40, 230, 255), width=2)
        rows.append(row)
    pages, page, h = [], [], 0
    for r in rows:
        if h + r.height > 1800 and page:
            pages.append(page)
            page, h = [], 0
        page.append(r)
        h += r.height
    pages.append(page)
    for n, page in enumerate(pages):
        out = Image.new("RGBA", (max(r.width for r in page), sum(r.height for r in page)), (255, 255, 255, 255))
        y = 0
        for r in page:
            out.alpha_composite(r, (0, y))
            y += r.height
        out.convert("RGB").save(path.format(n + 1))


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "frames")
    os.makedirs(out, exist_ok=True)
    sheet([k for k, e in CAT.items() if len(e[5]) > 1], os.path.join(out, "sheet{}.png"))
    print("wrote", out)
