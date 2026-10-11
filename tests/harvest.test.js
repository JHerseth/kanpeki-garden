// Harvest: mature vegetables and fruit trees have a crop once they've been mature through a growth day since they
// matured or were last picked. A ready plant shows a still glint; a tap picks it for ¤2 or ¤5 (¤50 a day at most,
// earned left alone), and the next tap selects it. The save keeps each plant's picked day (h) and the crops picked
// today (picked), as a v: 3 save.
// Every check runs on a fake clock (KG_CLOCK). 2026-10-12 is a Monday.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
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

// ---- the glint ----------------------------------------------------------------------------------

test("the glint: a pixel-art star in a box over the plant's picture, the picture's size, swaying as it does", async () => {
  const g = garden({ placed: [ripe(1, "corn"), ripe(2, "pear_tree", { x: 900 }), ripe(3, "tulip_yellow")], next: 4 });
  const S = g.win.KG_SCALE;
  assert.deepStrictEqual(glints(g.root), [1, 2]);
  for (const id of [1, 2]) {
    const d = node(g.root, id), pic = d.children[0], box = d.children[1], star = box.children[0];
    const f = g.G.items[saved(g.stored).placed[id - 1].k].frames[MATURE];
    assert.strictEqual(d.children.length, 2);
    assert.deepStrictEqual([box.children.length, star.className.trim()], [1, "kg-glint"]);
    assert.deepStrictEqual([box.style.width, box.style.height], [f.w * S + "px", f.h * S + "px"]);
    // 11 × 4 = 44 garden px a side, centred over the picture, its bottom 10 px down on the top of it
    assert.deepStrictEqual([star.style.width, star.style.height], ["44px", "44px"]);
    assert.deepStrictEqual([star.style.left, star.style.top], [(f.w * S - 44) / 2 + "px", "-34px"]);
    assert.match(star.style.backgroundImage, /^url\(data:image\/png/);
    // the same sway as the picture: its skew about the same anchor, at the same time
    assert.ok(box.classList.contains("kg-sway") && pic.classList.contains("kg-sway"));
    for (const k of ["transformOrigin", "--kg-a", "animationDuration", "animationDelay"]) {
      assert.strictEqual(box.style[k], pic.style[k], k);
    }
  }
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual([1, 2].map((id) => node(g.root, id).children[1].getAnimations()[0].startTime), [0, 0]);
  // it's in the world, which carries the map's zoom
  assert.ok(byClass(g.root, "kg-world")[0].contains(node(g.root, 1).children[1]));
  const css = g.win.document.getElementById("kg-style").textContent;
  assert.match(css, /\.kg-glint\{[^}]*image-rendering:pixelated/);
});

test("with reduced motion, or the sway switched off, the glint shows still", () => {
  let g = garden({ placed: [ripe(1)], next: 2 }, { reduceMotion: true });
  assert.deepStrictEqual(glints(g.root), [1]);
  assert.ok(!node(g.root, 1).children[1].classList.contains("kg-sway"));
  g = garden({ placed: [ripe(1)], next: 2 });
  const sway = byClass(openSettings(g.root), "kg-opt").find((n) => n.textContent === "くさばなが ゆれる");
  sway.click();
  assert.deepStrictEqual(glints(g.root), [1]);
  assert.ok(!node(g.root, 1).children[1].classList.contains("kg-sway"));
  sway.click();
  assert.ok(node(g.root, 1).children[1].classList.contains("kg-sway"));
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
  assert.strictEqual(shownHint(g.root), null);
  touch(g.root, 2);
  s = saved(g.stored);
  assert.deepStrictEqual([s.coins, s.earned, s.placed[1].h, s.picked], [17, 40, iso(MON), { day: iso(MON), coins: 7 }]);
  assert.strictEqual(g.counted.saves, 2);
  assert.deepStrictEqual(glints(g.root), []);
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
  assert.strictEqual(shownHint(g.root), null, "¤50 exactly, each pick paid in full");
  touch(g.root, 26);
  assert.deepStrictEqual([saved(g.stored).coins, saved(g.stored).picked.coins], [55, 52]);
  assert.strictEqual(shownHint(g.root), CAP + "OK");
  assert.strictEqual(byClass(hint(g.root), "kg-coin").length, 1);
  assert.ok(!glints(g.root).includes(26), "its crop is cleared");
  assert.strictEqual(saved(g.stored).placed[25].h, iso(MON));
  assert.strictEqual(floats(g.root).length, 25, "no float for ¤0");
  touch(g.root, 27);                                                        // once a day: not again
  assert.strictEqual(shownHint(g.root), null);
  assert.strictEqual(saved(g.stored).coins, 55);
  assert.strictEqual(saved(g.stored).earned, 40);
  // the next card's garden, the same day: still capped, and not said again
  let next = garden(null, { stored: g.stored, now: at(TUE, 3, 59) });
  touch(next.root, 28);
  assert.deepStrictEqual([saved(g.stored).coins, saved(g.stored).picked], [55, { day: iso(MON), coins: 56 }]);
  assert.strictEqual(shownHint(next.root), null);
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
  assert.strictEqual(shownHint(g.root), null);
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
  assert.deepStrictEqual([outlined(g.root), shownHint(g.root), saved(g.stored).coins], [[], null, 2]);
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
