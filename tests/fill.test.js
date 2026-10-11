// 「+150」, a test control on a slot with data-dev="1": 150 mature plants placed at once, for free, for a
// performance test.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, page, openGarden } = require("./harness");

const NOW = new Date(2026, 9, 12, 10).getTime(), TODAY = "2026-10-12";
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const stored2 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 2, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const saved = (stored) => JSON.parse(stored[KEY]);
const fill = (root) => byClass(root, "kg-dev").find((b) => b.textContent === "+150");
const POND = [1655, 685, 270, 180];
const inPond = (p) => ((p.x - POND[0]) / POND[2]) ** 2 + ((p.y - POND[1]) / POND[3]) ** 2 < 1;
/** garden.js with Math.random taking the numbers in `first` before going on at random. */
const randoms = (first) => (code) => "Math.random = (function (q, r) { return function () { return q.length ? q.shift() : r(); }; })(" +
  JSON.stringify(first) + ", Math.random);\n" + code;
// a rose placed on the 10th, reviewed on the 11th; a bench in もちもの
const base = () => stored2({ coins: 37, earned: 120, seen: { 5: "2026-10-11" }, inv: { bench: 1 }, next: 8,
  days: { "2026-10-11": 1 }, placed: [{ id: 7, k: "rose_pink", x: 600, y: 700, t: "2026-10-10", g: 0 }] });

test("with data-dev=\"1\": +150 places 150 mature, living plants on the map, out of the pond, and nothing else changes", () => {
  const stored = base(), before = saved(stored);
  const win = page(stored, { now: NOW });
  const root = openGarden(win, undefined, { dev: "1" });
  const G = win.KanpekiGarden, b = fill(root);
  assert.strictEqual(b.attrs["aria-label"], "テスト：しょくぶつ +150");
  assert.ok(!b.disabled);
  b.click();
  const s = saved(stored), added = s.placed.slice(1);
  assert.deepStrictEqual(s.placed[0], before.placed[0]);
  assert.strictEqual(added.length, 150);
  assert.deepStrictEqual(added.map((p) => p.id), Array.from({ length: 150 }, (_, i) => 8 + i));
  assert.strictEqual(s.next, 158);
  for (const k of ["coins", "earned", "seen", "inv", "days"]) assert.deepStrictEqual(s[k], before[k], k);
  const kinds = new Set();
  for (const p of added) {
    const item = G.items[p.k], f = item.pic;
    kinds.add(item.tab);
    assert.ok(item.sold && item.frames.length > 1, p.k);
    assert.ok(item.frames[0].ay <= item.frames[0].h, p.k + " hangs");
    assert.deepStrictEqual([p.t, p.g], [TODAY, item.frames.length - 3], p.k);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(G.life(s, p))), { g: item.frames.length - 3, missed: 0, dead: false }, p.k);
    assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y));
    assert.ok(p.x >= f.ax * win.KG_SCALE - 0.5 && p.x <= 2000 - (f.w - f.ax) * win.KG_SCALE + 0.5, p.k + " x " + p.x);
    assert.ok(p.y >= f.ay * win.KG_SCALE - 0.5 && p.y <= 1116, p.k + " y " + p.y);
    assert.ok(!inPond(p), p.k + " in the pond at " + p.x + "," + p.y);
  }
  assert.ok(kinds.size >= 4, [...kinds].join());          // 150 picks from five tabs
  // drawn at once: a node per plant, the flowers swaying, and butterflies for the flowers
  const items = byClass(root, "kg-item");
  assert.strictEqual(items.length, 151);
  assert.deepStrictEqual(items.map((d) => +d.dataset.id).sort((x, y) => x - y), [7].concat(added.map((p) => p.id)));
  const flowers = added.filter((p) => G.items[p.k].tab === "花");
  for (const p of flowers) {
    const d = items.find((n) => n.dataset.id === String(p.id));
    assert.ok(d.children[0].classList.contains("kg-sway"), p.k);
  }
  assert.strictEqual(byClass(root, "kg-bug").length, G.butterflies(flowers.length + 1));
  assert.strictEqual(byClass(root, "kg-purse-n")[0].textContent, "37");
  // a second press adds 150 more, ids going on
  b.click();
  const s2 = saved(stored);
  assert.strictEqual(s2.placed.length, 301);
  assert.strictEqual(new Set(s2.placed.map((p) => p.id)).size, 301);
  assert.strictEqual(s2.next, 308);
  assert.strictEqual(byClass(root, "kg-item").length, 301);
});

test("a spot in the pond is passed over for another", () => {
  // kind 0 (the first plant), then the pond's middle, then a spot on the grass, for the first plant
  const stored = stored2({});
  const win = page(stored, { now: NOW, src: randoms([0, 1655 / 2000, 685 / 1116, 0.25, 0.5]) });
  fill(openGarden(win, undefined, { dev: "1" })).click();
  const p = saved(stored).placed[0];
  assert.deepStrictEqual([p.k, p.x, p.y], ["rose_pink", 500, 558]);
  assert.ok(saved(stored).placed.every((q) => !inPond(q)));
});

test("they join on the test day, and wilt and die by the normal rules", () => {
  const stored = stored2({});
  let root = openGarden(page(stored, { now: NOW }), undefined, { dev: "1" });
  byClass(root, "kg-dev").find((b) => b.textContent === "+1日").click();
  fill(root).click();
  assert.ok(saved(stored).placed.every((p) => p.t === "2026-10-13"));
  const life = (now) => { const w = page(stored, { now }); openGarden(w); return w.KanpekiGarden; };
  const G = life(NOW + 4 * 864e5), s = saved(stored);     // the 16th, real day: the 14th and 15th missed
  assert.ok(s.placed.every((p) => G.life(s, p).missed === 2 && !G.life(s, p).dead));
  const H = life(NOW + 6 * 864e5), s2 = saved(stored);   // the 18th: 4 missed
  assert.ok(s2.placed.every((p) => H.life(s2, p).dead));
});

test("without the marker there is no +150", () => {
  for (const data of [undefined, { dev: "0" }]) {
    const root = openGarden(page(base(), { now: NOW }), undefined, data);
    assert.strictEqual(fill(root), undefined);
  }
});

test("a locked save (from a newer script): +150 is disabled and writes nothing", () => {
  const stored = { [KEY]: JSON.stringify({ v: 3, coins: 40, earned: 40 }) };
  const before = stored[KEY];
  const root = openGarden(page(stored, { now: NOW }), undefined, { dev: "1" });
  const b = fill(root);
  assert.ok(b.disabled);
  b.click();                  // the fake DOM fires it anyway
  assert.deepStrictEqual(Object.keys(stored), [KEY]);
  assert.strictEqual(stored[KEY], before);
  assert.strictEqual(byClass(root, "kg-item").length, 0);
});
