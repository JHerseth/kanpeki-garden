"""The stage-art gallery page: every strip in art/stages/, cropped and shown at one height.

    python art/tools/gallery.py

Run prompts/build.py first; the plant list, names and groups come from its data.json. Writes
art/tools/out/gallery/ (index.html + img/); open index.html, or host that folder as a web page.
"""
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
STAGES = os.path.join(REPO, "art/stages")
OUT = os.path.join(HERE, "out", "gallery")
HEIGHT = 200


def main():
    data = json.load(open(os.path.join(HERE, "out", "prompts", "data.json"), encoding="utf-8"))
    os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
    items = []
    for it in data["items"]:
        path = os.path.join(STAGES, it["key"] + ".png")
        if not os.path.exists(path):
            continue
        a = np.asarray(Image.open(path).convert("RGBA")).copy()
        a[..., 3] = np.where(a[..., 3] < 40, 0, a[..., 3])          # faint glow haze
        ys, xs = np.nonzero(a[..., 3])
        im = Image.fromarray(a).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        w = round(im.width * HEIGHT / im.height)
        im.resize((w, HEIGHT), Image.LANCZOS).save(os.path.join(OUT, "img", it["key"] + ".webp"), quality=88)
        items.append(dict(key=it["key"], name=it["name"], jp=it["jp"], group=it["group"], w=w, h=HEIGHT,
                          redo=bool(it.get("note"))))
    page = open(os.path.join(HERE, "gallery.html"), encoding="utf-8").read()
    a = page.index("const DATA = ")
    b = page.index(";\n", a)
    old = json.loads(page[a + len("const DATA = "):b])
    page = page[:a] + "const DATA = " + json.dumps(dict(items=items, skipped=old["skipped"]), ensure_ascii=False) + page[b:]
    open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page)
    print(len(items), "strips; wrote", OUT, "(the left-out and style-check images are not regenerated)")


if __name__ == "__main__":
    main()
