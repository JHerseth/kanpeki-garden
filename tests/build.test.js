// build_assets.py's full build rewrites a backup crop in art/removed/ only when its pixels change: another
// machine's zlib gives the same picture other bytes, which would fail the release's clean-tree check.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DIR = path.join(__dirname, "..");
// build_assets.py needs Pillow and NumPy
const noBuild = spawnSync("python3", ["-c", "import numpy, PIL"]).status !== 0 && "no python3 with Pillow / NumPy";

test("save_png() writes a new or changed picture, and leaves one with the same pixels byte for byte", { skip: noBuild }, () => {
  const r = spawnSync("python3", ["-B", "-c", `
import sys; sys.path.insert(0, 'scripts')
import json, os, tempfile
from PIL import Image
from build_assets import save_png
im = Image.new("RGBA", (40, 30), (0, 0, 0, 0))
for x in range(40):
    im.putpixel((x, x * 3 // 4), (200, 120, x * 6, 255))
out = {}
with tempfile.TemporaryDirectory() as d:
    p = os.path.join(d, "crop.png")
    raw = lambda: open(p, "rb").read()
    out["missing"] = save_png(im, p)
    out["missing same"] = Image.open(p).tobytes() == im.tobytes()
    im.save(p, compress_level=1)                       # the same pixels, compressed otherwise
    before = raw()
    out["recompressed"] = save_png(im, p)
    out["recompressed untouched"] = raw() == before
    changed = im.copy()
    changed.putpixel((5, 20), (1, 2, 3, 200))
    out["one pixel"] = save_png(changed, p)
    out["one pixel same"] = Image.open(p).tobytes() == changed.tobytes()
    out["mode"] = save_png(im.convert("RGB"), p)       # another mode is another picture
    out["size"] = save_png(im.crop((0, 0, 40, 29)), p)
    open(p, "wb").write(b"not a png")
    out["not a picture"] = save_png(im, p)
    out["again"] = save_png(im, p)
print(json.dumps(out))`], { cwd: DIR, encoding: "utf8" });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout), {
    "missing": true, "missing same": true,
    "recompressed": false, "recompressed untouched": true,
    "one pixel": true, "one pixel same": true,
    "mode": true, "size": true,
    "not a picture": true, "again": false,
  });
});
