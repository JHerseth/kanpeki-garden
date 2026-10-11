// Maps: the home garden and two more, opened by buying their signposts in the shop's とち tab and linked by the signs
// the player places. Placed items belong to their map; coins, もちもの and the shop are shared, and the life cycle runs
// on every map. The save's v: 3 keeps the maps whose signs are owned (maps), the current one (at) and each placed
// item's map (m); a placed sign is an item, sign_<map>, with f: 1 while flipped.
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
const FOLDED = { [PREFS_KEY]: JSON.stringify({ shop: false }) };
const UP = 634 / 1116;                    // the camera's scale upright at 360 x 740, folded: the map fills the height
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const stored3 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 3, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const saved = (stored) => JSON.parse(stored[KEY]);
/** A value from the garden's page as plain JSON, to compare with this realm's objects. */
const plain = (v) => JSON.parse(JSON.stringify(v));

const hint = (root) => byClass(root, "kg-hint")[0];
const button = (root, text) => hint(root).all((n) => n.tagName === "button").find((b) => b.textContent === text);
const ids = (root) => byClass(root, "kg-item").map((d) => Number(d.dataset.id)).sort((a, b) => a - b);
const node = (root, id) => byClass(root, "kg-item").find((d) => d.dataset.id === String(id));
const bugs = (root) => byClass(root, "kg-bug").length;
const purse = (root) => byClass(root, "kg-purse-n")[0].textContent;
const confirm = (root) => byClass(root, "kg-confirm")[0];
const outlined = (root) => byClass(root, "kg-sel").map((d) => Number(d.dataset.id)).sort((a, b) => a - b);
/** The selected sign's label, or null while it's hidden. */
const label = (root) => { const b = byClass(root, "kg-go")[0]; return b.hidden ? null : b; };
/** The map's name in the top bar, and its dots: here, open or lock, one per map in order. */
const name = (root) => byClass(root, "kg-map-name")[0].textContent;
const dots = (root) => byClass(root, "kg-dot").map((n) => n.className.split(" ").find((c) => c !== "kg-dot"));
/** The backgrounds loaded so far, [map, src], and the one shown. */
const bgs = (root) => byClass(root, "kg-bg").map((n) => [n.dataset.map, n.src]);
const shownBg = (root) => byClass(root, "kg-bg").filter((n) => !n.hidden).map((n) => n.src);
/** Open shop tab `t` (its label starts with t); the cards' texts. */
const tabNamed = (root, t) => byClass(root, "kg-tab").find((n) => n.textContent.startsWith(t));
const cards = (root) => byClass(root, "kg-card").map((c) => c.textContent);
const card = (root, text) => byClass(root, "kg-card").find((c) => byClass(c, "kg-name")[0].textContent === text);
/** The camera, from the world's transform: { x, y, s }. */
function cam(root) {
  const m = /translate\((-?[\d.e-]+)px,(-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/.exec(byClass(root, "kg-world")[0].style.transform);
  return { x: +m[1], y: +m[2], s: +m[3] };
}
/** Pointer event `type` on the map at garden spot x, y (the fake view's corner is the page's), on placed item d. */
function pointer(root, type, x, y, d, id = 1) {
  const c = cam(root), target = { closest: (sel) => (sel === ".kg-item" ? d || null : null) };
  byClass(root, "kg-view")[0].on[type].forEach((f) =>
    f({ type, pointerId: id, clientX: x * c.s + c.x, clientY: y * c.s + c.y, target }));
}
/** A tap on placed item `id`, or on the empty map at garden spot x, y. */
function touch(root, id, x = 1000, y = 600) {
  const d = id == null ? null : node(root, id);
  ["pointerdown", "pointerup"].forEach((type) => pointer(root, type, x, y, d));
}
/** Walk by the placed sign `id`: a tap selects it, a second walks. */
function walkBy(root, id) { touch(root, id); touch(root, id); }
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
/** A placed sign to map `to`, on map m (home if left out), at x, y. */
const sign = (id, to, m, x = 1200, y = 900, more) => Object.assign({ id, k: "sign_" + to, x, y }, m && { m }, more);

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
  const stored = { "kanpekikun-garden": JSON.stringify({ v: 1, coins: 7, earned: 7, seen: {}, inv: {},
    placed: [{ id: 1, k: "watering_can", x: 500, y: 700 }], next: 2 }) };
  page(stored, { now: NOW }).KanpekiGarden.load();
  assert.deepStrictEqual([saved(stored).v, saved(stored).coins, saved(stored).placed[0].m], [3, 7, undefined]);
});

test("a fresh garden is v: 3, on the home map, with no map but home open", () => {
  const stored = {};
  openGarden(page(stored, { now: NOW }), 5);
  const s = saved(stored);
  assert.strictEqual(s.v, 3);
  assert.deepStrictEqual([s.maps, s.at, s.inv], [undefined, undefined, {}]);
});

// v1.1.0 is the last release with v: 2: its load() locks any save whose v isn't 2. Its script, from the tag (not in a
// shallow clone), is run on a v: 3 save; the second test reads the same rule off the save itself.
const old = spawnSync("git", ["show", "v1.1.0:garden.js"], { cwd: DIR, encoding: "utf8" });
const noOld = (old.status !== 0 || !/if \(s\.v !== 2\) return locked\(\);/.test(old.stdout)) && "no v1.1.0 tag here";

test("v1.1.0's script locks a v: 3 save: it won't open the garden, pay into it or write over it", { skip: noOld }, () => {
  const stored = stored3({ coins: 600, earned: 1100, maps: ["riverside"], at: "riverside", next: 4,
    placed: [rose(1), rose(2, "riverside"), sign(3, "home", "riverside", 900, 900, { f: 1 })] });
  const before = stored[KEY];
  const win = page(stored, { now: NOW, src: () => old.stdout });
  assert.ok(win.KanpekiGarden.load().locked);
  const root = openGarden(win, 5);                     // a card answered: it pays nothing
  assert.strictEqual(confirm(root).textContent, "いまは にわを ひらけないよ");
  byClass(root, "kg-close")[0].click();
  assert.deepStrictEqual(Object.keys(stored), [KEY]);
  assert.strictEqual(stored[KEY], before);
  // and this script still reads it as it was
  const s = page(stored, { now: NOW }).KanpekiGarden.load();
  assert.deepStrictEqual(plain([s.coins, s.maps, s.at, s.placed[1].m, s.placed[2]]),
    [600, ["riverside"], "riverside", "riverside", sign(3, "home", "riverside", 900, 900, { f: 1 })]);
});

test("a moved save keeps the key an older script reads, with a v other than 2, which that script locks", () => {
  const stored = { [KEY]: JSON.stringify({ v: 2, coins: 1, earned: 1, seen: {}, inv: {}, placed: [], next: 1, days: {} }) };
  page(stored, { now: NOW }).KanpekiGarden.load();
  assert.deepStrictEqual(Object.keys(stored), ["kanpekikun-garden-2"]);
  assert.ok(saved(stored).v !== 2, "v1.1.0: if (s.v !== 2) return locked();");
});

test("a save from a newer script (v: 4) is locked: nothing is bought, walked or written", () => {
  const stored = { [KEY]: JSON.stringify({ v: 4, coins: 900, earned: 900, maps: ["riverside"] }) };
  const before = stored[KEY];
  const root = openGarden(page(stored, { now: NOW }));
  tabNamed(root, "とち").click();
  card(root, "かわべの はらっぱ の かんばん").click();
  byClass(confirm(root), "kg-btn").forEach((b) => b.click());
  byClass(root, "kg-close")[0].click();
  assert.strictEqual(stored[KEY], before);
  assert.strictEqual(name(root), "わたしのにわ");
});

test("damaged map fields fall back to home or are dropped", () => {
  const load = (over) => {
    const stored = stored3(Object.assign({ next: 20 }, over));
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

test("damaged signs: only to open maps, never on their own map, one of each on a map, f only as 1, none in inv", () => {
  const stored = stored3({ maps: ["riverside"], next: 20, inv: { sign_riverside: 2, sign_home: 1, bench: 1 }, placed: [
    sign(1, "riverside"), sign(2, "riverside", null, 500), sign(3, "waterfall"), sign(4, "home"),
    sign(5, "home", "riverside", 900, 900, { f: 1 }), sign(6, "riverside", "riverside"), sign(7, "home", "riverside"),
    sign(8, "riverside", null, 700, 900, { f: true }), sign(9, "home", "waterfall"), rose(10)] });
  const s = plain(page(stored, { now: NOW }).KanpekiGarden.load());
  assert.deepStrictEqual(saved(stored), s);
  // 2 and 8: a second riverside sign on home; 3: a locked map's; 4, 6: on their own map; 7: a second home sign by the
  // river; 9: on a locked map, so it went home, where it's on its own map
  assert.deepStrictEqual(s.placed.map((p) => p.id), [1, 5, 10]);
  assert.strictEqual(s.placed[1].f, 1);
  assert.deepStrictEqual(s.inv, { bench: 1 });
  const flip = plain(page(stored3({ maps: ["riverside"], placed: [sign(1, "riverside", null, 1, 1, { f: 0 })] }), { now: NOW })
    .KanpekiGarden.load()).placed[0];
  assert.ok(!("f" in flip));
});

test("a sound v: 3 save loads without a write; one whose only damage is a sign is written", () => {
  // the same sign (waterfall's) on two maps: one of each per map, so both stay
  const stored = stored3({ maps: ["riverside", "waterfall"], at: "riverside", next: 7,
    placed: [rose(1), rose(2, "riverside"), sign(3, "riverside"), sign(4, "home", "riverside", 900, 900, { f: 1 }),
      sign(5, "waterfall"), sign(6, "waterfall", "riverside")] });
  let writes = 0;
  const watched = new Proxy(stored, { set(t, k, v) { writes++; t[k] = v; return true; } });
  const s = page(watched, { now: NOW }).KanpekiGarden.load();
  assert.strictEqual(writes, 0);
  assert.deepStrictEqual(plain(s.placed.map((p) => p.id)), [1, 2, 3, 4, 5, 6]);
  // a riverside sign by the river, on its own map: dropped, and the save written for it
  const bad = stored3({ maps: ["riverside"], next: 3, placed: [rose(1), sign(2, "riverside", "riverside")] });
  const badWatched = new Proxy(bad, { set(t, k, v) { writes++; t[k] = v; return true; } });
  page(badWatched, { now: NOW }).KanpekiGarden.load();
  assert.strictEqual(writes, 1);
  assert.deepStrictEqual(saved(bad).placed.map((p) => p.id), [1]);
  writes = 0;
  // the trap counts: a v: 2 save is written once
  page(new Proxy({ [KEY]: stored[KEY].replace('"v":3', '"v":2') }, { set(t, k, v) { writes++; t[k] = v; return true; } }),
    { now: NOW }).KanpekiGarden.load();
  assert.strictEqual(writes, 1);
});

// ---- the maps and their signs ----------------------------------------------------------------

test("three maps in order, each with its sign: an item of the とち tab, priced as the map, drawn with KG_SIGN", () => {
  const win = page({}), G = win.KanpekiGarden;
  assert.deepStrictEqual(plain(G.maps).map((m) => [m.key, m.price, m.bg]), [["home", 0, "_garden_bg.webp"],
    ["riverside", 500, "_garden_bg_riverside.webp"], ["waterfall", 1000, "_garden_bg_waterfall.webp"]]);
  assert.deepStrictEqual(plain(G.maps[0].water), [[1655, 685, 270, 180]]);           // home keeps POND
  const [a, x, y, w, h, ax, ay] = win.KG_SIGN;
  assert.ok(h * win.KG_SCALE > 70 && h * win.KG_SCALE < 110, "about 90 garden px tall");
  for (const [key, ja, en, price] of [["home", "わたしのにわ の かんばん", "Sign to My garden", 0],
    ["riverside", "かわべの はらっぱ の かんばん", "Sign to Riverside meadow", 500],
    ["waterfall", "たきの たかだい の かんばん", "Sign to Waterfall plateau", 1000]]) {
    const item = G.items["sign_" + key];
    assert.deepStrictEqual(plain([item.name, item.en, item.tab, item.price, item.to, item.frames]),
      [ja, en, "とち", price, key, [{ a, x, y, w, h, ax, ay }]]);
    assert.ok(!win.KG_CATALOG.some((e) => e[0] === "sign_" + key));
  }
});

test("each map's water is where its picture has water, and not on its grass or paths", () => {
  const G = page({}).KanpekiGarden;
  const wetSpots = { home: [[1655, 685], [1500, 650]],
    riverside: [[230, 860], [370, 950], [560, 1000], [760, 1005], [1120, 1025], [1340, 1000], [1580, 945], [1800, 900], [1880, 830]],
    waterfall: [[1770, 540], [1650, 520], [1850, 150], [1855, 330]] };
  // grass, and the paths, bridge and stairs at the edges, where signs might go
  const drySpots = { home: [[1000, 600], [965, 1085]],
    riverside: [[1000, 500], [950, 1045], [1592, 300], [400, 700], [1700, 700]],
    waterfall: [[1000, 600], [970, 1060], [1500, 500], [1700, 800]] };
  for (const key of ["home", "riverside", "waterfall"]) {
    for (const [x, y] of wetSpots[key]) assert.ok(wet(G, key, { x, y }), key + " " + x + "," + y + " is water");
    for (const [x, y] of drySpots[key]) assert.ok(!wet(G, key, { x, y }), key + " " + x + "," + y + " is land");
  }
});

// ---- the shop: とち ---------------------------------------------------------------------------

test("the とち tab comes after かざり and sells riverside's sign; waterfall's once riverside's is owned; never home's", () => {
  let root = openGarden(page(stored3({ coins: 2000 }), { now: NOW }));
  assert.deepStrictEqual(byClass(root, "kg-tab").slice(-2).map((n) => n.textContent), ["かざり", "とち"]);
  tabNamed(root, "とち").click();
  assert.deepStrictEqual(cards(root), ["かわべの はらっぱ の かんばん500"]);
  root = openGarden(page(stored3({ coins: 2000, maps: ["riverside"] }), { now: NOW }));
  tabNamed(root, "とち").click();
  assert.deepStrictEqual(cards(root), ["かわべの はらっぱ の かんばんもっているよ", "たきの たかだい の かんばん1000"]);
  assert.ok(card(root, "かわべの はらっぱ の かんばん").classList.contains("kg-owned"));
  card(root, "かわべの はらっぱ の かんばん").click();       // owned: nothing to buy
  assert.ok(confirm(root).hidden);
  root = openGarden(page(stored3({ coins: 10, maps: ["riverside", "waterfall"] }), { now: NOW }));
  tabNamed(root, "とち").click();
  assert.deepStrictEqual(cards(root), ["かわべの はらっぱ の かんばんもっているよ", "たきの たかだい の かんばんもっているよ"]);
});

test("at exactly its price a sign is bought: 0 left, the map open, earned the same, and placing starts here", () => {
  const stored = stored3({ coins: 500, earned: 800, next: 2, placed: [rose(1)] });
  const root = openGarden(page(stored, { now: NOW }));
  tabNamed(root, "とち").click();
  card(root, "かわべの はらっぱ の かんばん").click();
  assert.strictEqual(confirm(root).textContent, "かわべの はらっぱ の かんばん500 で かう？ のこりは 0かうやめる");
  byClass(confirm(root), "kg-btn-go")[0].click();
  let s = saved(stored);
  assert.deepStrictEqual([s.coins, s.earned, s.maps, s.inv], [0, 800, ["riverside"], {}]);
  assert.strictEqual(purse(root), "0");
  assert.deepStrictEqual(dots(root), ["kg-dot-here", "kg-dot-open", "kg-dot-lock"]);
  assert.match(hint(root).textContent, /^タップ して おいてね/);
  touch(root, null, 965, 1085);
  s = saved(stored);
  assert.deepStrictEqual(s.placed.slice(1).map((p) => [p.id, p.k, p.m, p.f]), [[2, "sign_riverside", undefined, undefined]]);
  assert.deepStrictEqual(s.inv, {});
  // the bought sign is in もちもの for good, but this map has it now; the home sign can't go home
  tabNamed(root, "もちもの").click();
  assert.deepStrictEqual(cards(root), ["わたしのにわ の かんばんいまの にわだよ", "かわべの はらっぱ の かんばんもう おいてあるよ"]);
  // nothing else in the bag, and no sign that can go here: it still points to the shop, above the signs
  assert.strictEqual(byClass(root, "kg-empty")[0].textContent, "まだ なにも もっていないよ。おみせで かってね。");
  assert.ok(byClass(root, "kg-card").every((c) => c.attrs["aria-disabled"] === "true"));
  assert.ok(byClass(root, "kg-card").every((c) => c.classList.contains("kg-off")));
});

test("one coin short (499), the sign isn't bought: the shop's too-few message, and nothing changes", () => {
  const stored = stored3({ coins: 499, earned: 499 });
  const before = stored[KEY];
  const root = openGarden(page(stored, { now: NOW }));
  tabNamed(root, "とち").click();
  assert.ok(card(root, "かわべの はらっぱ の かんばん").classList.contains("kg-poor"));
  card(root, "かわべの はらっぱ の かんばん").click();
  assert.strictEqual(confirm(root).textContent, "かわべの はらっぱ の かんばんあと 1 コイン たりないよ。カードを がんばろう！OK");
  byClass(confirm(root), "kg-btn")[0].click();
  assert.ok(confirm(root).hidden);
  assert.strictEqual(stored[KEY], before);
});

test("「かう」 checks the coins again when tapped: a question left open after another spend can't go below 0", () => {
  const stored = stored3({ coins: 510, earned: 510 });
  const root = openGarden(page(stored, { now: NOW }));
  tabNamed(root, "花").click();
  card(root, "ピンクのバラ").click();                       // 20: affordable now
  const roseBuy = byClass(confirm(root), "kg-btn-go")[0];
  tabNamed(root, "とち").click();
  card(root, "かわべの はらっぱ の かんばん").click();
  const signBuy = byClass(confirm(root), "kg-btn-go")[0];
  signBuy.click();
  assert.strictEqual(saved(stored).coins, 10);
  roseBuy.click();                                          // the old question's button, fired anyway
  assert.deepStrictEqual([saved(stored).coins, saved(stored).inv], [10, {}]);
  assert.strictEqual(confirm(root).textContent, "ピンクのバラあと 10 コイン たりないよ。カードを がんばろう！OK");
  // a sign is never paid for twice, with coins enough for it again
  const rich = stored3({ coins: 2000 });
  const r2 = openGarden(page(rich, { now: NOW }));
  tabNamed(r2, "とち").click();
  card(r2, "かわべの はらっぱ の かんばん").click();
  const again = byClass(confirm(r2), "kg-btn-go")[0];
  again.click();
  again.click();
  assert.deepStrictEqual([saved(rich).coins, saved(rich).maps], [1500, ["riverside"]]);
  tabNamed(r2, "とち").click();
  assert.strictEqual(card(r2, "かわべの はらっぱ の かんばん").attrs["aria-disabled"], "true");     // owned
});

test("「かう」's check again is at the exact price: coins left just enough still buy, one short don't", () => {
  for (const [coins, bought] of [[520, true], [519, false]]) {
    const stored = stored3({ coins });
    const root = openGarden(page(stored, { now: NOW }));
    tabNamed(root, "花").click();
    card(root, "ピンクのバラ").click();
    const roseBuy = byClass(confirm(root), "kg-btn-go")[0];
    tabNamed(root, "とち").click();
    card(root, "かわべの はらっぱ の かんばん").click();
    byClass(confirm(root), "kg-btn-go")[0].click();      // 20 or 19 left
    roseBuy.click();
    assert.deepStrictEqual([saved(stored).coins, saved(stored).inv], bought ? [0, { rose_pink: 1 }] : [19, {}], String(coins));
  }
});

test("owned signs never run out: one of each per map, never on its own map, greyed with why where they can't go", () => {
  const stored = stored3({ maps: ["riverside", "waterfall"], next: 1 });
  const root = openGarden(page(stored, { now: NOW }));
  tabNamed(root, "もちもの").click();
  const why = () => byClass(root, "kg-card").map((c) => [byClass(c, "kg-name")[0].textContent,
    c.classList.contains("kg-off") ? byClass(c, "kg-why")[0].textContent : null]);
  assert.deepStrictEqual(why(), [["わたしのにわ の かんばん", "いまの にわだよ"], ["かわべの はらっぱ の かんばん", null],
    ["たきの たかだい の かんばん", null]]);
  card(root, "わたしのにわ の かんばん").click();                // greyed: nothing happens
  assert.ok(hint(root).hidden);
  const place = (n, x) => { tabNamed(root, "もちもの").click(); card(root, n).click(); touch(root, null, x, 900); };
  place("かわべの はらっぱ の かんばん", 900);
  place("たきの たかだい の かんばん", 1300);
  tabNamed(root, "もちもの").click();
  assert.deepStrictEqual(why(), [["わたしのにわ の かんばん", "いまの にわだよ"], ["かわべの はらっぱ の かんばん", "もう おいてあるよ"],
    ["たきの たかだい の かんばん", "もう おいてあるよ"]]);
  assert.deepStrictEqual(saved(stored).placed.map((p) => p.k), ["sign_riverside", "sign_waterfall"]);
  // on the riverside, its own sign can't go, the others can: the bag, left open, shows it after the walk
  walkBy(root, 1);
  assert.strictEqual(byClass(root, "kg-empty").length, 0, "a sign can go here: no need to point to the shop");
  assert.deepStrictEqual(why(), [["わたしのにわ の かんばん", null], ["かわべの はらっぱ の かんばん", "いまの にわだよ"],
    ["たきの たかだい の かんばん", null]]);
  const bag = byClass(root, "kg-tab").find((n) => /もちもの/.test(n.textContent));
  assert.strictEqual(byClass(bag, "kg-badge").length, 0, "signs aren't counted");
});

// ---- a placed sign ----------------------------------------------------------------------------

test("no label until a sign is selected; the first tap selects it, with its label and the hint's ↔, しまう and OK", () => {
  const stored = stored3({ maps: ["riverside"], next: 3, placed: [rose(1), sign(2, "riverside")] });
  const root = openGarden(page(stored, { now: NOW }));
  assert.strictEqual(label(root), null);
  touch(root, 1);                                           // a rose: no label
  assert.strictEqual(label(root), null);
  touch(root, 2);
  assert.deepStrictEqual(outlined(root), [2]);
  assert.strictEqual(label(root).textContent, "かわべの はらっぱ へ ▶︎");
  assert.strictEqual(label(root).attrs["aria-label"], "かわべの はらっぱ へ いく");
  assert.strictEqual(label(root).parent, byClass(root, "kg-view")[0]);     // over the map, at screen size
  assert.strictEqual(hint(root).textContent, "ゆびで うごかせるよ↔しまうOK");
  assert.strictEqual(button(root, "↔").attrs["aria-label"], "やじるしの むきを かえる");
  touch(root, null);                                        // a tap elsewhere: deselected, no label
  assert.deepStrictEqual([outlined(root), label(root)], [[], null]);
  touch(root, 2);
  button(root, "OK").click();
  assert.strictEqual(label(root), null);
  assert.strictEqual(name(root), "わたしのにわ");
  assert.ok(byClass(node(root, 2), "kg-sprite")[0] && node(root, 2).classList.contains("kg-signpost"));
});

test("↔ flips the sign's arrow: f: 1 in the save, the picture mirrored about its foot, the label's arrow too", () => {
  const stored = stored3({ maps: ["riverside"], next: 2, placed: [sign(1, "riverside")] });
  const win = page(stored, { now: NOW });
  const root = openGarden(win);
  touch(root, 1);
  button(root, "↔").click();
  const pic = node(root, 1).children[0];
  assert.strictEqual(saved(stored).placed[0].f, 1);
  assert.deepStrictEqual([pic.style.transform, pic.style.transformOrigin], ["scaleX(-1)", win.KG_SIGN[5] * win.KG_SCALE + "px 0"]);
  assert.strictEqual(label(root).textContent, "◀︎ かわべの はらっぱ へ");
  assert.deepStrictEqual(outlined(root), [1], "still selected");
  button(root, "↔").click();
  assert.ok(!("f" in saved(stored).placed[0]));
  assert.strictEqual(pic.style.transform, "");
  // reopened, a flipped sign stays flipped
  button(root, "↔").click();
  const again = openGarden(page(stored, { now: NOW }));
  assert.strictEqual(node(again, 1).children[0].style.transform, "scaleX(-1)");
});

test("しまう takes a sign off the map; it stays owned, in もちもの, ready to go back", () => {
  const stored = stored3({ maps: ["riverside"], next: 2, placed: [sign(1, "riverside")] });
  const root = openGarden(page(stored, { now: NOW }));
  touch(root, 1);
  button(root, "しまう").click();
  assert.deepStrictEqual([saved(stored).placed, saved(stored).inv, saved(stored).maps], [[], {}, ["riverside"]]);
  assert.strictEqual(label(root), null);
  tabNamed(root, "もちもの").click();
  assert.ok(!card(root, "かわべの はらっぱ の かんばん").classList.contains("kg-off"));
});

test("a second tap on the sign, or a tap on its label, walks there", () => {
  const stored = stored3({ maps: ["riverside"], next: 3, placed: [sign(1, "riverside"), sign(2, "home", "riverside")] });
  const root = openGarden(page(stored, { now: NOW }));
  walkBy(root, 1);
  assert.strictEqual(name(root), "かわべの はらっぱ");
  assert.deepStrictEqual([ids(root), outlined(root), label(root)], [[2], [], null]);
  touch(root, 2);
  label(root).click();
  assert.strictEqual(name(root), "わたしのにわ");
  assert.ok(!("at" in saved(stored)));
});

test("dragging a sign moves it; its label goes with it", () => {
  const stored = stored3({ maps: ["riverside"], next: 2, placed: [sign(1, "riverside", null, 1000, 900)] });
  const win = page(stored, { now: NOW });
  const root = openGarden(win);
  touch(root, 1, 1000, 880);
  const before = label(root).style.left;
  pointer(root, "pointerdown", 1000, 880, node(root, 1));
  pointer(root, "pointermove", 1200, 880, node(root, 1));
  pointer(root, "pointerup", 1200, 880, node(root, 1));
  assert.deepStrictEqual([saved(stored).placed[0].x, saved(stored).placed[0].y], [1200, 900]);
  assert.notStrictEqual(label(root).style.left, before);
  assert.strictEqual(name(root), "わたしのにわ", "a drag doesn't walk");
});

test("the label sits over the sign at screen size; its size is read once each time it shows, not on every move", () => {
  const stored = Object.assign(stored3({ maps: ["riverside"], next: 2, placed: [sign(1, "riverside", null, 965, 1085)] }), FOLDED);
  const win = page(stored, { now: NOW, screen: [360, 740] });
  const root = openGarden(win);
  const b = byClass(root, "kg-go")[0];
  let reads = 0;
  Object.defineProperty(b, "offsetWidth", { get() { reads++; return 120; } });
  Object.defineProperty(b, "offsetHeight", { get() { reads++; return 30; } });
  touch(root, 1, 965, 1060);
  assert.strictEqual(reads, 2);
  const top = win.KG_SIGN[6] * win.KG_SCALE;
  const over = (c) => [c.x + 965 * c.s - 60, c.y + (1085 - top) * c.s - 6 - 30];
  const where = () => [parseFloat(b.style.left), parseFloat(b.style.top)];
  const c0 = cam(root);
  assert.deepStrictEqual(where().map(Math.round), over(c0).map(Math.round));
  // a pan and a zoom move it, without reading its size again
  pointer(root, "pointerdown", 500, 300, null, 2);
  pointer(root, "pointermove", 400, 300, null, 2);
  pointer(root, "pointerup", 400, 300, null, 2);
  byClass(root, "kg-zbtn")[0].click();
  const c1 = cam(root);
  assert.notDeepStrictEqual(c1, c0);
  assert.deepStrictEqual(where().map(Math.round), over(c1).map(Math.round));
  assert.strictEqual(reads, 2);
});

test("the signs' hit area: the world's --kg-s is the camera's scale, set only when it changes", () => {
  const root = openGarden(page(Object.assign(stored3({}), FOLDED), { now: NOW, screen: [360, 740] }));
  const world = byClass(root, "kg-world")[0];
  let sets = 0;
  const setProperty = world.style.setProperty.bind(world.style);
  world.style.setProperty = (k, v) => { if (k === "--kg-s") sets++; setProperty(k, v); };
  assert.strictEqual(world.style["--kg-s"], String(cam(root).s));
  pointer(root, "pointerdown", 500, 300, null, 2);
  pointer(root, "pointermove", 400, 300, null, 2);
  pointer(root, "pointermove", 300, 300, null, 2);
  assert.strictEqual(sets, 0, "a pan doesn't set it");
  byClass(root, "kg-zbtn")[0].click();
  assert.strictEqual(sets, 1);
  assert.strictEqual(world.style["--kg-s"], String(cam(root).s));
});

// ---- walking ---------------------------------------------------------------------------------

test("the view lands centred on the sign back to the map left, at the same zoom; on the map's middle without one", () => {
  // upright and folded: the map fills the view's height, wider than the view (see fold.test.js)
  const stored = Object.assign(stored3({ maps: ["riverside", "waterfall"], next: 5, placed: [sign(1, "riverside", null, 965, 1085),
    sign(2, "home", "riverside", 1300, 1000), sign(3, "waterfall", "riverside", 1592, 300)] }), FOLDED);
  const win = page(stored, { now: NOW, screen: [360, 740] });
  const root = openGarden(win);
  const mid = win.KG_SIGN[6] * win.KG_SCALE / 2;          // half the signpost's height
  assert.ok(Math.abs(cam(root).s - UP) < 1e-9);
  walkBy(root, 1);
  let c = cam(root);
  assert.ok(Math.abs(c.s - UP) < 1e-9);
  assert.ok(Math.abs(c.x - (180 - 1300 * UP)) < 1e-6, "on the home sign by the river: " + c.x);
  assert.strictEqual(c.y, 0);                              // the height fills the view: nothing to move
  walkBy(root, 3);
  c = cam(root);                                           // no sign back on the waterfall map: its middle
  assert.ok(Math.abs(c.x - (180 - 1000 * UP)) < 1e-6, "the middle: " + c.x);
  // zoomed in: the same zoom, and the height centred on the sign's middle too, as far as the map goes
  const again = Object.assign(stored3({ maps: ["riverside"], next: 3,
    placed: [sign(1, "riverside", null, 965, 1085), sign(2, "home", "riverside", 1300, 700)] }), FOLDED);
  const r2 = openGarden(page(again, { now: NOW, screen: [360, 740] }));
  byClass(r2, "kg-zbtn")[0].click();
  const s2 = cam(r2).s;
  walkBy(r2, 1);
  c = cam(r2);
  const fit = (v, view, world) => Math.min(0, Math.max(view - world * s2, v));
  assert.strictEqual(c.s, s2);
  assert.ok(Math.abs(c.x - fit(180 - 1300 * s2, 360, 2000)) < 1e-6, "x: " + c.x);
  assert.ok(Math.abs(c.y - fit(317 - (700 - mid) * s2, 634, 1116)) < 1e-6, "y: " + c.y);
});

test("walking switches the items, the butterflies, the background and the top bar; the garden reopens on the last map", () => {
  // 10 living roses by the river: 2 butterflies there, none at home (one rose)
  const river = Array.from({ length: 10 }, (_, i) => rose(i + 2, "riverside"));
  const stored = stored3({ maps: ["riverside"], next: 14,
    placed: [rose(1)].concat(river, [sign(12, "riverside"), sign(13, "home", "riverside")]) });
  const win = page(stored, { now: NOW });
  let root = openGarden(win);
  assert.deepStrictEqual([ids(root), bugs(root), bgs(root)], [[1, 12], 0, [["home", "_garden_bg.webp"]]]);
  walkBy(root, 12);
  assert.deepStrictEqual(ids(root), river.map((p) => p.id).concat(13));
  assert.strictEqual(bugs(root), 2);
  assert.deepStrictEqual([name(root), dots(root)], ["かわべの はらっぱ", ["kg-dot-open", "kg-dot-here", "kg-dot-lock"]]);
  assert.deepStrictEqual(bgs(root), [["home", "_garden_bg.webp"], ["riverside", "_garden_bg_riverside.webp"]]);
  assert.deepStrictEqual(shownBg(root), ["_garden_bg_riverside.webp"]);
  assert.strictEqual(saved(stored).at, "riverside");
  byClass(root, "kg-close")[0].click();
  root = openGarden(win);
  assert.deepStrictEqual([name(root), bgs(root)], ["かわべの はらっぱ", [["riverside", "_garden_bg_riverside.webp"]]]);
  walkBy(root, 13);
  assert.deepStrictEqual([ids(root), bugs(root), name(root)], [[1, 12], 0, "わたしのにわ"]);
  walkBy(root, 12);
  assert.strictEqual(bgs(root).length, 2, "each picture loaded once");
});

test("the walk fades: a veil over the map that goes when its animation ends; none before the first walk", () => {
  const root = openGarden(page(stored3({ maps: ["riverside"], next: 3, placed: [sign(1, "riverside"), sign(2, "home", "riverside")] }),
    { now: NOW }));
  assert.strictEqual(byClass(root, "kg-veil").length, 0);
  walkBy(root, 1);
  assert.strictEqual(byClass(root, "kg-veil").length, 1);
  walkBy(root, 2);
  assert.strictEqual(byClass(root, "kg-veil").length, 1, "one at a time");
  byClass(root, "kg-veil")[0].fire("animationend");
  assert.strictEqual(byClass(root, "kg-veil").length, 0);
});

test("a walk ends a drag and a pan under way: the dragged item stays where it got to, and nothing moves after", () => {
  const stored = Object.assign(stored3({ maps: ["riverside"], next: 3,
    placed: [sign(1, "riverside", null, 1000, 900), sign(2, "home", "riverside", 1300, 1000)] }), FOLDED);
  const root = openGarden(page(stored, { now: NOW, screen: [360, 740] }));
  touch(root, 1, 1000, 880);
  // one finger drags the sign, another pans, and a third taps the label
  pointer(root, "pointerdown", 1000, 880, node(root, 1), 1);
  pointer(root, "pointermove", 1100, 880, node(root, 1), 1);
  label(root).click();
  assert.strictEqual(name(root), "かわべの はらっぱ");
  assert.deepStrictEqual(saved(stored).placed.map((p) => [p.id, p.x, p.y]), [[1, 1100, 900], [2, 1300, 1000]]);
  const c = cam(root);
  pointer(root, "pointermove", 1200, 700, node(root, 1), 1);
  pointer(root, "pointerup", 1200, 700, node(root, 1), 1);
  assert.deepStrictEqual(saved(stored).placed.map((p) => [p.id, p.x, p.y]), [[1, 1100, 900], [2, 1300, 1000]]);
  assert.deepStrictEqual(cam(root), c);
  assert.deepStrictEqual([outlined(root), name(root)], [[], "かわべの はらっぱ"]);
  // a pan under way
  touch(root, 2, 1300, 980);
  pointer(root, "pointerdown", 600, 500, null, 2);
  pointer(root, "pointermove", 500, 500, null, 2);
  label(root).click();
  const back = cam(root);
  pointer(root, "pointermove", 300, 500, null, 2);
  pointer(root, "pointerup", 300, 500, null, 2);
  assert.deepStrictEqual(cam(root), back, "the old pan's start doesn't move the new map");
  assert.strictEqual(name(root), "わたしのにわ");
});

// ---- per map, and shared --------------------------------------------------------------------

test("per map: after a walk no item, butterfly, outline or compost-all target is from the other map", () => {
  const dead = (id, m) => Object.assign({ id, k: "phlox", x: 150 * id, y: 650, t: iso(1), dead: iso(6) }, m && { m });
  const roses = (from, n, m) => Array.from({ length: n }, (_, i) => rose(from + i, m));
  // home: 2 dead phlox and 5 living roses (a butterfly); riverside: 3 dead phlox and 10 living roses (2 butterflies)
  const placed = [dead(1), dead(2, "riverside"), dead(3), dead(4, "riverside"), dead(5, "riverside")]
    .concat(roses(10, 5), roses(20, 10, "riverside"), [sign(40, "riverside"), sign(41, "home", "riverside")]);
  const stored = stored3({ coins: 3, maps: ["riverside"], next: 42, placed });
  const root = openGarden(page(stored, { now: NOW }));
  const mine = (m) => placed.filter((p) => (p.m || "home") === m).map((p) => p.id).sort((a, b) => a - b);
  const check = (m, flowers, deadOnes) => {
    assert.deepStrictEqual(ids(root), mine(m), m + ": nodes");
    assert.strictEqual(bugs(root), Math.floor(flowers / 5), m + ": butterflies");
    touch(root, deadOnes[0]);
    button(root, "ぜんぶ ×" + deadOnes.length).click();
    assert.deepStrictEqual(outlined(root), deadOnes, m + ": outlines");
    button(root, "✕").click();
    touch(root, null);
  };
  check("home", 5, [1, 3]);
  walkBy(root, 40);
  check("riverside", 10, [2, 4, 5]);
  touch(root, 2);
  button(root, "ぜんぶ ×3").click();
  button(root, "はい").click();
  assert.deepStrictEqual(saved(stored).placed.filter((p) => p.k === "phlox").map((p) => p.id), [1, 3], "home's dead stay");
  walkBy(root, 41);
  check("home", 5, [1, 3]);
});

test("plants on a map that isn't shown still grow, wilt and die", () => {
  // planted on the 5th on both maps, reviews on the 5th to the 7th, then none: on the 12th, 4 days missed
  const days = { [iso(5)]: 1, [iso(6)]: 1, [iso(7)]: 1 };
  const placed = [rose(1, null, { t: iso(5) }), rose(2, "riverside", { t: iso(5) }), sign(3, "riverside")];
  const grow = (day) => {
    const stored = stored3({ maps: ["riverside"], days, next: 4, placed });
    const win = page(stored, { now: at(day) });
    openGarden(win);
    const s = saved(stored);
    return s.placed.slice(0, 2).map((p) => plain(win.KanpekiGarden.life(s, p)));
  };
  assert.deepStrictEqual(grow(8), [{ g: 2, missed: 0, dead: false }, { g: 2, missed: 0, dead: false }]);
  assert.deepStrictEqual(grow(10), [{ g: 2, missed: 2, dead: false }, { g: 2, missed: 2, dead: false }]);
  const stored = stored3({ maps: ["riverside"], days, next: 4, placed });
  const root = openGarden(page(stored, { now: at(12) }));     // opened at home
  assert.deepStrictEqual(saved(stored).placed.slice(0, 2).map((p) => p.dead), [TODAY, TODAY], "both found dead");
  walkBy(root, 3);
  touch(root, 2);
  assert.match(hint(root).textContent, /^たいひにする？/);
});

test("coins, もちもの, the shop and vacation are shared by every map", () => {
  const stored = stored3({ coins: 77, maps: ["riverside"], inv: { bench: 2 }, vac: iso(10), next: 2, placed: [sign(1, "riverside")] });
  const root = openGarden(page(stored, { now: NOW }));
  walkBy(root, 1);
  assert.strictEqual(purse(root), "77");
  const bag = byClass(root, "kg-tab").find((n) => /もちもの/.test(n.textContent));
  assert.strictEqual(byClass(bag, "kg-badge")[0].textContent, "2");
  assert.ok(!byClass(root, "kg-vac-badge")[0].hidden);
  assert.strictEqual(saved(stored).vac, iso(10));
});

test("an item placed on a map belongs to it: m in the save, left out for home", () => {
  const stored = stored3({ maps: ["riverside"], at: "riverside", inv: { watering_can: 2 }, next: 2,
    placed: [sign(1, "home", "riverside", 1300, 1000)] });
  const root = openGarden(page(stored, { now: NOW }));
  const place = (x) => {
    tabNamed(root, "もちもの").click();
    card(root, "じょうろ").click();
    touch(root, null, x, 700);
  };
  place(500);
  walkBy(root, 1);
  place(700);
  assert.deepStrictEqual(saved(stored).placed.map((p) => [p.id, p.m]), [[1, "riverside"], [2, "riverside"], [3, undefined]]);
  assert.ok(!("m" in saved(stored).placed[2]));
  assert.deepStrictEqual(ids(root), [3]);
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
    assert.ok(placed.every((p) => !p.k.startsWith("sign_")), "no signs");
    assert.strictEqual(byClass(root, "kg-item").length, 150);
  }
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

test("data-lang=\"en\": the Land tab, the signs, their label and why one can't go are in English", () => {
  const stored = stored3({ coins: 1200, maps: ["riverside"], next: 2, placed: [sign(1, "riverside")] });
  const root = openGarden(page(stored, { now: NOW }), undefined, EN);
  assert.strictEqual(name(root), "My garden");
  tabNamed(root, "Land").click();
  assert.deepStrictEqual(cards(root), ["Sign to Riverside meadowOwned", "Sign to Waterfall plateau1000"]);
  card(root, "Sign to Waterfall plateau").click();
  assert.strictEqual(confirm(root).textContent, "Sign to Waterfall plateauBuy for 1000? You'll have 200 left.BuyCancel");
  byClass(confirm(root), "kg-btn")[1].click();
  tabNamed(root, "Bag").click();
  assert.deepStrictEqual(cards(root), ["Sign to My gardenYou're in this garden", "Sign to Riverside meadowAlready here"]);
  touch(root, 1);
  assert.strictEqual(label(root).textContent, "Riverside meadow ▶︎");
  assert.strictEqual(label(root).attrs["aria-label"], "Go to Riverside meadow");
  assert.strictEqual(hint(root).textContent, "Drag it to move it↔Put awayOK");
  assert.strictEqual(button(root, "↔").attrs["aria-label"], "Turn the arrow around");
  button(root, "↔").click();
  assert.strictEqual(label(root).textContent, "◀︎ Riverside meadow");
  label(root).click();
  assert.strictEqual(name(root), "Riverside meadow");
});
