// Maps: the home garden and two more that the player unlocks with coins, linked by signs at the exits on their edges.
// Placed items belong to their map; coins, もちもの and the shop are shared, and the life cycle runs on every map.
// The save's v: 3 keeps the unlocked maps (maps), the current one (at) and each placed item's map (m).
// Every check runs on a fake clock (KG_CLOCK). 2026-10-12 is a Monday.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { KEY, page, openGarden, openSettings } = require("./harness");

const DIR = path.join(__dirname, "..");
const PREFS_KEY = "kanpekikun-garden-opts";
const at = (day, h = 10) => new Date(2026, 9, day, h).getTime();         // October 2026, local time
const iso = (day) => "2026-10-" + String(day).padStart(2, "0");
const NOW = at(12), TODAY = iso(12);
const EN = { lang: "en" };
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const stored3 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 3, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const saved = (stored) => JSON.parse(stored[KEY]);
/** A value from the garden's page as plain JSON, to compare with this realm's objects. */
const plain = (v) => JSON.parse(JSON.stringify(v));

const signs = (root) => byClass(root, "kg-exit");
const sign = (root, to) => signs(root).find((b) => b.dataset.to === to);
const hint = (root) => byClass(root, "kg-hint")[0];
const button = (root, text) => hint(root).all((n) => n.tagName === "button").find((b) => b.textContent === text);
const ids = (root) => byClass(root, "kg-item").map((d) => Number(d.dataset.id)).sort((a, b) => a - b);
const bugs = (root) => byClass(root, "kg-bug").length;
const purse = (root) => byClass(root, "kg-purse-n")[0].textContent;
/** The map's name in the top bar, and its dots: here, open (unlocked) or lock, one per map in order. */
const name = (root) => byClass(root, "kg-map-name")[0].textContent;
const dots = (root) => byClass(root, "kg-dot").map((n) => n.className.split(" ").find((c) => c !== "kg-dot"));
/** The backgrounds loaded so far, [map, src], and the one shown. */
const bgs = (root) => byClass(root, "kg-bg").map((n) => [n.dataset.map, n.src]);
const shownBg = (root) => byClass(root, "kg-bg").filter((n) => !n.hidden).map((n) => n.src);
/** The camera, from the world's transform: { x, y, s }. */
function cam(root) {
  const m = /translate\((-?[\d.e-]+)px,(-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/.exec(byClass(root, "kg-world")[0].style.transform);
  return { x: +m[1], y: +m[2], s: +m[3] };
}
/** A tap on placed item `id`, or on the empty map at garden spot x, y (the fake view's corner is the page's). */
function touch(root, id, x = 1000, y = 600) {
  const d = id == null ? null : byClass(root, "kg-item").find((n) => n.dataset.id === String(id));
  const c = cam(root), target = { closest: (sel) => (sel === ".kg-item" ? d : null) };
  const view = byClass(root, "kg-view")[0];
  ["pointerdown", "pointerup"].forEach((type) => view.on[type].forEach((f) =>
    f({ type, pointerId: 1, clientX: x * c.s + c.x, clientY: y * c.s + c.y, target })));
}
/** garden.js with Math.random taking the numbers in `first` before going on at random. */
const randoms = (first) => (code) => "Math.random = (function (q, r) { return function () { return q.length ? q.shift() : r(); }; })(" +
  JSON.stringify(first) + ", Math.random);\n" + code;
/** Whether garden spot p is in map `key`'s water, as KanpekiGarden.maps gives it. */
function wet(G, key, p) {
  const map = G.maps.find((m) => m.key === key);
  return map.water.some(([cx, cy, rx, ry]) => ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 < 1);
}

const rose = (id, m, more) => Object.assign({ id, k: "rose_pink", x: 300 + 100 * id, y: 700, t: iso(11) }, m && { m }, more);
const can = (id, m) => Object.assign({ id, k: "watering_can", x: 300 + 100 * id, y: 800 }, m && { m });

// ---- the save ---------------------------------------------------------------------------------

test("a v: 2 save moves to v: 3 as it is, with everything on the home map", () => {
  const v2 = { v: 2, coins: 40, earned: 90, seen: { 5: iso(11) }, inv: { bench: 1 }, next: 9, days: { [iso(11)]: 1 },
    placed: [rose(7), can(8)] };
  const stored = { [KEY]: JSON.stringify(v2) };
  const win = page(stored, { now: NOW });
  assert.deepStrictEqual(plain(win.KanpekiGarden.load()), Object.assign({}, v2, { v: 3 }));
  assert.deepStrictEqual(saved(stored), Object.assign({}, v2, { v: 3 }));     // under the same key: no maps, at or m
  assert.deepStrictEqual(Object.keys(stored), [KEY]);
  const root = openGarden(win);
  assert.deepStrictEqual(ids(root), [7, 8]);
  assert.strictEqual(name(root), "わたしのにわ");
  assert.deepStrictEqual(dots(root), ["kg-dot-here", "kg-dot-lock", "kg-dot-lock"]);
});

test("a v: 1 save under the old key moves straight to v: 3", () => {
  const stored = { kanpekikun_unused: "", "kanpekikun-garden": JSON.stringify({ v: 1, coins: 7, earned: 7, seen: {}, inv: {},
    placed: [{ id: 1, k: "watering_can", x: 500, y: 700 }], next: 2 }) };
  page(stored, { now: NOW }).KanpekiGarden.load();
  assert.deepStrictEqual([saved(stored).v, saved(stored).coins, saved(stored).placed[0].m], [3, 7, undefined]);
});

test("a fresh garden is v: 3, on the home map, with nothing unlocked", () => {
  const stored = {};
  openGarden(page(stored, { now: NOW }), 5);
  const s = saved(stored);
  assert.strictEqual(s.v, 3);
  assert.deepStrictEqual([s.maps, s.at], [undefined, undefined]);
});

// v1.1.0 is the last release with v: 2: its load() locks any save whose v isn't 2. Its script, from the tag (not in a
// shallow clone, as on CI), is run on a v: 3 save; the second test reads the same rule off the save itself.
const old = spawnSync("git", ["show", "v1.1.0:garden.js"], { cwd: DIR, encoding: "utf8" });
const noOld = (old.status !== 0 || !/if \(s\.v !== 2\) return locked\(\);/.test(old.stdout)) && "no v1.1.0 tag here";

test("v1.1.0's script locks a v: 3 save: it won't open the garden, pay into it or write over it", { skip: noOld }, () => {
  const stored = stored3({ coins: 600, earned: 1100, maps: ["riverside"], at: "riverside", next: 3,
    placed: [rose(1), rose(2, "riverside")] });
  const before = stored[KEY];
  const win = page(stored, { now: NOW, src: () => old.stdout });
  assert.ok(win.KanpekiGarden.load().locked);
  const root = openGarden(win, 5);                     // a card answered: it pays nothing
  assert.strictEqual(byClass(root, "kg-confirm")[0].textContent, "いまは にわを ひらけないよ");
  byClass(root, "kg-close")[0].click();
  assert.deepStrictEqual(Object.keys(stored), [KEY]);
  assert.strictEqual(stored[KEY], before);
  // and this script still reads it as it was
  const s = page(stored, { now: NOW }).KanpekiGarden.load();
  assert.deepStrictEqual(plain([s.coins, s.maps, s.at, s.placed[1].m]), [600, ["riverside"], "riverside", "riverside"]);
});

test("a moved save keeps the key an older script reads, with a v other than 2, which that script locks", () => {
  const stored = { [KEY]: JSON.stringify({ v: 2, coins: 1, earned: 1, seen: {}, inv: {}, placed: [], next: 1, days: {} }) };
  page(stored, { now: NOW }).KanpekiGarden.load();
  assert.deepStrictEqual(Object.keys(stored), ["kanpekikun-garden-2"]);
  const s = saved(stored);
  assert.ok(s.v !== 2, "v1.1.0: if (s.v !== 2) return locked();");
});

test("a save from a newer script (v: 4) is locked: no maps are opened, walked or written", () => {
  const stored = { [KEY]: JSON.stringify({ v: 4, coins: 900, earned: 900, maps: ["riverside"] }) };
  const before = stored[KEY];
  const root = openGarden(page(stored, { now: NOW }));
  assert.ok(signs(root).length > 0);
  assert.ok(signs(root).every((b) => b.disabled));
  sign(root, "riverside").click();                     // the fake DOM fires it anyway
  assert.ok(hint(root).hidden);
  assert.strictEqual(stored[KEY], before);
  assert.strictEqual(name(root), "わたしのにわ");
});

test("damaged map fields fall back to home or are dropped", () => {
  const load = (over) => {
    const stored = stored3(Object.assign({ next: 9 }, over));
    const s = plain(page(stored, { now: NOW }).KanpekiGarden.load());
    assert.deepStrictEqual(saved(stored), s, "saved as loaded");
    return s;
  };
  let s = load({ maps: ["riverside", "riverside", "home", "moon", 7, null, "toString"], at: "moon",
    placed: [rose(1, "riverside"), rose(2, "waterfall"), rose(3, "home"), rose(4, 5), rose(5, "__proto__"), can(6)] });
  assert.deepStrictEqual(s.maps, ["riverside"]);
  assert.ok(!("at" in s));
  // waterfall is still locked: its plant goes home, as do the damaged ones; home is never written
  assert.deepStrictEqual(s.placed.map((p) => p.m), ["riverside", undefined, undefined, undefined, undefined, undefined]);
  assert.ok(s.placed.slice(1).every((p) => !("m" in p)));
  s = load({ maps: "riverside", at: "riverside", placed: [rose(1, "riverside")] });
  assert.deepStrictEqual([s.maps, s.at, s.placed[0].m], [undefined, undefined, undefined]);
  s = load({ maps: [], at: "home" });
  assert.ok(!("maps" in s) && !("at" in s));
  s = load({ maps: ["waterfall", "riverside"], at: "waterfall" });
  assert.deepStrictEqual([s.maps, s.at], [["waterfall", "riverside"], "waterfall"]);
  s = load({ maps: { riverside: true }, at: 3 });
  assert.ok(!("maps" in s) && !("at" in s));
});

test("a sound v: 3 save loads without a write", () => {
  const stored = stored3({ maps: ["riverside"], at: "riverside", next: 3, placed: [rose(1), rose(2, "riverside")] });
  const watched = new Proxy(stored, { set(t, k, v) { throw new Error("wrote " + k); } });
  page(watched, { now: NOW }).KanpekiGarden.load();
});

// ---- the maps -----------------------------------------------------------------------------

test("three maps in order, each exit's sign leading to a map with an exit back", () => {
  const G = plain(page({}).KanpekiGarden);
  assert.deepStrictEqual(G.maps.map((m) => [m.key, m.price, m.bg]), [["home", 0, "_garden_bg.webp"],
    ["riverside", 500, "_garden_bg_riverside.webp"], ["waterfall", 1000, "_garden_bg_waterfall.webp"]]);
  assert.deepStrictEqual(G.maps.map((m) => m.exits.map((e) => e[2])), [["riverside"], ["home", "waterfall"], ["riverside"]]);
  for (const m of G.maps) for (const [x, y, to] of m.exits) {
    assert.ok(G.maps.find((n) => n.key === to).exits.some((e) => e[2] === m.key), m.key + " → " + to);
    assert.ok(x > 0 && x < 2000 && y > 0 && y < 1116, m.key + " → " + to);
  }
  assert.deepStrictEqual(G.maps[0].water, [[1655, 685, 270, 180]]);                     // home keeps POND
});

test("each map's water is where its picture has water, and not on its grass or paths", () => {
  const G = page({}).KanpekiGarden;
  const wetSpots = { home: [[1655, 685], [1500, 650]],
    riverside: [[230, 860], [370, 950], [560, 1000], [760, 1005], [1120, 1025], [1340, 1000], [1580, 945], [1800, 900], [1880, 830]],
    waterfall: [[1770, 540], [1650, 520], [1850, 150], [1855, 330]] };
  const drySpots = { home: [[1000, 600], [965, 1085]],
    riverside: [[1000, 500], [950, 1045], [1592, 300], [400, 700], [1700, 700]],
    waterfall: [[1000, 600], [970, 1060], [1500, 500], [1700, 800]] };
  for (const key of ["home", "riverside", "waterfall"]) {
    for (const [x, y] of wetSpots[key]) assert.ok(wet(G, key, { x, y }), key + " " + x + "," + y + " is water");
    for (const [x, y] of drySpots[key]) assert.ok(!wet(G, key, { x, y }), key + " " + x + "," + y + " is land");
  }
});

test("the garden opens on the map visited last, with only that map's items, background and name", () => {
  const stored = stored3({ maps: ["riverside"], at: "riverside", next: 5,
    placed: [rose(1), can(2), rose(3, "riverside"), can(4, "riverside")] });
  const root = openGarden(page(stored, { now: NOW }));
  assert.deepStrictEqual(ids(root), [3, 4]);
  assert.strictEqual(name(root), "かわべの はらっぱ");
  assert.deepStrictEqual(dots(root), ["kg-dot-open", "kg-dot-here", "kg-dot-lock"]);
  // only this map's background has loaded
  assert.deepStrictEqual(bgs(root), [["riverside", "_garden_bg_riverside.webp"]]);
  assert.deepStrictEqual(shownBg(root), ["_garden_bg_riverside.webp"]);
});

test("the home map opens with only its background loaded, the others not until the player walks there", () => {
  const root = openGarden(page(stored3({ maps: ["riverside", "waterfall"] }), { now: NOW }));
  assert.deepStrictEqual(bgs(root), [["home", "_garden_bg.webp"]]);
  sign(root, "riverside").click();
  assert.deepStrictEqual(bgs(root), [["home", "_garden_bg.webp"], ["riverside", "_garden_bg_riverside.webp"]]);
  assert.deepStrictEqual(shownBg(root), ["_garden_bg_riverside.webp"]);
  sign(root, "home").click();
  assert.deepStrictEqual(bgs(root).length, 2, "loaded once");
  assert.deepStrictEqual(shownBg(root), ["_garden_bg.webp"]);
});

test("signs: a signpost on the map and a label over it per exit of the map shown: the next map's name, or its price", () => {
  const root = openGarden(page(stored3({ coins: 20 }), { now: NOW }));
  assert.deepStrictEqual(signs(root).map((b) => [b.dataset.to, b.textContent]), [["riverside", "500 で ひらく"]]);
  const b = sign(root, "riverside");
  assert.strictEqual(byClass(b, "kg-coin").length, 1);
  assert.strictEqual(b.attrs["aria-label"], "かわべの はらっぱ を 500 コインで ひらく");
  assert.strictEqual(b.parent, byClass(root, "kg-view")[0]);        // over the map, not scaled with it
  const open = openGarden(page(stored3({ maps: ["riverside"], at: "riverside" }), { now: NOW }));
  assert.deepStrictEqual(signs(open).map((n) => [n.dataset.to, n.textContent]),
    [["home", "わたしのにわ"], ["waterfall", "1000 で ひらく"]]);
  assert.strictEqual(sign(open, "home").attrs["aria-label"], "わたしのにわ へ いく");
  // the signposts: in the world, at their exits' feet, in depth order with the items, the one back home mirrored
  const posts = byClass(open, "kg-post");
  assert.deepStrictEqual(posts.map((n) => [n.dataset.to, n.parent.className, n.style.zIndex]),
    [["home", "kg-world", "1045"], ["waterfall", "kg-world", "300"]]);
  assert.deepStrictEqual(posts.map((n) => n.children[0].style.transform), ["scaleX(-1)", undefined]);
});

test("the signpost is the build's KG_SIGN frame, not an item in the shop, standing with its foot on the exit", () => {
  const win = page({});
  const [a, x, y, w, h, ax, ay] = win.KG_SIGN, S = win.KG_SCALE;
  assert.ok(a < win.KG_ATLAS.length && w > 0 && h > 0 && ax > 0 && ax < w && ay > 0 && ay <= h, String(win.KG_SIGN));
  assert.ok(h * S > 70 && h * S < 110, "about 90 garden px tall: " + h * S);
  assert.ok(!win.KG_CATALOG.some((e) => e[0] === "sign"));
  const root = openGarden(win);
  const post = byClass(root, "kg-post")[0];
  assert.deepStrictEqual([parseFloat(post.style.left) + ax * S, parseFloat(post.style.top) + ay * S].map((v) => Math.round(v * 1e6) / 1e6),
    [965, 1085]);
  assert.strictEqual(post.children[0].style.width, w * S + "px");
  assert.strictEqual(byClass(root, "kg-card").filter((c) => /sign|看板|かんばん/.test(c.textContent)).length, 0);
});

test("a tap on the signpost does what its label does; while placing, it places on the path instead", () => {
  const stored = stored3({ coins: 900, maps: [], inv: { watering_can: 1 } });
  const root = openGarden(page(stored, { now: NOW }));
  const post = byClass(root, "kg-post")[0], view = byClass(root, "kg-view")[0];
  const tapPost = () => ["pointerdown", "pointerup"].forEach((type) => view.on[type].forEach((f) =>
    f({ type, pointerId: 1, clientX: 100, clientY: 100, target: { closest: (sel) => (sel === ".kg-post" ? post : null) } })));
  tapPost();
  assert.strictEqual(hint(root).textContent, "かわべの はらっぱ を 500 で ひらく？はい✕");
  button(root, "✕").click();
  byClass(root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
  byClass(root, "kg-card")[0].click();
  tapPost();
  assert.deepStrictEqual(saved(stored).placed.map((p) => p.k), ["watering_can"]);
  assert.ok(!/ひらく/.test(hint(root).textContent));
});

test("a locked sign asks in the hint; ✕ leaves it, and 「はい」 spends the price, unlocks the map and walks there", () => {
  const stored = stored3({ coins: 650, earned: 1200, next: 3, placed: [rose(1), can(2)] });
  const root = openGarden(page(stored, { now: NOW }));
  sign(root, "riverside").click();
  assert.ok(!hint(root).hidden);
  assert.strictEqual(hint(root).textContent, "かわべの はらっぱ を 500 で ひらく？はい✕");
  assert.strictEqual(byClass(hint(root), "kg-coin").length, 1);
  assert.strictEqual(button(root, "✕").attrs["aria-label"], "やめる");
  button(root, "✕").click();
  assert.ok(hint(root).hidden);
  assert.deepStrictEqual([saved(stored).coins, saved(stored).maps], [650, undefined]);
  sign(root, "riverside").click();
  button(root, "はい").click();
  const s = saved(stored);
  assert.deepStrictEqual([s.coins, s.earned, s.maps, s.at], [150, 1200, ["riverside"], "riverside"]);
  assert.strictEqual(purse(root), "150");
  assert.ok(hint(root).hidden);
  assert.strictEqual(name(root), "かわべの はらっぱ");
  assert.deepStrictEqual(dots(root), ["kg-dot-open", "kg-dot-here", "kg-dot-lock"]);
  assert.deepStrictEqual(ids(root), []);
  // back home, its sign now leads there
  sign(root, "home").click();
  assert.deepStrictEqual(signs(root).map((b) => b.textContent), ["かわべの はらっぱ"]);
  assert.deepStrictEqual(ids(root), [1, 2]);
});

test("too few coins: the hint says how many more, as the shop does, and nothing changes", () => {
  const stored = stored3({ coins: 300, earned: 300, maps: ["riverside"], at: "riverside" });
  const before = stored[KEY];
  const root = openGarden(page(stored, { now: NOW }));
  sign(root, "waterfall").click();
  assert.strictEqual(hint(root).textContent, "あと 700 コイン たりないよ。カードを がんばろう！OK");
  assert.ok(hint(root).classList.contains("kg-hint-long"), "the long message may wrap");
  button(root, "OK").click();
  assert.ok(hint(root).hidden);
  assert.strictEqual(stored[KEY], before);
  assert.strictEqual(sign(root, "waterfall").textContent, "1000 で ひらく");
});

test("a tap on the map, or on a plant, leaves the question", () => {
  const root = openGarden(page(stored3({ coins: 900, next: 2, placed: [rose(1)] }), { now: NOW }));
  sign(root, "riverside").click();
  touch(root, null);
  assert.ok(hint(root).hidden);
  sign(root, "riverside").click();
  touch(root, 1);
  assert.strictEqual(hint(root).textContent, "ゆびで うごかせるよOK");
});

test("unlocking spends coins the shop then sees as gone", () => {
  const root = openGarden(page(stored3({ coins: 515 }), { now: NOW }));
  const card = () => byClass(root, "kg-card").find((c) => byClass(c, "kg-name")[0].textContent === "ピンクのバラ");
  assert.ok(!card().classList.contains("kg-poor"));
  sign(root, "riverside").click();
  button(root, "はい").click();
  assert.ok(card().classList.contains("kg-poor"));            // 20 coins; 15 left
});

// ---- walking ---------------------------------------------------------------------------------

test("walking switches the items, the butterflies, the top bar and the signs; the garden reopens on the last map", () => {
  // 10 living roses by the river: 2 butterflies there, none at home (one rose)
  const river = Array.from({ length: 10 }, (_, i) => rose(i + 2, "riverside"));
  const stored = stored3({ maps: ["riverside"], next: 12, placed: [rose(1)].concat(river) });
  const win = page(stored, { now: NOW });
  let root = openGarden(win);
  assert.deepStrictEqual([ids(root), bugs(root)], [[1], 0]);
  sign(root, "riverside").click();
  assert.deepStrictEqual(ids(root), river.map((p) => p.id));
  assert.strictEqual(bugs(root), 2);
  assert.strictEqual(name(root), "かわべの はらっぱ");
  assert.deepStrictEqual(signs(root).map((b) => b.dataset.to), ["home", "waterfall"]);
  assert.strictEqual(saved(stored).at, "riverside");
  byClass(root, "kg-close")[0].click();
  root = openGarden(win);
  assert.deepStrictEqual([name(root), ids(root), bugs(root)], ["かわべの はらっぱ", river.map((p) => p.id), 2]);
  sign(root, "home").click();
  assert.deepStrictEqual([ids(root), bugs(root), name(root)], [[1], 0, "わたしのにわ"]);
  assert.ok(!("at" in saved(stored)));                          // home is left out
});

test("walking puts down the selected item and leaves a question; placing goes on, onto the new map", () => {
  const stored = stored3({ coins: 50, maps: ["riverside"], inv: { watering_can: 1 }, next: 2, placed: [rose(1)] });
  const root = openGarden(page(stored, { now: NOW }));
  touch(root, 1);
  assert.strictEqual(byClass(root, "kg-sel").length, 1);
  sign(root, "riverside").click();
  assert.ok(hint(root).hidden);
  assert.strictEqual(byClass(root, "kg-sel").length, 0);
  // something to place: bought or from もちもの, then a walk
  byClass(root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
  byClass(root, "kg-card")[0].click();
  sign(root, "home").click();
  assert.match(hint(root).textContent, /タップ して おいてね/);
  touch(root, null, 500, 700);
  const s = saved(stored);
  assert.deepStrictEqual(s.placed.map((p) => [p.id, p.k, p.m]), [[1, "rose_pink", undefined], [2, "watering_can", undefined]]);
});

test("an item placed on a map belongs to it: m in the save, left out for home", () => {
  const stored = stored3({ maps: ["riverside"], at: "riverside", inv: { watering_can: 2 }, next: 1 });
  const root = openGarden(page(stored, { now: NOW }));
  const place = (x) => {
    byClass(root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
    byClass(root, "kg-card")[0].click();
    touch(root, null, x, 700);
  };
  place(500);
  sign(root, "home").click();
  place(700);
  assert.deepStrictEqual(saved(stored).placed.map((p) => [p.id, p.m]), [[1, "riverside"], [2, undefined]]);
  assert.ok(!("m" in saved(stored).placed[1]));
  assert.deepStrictEqual(ids(root), [2]);
  sign(root, "riverside").click();
  assert.deepStrictEqual(ids(root), [1]);
});

test("put away (しまう) and moving work on the shown map's items", () => {
  const stored = stored3({ maps: ["riverside"], at: "riverside", next: 3, placed: [can(1), can(2, "riverside")] });
  const root = openGarden(page(stored, { now: NOW }));
  touch(root, 2);
  hint(root).all((n) => n.tagName === "button").find((b) => b.textContent === "しまう").click();
  const s = saved(stored);
  assert.deepStrictEqual([s.placed.map((p) => p.id), s.inv], [[1], { watering_can: 1 }]);
});

test("the view lands centred on the sign the player arrives at, at the same zoom", () => {
  // upright and folded: the map fills the view's height, wider than the view (see fold.test.js)
  const stored = Object.assign(stored3({ maps: ["riverside", "waterfall"] }), { [PREFS_KEY]: JSON.stringify({ shop: false }) });
  const root = openGarden(page(stored, { now: NOW, screen: [360, 740] }));
  const s = 634 / 1116;
  assert.ok(Math.abs(cam(root).s - s) < 1e-9);
  sign(root, "riverside").click();
  const c = cam(root);
  assert.ok(Math.abs(c.s - s) < 1e-9);
  assert.ok(Math.abs(c.x - (180 - 950 * s)) < 1, "on the bridge: " + c.x);
  sign(root, "waterfall").click();
  assert.ok(Math.abs(cam(root).x - (180 - 970 * s)) < 1, "on the stairs: " + cam(root).x);
  sign(root, "riverside").click();
  assert.ok(Math.abs(cam(root).x - (180 - 1592 * s)) < 1, "on the riverside's stairs: " + cam(root).x);
  sign(root, "home").click();
  assert.ok(Math.abs(cam(root).x - (180 - 965 * s)) < 1, "on the stepping stones: " + cam(root).x);
});

test("a sign's label sits over its signpost at screen size, and moves with the camera", () => {
  const stored = Object.assign(stored3({ maps: ["riverside"] }), { [PREFS_KEY]: JSON.stringify({ shop: false }) });
  const win = page(stored, { now: NOW, screen: [360, 740] });
  const root = openGarden(win);
  const top = win.KG_SIGN[6] * win.KG_SCALE;                  // the signpost's height over its foot
  const where = () => { const b = sign(root, "riverside"); return [parseFloat(b.style.left), parseFloat(b.style.top)]; };
  // the fake DOM's label has no size: its corner is centred over the post, 6 px above its top
  const over = (c) => [c.x + 965 * c.s, c.y + (1085 - top) * c.s - 6];
  const [x0, y0] = where(), c0 = cam(root);
  assert.ok(Math.abs(x0 - over(c0)[0]) < 1e-6 && Math.abs(y0 - over(c0)[1]) < 1e-6, [x0, y0, over(c0)].join());
  byClass(root, "kg-zbtn")[0].click();
  const [x1, y1] = where(), c1 = cam(root);
  assert.notStrictEqual(x1, x0);
  assert.ok(Math.abs(x1 - over(c1)[0]) < 1e-6 && Math.abs(y1 - over(c1)[1]) < 1e-6);
  // the posts' hit area stays a size on the screen: the world says its scale
  assert.strictEqual(byClass(root, "kg-world")[0].style["--kg-s"], String(c1.s));
});

test("the walk fades: a veil over the map that goes when its animation ends; none before the first walk", () => {
  const root = openGarden(page(stored3({ maps: ["riverside"] }), { now: NOW }));
  assert.strictEqual(byClass(root, "kg-veil").length, 0);
  sign(root, "riverside").click();
  const veil = byClass(root, "kg-veil");
  assert.strictEqual(veil.length, 1);
  sign(root, "home").click();
  assert.strictEqual(byClass(root, "kg-veil").length, 1, "one at a time");
  byClass(root, "kg-veil")[0].fire("animationend");
  assert.strictEqual(byClass(root, "kg-veil").length, 0);
});

// ---- per map, and shared --------------------------------------------------------------------

test("plants on a map that isn't shown still grow, wilt and die", () => {
  // planted on the 5th on both maps, reviews on the 5th to the 7th, then none: on the 12th, 4 days missed
  const days = { [iso(5)]: 1, [iso(6)]: 1, [iso(7)]: 1 };
  const placed = [rose(1, null, { t: iso(5) }), rose(2, "riverside", { t: iso(5) })];
  const grow = (day) => {
    const stored = stored3({ maps: ["riverside"], days, next: 3, placed });
    const win = page(stored, { now: at(day) });
    openGarden(win);
    const s = saved(stored);
    return s.placed.map((p) => JSON.parse(JSON.stringify(win.KanpekiGarden.life(s, p))));
  };
  assert.deepStrictEqual(grow(8), [{ g: 2, missed: 0, dead: false }, { g: 2, missed: 0, dead: false }]);
  assert.deepStrictEqual(grow(10), [{ g: 2, missed: 2, dead: false }, { g: 2, missed: 2, dead: false }]);
  const stored = stored3({ maps: ["riverside"], days, next: 3, placed });
  const root = openGarden(page(stored, { now: at(12) }));     // opened at home
  assert.deepStrictEqual(saved(stored).placed.map((p) => p.dead), [TODAY, TODAY], "both found dead");
  sign(root, "riverside").click();
  touch(root, 2);
  assert.match(hint(root).textContent, /^たいひにする？/);
});

test("compost all takes only the shown map's dead plants", () => {
  const dead = (id, m) => Object.assign({ id, k: "phlox", x: 200 * id, y: 700, t: iso(1), dead: iso(6) }, m && { m });
  // home: 2 dead phlox (12 each); riverside: 3 dead phlox
  const stored = stored3({ coins: 3, earned: 40, maps: ["riverside"], next: 6,
    placed: [dead(1), dead(2, "riverside"), dead(3), dead(4, "riverside"), dead(5, "riverside")] });
  const root = openGarden(page(stored, { now: NOW }));
  touch(root, 1);
  assert.strictEqual(hint(root).textContent, "たいひにする？ +12はいぜんぶ ×2✕");
  button(root, "ぜんぶ ×2").click();
  assert.strictEqual(hint(root).textContent, "かれた くさばな ×2 を ぜんぶ たいひにする？ +24はい✕");
  assert.deepStrictEqual(byClass(root, "kg-sel").map((d) => +d.dataset.id).sort(), [1, 3]);
  button(root, "はい").click();
  assert.deepStrictEqual(saved(stored).placed.map((p) => p.id), [2, 4, 5]);
  assert.strictEqual(saved(stored).coins, 3 + 24);
  sign(root, "riverside").click();
  touch(root, 4);
  assert.strictEqual(hint(root).textContent, "たいひにする？ +12はいぜんぶ ×3✕");
  touch(root, null);
  touch(root, 2);
  button(root, "はい").click();
  assert.deepStrictEqual(saved(stored).placed.map((p) => p.id), [4, 5]);
  touch(root, 4);
  assert.strictEqual(hint(root).textContent, "たいひにする？ +12はいぜんぶ ×2✕");
});

test("coins, もちもの and vacation are shared by every map", () => {
  const stored = stored3({ coins: 77, maps: ["riverside"], inv: { bench: 2 }, vac: iso(10) });
  const root = openGarden(page(stored, { now: NOW }));
  sign(root, "riverside").click();
  assert.strictEqual(purse(root), "77");
  const bag = byClass(root, "kg-tab").find((n) => /もちもの/.test(n.textContent));
  assert.strictEqual(byClass(bag, "kg-badge")[0].textContent, "2");
  assert.ok(!byClass(root, "kg-vac-badge")[0].hidden);
  assert.strictEqual(saved(stored).vac, iso(10));
});

// ---- the dev fill ---------------------------------------------------------------------------

test("「+150」 places on the shown map, out of that map's water", () => {
  for (const key of ["riverside", "waterfall"]) {
    const stored = stored3({ maps: ["riverside", "waterfall"], at: key, next: 1 });
    const win = page(stored, { now: NOW });
    const root = openGarden(win, undefined, { dev: "1" });
    byClass(openSettings(root), "kg-dev").find((b) => b.textContent === "+150").click();
    const placed = saved(stored).placed;
    assert.strictEqual(placed.length, 150);
    assert.ok(placed.every((p) => p.m === key), key);
    assert.ok(placed.every((p) => !wet(win.KanpekiGarden, key, p)), key + ": a plant in the water");
    assert.strictEqual(byClass(root, "kg-item").length, 150);
  }
  // and on home, out of the pond, with no m
  const stored = stored3({ maps: ["riverside"], next: 1 });
  const win = page(stored, { now: NOW });
  byClass(openSettings(openGarden(win, undefined, { dev: "1" })), "kg-dev").find((b) => b.textContent === "+150").click();
  assert.ok(saved(stored).placed.every((p) => !("m" in p) && !wet(win.KanpekiGarden, "home", p)));
});

test("「+150」 passes over a spot in the river for another", () => {
  // kind 0 (the first plant), then the river's middle, then a spot on the grass, for the first plant
  const stored = stored3({ maps: ["riverside"], at: "riverside", next: 1 });
  const win = page(stored, { now: NOW, src: randoms([0, 560 / 2000, 1000 / 1116, 0.5, 0.5]) });
  byClass(openSettings(openGarden(win, undefined, { dev: "1" })), "kg-dev").find((b) => b.textContent === "+150").click();
  const p = saved(stored).placed[0];
  assert.deepStrictEqual([p.k, p.x, p.y, p.m], ["rose_pink", 1000, 558, "riverside"]);
});

// ---- English ------------------------------------------------------------------------------

test("data-lang=\"en\": the map names, signs and questions are in English", () => {
  const stored = stored3({ coins: 1200, maps: ["riverside"] });
  const root = openGarden(page(stored, { now: NOW }), undefined, EN);
  assert.strictEqual(name(root), "My garden");
  assert.deepStrictEqual(signs(root).map((b) => [b.textContent, b.attrs["aria-label"]]),
    [["Riverside meadow", "Go to Riverside meadow"]]);
  sign(root, "riverside").click();
  assert.strictEqual(name(root), "Riverside meadow");
  assert.deepStrictEqual(signs(root).map((b) => [b.textContent, b.attrs["aria-label"]]),
    [["My garden", "Go to My garden"], ["Open for 1000", "Open Waterfall plateau for 1000 coins"]]);
  sign(root, "waterfall").click();
  assert.strictEqual(hint(root).textContent, "Open Waterfall plateau for 1000?Yes✕");
  button(root, "Yes").click();
  assert.strictEqual(name(root), "Waterfall plateau");
  assert.deepStrictEqual(saved(stored).maps, ["riverside", "waterfall"]);
  sign(root, "riverside").click();
  const poor = openGarden(page(stored3({ coins: 10 }), { now: NOW }), undefined, EN);
  sign(poor, "riverside").click();
  assert.strictEqual(hint(poor).textContent, "You need 490 more coins. Keep going with your cards!OK");
});
