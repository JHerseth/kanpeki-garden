// Harvest: mature vegetables and fruit trees have a crop once they've been mature through a growth day since they
// matured or were last picked. A ready plant shimmers, 48 glints at most on the map (a still glint with reduced
// motion); a tap picks it for ¤2 or ¤5 (¤50 a day at most, earned left alone) with a burst, and the next tap selects
// it; after a pick the hint offers to pick the rest on the map shown, in one save. The save keeps each plant's picked
// day (h) and the crops picked today (picked), as a v: 3 save.
// Every check runs on a fake clock (KG_CLOCK). 2026-10-12 is a Monday.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const { KEY, page, openGarden, openSettings } = require("./harness");

const DIR = path.join(__dirname, "..");
const at = (day, h = 10, m = 0) => new Date(2026, 9, day, h, m).getTime();     // October 2026, local time
const iso = (day) => "2026-10-" + String(day).padStart(2, "0");
const MON = 12, TUE = 13, WED = 14, THU = 15, FRI = 16, SAT = 17, SUN = 18;
const MATURE = 2;                                                                 // a 5-frame strip
const REVIEWED = 1, VACATION = 2;
const FRUIT = ["apple", "orange_tree", "pear_tree"];
const CAP = "きょうの しゅうかくは 50 まで";

const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const plain = (v) => JSON.parse(JSON.stringify(v));      // the page's objects come from another realm
const stored3 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 3, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const saved = (stored) => JSON.parse(stored[KEY]);
/** Review days for a save's `days`: the 1st to the 11th (Sunday), and any more given. */
const days = (...more) => Object.fromEntries([...Array.from({ length: 11 }, (_, i) => i + 1), ...more]
  .map((d) => [iso(d), REVIEWED]));
/** A plant placed mature on the 1st, so it has a crop by Monday with days(): k at x, y = 700. */
const ripe = (id, k = "tomato", more) => Object.assign({ id, k, x: 120 * id + 100, y: 700, t: iso(1), g: MATURE }, more);

/** The garden from a v: 3 save with days() and `over` in it (or opts.stored, a save as it is), opened at opts.now
 *  (Monday 10:00 if left out), answering card opts.card first if given, on a slot with opts.data; saves counts the
 *  save's writes from then on. */
function garden(over, opts = {}) {
  const stored = opts.stored || stored3(Object.assign({ days: days() }, over));
  const counted = { saves: 0 };
  const watched = new Proxy(stored, { set(t, k, v) { if (k === KEY) counted.saves++; t[k] = v; return true; } });
  const win = page(watched, { now: opts.now || at(MON), reduceMotion: opts.reduceMotion });
  const root = openGarden(win, opts.card, opts.data);
  counted.saves = 0;
  return { win, root, stored, counted, G: win.KanpekiGarden };
}
/** Whether placed plant `id` has a crop at `when`, as lifeOf works it out from the save in `stored`. */
function crop(stored, when, id) {
  const G = page(stored, { now: when }).KanpekiGarden, s = G.load();
  return G.life(s, s.placed.find((p) => p.id === id)).crop;
}
/** Answer card `card` at `when` without opening the garden. */
function review(stored, when, card = 1) { page(stored, { now: when }).KanpekiGarden.earn(String(card)); }
const node = (root, id) => byClass(root, "kg-item").find((d) => d.dataset.id === String(id));
/** The ids of the placed items that show a glint: a .kg-ripe box after their picture. */
const glints = (root) => byClass(root, "kg-item").filter((d) => d.children[1] && d.children[1].classList.contains("kg-ripe"))
  .map((d) => Number(d.dataset.id)).sort((a, b) => a - b);
function pointer(root, type, target, x = 200, y = 150) {
  byClass(root, "kg-view")[0].on[type].forEach((f) => f({ type, pointerId: 1, clientX: x, clientY: y, target }));
}
/** A finger on placed item `id` (or the empty map), moved by (dx, dy), then lifted. */
function touch(root, id, dx = 0, dy = 0) {
  const d = id == null ? null : node(root, id);
  const target = { closest: (sel) => (sel === ".kg-item" ? d : null) };
  pointer(root, "pointerdown", target);
  if (dx || dy) pointer(root, "pointermove", target, 200 + dx, 150 + dy);
  pointer(root, "pointerup", target, 200 + dx, 150 + dy);
}
const hint = (root) => byClass(root, "kg-hint")[0];
const shownHint = (root) => (hint(root).hidden ? null : hint(root).textContent);
const button = (root, text) => hint(root).all((n) => n.tagName === "button" && n.textContent === text)[0];
const purse = (root) => byClass(root, "kg-purse-n")[0].textContent;
const outlined = (root) => byClass(root, "kg-sel").map((d) => Number(d.dataset.id)).sort((a, b) => a - b);
const floats = (root) => byClass(root, "kg-gain").map((n) => n.textContent);

// ---- which plants, and when -------------------------------------------------------------------

test("a crop: ¤2 for every plant on the やさい tab, ¤5 for the apple, orange and pear trees, none for anything else", () => {
  const G = page({}).KanpekiGarden;
  assert.strictEqual(Object.values(G.items).filter((i) => i.tab === "やさい").length, 18);
  for (const item of Object.values(G.items)) {
    assert.strictEqual(G.cropOf(item), item.tab === "やさい" ? 2 : FRUIT.includes(item.key) ? 5 : 0, item.key);
  }
});

test("of every plant mature through growth days, only the vegetables and the fruit trees have a crop, and show it", () => {
  const G = page({}).KanpekiGarden;
  const kinds = Object.values(G.items).filter((i) => i.sold && i.frames.length > 1);
  const placed = kinds.map((item, n) => ripe(n + 1, item.key, { x: 100 + (n % 15) * 120, y: 300 + (n - n % 15) * 8 }));
  const g = garden({ placed, next: placed.length + 1 });
  const s = g.G.load();
  const want = placed.filter((p) => G.cropOf(G.items[p.k]) > 0).map((p) => p.id);
  assert.strictEqual(want.length, 21);
  assert.deepStrictEqual(plain(s.placed.filter((p) => g.G.life(s, p).crop).map((p) => p.id)), want);
  assert.deepStrictEqual(glints(g.root), want);
  // and a decoration, outside the life cycle, has none
  assert.strictEqual(g.G.life(s, { id: 99, k: "bench", x: 1, y: 1 }), null);
});

test("a sprout planted Monday, reviews every day: mature from Wednesday, its crop ready from 04:00 Thursday", () => {
  const sprout = [{ id: 1, k: "carrot", x: 500, y: 700, t: iso(MON) }];
  const stored = stored3({ placed: sprout, next: 2, days: days(MON, TUE, WED) });
  assert.strictEqual(crop(stored, at(TUE), 1), false);
  assert.strictEqual(crop(stored, at(WED), 1), false);                     // mature now, but not through a growth day
  assert.strictEqual(crop(stored, at(THU, 3, 59), 1), false);
  assert.strictEqual(crop(stored, at(THU, 4), 1), true);
  // no reviews on Wednesday: Thursday's are the first growth day it's mature through
  const later = stored3({ placed: sprout, next: 2, days: days(MON, TUE, THU) });
  assert.strictEqual(crop(later, at(THU, 4), 1), false);
  assert.strictEqual(crop(later, at(FRI, 3, 59), 1), false);
  assert.strictEqual(crop(later, at(FRI, 4), 1), true);
});

test("a plant that joins mature (enrolled, or 「+150」) counts its joining day as a growth day it was mature through", () => {
  const placed = [{ id: 1, k: "apple", x: 500, y: 700, t: iso(MON), g: MATURE }];
  const reviewed = stored3({ placed, next: 2, days: days(MON) });
  assert.strictEqual(crop(reviewed, at(MON, 23), 1), false);
  assert.strictEqual(crop(reviewed, at(TUE, 4), 1), true);
  const not = stored3({ placed, next: 2, days: days(TUE) });             // nothing on Monday
  assert.strictEqual(crop(not, at(TUE, 4), 1), false);
  assert.strictEqual(crop(not, at(WED, 4), 1), true);
});

test("crops don't stack: after a week of growth days a tap picks one crop, once; the next comes after a growth day", () => {
  const g = garden({ coins: 10, earned: 40, placed: [ripe(1)], next: 2, days: days(MON) });
  touch(g.root, 1);
  assert.deepStrictEqual([saved(g.stored).coins, saved(g.stored).placed[0].h], [12, iso(MON)]);
  assert.deepStrictEqual(glints(g.root), []);
  touch(g.root, 1);                                                         // selects it: no second crop
  assert.strictEqual(saved(g.stored).coins, 12);
  assert.strictEqual(shownHint(g.root), "ゆびで うごかせるよOK");
  assert.strictEqual(crop(g.stored, at(TUE, 3, 59), 1), false);
  assert.strictEqual(crop(g.stored, at(TUE, 4), 1), true);                // Monday had reviews: picked, then grown
  // picked on a day without reviews: no crop until a growth day after it is over
  const s = saved(g.stored);
  s.days = days();
  const quiet = { [KEY]: JSON.stringify(s) };
  assert.strictEqual(crop(quiet, at(TUE, 4), 1), false);
  review(quiet, at(TUE));
  assert.strictEqual(crop(quiet, at(TUE, 23), 1), false);
  assert.strictEqual(crop(quiet, at(WED, 4), 1), true);
});

test("a dying plant has no crop, and loses the one it had; the day it comes back on brings the next; a dead one has none", () => {
  // ready Monday (reviews to Sunday the 11th); none after
  const stored = stored3({ placed: [ripe(1)], next: 2, days: days() });
  assert.strictEqual(crop(stored, at(MON), 1), true);
  assert.strictEqual(crop(stored, at(TUE), 1), true);                      // Monday missed: still well
  assert.strictEqual(crop(stored, at(WED, 4), 1), false);                  // Monday and Tuesday missed: dying
  let g = garden(null, { stored, now: at(WED, 9) });
  assert.deepStrictEqual(glints(g.root), []);
  touch(g.root, 1);                                                         // selects it: nothing to pick
  assert.strictEqual(saved(stored).coins, 0);
  // a card brings it back: no crop that day, one from 04:00 the next (the day it came back on was a growth day)
  review(stored, at(WED, 10));
  assert.strictEqual(crop(stored, at(WED, 11), 1), false);
  assert.strictEqual(crop(stored, at(THU, 3, 59), 1), false);
  assert.strictEqual(crop(stored, at(THU, 4), 1), true);
  // ... and the crop of a plant that came back on a day with reviews comes the same way, when the garden wasn't opened
  const away = stored3({ placed: [ripe(1)], next: 2, days: days(THU) });  // none Monday to Wednesday: dying, back Thursday
  assert.strictEqual(crop(away, at(THU, 23), 1), false);
  assert.strictEqual(crop(away, at(FRI, 4), 1), true);
  // dead: none, and none after reviews either
  const dead = stored3({ placed: [ripe(1)], next: 2, days: days() });
  assert.strictEqual(crop(dead, at(FRI, 4), 1), false);
  g = garden(null, { stored: dead, now: at(FRI, 9) });
  assert.ok(saved(dead).placed[0].dead);
  assert.deepStrictEqual(glints(g.root), []);
  review(dead, at(FRI, 10));
  assert.strictEqual(crop(dead, at(SAT, 4), 1), false);
});

test("vacation: no crop while it's on; one ready before waits for it to end; vacation days bring none", () => {
  // ready Monday; on vacation from Monday: none while it's on, and the same crop back when it ends
  const on = stored3({ placed: [ripe(1)], next: 2, days: days(), vac: iso(MON) });
  assert.strictEqual(crop(on, at(MON), 1), false);
  assert.strictEqual(crop(on, at(FRI), 1), false);
  const after = stored3({ placed: [ripe(1)], next: 2,
    days: Object.assign(days(), { [iso(MON)]: VACATION, [iso(TUE)]: VACATION, [iso(WED)]: VACATION }) });
  assert.strictEqual(crop(after, at(THU), 1), true);
  // picked on Monday, a day without reviews, then on vacation Tuesday to Friday: no crop after it, until a growth day
  const picked = stored3({ placed: [ripe(1, "tomato", { h: iso(MON) })], next: 2,
    days: Object.assign(days(), ...[TUE, WED, THU, FRI].map((d) => ({ [iso(d)]: VACATION }))) });
  assert.strictEqual(crop(picked, at(SAT, 9), 1), false);
  review(picked, at(SAT, 10));
  assert.strictEqual(crop(picked, at(SAT, 23), 1), false);
  assert.strictEqual(crop(picked, at(SUN, 4), 1), true);
  // a day with reviews made before vacation was switched on is a growth day, as for the life cycle
  const before = stored3({ placed: [ripe(1, "tomato", { h: iso(MON) })], next: 2,
    days: Object.assign(days(), { [iso(MON)]: REVIEWED | VACATION, [iso(TUE)]: VACATION }) });
  assert.strictEqual(crop(before, at(WED), 1), true);
});

test("switching vacation on takes the glints away at once, and off brings them back", () => {
  const g = garden({ placed: [ripe(1), ripe(2, "rose_pink")], next: 3 });
  assert.deepStrictEqual(glints(g.root), [1]);
  const sw = byClass(openSettings(g.root), "kg-vac")[0];
  sw.click();
  byClass(g.root, "kg-confirm")[0].all((n) => n.tagName === "button" && n.textContent === "はい")[0].click();
  assert.deepStrictEqual(glints(g.root), []);
  touch(g.root, 1);                                                         // selects it
  assert.strictEqual(saved(g.stored).coins, 0);
  touch(g.root, null);
  sw.click();
  assert.deepStrictEqual(glints(g.root), [1]);
});

test("moving the test day: a plant's crop comes once the day it was mature through is over", () => {
  const g = garden({ placed: [{ id: 1, k: "pumpkin", x: 500, y: 700, t: iso(MON), g: MATURE }], next: 2 },
    { card: 5, data: { dev: "1" } });                                       // a card: Monday has reviews
  assert.deepStrictEqual(glints(g.root), []);
  byClass(openSettings(g.root), "kg-dev").find((b) => b.textContent === "+1日").click();
  assert.deepStrictEqual(glints(g.root), [1]);
});

// ---- the glints -------------------------------------------------------------------------------------

/** Let the page finish its task: it gives the ready plants their glints once its drawing is done. */
const settle = () => new Promise((r) => setImmediate(r));
/** Placed item id's glints: the children of its crop box, or [] without one. */
const starsOf = (root, id) => (node(root, id).children[1] ? node(root, id).children[1].children : []);
const shimmers = (root) => byClass(root, "kg-shimmer");
/** How many shimmering glints each placed item with a crop box has: {id: n}, 0 for the still glint. */
const shares = (root) => Object.fromEntries(glints(root).map((id) => {
  const st = starsOf(root, id);
  return [id, st.length && st[0].classList.contains("kg-shimmer") ? st.length : 0];
}));
const css = (g) => g.win.document.getElementById("kg-style").textContent;
/** n ready plants of kind k (or kinds by index), ids from `from`, spread over the map. */
const many = (n, k = "onion", from = 1, more) => Array.from({ length: n }, (_, i) => ripe(from + i,
  typeof k === "function" ? k(i) : k, Object.assign({ x: 100 + (i % 15) * 120, y: 300 + Math.floor(i / 15) * 150 }, more)));
const px = (v) => parseFloat(v);

test("the shimmer: 3 glints on a vegetable, 4 on a fruit tree, in a box over the picture swaying with it", async () => {
  const g = garden({ placed: [ripe(1, "corn"), ripe(2, "pear_tree", { x: 900 }), ripe(3, "tulip_yellow")], next: 4 });
  const S = g.win.KG_SCALE;
  assert.deepStrictEqual(glints(g.root), [1, 2]);
  await settle();
  assert.deepStrictEqual(plain(shares(g.root)), { 1: 3, 2: 4 });
  for (const id of [1, 2]) {
    const d = node(g.root, id), pic = d.children[0], box = d.children[1];
    const f = g.G.items[saved(g.stored).placed[id - 1].k].frames[MATURE], w = f.w * S, h = f.h * S;
    assert.strictEqual(d.children.length, 2);
    assert.deepStrictEqual([box.style.width, box.style.height], [w + "px", h + "px"]);
    // the same sway as the picture: its skew about the same anchor, at the same time
    assert.ok(box.classList.contains("kg-sway") && pic.classList.contains("kg-sway"));
    for (const k of ["transformOrigin", "--kg-a", "animationDuration", "animationDelay"]) {
      assert.strictEqual(box.style[k], pic.style[k], k);
    }
    const names = new Set();
    box.children.forEach((star, i, all) => {
      assert.deepStrictEqual(star.className.trim().split(" "), ["kg-glint", "kg-shimmer"]);
      // its box is the crown: the middle 60% of the picture's width, from 10% to 50% of its height down; the star,
      // 11 × 4 = 44 garden px a side, at its top left, so a translate in percent of the box puts it on the crown
      const near = (v, want) => Math.abs(px(v) - want) < 1e-9;
      assert.ok(near(star.style.left, 0.2 * w - 22) && near(star.style.top, 0.1 * h - 22), star.style.left + star.style.top);
      assert.ok(near(star.style.width, 0.6 * w) && near(star.style.height, 0.4 * h));
      assert.strictEqual(star.style.backgroundSize, "44px");
      assert.match(star.style.backgroundImage, /^url\(data:image\/png/);
      // three showings of 2 to 2.8 s each, the plant's glints a share of a showing apart, and each its own keyframes
      const time = px(star.style.animationDuration) / 3, start = -px(star.style.animationDelay) / time;
      assert.ok(time >= 2 && time <= 2.8, star.style.animationDuration);
      assert.ok(start >= i / all.length && start <= (i + 0.6) / all.length, star.style.animationDelay);
      assert.match(star.style.animationName, /^kg-shimmer[0-5]$/);
      names.add(star.style.animationName);
    });
    assert.strictEqual(names.size, box.children.length, "each of a plant's glints shows at points of its own");
  }
  await settle();
  assert.deepStrictEqual([1, 2].map((id) => node(g.root, id).children[1].getAnimations()[0].startTime), [0, 0]);
  // it's in the world, which carries the map's zoom
  assert.ok(byClass(g.root, "kg-world")[0].contains(node(g.root, 1).children[1]));
  assert.match(css(g), /\.kg-glint\{[^}]*image-rendering:pixelated/);
});

test("the shimmer's keyframes: transform and opacity, no var(); 3 times a glint appears, rises 20 px and fades", () => {
  const g = garden({ placed: [ripe(1)], next: 2 });
  const sets = [...css(g).matchAll(/@keyframes kg-shimmer(\d)\{((?:[\d.]+%\{[^{}]*\})+)\}/g)];
  assert.deepStrictEqual(sets.map((m) => m[1]), ["0", "1", "2", "3", "4", "5"]);
  const spots = new Set();
  for (const [, , body] of sets) {
    const stops = [...body.matchAll(/([\d.]+)%\{([^{}]*)\}/g)].map((m) => [+m[1], m[2]]);
    assert.strictEqual(stops.length, 16);
    assert.deepStrictEqual(stops[0][1], stops[15][1], "it ends where it starts");
    assert.strictEqual(stops[15][0], 100);
    for (const [, decl] of stops) {
      assert.deepStrictEqual(decl.split(";").map((d) => d.split(":")[0]), ["opacity", "transform"]);
      assert.doesNotMatch(decl, /var\(/);
    }
    // each third: at a point in percent of the crown, it grows from nothing, twinkles, and fades 20 px up
    for (let k = 0; k < 3; k++) {
      const third = stops.slice(5 * k, 5 * k + 5), at = /translate\(([\d.]+)%,calc\(([\d.]+)% - /.exec(third[0][1]);
      assert.ok(Math.abs(third[0][0] - 100 * k / 3) < 1e-3);
      for (const [, decl] of third) assert.ok(decl.includes("translate(" + at[1] + "%,calc(" + at[2] + "% - "), decl);
      assert.match(third[0][1], /^opacity:0;.* - 0px\)\) scale\(0\.2\)$/);
      assert.match(third[1][1], /^opacity:1;.*scale\(1\)$/);
      assert.match(third[4][1], /^opacity:0;.* - 20px\)\) scale\(0\.3\)$/);
      spots.add(at[1] + " " + at[2]);
    }
  }
  assert.strictEqual(spots.size, 18, "every showing at a point of its own");
});

test("the cap: 48 shimmering glints at most on the map; with more ready plants each gets fewer, 1 at least", () => {
  const G = page({}).KanpekiGarden;
  const veg = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, k: "tomato" }));
  const fruit = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, k: FRUIT[i % 3] }));
  const counts = (o) => Object.values(o);
  const sum = (o) => counts(o).reduce((a, b) => a + b, 0);
  assert.deepStrictEqual(plain(G.glintShares(veg(1))), { 1: 3 });
  assert.deepStrictEqual(plain(G.glintShares(fruit(1))), { 1: 4 });
  // an even share: its own while 48 go round, then 3, 2 and 1 each
  for (const [n, each] of [[12, 4], [13, 3], [16, 3], [17, 2], [24, 2], [25, 1], [48, 1]]) {
    assert.deepStrictEqual(counts(G.glintShares(fruit(n))), Array(n).fill(each), n + " fruit trees");
    assert.deepStrictEqual(counts(G.glintShares(veg(n))), Array(n).fill(Math.min(3, each)), n + " vegetables");
  }
  for (let n = 1; n <= 200; n++) {
    for (const ready of [veg(n), fruit(n), veg(n).map((p, i) => (i % 2 ? p : { id: p.id, k: "apple" }))]) {
      const out = G.glintShares(ready);
      assert.strictEqual(counts(out).length, n);
      assert.ok(sum(out) <= 48, n + ": " + sum(out));
      if (n <= 48) assert.ok(counts(out).every((c) => c >= 1), String(n));
      else assert.deepStrictEqual([counts(out).filter((c) => c === 1).length, counts(out).filter((c) => !c).length],
        [48, n - 48]);
    }
  }
  // past 48, the ones that shimmer are the same whatever the order, and spread over the plants, not the first 48
  const out = plain(G.glintShares(veg(60))), back = plain(G.glintShares(veg(60).reverse()));
  assert.deepStrictEqual(out, back);
  const still = Object.keys(out).filter((id) => !out[id]).map(Number);
  assert.notDeepStrictEqual(still, Array.from({ length: 12 }, (_, i) => 49 + i));
});

test("in the garden: 60 ready plants have 48 shimmering glints, 1 each, and the other 12 the still glint", async () => {
  const g = garden({ placed: many(60), next: 61 });
  await settle();
  assert.strictEqual(glints(g.root).length, 60);
  assert.strictEqual(shimmers(g.root).length, 48);
  const n = plain(shares(g.root));
  const each = Object.values(n);
  assert.deepStrictEqual([each.filter((c) => c === 1).length, each.filter((c) => !c).length], [48, 12]);
  // the still ones: one glint each, centred just above the picture, as with reduced motion
  for (const id of Object.keys(n).filter((id) => !n[id])) {
    const st = starsOf(g.root, id);
    assert.deepStrictEqual([st.length, st[0].className.trim(), st[0].style.top], [1, "kg-glint", "-34px"]);
  }
  // 20 ready: 2 each
  const twenty = garden({ placed: many(20), next: 21 });
  await settle();
  assert.deepStrictEqual(Object.values(plain(shares(twenty.root))), Array(20).fill(2));
});

test("the count stays right as crops are picked: shares grow, and glints not due a change keep on", async () => {
  const g = garden({ placed: many(13, (i) => FRUIT[i % 3]), next: 14 });
  await settle();
  assert.deepStrictEqual(Object.values(plain(shares(g.root))), Array(13).fill(3));
  touch(g.root, 13);
  await settle();
  assert.deepStrictEqual(Object.values(plain(shares(g.root))), Array(12).fill(4));
  assert.strictEqual(shimmers(g.root).length, 48);
  // 20 ready, 2 each; one picked leaves 19, still 2 each: the others' glints go on as they were, not started over
  const h = garden({ placed: many(20), next: 21 });
  await settle();
  const before = starsOf(h.root, 5).slice();
  touch(h.root, 1);
  await settle();
  assert.deepStrictEqual(Object.values(plain(shares(h.root))), Array(19).fill(2));
  assert.deepStrictEqual(starsOf(h.root, 5), before);
  // and from 49 ready to 48, the plant with the still glint gets one that shimmers
  const k = garden({ placed: many(49), next: 50 });
  await settle();
  const still = Object.entries(plain(shares(k.root))).find(([, c]) => !c)[0];
  touch(k.root, Number(still) === 1 ? 2 : 1);
  await settle();
  assert.deepStrictEqual(Object.values(plain(shares(k.root))), Array(48).fill(1));
  assert.ok(starsOf(k.root, still)[0].classList.contains("kg-shimmer"));
});

test("the count stays right after a walk: each map's ready plants share the 48, the map left takes its glints", async () => {
  const placed = many(30).concat(many(2, "tomato", 31, { m: "riverside" }),
    [{ id: 33, k: "sign_riverside", x: 1500, y: 1000 }, { id: 34, k: "sign_home", x: 1500, y: 1000, m: "riverside" }]);
  const g = garden({ maps: ["riverside"], placed, next: 35 });
  await settle();
  assert.deepStrictEqual([shimmers(g.root).length, Object.values(plain(shares(g.root)))], [30, Array(30).fill(1)]);
  touch(g.root, 33);
  touch(g.root, 33);                                                        // walk there
  await settle();
  assert.deepStrictEqual(plain(shares(g.root)), { 31: 3, 32: 3 });
  const world = byClass(g.root, "kg-world")[0];
  assert.strictEqual(byClass(world, "kg-glint").length, 6, "none of the home map's");
  touch(g.root, 34);
  touch(g.root, 34);                                                        // and back
  await settle();
  assert.deepStrictEqual([shimmers(g.root).length, byClass(world, "kg-glint").length], [30, 30]);
});

test("the count stays right as the test day moves and vacation switches", async () => {
  // 12 fruit trees ready (4 each); 4 pumpkins mature today, ready tomorrow
  const placed = many(12, (i) => FRUIT[i % 3]).concat(Array.from({ length: 4 }, (_, i) =>
    ({ id: 13 + i, k: "pumpkin", x: 300 + 200 * i, y: 1000, t: iso(MON), g: MATURE })));
  const g = garden({ placed, next: 17 }, { card: 5, data: { dev: "1" } });
  await settle();
  assert.deepStrictEqual([glints(g.root).length, shimmers(g.root).length], [12, 48]);
  const panel = openSettings(g.root), dev = (t) => byClass(panel, "kg-dev").find((b) => b.textContent === t);
  dev("+1日").click();
  await settle();
  assert.deepStrictEqual([glints(g.root).length, Object.values(plain(shares(g.root)))], [16, Array(16).fill(3)]);
  dev("−1日").click();
  await settle();
  assert.deepStrictEqual([glints(g.root).length, Object.values(plain(shares(g.root)))], [12, Array(12).fill(4)]);
  // vacation: no crops, so no glints at all; back after
  const sw = byClass(panel, "kg-vac")[0];
  sw.click();
  byClass(g.root, "kg-confirm")[0].all((n) => n.tagName === "button" && n.textContent === "はい")[0].click();
  await settle();
  assert.deepStrictEqual([glints(g.root), byClass(g.root, "kg-glint").length], [[], 0]);
  sw.click();
  await settle();
  assert.deepStrictEqual([glints(g.root).length, shimmers(g.root).length], [12, 48]);
});

test("a pick bursts: 8 glints fly out from the crown's middle, in the world over every item, gone after 0.6 s", async () => {
  const g = garden({ placed: [ripe(1, "apple"), ripe(2, "corn", { x: 900 })], next: 3 });
  await settle();
  touch(g.root, 1);
  assert.deepStrictEqual(starsOf(g.root, 1), [], "its own glints go at once");
  const sparks = byClass(g.root, "kg-sparks")[0], b = byClass(g.root, "kg-burst");
  assert.strictEqual(sparks.parent, byClass(g.root, "kg-world")[0]);
  assert.deepStrictEqual([b.length, b[0].parent, b[0].children.length], [1, sparks, 8]);
  const f = g.G.items.apple.frames[MATURE], S = g.win.KG_SCALE;
  const near = (v, want) => Math.abs(px(v) - want) < 1e-9;
  assert.ok(near(b[0].style.left, 220 + (0.5 * f.w - f.ax) * S) && near(b[0].style.top, 700 + (0.3 * f.h - f.ay) * S));
  const angles = b[0].children.map((star) => {
    assert.deepStrictEqual([star.className.trim(), star.style.left, star.style.top], ["kg-glint", "-22px", "-22px"]);
    const x = px(star.style["--kg-bx"]), y = px(star.style["--kg-by"]), far = Math.hypot(x, y);
    assert.ok(far >= 70 && far <= 110, String(far));
    return (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI);
  });
  // each its own way: one in each eighth of the circle
  assert.deepStrictEqual(angles.map((a) => Math.floor(a / (Math.PI / 4))).sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.match(css(g), /\.kg-sparks\{[^}]*z-index:2000;pointer-events:none/);
  assert.match(css(g), /\.kg-burst>\.kg-glint\{animation:kg-burst \.6s/);
  g.win.wait(599);
  assert.strictEqual(byClass(g.root, "kg-burst").length, 1);
  g.win.wait(1);
  assert.deepStrictEqual(byClass(g.root, "kg-burst"), []);
  // a pick the day's cap leaves unpaid bursts too
  const capped = garden({ placed: [ripe(1)], next: 2, picked: { day: iso(MON), coins: 50 } });
  touch(capped.root, 1);
  assert.deepStrictEqual([byClass(capped.root, "kg-burst").length, floats(capped.root)], [1, []]);
});

test("a burst under way goes with a walk, and with the garden when it closes", () => {
  const g = garden({ maps: ["riverside"], placed: [ripe(1), { id: 2, k: "sign_riverside", x: 1500, y: 1000 }],
    next: 3 });
  touch(g.root, 1);
  assert.strictEqual(byClass(g.root, "kg-burst").length, 1);
  touch(g.root, 2);
  touch(g.root, 2);                                                         // walk
  assert.deepStrictEqual(byClass(g.root, "kg-burst"), []);
  const h = garden({ placed: [ripe(1)], next: 2 });
  touch(h.root, 1);
  byClass(h.root, "kg-close")[0].click();
  assert.ok(!h.root.isConnected);
  h.win.wait(600);
  assert.deepStrictEqual(h.win.document.body.all((n) => n.classList.contains("kg-glint")), []);
});

test("with reduced motion: one still glint above the picture, never a shimmer, and a pick doesn't burst", async () => {
  const g = garden({ placed: [ripe(1, "corn"), ripe(2, "pear_tree", { x: 900 })], next: 3 }, { reduceMotion: true });
  await settle();
  assert.deepStrictEqual([plain(shares(g.root)), shimmers(g.root).length], [{ 1: 0, 2: 0 }, 0]);
  const S = g.win.KG_SCALE;
  for (const id of [1, 2]) {
    const star = starsOf(g.root, id)[0], f = g.G.items[id === 1 ? "corn" : "pear_tree"].frames[MATURE];
    assert.ok(!node(g.root, id).children[1].classList.contains("kg-sway"));
    // 44 garden px a side, centred over the picture, its bottom 10 px down on the top of it
    assert.deepStrictEqual([star.style.width, star.style.height], ["44px", "44px"]);
    assert.deepStrictEqual([star.style.left, star.style.top], [(f.w * S - 44) / 2 + "px", "-34px"]);
  }
  touch(g.root, 1);
  assert.deepStrictEqual([byClass(g.root, "kg-burst"), saved(g.stored).placed[0].h], [[], iso(MON)]);
  await settle();
  assert.deepStrictEqual(plain(shares(g.root)), { 2: 0 });
  // and the CSS stops a shimmer and hides a burst, should the phone's setting change while the garden is open
  assert.match(css(g), /@media \(prefers-reduced-motion:reduce\)\{[^{}]*\.kg-shimmer[,{][^{}]*\{animation:none\}/);
  assert.match(css(g),
    /@media \(prefers-reduced-motion:reduce\)\{(?:[^{}]*\{[^}]*\})*?[^{}]*\.kg-burst[,{][^{}]*\{display:none\}/);
});

test("the sway and butterfly switches don't touch the shimmer: switched off, the glints go on", async () => {
  const g = garden({ placed: [ripe(1), ripe(2, "apple", { x: 900 })], next: 3 });
  await settle();
  const before = [starsOf(g.root, 1).slice(), starsOf(g.root, 2).slice()];
  const panel = openSettings(g.root), sw = (t) => byClass(panel, "kg-opt").find((n) => n.textContent === t);
  sw("くさばなが ゆれる").click();
  sw("ちょうちょが とぶ").click();
  await settle();
  assert.deepStrictEqual([starsOf(g.root, 1), starsOf(g.root, 2)], before, "not made again");
  assert.deepStrictEqual(plain(shares(g.root)), { 1: 3, 2: 4 });
  assert.ok(!node(g.root, 1).children[1].classList.contains("kg-sway"));
  assert.ok(g.root.classList.contains("kg-no-sway") && g.root.classList.contains("kg-no-butterflies"));
  assert.doesNotMatch(css(g), /kg-no-(sway|butterflies)[^{]*kg-(shimmer|glint|burst|ripe)/);
  touch(g.root, 1);
  assert.strictEqual(byClass(g.root, "kg-burst").length, 1);
  sw("くさばなが ゆれる").click();
  assert.ok(node(g.root, 2).children[1].classList.contains("kg-sway"));
  assert.deepStrictEqual(starsOf(g.root, 2), before[1]);
});

test("taps: the shimmering glints let them through, the still glint takes them for its plant", () => {
  const g = garden({ placed: [ripe(1)], next: 2 });
  const rule = (sel) => new RegExp("(?:^|\\})" + sel.replace(/[.>]/g, "\\$&") + "\\{([^}]*)\\}").exec(css(g))[1];
  assert.match(rule(".kg-shimmer"), /pointer-events:none/);
  assert.match(rule(".kg-sparks"), /pointer-events:none/);
  assert.doesNotMatch(rule(".kg-glint"), /pointer-events/);
  assert.doesNotMatch(rule(".kg-ripe"), /pointer-events/);
});

test("while fingers move the map or an item, the shimmer is held (kg-moving), and goes on after; not for a tap", () => {
  const g = garden({ placed: [ripe(1), { id: 2, k: "bench", x: 900, y: 900 }], next: 3 });
  const view = byClass(g.root, "kg-view")[0], moving = () => g.root.classList.contains("kg-moving");
  const fire = (type, id, x, y) => view.on[type].forEach((f) => f({ type, pointerId: id, clientX: x, clientY: y,
    target: { closest: () => null } }));
  assert.match(css(g), /\.kg-moving \.kg-shimmer\{animation-play-state:paused\}/);
  fire("pointerdown", 1, 200, 150);
  fire("pointermove", 1, 204, 150);
  assert.ok(!moving(), "not yet a pan");
  fire("pointermove", 1, 240, 150);
  assert.ok(moving());
  fire("pointerup", 1, 240, 150);
  assert.ok(!moving());
  // a pinch, until its last finger is lifted
  fire("pointerdown", 1, 100, 150);
  fire("pointerdown", 2, 300, 150);
  assert.ok(moving());
  fire("pointerup", 2, 300, 150);
  assert.ok(moving());
  fire("pointercancel", 1, 100, 150);
  assert.ok(!moving());
  // a drag of the selected bench, and a tap
  touch(g.root, 2);
  pointer(g.root, "pointerdown", { closest: (sel) => (sel === ".kg-item" ? node(g.root, 2) : null) });
  pointer(g.root, "pointermove", { closest: () => null }, 260, 150);
  assert.ok(moving());
  pointer(g.root, "pointerup", { closest: () => null }, 260, 150);
  assert.ok(!moving());
  pointer(g.root, "pointerdown", { closest: (sel) => (sel === ".kg-item" ? node(g.root, 1) : null) });
  assert.ok(!moving());
  pointer(g.root, "pointerup", { closest: (sel) => (sel === ".kg-item" ? node(g.root, 1) : null) });
  assert.deepStrictEqual([moving(), saved(g.stored).placed[0].h], [false, iso(MON)]);
});

// ---- picking ---------------------------------------------------------------------------------------

test("a tap picks a ready plant: ¤2 a vegetable, ¤5 a fruit tree, earned left alone, its day saved, its glint gone", () => {
  const g = garden({ coins: 10, earned: 40, placed: [ripe(1, "cabbage"), ripe(2, "orange_tree", { x: 900 })], next: 3 });
  touch(g.root, 1);
  let s = saved(g.stored);
  assert.deepStrictEqual([s.coins, s.earned, s.placed[0].h, s.placed[1].h, s.picked], [12, 40, iso(MON), undefined,
    { day: iso(MON), coins: 2 }]);
  assert.strictEqual(g.counted.saves, 1);
  assert.strictEqual(purse(g.root), "12");
  assert.deepStrictEqual(glints(g.root), [2]);
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×1 +5✕");            // pick all (see below)
  touch(g.root, 2);
  s = saved(g.stored);
  assert.deepStrictEqual([s.coins, s.earned, s.placed[1].h, s.picked], [17, 40, iso(MON), { day: iso(MON), coins: 7 }]);
  assert.strictEqual(g.counted.saves, 2);
  assert.deepStrictEqual(glints(g.root), []);
  assert.strictEqual(shownHint(g.root), null);
  // the next tap selects it, to move it, as before
  touch(g.root, 2);
  assert.strictEqual(shownHint(g.root), "ゆびで うごかせるよOK");
  assert.deepStrictEqual(outlined(g.root), [2]);
  assert.strictEqual(saved(g.stored).coins, 17);
  // and the next opening has them picked
  const again = garden(null, { stored: g.stored });
  assert.deepStrictEqual(glints(again.root), []);
  assert.strictEqual(purse(again.root), "17");
});

test("the coins float up from the plant over the map, and go after 1.1 s", () => {
  const g = garden({ placed: [ripe(1, "apple")], next: 2 });
  touch(g.root, 1);
  const up = byClass(g.root, "kg-gain");
  assert.strictEqual(up.length, 1);
  assert.strictEqual(up[0].parent, byClass(g.root, "kg-view")[0], "at screen size, not in the world");
  assert.strictEqual(up[0].textContent, "+5");
  assert.strictEqual(byClass(up[0], "kg-coin").length, 1);
  // from the top of the picture, over its middle: the fake 400 x 300 view shows the map at 0.2, 38.4 px down
  const f = g.G.items.apple.frames[MATURE], S = g.win.KG_SCALE;
  const near = (v, want) => Math.abs(parseFloat(v) - want) < 1e-9;
  assert.ok(near(up[0].style.left, (220 + (f.w / 2 - f.ax) * S) * 0.2), up[0].style.left);
  assert.ok(near(up[0].style.top, 38.4 + (700 - f.ay * S) * 0.2), up[0].style.top);
  g.win.wait(1099);
  assert.strictEqual(floats(g.root).length, 1);
  g.win.wait(1);
  assert.deepStrictEqual(floats(g.root), []);
  const css = g.win.document.getElementById("kg-style").textContent;
  assert.match(css, /\.kg-gain\{[^}]*animation:kg-up 1\.1s/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[^{}]*\.kg-gain[,{]/);
});

test("zoomed in with the picture's top out of the view, the coins float up inside it", () => {
  const g = garden({ placed: [ripe(1, "pear_tree", { x: 1200, y: 650 })], next: 2 });
  const zin = byClass(g.root, "kg-zbtn")[0];
  for (let i = 0; i < 4; i++) zin.click();                                 // about the map's middle: its top is above the view
  touch(g.root, 1);
  const up = byClass(g.root, "kg-gain")[0];
  assert.deepStrictEqual([up.style.left, up.style.top], [400 - 28 + "px", "52px"]);
});

test("a paid pick redraws the shop: prices the player can now pay lose their grey", () => {
  const g = garden({ coins: 18, placed: [ripe(1, "apple")], next: 2 });
  const rose = () => byClass(g.root, "kg-card").find((c) => byClass(c, "kg-name")[0].textContent === "ピンクのバラ");
  assert.ok(rose().classList.contains("kg-poor"));                          // ¤20
  touch(g.root, 1);
  assert.strictEqual(saved(g.stored).coins, 23);
  assert.ok(!rose().classList.contains("kg-poor"));
});

test("a garden left open past 04:00: a tap sees the plant's life then, so one that turned dying isn't picked", () => {
  const g = garden({ placed: [ripe(1)], next: 2 }, { now: at(TUE, 23) });  // Monday missed: well, with a crop
  assert.deepStrictEqual(glints(g.root), [1]);
  g.win.KG_CLOCK = () => at(WED, 4);                                        // Tuesday missed too: dying
  touch(g.root, 1);
  assert.deepStrictEqual([saved(g.stored).coins, saved(g.stored).placed[0].h], [0, undefined]);
  assert.deepStrictEqual([outlined(g.root), glints(g.root)], [[1], []]);    // selected, its glint gone
});

test("the day's cap: ¤50 at most; later picks clear the crop for ¤0, and the first says so in the hint, once a day", () => {
  const placed = Array.from({ length: 30 }, (_, i) => ripe(i + 1, "onion", { x: 100 + (i % 15) * 120, y: i < 15 ? 500 : 700 }));
  const g = garden({ coins: 5, earned: 40, placed, next: 31, days: days(MON) });
  for (let id = 1; id <= 25; id++) touch(g.root, id);
  assert.deepStrictEqual([saved(g.stored).coins, saved(g.stored).picked], [55, { day: iso(MON), coins: 50 }]);
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×5 +0✕", "¤50 exactly, each pick paid in full: no note");
  touch(g.root, 26);
  assert.deepStrictEqual([saved(g.stored).coins, saved(g.stored).picked.coins], [55, 52]);
  assert.strictEqual(shownHint(g.root), CAP + "OK");
  assert.strictEqual(byClass(hint(g.root), "kg-coin").length, 1);
  assert.ok(!glints(g.root).includes(26), "its crop is cleared");
  assert.strictEqual(saved(g.stored).placed[25].h, iso(MON));
  assert.strictEqual(floats(g.root).length, 25, "no float for ¤0");
  touch(g.root, 27);                                                        // once a day: not again
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×3 +0✕");
  assert.strictEqual(saved(g.stored).coins, 55);
  assert.strictEqual(saved(g.stored).earned, 40);
  // the next card's garden, the same day: still capped, and not said again
  let next = garden(null, { stored: g.stored, now: at(TUE, 3, 59) });
  touch(next.root, 28);
  assert.deepStrictEqual([saved(g.stored).coins, saved(g.stored).picked], [55, { day: iso(MON), coins: 56 }]);
  assert.strictEqual(shownHint(next.root), "のこり ぜんぶ とる ×2 +0✕");
  // from 04:00 the day's cap starts again: the ones left, and those picked Monday (a growth day), pay again
  next = garden(null, { stored: g.stored, now: at(TUE, 4) });
  assert.strictEqual(glints(next.root).length, 30);
  touch(next.root, 29);
  touch(next.root, 1);
  assert.deepStrictEqual([saved(g.stored).coins, saved(g.stored).picked], [59, { day: iso(TUE), coins: 4 }]);
});

test("a pick the cap cuts short pays what's left of the ¤50 and says so; the note goes with its OK or the next tap", () => {
  const g = garden({ coins: 0, placed: [ripe(1, "pear_tree"), ripe(2, "pear_tree", { x: 900 })], next: 3,
    picked: { day: iso(MON), coins: 48 } });
  touch(g.root, 1);
  assert.deepStrictEqual([saved(g.stored).coins, saved(g.stored).picked.coins], [2, 53]);
  assert.deepStrictEqual(floats(g.root), ["+2"]);
  assert.strictEqual(shownHint(g.root), CAP + "OK");
  assert.ok(hint(g.root).classList.contains("kg-hint-note"), "it may wrap");
  button(g.root, "OK").click();
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×1 +0✕");            // the other pear: pick all (see below)
  assert.ok(!hint(g.root).classList.contains("kg-hint-note"));
  // an old day's count is none: Sunday's 50 don't count on Monday
  const old = garden({ placed: [ripe(1, "pear_tree")], next: 2, picked: { day: iso(11), coins: 50 } });
  touch(old.root, 1);
  assert.deepStrictEqual([saved(old.stored).coins, saved(old.stored).picked], [5, { day: iso(MON), coins: 5 }]);
  // a tap on the map puts the note away
  const tap = garden({ placed: [ripe(1)], next: 2, picked: { day: iso(MON), coins: 50 } });
  touch(tap.root, 1);
  assert.strictEqual(shownHint(tap.root), CAP + "OK");
  touch(tap.root, null);
  assert.strictEqual(shownHint(tap.root), null);
  // and so does moving the test day: the note was the day left's
  const dev = garden({ placed: [ripe(1)], next: 2, picked: { day: iso(MON), coins: 50 } }, { data: { dev: "1" } });
  touch(dev.root, 1);
  assert.strictEqual(shownHint(dev.root), CAP + "OK");
  byClass(openSettings(dev.root), "kg-dev").find((b) => b.textContent === "+1日").click();
  assert.strictEqual(shownHint(dev.root), null);
});

test("data-lang=\"en\": the cap's note in English", () => {
  const g = garden({ placed: [ripe(1)], next: 2, picked: { day: iso(MON), coins: 50 } }, { data: { lang: "en" } });
  touch(g.root, 1);
  assert.strictEqual(shownHint(g.root), "You can earn up to 50 from picking each\u00a0dayOK");
  assert.strictEqual(byClass(hint(g.root), "kg-coin").length, 1);
});

// ---- pick all ------------------------------------------------------------------------------------

/** The offer's button that picks the rest, if the hint shows it. */
const takeAll = (root) => hint(root).all((n) => n.tagName === "button" && /^(のこり|Pick the rest)/.test(n.textContent))[0];

test("after a pick, with more crops ready on the map shown, the hint offers to pick the rest: how many, for how much", () => {
  // ready: 2 tomatoes, an apple and a pear; not: a rose (no crop), a carrot picked today and a corn sprout
  const g = garden({ placed: [ripe(1), ripe(2), ripe(3, "apple"), ripe(4, "pear_tree"), ripe(5, "rose_pink"),
    ripe(6, "carrot", { h: iso(MON) }), { id: 7, k: "corn", x: 940, y: 700, t: iso(11) }], next: 8 });
  assert.deepStrictEqual(glints(g.root), [1, 2, 3, 4]);
  touch(g.root, 1);
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×3 +12✕");
  const [take, no] = hint(g.root).all((n) => n.tagName === "button");
  assert.strictEqual(take, takeAll(g.root));
  assert.ok(take.classList.contains("kg-btn-go"));
  assert.strictEqual(byClass(take, "kg-coin").length, 1);
  assert.strictEqual(no.attrs["aria-label"], "やめる");
  assert.ok(hint(g.root).classList.contains("kg-hint-pick"));
  assert.strictEqual(g.counted.saves, 1, "the offer saves nothing");
  // each pick offers what's left; after the last, nothing
  touch(g.root, 3);
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×2 +7✕");
  touch(g.root, 2);
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×1 +5✕");
  touch(g.root, 4);
  assert.strictEqual(shownHint(g.root), null);
  assert.ok(!hint(g.root).classList.contains("kg-hint-pick"));
  // a pick with no other crop ready offers nothing
  const one = garden({ placed: [ripe(1), ripe(2, "rose_pink")], next: 3 });
  touch(one.root, 1);
  assert.strictEqual(shownHint(one.root), null);
  const css = g.win.document.getElementById("kg-style").textContent;
  assert.match(css, /\.kg-hint-pick\{padding-left:4px\}/);
});

test("one tap picks every crop left on the map shown, each as a tap would, in one save; earned stays, other maps wait", () => {
  const g = garden({ coins: 12, earned: 40, maps: ["riverside"], next: 8, placed: [ripe(1), ripe(2, "corn"),
    ripe(3, "apple"), ripe(4, "rose_pink"), ripe(5, "tomato", { m: "riverside" }), ripe(6, "apple", { m: "riverside" }),
    { id: 7, k: "sign_riverside", x: 1500, y: 900 }] });
  const rose = () => byClass(g.root, "kg-card").find((c) => byClass(c, "kg-name")[0].textContent === "ピンクのバラ");
  touch(g.root, 1);
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×2 +7✕", "the riverside's two aren't counted");
  assert.ok(rose().classList.contains("kg-poor"));                          // ¤20; the player has 14
  takeAll(g.root).click();
  const s = saved(g.stored);
  assert.deepStrictEqual([s.coins, s.earned, s.picked], [21, 40, { day: iso(MON), coins: 9 }]);
  assert.deepStrictEqual(s.placed.map((p) => p.h), [iso(MON), iso(MON), iso(MON), undefined, undefined, undefined, undefined]);
  assert.strictEqual(g.counted.saves, 2, "one for the tap, one for the rest");
  assert.strictEqual(purse(g.root), "21");
  assert.ok(!rose().classList.contains("kg-poor"), "the shop sees the coins at once");
  assert.deepStrictEqual(glints(g.root), []);
  // a float from each plant, as a tap's: the tapped tomato's, the corn's and the apple's, each from its own spot
  assert.deepStrictEqual(floats(g.root), ["+2", "+2", "+5"]);
  assert.strictEqual(new Set(byClass(g.root, "kg-gain").map((n) => n.style.left)).size, 3);
  g.win.wait(1100);
  assert.deepStrictEqual(floats(g.root), []);
  assert.strictEqual(shownHint(g.root), null, "nothing left to offer");
  // the next tap on one of them selects it: its crop is picked
  touch(g.root, 3);
  assert.deepStrictEqual([outlined(g.root), shownHint(g.root)], [[3], "ゆびで うごかせるよOK"]);
  // the riverside's crops wait for the player, and a pick there offers only its own
  touch(g.root, 7);
  touch(g.root, 7);
  assert.deepStrictEqual(glints(g.root), [5, 6]);
  assert.strictEqual(shownHint(g.root), null, "no offer after a walk, before a pick");
  touch(g.root, 5);
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×1 +5✕");
});

test("pick all pays as the offer said: in full up to the day's cap, then ¤0; the cap's note follows", () => {
  const placed = [ripe(1), ripe(2), ripe(3, "apple"), ripe(4)];
  const g = garden({ coins: 0, earned: 40, placed, next: 5, picked: { day: iso(MON), coins: 41 } });
  touch(g.root, 1);                                                         // 43 picked today
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×3 +7✕");       // 7 of the 9 they're worth
  takeAll(g.root).click();
  const s = saved(g.stored);
  assert.deepStrictEqual([s.coins, s.earned, s.picked], [9, 40, { day: iso(MON), coins: 52 }]);
  assert.deepStrictEqual(s.placed.map((p) => p.h), [iso(MON), iso(MON), iso(MON), iso(MON)]);
  assert.deepStrictEqual(floats(g.root), ["+2", "+2", "+5"], "the last tomato paid nothing: no float");
  assert.strictEqual(g.counted.saves, 2);
  assert.strictEqual(shownHint(g.root), CAP + "OK", "the first pick the cap cut short, said once");
  button(g.root, "OK").click();
  assert.strictEqual(shownHint(g.root), null);
});

test("after a pick the cap cut short, its note shows first and the offer after its OK, for ¤0: picking only clears", () => {
  const g = garden({ coins: 0, earned: 40, placed: [ripe(1), ripe(2), ripe(3, "apple")], next: 4,
    picked: { day: iso(MON), coins: 49 } });
  touch(g.root, 1);                                                         // ¤1 of its 2
  assert.strictEqual(shownHint(g.root), CAP + "OK");
  assert.ok(!hint(g.root).classList.contains("kg-hint-pick"));
  button(g.root, "OK").click();
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×2 +0✕");
  assert.ok(!hint(g.root).classList.contains("kg-hint-note"));
  takeAll(g.root).click();
  const s = saved(g.stored);
  assert.deepStrictEqual([s.coins, s.earned, s.picked], [1, 40, { day: iso(MON), coins: 58 }]);
  assert.deepStrictEqual(s.placed.map((p) => p.h), [iso(MON), iso(MON), iso(MON)]);
  assert.deepStrictEqual(glints(g.root), []);
  assert.deepStrictEqual(floats(g.root), ["+1"], "none for ¤0");
  assert.strictEqual(g.counted.saves, 2);
  assert.strictEqual(shownHint(g.root), null, "the note was said already");
  // a tap on the map puts the note away, and the offer it would have led to with it
  const tap = garden({ placed: [ripe(1), ripe(2)], next: 3, picked: { day: iso(MON), coins: 50 } });
  touch(tap.root, 1);
  assert.strictEqual(shownHint(tap.root), CAP + "OK");
  touch(tap.root, null);
  assert.strictEqual(shownHint(tap.root), null);
  assert.deepStrictEqual(glints(tap.root), [2]);
});

test("✕ closes the offer, and so does any other tap: the map, or a plant, which it selects; a ready one it picks", () => {
  const g = garden({ placed: [ripe(1), ripe(2), ripe(3), ripe(4), { id: 5, k: "bench", x: 700, y: 900 }], next: 6 });
  touch(g.root, 1);
  button(g.root, "✕").click();
  assert.strictEqual(shownHint(g.root), null);
  assert.ok(!hint(g.root).classList.contains("kg-hint-pick"));
  assert.deepStrictEqual([g.counted.saves, glints(g.root)], [1, [2, 3, 4]], "nothing more picked");
  touch(g.root, 2);                                                         // another pick: offered again, one fewer
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×2 +4✕");
  touch(g.root, null);
  assert.strictEqual(shownHint(g.root), null);
  touch(g.root, 3);
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×1 +2✕");
  touch(g.root, 5);                                                         // the bench: selected, its own hint
  assert.deepStrictEqual([outlined(g.root), shownHint(g.root)], [[5], "ゆびで うごかせるよしまうOK"]);
  touch(g.root, 5);                                                         // and let go: the offer doesn't come back
  assert.strictEqual(shownHint(g.root), null);
  assert.deepStrictEqual([saved(g.stored).coins, glints(g.root), g.counted.saves], [6, [4], 3]);
});

test("moving the test day, switching vacation or placing something closes the offer; a new opening has none", () => {
  const over = { inv: { bench: 1 }, placed: [ripe(1), ripe(2), ripe(3)], next: 4 };
  // the test day
  let g = garden(over, { data: { dev: "1" } });
  touch(g.root, 1);
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×2 +4✕");
  const panel = openSettings(g.root);
  byClass(panel, "kg-dev").find((b) => b.textContent === "+1日").click();
  assert.strictEqual(shownHint(g.root), null);
  assert.deepStrictEqual(glints(g.root), [2, 3]);
  // vacation, on and off again
  g = garden(over);
  touch(g.root, 1);
  const sw = byClass(openSettings(g.root), "kg-vac")[0];
  sw.click();
  byClass(g.root, "kg-confirm")[0].all((n) => n.tagName === "button" && n.textContent === "はい")[0].click();
  assert.deepStrictEqual([shownHint(g.root), glints(g.root)], [null, []]);
  sw.click();
  assert.deepStrictEqual([shownHint(g.root), glints(g.root)], [null, [2, 3]]);
  // placing: the bag's bench, then ✕
  g = garden(over);
  touch(g.root, 1);
  byClass(g.root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
  byClass(g.root, "kg-card")[0].click();
  assert.strictEqual(shownHint(g.root), "タップ して おいてね✕");
  button(g.root, "✕").click();
  assert.strictEqual(shownHint(g.root), null);
  // closing the garden: the next opening offers nothing until a pick
  g = garden(over);
  touch(g.root, 1);
  byClass(g.root, "kg-close")[0].click();
  const again = garden(null, { stored: g.stored });
  assert.deepStrictEqual([shownHint(again.root), glints(again.root)], [null, [2, 3]]);
});

test("pick all in a garden left open past 04:00 sees each plant's life then: ones that turned dying aren't picked", () => {
  const g = garden({ placed: [ripe(1), ripe(2), ripe(3)], next: 4 }, { now: at(TUE, 23) });   // Monday missed: well
  touch(g.root, 1);
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×2 +4✕");
  g.win.KG_CLOCK = () => at(WED, 4);                                        // Tuesday missed too: dying
  takeAll(g.root).click();
  const s = saved(g.stored);
  assert.deepStrictEqual([s.coins, s.placed.map((p) => p.h)], [2, [iso(TUE), undefined, undefined]]);
  assert.deepStrictEqual(glints(g.root), [], "their glints go with their crops");
  assert.strictEqual(shownHint(g.root), null);
});

/** Zoom the garden in 4 times about the map's middle: the fake 400 x 300 view then shows garden x 802 to 1198 and
 *  y 410 to 706, at 1.0125. */
function zoomIn4(root) {
  const zin = byClass(root, "kg-zbtn")[0];
  for (let i = 0; i < 4; i++) zin.click();
}

test("zoomed in, pick all floats the coins up from each plant in the view, its glint's room too; one out of it has none", () => {
  // a tomato's picture reaches 123 px up from its spot, and its glint's room 34 px more. Tomatoes 1 and 2 are in the
  // view; the corn is left of it, the apple right, tomato 5 above and tomato 6 below, glint and all; tomato 7 is below
  // it but for its glint's room, which a tap can pick it by
  const g = garden({ placed: [ripe(1, "tomato", { x: 1000, y: 600 }), ripe(2, "tomato", { x: 1100, y: 600 }),
    ripe(3, "corn", { x: 220 }), ripe(4, "apple", { x: 1900 }), ripe(5, "tomato", { x: 900, y: 400 }),
    ripe(6, "tomato", { x: 1000, y: 880 }), ripe(7, "tomato", { x: 1100, y: 845 })], next: 8 });
  zoomIn4(g.root);
  touch(g.root, 1);
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×6 +15✕");
  takeAll(g.root).click();
  assert.strictEqual(saved(g.stored).coins, 17, "they all pay");
  assert.deepStrictEqual(floats(g.root), ["+2", "+2", "+2"], "none piled up at the view's sides");
  // tomato 7's coins: over its middle, from the view's bottom, as its picture's top is below it
  const up = byClass(g.root, "kg-gain");
  assert.deepStrictEqual([up[2].style.left, up[2].style.top], [up[1].style.left, "300px"]);
});

test("zoomed in, pick all bursts the plants in the view, its glint's room too, and none out of it; one shine for all", async () => {
  // as above: tomatoes 1 and 2 in the view, tomato 7 by its glint's room; the corn, the apple and tomatoes 5 and 6 out
  const g = garden({ placed: [ripe(1, "tomato", { x: 1000, y: 600 }), ripe(2, "tomato", { x: 1100, y: 600 }),
    ripe(3, "corn", { x: 220 }), ripe(4, "apple", { x: 1900 }), ripe(5, "tomato", { x: 900, y: 400 }),
    ripe(6, "tomato", { x: 1000, y: 880 }), ripe(7, "tomato", { x: 1100, y: 845 })], next: 8 });
  zoomIn4(g.root);
  touch(g.root, 1);
  await settle();
  // the glints' shares are worked out once for the whole batch, after it, not once a plant: one pass is asked for
  vm.runInContext("var kept = Promise.resolve, passes = 0;" +
    "Promise.resolve = function () { passes++; return kept.apply(this, arguments); };", g.win);
  takeAll(g.root).click();
  vm.runInContext("Promise.resolve = kept;", g.win);
  assert.strictEqual(g.win.passes, 1);
  const f = g.G.items.tomato.frames[MATURE], S = g.win.KG_SCALE;
  const spot = (x, y) => [x + (0.5 * f.w - f.ax) * S, y + (0.3 * f.h - f.ay) * S];
  assert.deepStrictEqual(byClass(g.root, "kg-burst").map((b) => [px(b.style.left), px(b.style.top)]),
    [spot(1000, 600), spot(1100, 600), spot(1100, 845)]);
  await settle();
  assert.deepStrictEqual([glints(g.root), byClass(g.root, "kg-glint").length], [[], 3 * 8]);
  g.win.wait(600);
  assert.deepStrictEqual(byClass(g.root, "kg-glint"), []);
});

test("pick all shares 48 burst glints over the plants in the view: 8 each at most, 1 at least, none past the 48th", () => {
  // the whole map is in the fake view; after a tap's pick (a burst of 8), the rest
  for (const [n, each] of [[7, [8, 8, 8, 8, 8, 8]], [8, Array(7).fill(6)], [30, Array(29).fill(1)],
    [60, Array(48).fill(1)]]) {
    const g = garden({ placed: many(n), next: n + 1 });
    touch(g.root, 1);
    takeAll(g.root).click();
    const b = byClass(g.root, "kg-burst");
    assert.deepStrictEqual(b.map((x) => x.children.length), [8].concat(each), n + " ready");
    assert.deepStrictEqual(glints(g.root), [], "all picked");
  }
});

test("with the cap nearly reached, pick all pays the plants in the view first, so the coins float up where they're seen", () => {
  // tomatoes 1 and 4 in the view; the corn left of it and the apple right, placed before tomato 4
  const g = garden({ coins: 0, placed: [ripe(1, "tomato", { x: 1000, y: 600 }), ripe(2, "corn", { x: 220 }),
    ripe(3, "apple", { x: 1900 }), ripe(4, "tomato", { x: 1100, y: 600 })], next: 5, picked: { day: iso(MON), coins: 44 } });
  zoomIn4(g.root);
  touch(g.root, 1);                                                         // 46: ¤4 left today
  assert.strictEqual(shownHint(g.root), "のこり ぜんぶ とる ×3 +4✕");
  takeAll(g.root).click();
  const s = saved(g.stored);
  assert.deepStrictEqual([s.coins, s.picked.coins, s.placed.map((p) => p.h)], [6, 55, [iso(MON), iso(MON), iso(MON), iso(MON)]]);
  // tomato 4 paid ¤2 with its float, 100 garden px right of tomato 1's; then the corn ¤2, out of the view, and the apple ¤0
  assert.deepStrictEqual(floats(g.root), ["+2", "+2"]);
  const left = byClass(g.root, "kg-gain").map((n) => parseFloat(n.style.left));
  assert.ok(Math.abs(left[1] - left[0] - 101.25) < 1e-9, String(left));
  assert.strictEqual(shownHint(g.root), CAP + "OK");
});

test("data-lang=\"en\": the offer in English", () => {
  const g = garden({ placed: [ripe(1), ripe(2, "apple"), ripe(3)], next: 4 }, { data: { lang: "en" } });
  touch(g.root, 1);
  assert.strictEqual(shownHint(g.root), "Pick the rest ×2 +7✕");
  assert.strictEqual(byClass(takeAll(g.root), "kg-coin").length, 1);
  assert.strictEqual(button(g.root, "✕").attrs["aria-label"], "Cancel");
  takeAll(g.root).click();
  assert.deepStrictEqual([saved(g.stored).coins, glints(g.root)], [9, []]);
});

// ---- taps in the garden's other modes --------------------------------------------------------------

test("while placing, a tap on a ready plant places the item there and picks nothing", () => {
  const g = garden({ inv: { bench: 1 }, placed: [ripe(1)], next: 2 });
  byClass(g.root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
  byClass(g.root, "kg-card")[0].click();
  touch(g.root, 1);
  const s = saved(g.stored);
  assert.deepStrictEqual(s.placed.map((p) => p.k), ["tomato", "bench"]);
  assert.deepStrictEqual([s.coins, s.placed[0].h], [0, undefined]);
  assert.deepStrictEqual(glints(g.root), [1]);
});

test("a pick ends a selection, a sign's label and compost all, as a tap on the map does", () => {
  const dead = (id) => ({ id, k: "rose_pink", x: 120 * id, y: 900, t: iso(1), dead: iso(6) });
  const g = garden({ maps: ["riverside"], placed: [ripe(1), ripe(2, "corn"), ripe(3, "lettuce"),
    { id: 4, k: "bench", x: 600, y: 900 }, { id: 5, k: "sign_riverside", x: 1500, y: 900 }, dead(6), dead(7)], next: 8 });
  const label = () => !byClass(g.root, "kg-go")[0].hidden;
  touch(g.root, 4);                                                         // a decoration selected
  assert.deepStrictEqual(outlined(g.root), [4]);
  touch(g.root, 1);
  assert.deepStrictEqual([outlined(g.root), shownHint(g.root), saved(g.stored).coins], [[], "のこり ぜんぶ とる ×2 +4✕", 2]);
  touch(g.root, 5);                                                         // a sign selected, its label shown
  assert.ok(label());
  touch(g.root, 2);
  assert.deepStrictEqual([outlined(g.root), label(), saved(g.stored).coins], [[], false, 4]);
  touch(g.root, 6);                                                         // compost all asked
  button(g.root, "ぜんぶ ×2").click();
  assert.deepStrictEqual(outlined(g.root), [6, 7]);
  touch(g.root, 3);
  assert.deepStrictEqual([outlined(g.root), shownHint(g.root), saved(g.stored).coins], [[], null, 6]);
  assert.strictEqual(saved(g.stored).placed.length, 7, "nothing composted or walked");
  assert.strictEqual(byClass(g.root, "kg-map-name")[0].textContent, "わたしのにわ");
});

test("a drag that starts on a ready plant pans the map, as on any plant not selected: nothing picked or moved", () => {
  const g = garden({ placed: [ripe(1)], next: 2 });
  touch(g.root, 1, 80, 40);
  const p = saved(g.stored).placed[0];
  assert.deepStrictEqual([p.x, p.y, p.h, saved(g.stored).coins], [220, 700, undefined, 0]);
  assert.deepStrictEqual(glints(g.root), [1]);
});

test("a selected plant whose crop comes while it's selected: a drag moves it, a tap picks it", () => {
  const g = garden({ placed: [{ id: 1, k: "pumpkin", x: 500, y: 700, t: iso(MON), g: MATURE }], next: 2 },
    { card: 5, data: { dev: "1" } });
  touch(g.root, 1);                                                         // no crop yet: selected
  assert.deepStrictEqual(outlined(g.root), [1]);
  byClass(openSettings(g.root), "kg-dev").find((b) => b.textContent === "+1日").click();
  assert.deepStrictEqual([glints(g.root), outlined(g.root)], [[1], [1]]);
  touch(g.root, 1, 50, 0);
  assert.notStrictEqual(saved(g.stored).placed[0].x, 500, "not moved");
  assert.strictEqual(saved(g.stored).placed[0].h, undefined);
  touch(g.root, 1);
  assert.deepStrictEqual([saved(g.stored).placed[0].h, saved(g.stored).coins, outlined(g.root)], [iso(TUE), 3, []]);
});

test("picking sees only the map shown: a crop on another map waits until the player walks there", () => {
  const g = garden({ maps: ["riverside"], placed: [ripe(1, "tomato", { m: "riverside" }), ripe(2, "corn"),
    { id: 3, k: "sign_riverside", x: 1500, y: 900 }], next: 4 });
  assert.deepStrictEqual(glints(g.root), [2]);
  touch(g.root, 3);
  touch(g.root, 3);                                                         // walk there
  assert.deepStrictEqual(glints(g.root), [1]);
  touch(g.root, 1);
  const s = saved(g.stored);
  assert.deepStrictEqual([s.placed[0].h, s.placed[1].h, s.coins], [iso(MON), undefined, 2]);
});

// ---- the save --------------------------------------------------------------------------------------

test("h and picked load and save as they are, without a write", () => {
  const over = { coins: 7, placed: [ripe(1, "tomato", { h: iso(11) }), ripe(2, "apple", { h: iso(MON), m: "riverside" })],
    maps: ["riverside"], next: 3, picked: { day: iso(MON), coins: 52 } };
  const stored = stored3(Object.assign({ days: days() }, over));
  let writes = 0;
  const watched = new Proxy(stored, { set(t, k, v) { writes++; t[k] = v; return true; } });
  const s = plain(page(watched, { now: at(MON) }).KanpekiGarden.load());
  assert.deepStrictEqual([s.placed[0].h, s.placed[1].h, s.picked], [iso(11), iso(MON), { day: iso(MON), coins: 52 }]);
  assert.strictEqual(writes, 0);
  // the garden writes them back as they are
  const g = garden(null, { stored });
  byClass(g.root, "kg-close")[0].click();
  assert.deepStrictEqual(saved(stored).placed.map((p) => p.h), [iso(11), iso(MON)]);
  assert.deepStrictEqual(saved(stored).picked, { day: iso(MON), coins: 52 });
  assert.strictEqual(saved(stored).v, 3);
});

// v1.2.0 is the release before the harvest: a v: 3 script that knows neither h nor picked. Its script, from the tag (not
// in a shallow clone), runs on a save that has them
const old = spawnSync("git", ["show", "v1.2.0:garden.js"], { cwd: DIR, encoding: "utf8" });
const noOld = (old.status !== 0 || !/if \(s\.v === 2\) \{ s\.v = 3; changed = true; \}/.test(old.stdout) ||
  /PICK_CAP/.test(old.stdout)) && "no v1.2.0 tag here";

test("v1.2.0's script loads and saves a save with picked days, keeping them", { skip: noOld }, () => {
  const stored = stored3({ coins: 30, earned: 70, days: days(), next: 3,
    placed: [ripe(1, "tomato", { h: iso(11) }), ripe(2, "apple", { h: iso(MON) })], picked: { day: iso(MON), coins: 7 } });
  const win = page(stored, { now: at(MON), src: () => old.stdout });
  const root = openGarden(win, 5);                                          // a card answered: it pays, and saves
  byClass(root, "kg-close")[0].click();
  const s = saved(stored);
  assert.deepStrictEqual([s.v, s.coins, s.earned], [3, 31, 71], "v1.2.0 didn't pay into it");
  assert.deepStrictEqual(s.placed.map((p) => p.h), [iso(11), iso(MON)]);
  assert.deepStrictEqual(s.picked, { day: iso(MON), coins: 7 });
  // and this script still reads them: the tomato picked Sunday has a crop again, the apple picked today not
  const g = garden(null, { stored });
  assert.deepStrictEqual(glints(g.root), [1]);
});

test("an h later than tomorrow (picked with the clock ahead) becomes today; one a day ahead stays, not picked twice", () => {
  const stored = stored3({ days: days(MON), next: 4, placed: [ripe(1, "tomato", { h: "2027-10-12" }),
    ripe(2, "corn", { h: iso(WED) }), ripe(3, "carrot", { h: iso(TUE) })] });
  const s = plain(page(stored, { now: at(MON) }).KanpekiGarden.load());
  assert.deepStrictEqual(s.placed.map((p) => p.h), [iso(MON), iso(MON), iso(TUE)]);
  assert.deepStrictEqual(saved(stored), s, "saved as loaded");
  // picked Tuesday, the clock back to Monday (a flight west): no crop again until a growth day after Tuesday
  assert.deepStrictEqual([1, 2, 3].map((id) => crop(stored, at(MON, 11), id)), [false, false, false]);
  assert.deepStrictEqual([1, 2, 3].map((id) => crop(stored, at(TUE, 4), id)), [true, true, false]);
  review(stored, at(TUE, 9));
  assert.strictEqual(crop(stored, at(WED, 4), 3), true);
});

test("a damaged h is dropped, as if never picked; a damaged picked is dropped, so nothing counts as picked today", () => {
  for (const h of ["x", 5, null, {}, [], "2026-1-2", true]) {
    const stored = stored3({ days: days(), placed: [ripe(1, "tomato", { h })], next: 2 });
    const s = plain(page(stored, { now: at(MON) }).KanpekiGarden.load());
    assert.ok(!("h" in s.placed[0]), JSON.stringify(h));
    assert.deepStrictEqual(saved(stored), s, JSON.stringify(h) + ": saved as loaded");
    assert.strictEqual(crop(stored, at(MON), 1), true, JSON.stringify(h));
  }
  for (const picked of [5, null, "x", [], {}, { day: "Monday", coins: 3 }, { day: iso(MON), coins: "3" },
    { day: iso(MON), coins: -1 }, { day: iso(MON), coins: 49.5 }, { day: iso(MON) }, { coins: 3 },
    { day: iso(MON), coins: "INF" }]) {
    const why = JSON.stringify(picked);
    const raw = JSON.stringify({ v: 3, coins: 0, earned: 0, seen: {}, inv: {}, placed: [ripe(1)], next: 2, days: days(), picked });
    const stored = { [KEY]: raw.replace('"INF"', "1e999") };
    const s = plain(page(stored, { now: at(MON) }).KanpekiGarden.load());
    assert.ok(!("picked" in s), why);
    assert.deepStrictEqual(saved(stored), s, why + ": saved as loaded");
    const g = garden(null, { stored });
    touch(g.root, 1);
    assert.deepStrictEqual([saved(stored).coins, saved(stored).picked], [2, { day: iso(MON), coins: 2 }], why);
  }
});
