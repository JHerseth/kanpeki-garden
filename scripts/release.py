#!/usr/bin/env python3
"""Make the zip people download to put the garden on their own cards:

    python3 scripts/release.py 1.2.0          # or 1.3.0-rc.1: MAJOR.MINOR.PATCH, an optional -suffix, no v
 -> dist/kanpeki-garden-1.2.0.zip

    1. the full build (scripts/build_assets.py), so a release never ships art older than art/;
    2. the version stamped into media/_garden.js (KG_VERSION, "dev" in a plain build; see stamp), and a syntax check;
    3. the tests;
    4. the zip, flat: the media the bundle loads (_garden.js, the atlases KG_ATLAS names, every map's background),
       release/template-snippet.html and release/INSTALL.txt, and the repo's LICENSE and ART.md.

Any failure stops it with a non-zero exit (2 for a bad version, and 1 for a missing EXTRAS file, both before
anything is built) and leaves no zip, not even an earlier run's for the same version.
Needs what the build needs (Python 3 with Pillow and NumPy, the LFS art) and node for the tests.
"""
import glob
import json
import os
import re
import subprocess
import sys
import zipfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA = os.path.join(REPO, "media")
DIST = os.path.join(REPO, "dist")
VERSION = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?")
# the plain build's line in _garden.js (build_assets.VERSION_DEV), the one stamp() replaces
DEV = 'var KG_VERSION = "dev";'
# the zip's other files, from release/ and the repo root (the licence and the art's note go with the art)
EXTRAS = ["release/template-snippet.html", "release/INSTALL.txt", "LICENSE", "ART.md"]


class Failed(Exception):
    """A release step that went wrong; its message says which."""


def valid(version):
    """True for a release version: 1.2.0 or 1.3.0-rc.1, without the tag's v."""
    return VERSION.fullmatch(version) is not None


def stamp(js, version):
    """_garden.js's text with KG_VERSION set to `version`: its one DEV line replaced."""
    if not valid(version):
        raise Failed(f"not a release version: {version!r}")
    if js.count(DEV) != 1:
        raise Failed(f"_garden.js should have {DEV} once, has it {js.count(DEV)} times")
    return js.replace(DEV, f"var KG_VERSION = {json.dumps(version)};")


def run(step, cmd):
    print("$", " ".join(cmd), flush=True)
    try:
        code = subprocess.call(cmd, cwd=REPO)
    except OSError as e:
        raise Failed(f"{step}: {e}")
    if code:
        raise Failed(f"{step} failed (exit {code})")


def media_files():
    """The media the bundle loads: _garden.js, every atlas in KG_ATLAS (catalog.js), and every map's background
    (the bg of each of garden.js's MAPS, home's _garden_bg.webp first)."""
    with open(os.path.join(REPO, "catalog.js"), encoding="utf-8") as f:
        m = re.search(r"^var KG_ATLAS = (.*);$", f.read(), re.M)
    if not m:
        raise Failed("catalog.js has no KG_ATLAS")
    with open(os.path.join(REPO, "garden.js"), encoding="utf-8") as f:
        backgrounds = re.findall(r'\bbg: "(_garden_bg[\w-]*\.webp)"', f.read())
    if "_garden_bg.webp" not in backgrounds:
        raise Failed("garden.js's MAPS has no _garden_bg.webp")
    names = ["_garden.js"] + [a[0] for a in json.loads(m.group(1))] + backgrounds
    missing = [n for n in names if not os.path.isfile(os.path.join(MEDIA, n))]
    if missing:
        raise Failed(f"not built: {', '.join(missing)}")
    return [os.path.join("media", n) for n in names]


def release(version):
    out = os.path.join(DIST, f"kanpeki-garden-{version}.zip")
    if os.path.exists(out):
        os.remove(out)              # an earlier run's: a failed run must not leave it looking like this one's
    missing = [f for f in EXTRAS if not os.path.isfile(os.path.join(REPO, f))]
    if missing:
        raise Failed(f"missing: {', '.join(missing)}")
    run("the build", [sys.executable, os.path.join("scripts", "build_assets.py")])
    path = os.path.join(MEDIA, "_garden.js")
    with open(path, encoding="ascii") as f:
        js = stamp(f.read(), version)
    with open(path, "w", encoding="ascii") as f:
        f.write(js)
    print(f"stamped {path}: KG_VERSION = {version}")
    run("the syntax check", ["node", "--check", path])
    run("the tests", ["node", "--test"] + sorted(glob.glob(os.path.join("tests", "*.test.js"))))

    files = media_files() + EXTRAS
    os.makedirs(DIST, exist_ok=True)
    part = out + ".part"            # renamed once whole, so a failure never leaves a zip that looks done
    try:
        with zipfile.ZipFile(part, "w", zipfile.ZIP_DEFLATED) as z:
            for f in files:
                z.write(os.path.join(REPO, f), os.path.basename(f))
        os.replace(part, out)
    finally:
        if os.path.exists(part):
            os.remove(part)
    print(f"wrote {out}")
    for f in files:
        print(" ", os.path.basename(f), os.path.getsize(os.path.join(REPO, f)) // 1024, "KB")
    return out


def main(argv):
    if len(argv) != 1 or not valid(argv[0]):
        print("usage: python3 scripts/release.py <version>   e.g. 1.2.0 or 1.3.0-rc.1 (MAJOR.MINOR.PATCH, "
              "an optional -suffix, no leading v)", file=sys.stderr)
        if argv:
            print(f"not a release version: {' '.join(argv)!r}", file=sys.stderr)
        return 2
    try:
        release(argv[0])
    except Failed as e:
        print(f"release failed: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
