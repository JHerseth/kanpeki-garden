// The build's version (KG_VERSION): "dev" from a plain build, a release's from scripts/release.py, shown small and
// quiet at the bottom of the settings. Also release.py's version check and stamp, run with python3.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { page, openGarden, openSettings } = require("./harness");

const DIR = path.join(__dirname, "..");
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
/** The settings panel's last line, on a page made with these opts and a slot with these data- attributes. */
function versionLine(opts = {}, data) {
  const panel = openSettings(openGarden(page({}, opts), undefined, data));
  const last = panel.children[panel.children.length - 1];
  assert.deepStrictEqual([last.tagName, last.className], ["p", "kg-ver"]);
  return last.textContent;
}
const withVersion = (v) => ({ edit: (win) => { win.KG_VERSION = v; } });

/** Run python3 on `code` in the repo, with scripts/ importable; its stdout parsed as JSON. */
function py(code, ...args) {
  const r = spawnSync("python3", ["-B", "-c", "import sys; sys.path.insert(0, 'scripts')\n" + code, ...args],
    { cwd: DIR, encoding: "utf8" });
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
// the release.py tests need python3; the bundle's also Pillow and NumPy, as build_assets.py does
const noPython = spawnSync("python3", ["-c", ""]).status !== 0 && "no python3";
const noBuild = noPython || (spawnSync("python3", ["-c", "import numpy, PIL"]).status !== 0 && "python3 has no Pillow / NumPy");

test("without KG_VERSION (garden.js on its own) the settings end with 「dev」", () => {
  assert.strictEqual(versionLine(), "dev");
  assert.strictEqual(versionLine(withVersion("dev")), "dev");
  assert.strictEqual(versionLine(withVersion("")), "dev");
  assert.strictEqual(versionLine(withVersion(12)), "dev");
});

test("a release's KG_VERSION shows as 「v1.2.0」, a pre-release with its suffix", () => {
  assert.strictEqual(versionLine(withVersion("1.2.0")), "v1.2.0");
  assert.strictEqual(versionLine(withVersion("1.3.0-rc.1")), "v1.3.0-rc.1");
});

test("the version stays the last line on a dev slot, under the test section", () => {
  assert.strictEqual(versionLine(withVersion("1.2.0"), { dev: "1" }), "v1.2.0");
  const panel = openSettings(openGarden(page({}), undefined, { dev: "1" }));
  assert.deepStrictEqual(panel.children.slice(-2).map((n) => n.className), ["kg-devset", "kg-ver"]);
});

test("the version is only in the settings, in small, quiet text", () => {
  const win = page({}, withVersion("1.2.0"));
  const root = openGarden(win);
  assert.strictEqual(byClass(win.document.body, "kg-ver").length, 1);
  assert.ok(byClass(root, "kg-panel")[0].children.includes(byClass(root, "kg-ver")[0]));
  const css = win.document.getElementById("kg-style").textContent;
  const rule = /(^|\})\.kg-ver\{([^}]*)\}/.exec(css)[2];
  for (const d of ["font-size:11px", "text-align:right", "opacity:.5"]) assert.match(rule, new RegExp("(^|;)" + d + "(;|$)"));
});

test("release.py takes MAJOR.MINOR.PATCH with an optional -suffix, without the tag's v", { skip: noPython }, () => {
  const good = ["1.2.0", "0.0.1", "10.20.30", "1.3.0-rc.1", "0.0.1-test", "2.0.0-beta-2"];
  const bad = ["v1.2.0", "1.2", "1.2.0.1", "01.2.0", "1.02.0", "1.2.0-", "1.2.0-rc..1", "1.2.0+build", "1.2.0\n",
    " 1.2.0", "", "dev", "1.2.0-ü", "\u0661.2.0"];     // ١: a digit, but not 0-9
  const code = "import json, release; print(json.dumps([release.valid(v) for v in json.loads(sys.argv[1])]))";
  assert.deepStrictEqual(py(code, JSON.stringify(good)), good.map(() => true));
  assert.deepStrictEqual(py(code, JSON.stringify(bad)), bad.map(() => false));
});

test("release.py with a bad version, or none, exits 2 before building anything", { skip: noPython }, () => {
  for (const args of [["v1.2.0"], ["1.2"], [], ["1.2.0", "1.3.0"]]) {
    const r = spawnSync("python3", ["-B", "scripts/release.py", ...args], { cwd: DIR, encoding: "utf8" });
    assert.strictEqual(r.status, 2, args.join(" "));
    assert.strictEqual(r.stdout, "");                // the build prints its steps; nothing ran
    assert.match(r.stderr, /^usage: python3 scripts\/release\.py <version>/);
    if (args.length) assert.match(r.stderr, /not a release version/);
  }
});

test("the zip needs the snippet, INSTALL.txt, LICENSE and ART.md: release.py stops before building without one",
  { skip: noPython }, () => {
  const out = py(`
import io, json, os, tempfile, contextlib, release
ran = []
release.run = lambda step, cmd: ran.append(step)
results = []
for gone in [None] + release.EXTRAS:
    with tempfile.TemporaryDirectory() as d:
        for f in release.EXTRAS:
            if f != gone:
                os.makedirs(os.path.join(d, os.path.dirname(f)), exist_ok=True)
                open(os.path.join(d, f), "w").close()
        release.REPO, release.DIST = d, os.path.join(d, "dist")
        err = io.StringIO()
        try:
            with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
                code = release.main(["1.2.0"])
        except Exception as e:           # with everything there it gets past the check, to a stubbed build
            code = type(e).__name__
        results.append([gone, code, err.getvalue(), len(ran)])
        ran.clear()
print(json.dumps(results))`);
  assert.deepStrictEqual(out.map((r) => r[0]),
    [null, "release/template-snippet.html", "release/INSTALL.txt", "LICENSE", "ART.md"]);
  assert.notStrictEqual(out[0][3], 0);                               // all there: the build ran
  for (const [gone, code, err, ran] of out.slice(1)) {
    assert.strictEqual(code, 1, gone);
    assert.strictEqual(err, "release failed: missing: " + gone + "\n");
    assert.strictEqual(ran, 0);                                       // nothing built
  }
});

test("stamp() replaces the one dev line, and refuses a bundle without exactly one, or a bad version", { skip: noPython }, () => {
  const out = py(`
import json, release
def tried(js, v):
    try:
        return release.stamp(js, v)
    except release.Failed as e:
        return "Failed: " + str(e)
one = 'var A = 1;\\nvar KG_VERSION = "dev";\\nvar B = 2;\\n'
print(json.dumps([tried(one, "1.2.0"), tried(one, "1.3.0-rc.1"), tried(one, "v1.2.0"),
                  tried("var A = 1;\\n", "1.2.0"), tried(one + one, "1.2.0")]))`);
  assert.deepStrictEqual(out.slice(0, 2), ['var A = 1;\nvar KG_VERSION = "1.2.0";\nvar B = 2;\n',
    'var A = 1;\nvar KG_VERSION = "1.3.0-rc.1";\nvar B = 2;\n']);
  assert.match(out[2], /^Failed: not a release version/);
  assert.match(out[3], /^Failed: .* 0 times$/);
  assert.match(out[4], /^Failed: .* 2 times$/);
});

test("the bundle build_assets.py makes says 「dev」; stamped by release.py, its version", { skip: noBuild }, () => {
  const [dev, stamped] = py(`
import json, build_assets, release
js = build_assets.bundle_js()
print(json.dumps([js, release.stamp(js, "1.2.0")]))`);
  assert.ok(/^[\x00-\x7f]*$/.test(stamped));                     // still ASCII only
  const shown = (bundle) => openSettings(openGarden(page({}, { bundle }))).children.slice(-1)[0].textContent;
  assert.strictEqual(shown(dev), "dev");
  assert.strictEqual(shown(stamped), "v1.2.0");
  // only the version line differs
  assert.strictEqual(stamped.replace('var KG_VERSION = "1.2.0";', 'var KG_VERSION = "dev";'), dev);
});
