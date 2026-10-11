// Life cycle: plants grow on days with reviews, wilt and die without them, and dead ones go to the
// compost. Every check runs on a fake clock (KG_CLOCK). 2026-10-12 is a Monday.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, OLD_KEY, page, openGarden, unsoldEdit } = require("./harness");

const at = (day, h = 10, m = 0) => new Date(2026, 9, day, h, m).getTime();     // October 2026, local time
const iso = (day) => "2026-10-" + String(day).padStart(2, "0");
const NO_ART = unsoldEdit("rose_red");                                             // a plant without stage art
const MON = 12, TUE = 13, WED = 14, THU = 15, FRI = 16, SAT = 17, SUN = 18;
const [SPROUT, YOUNG, MATURE, DYING, DEAD] = [0, 1, 2, 3, 4];                    // a 5-frame strip

const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const plain = (v) => JSON.parse(JSON.stringify(v));
const px = (v) => Number(String(v).replace("px", ""));
const stored2 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 2, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const saved = (stored) => JSON.parse(stored[KEY]);
/** Review days for a save's `days`. */
const days = (...ds) => Object.fromEntries(ds.map((d) => [iso(d), 1]));

/** Open the garden at `when` (answering card `card` first, if given). */
function look(stored, when, card, edit) {
  const win = page(stored, { now: when, edit });
  return { win, root: openGarden(win, card) };
}
/** Answer card `card` at `when` without opening the garden. */
function review(stored, when, card = 1, edit) {
  page(stored, { now: when, edit }).KanpekiGarden.earn(String(card));
}
function node(root, id) { return byClass(root, "kg-item").find((d) => d.dataset.id === String(id)); }
/** Which of its item's frames placed item `id` shows. */
function frameOf({ win, root }, id) {
  const d = node(root, id), S = win.KG_SCALE;
  const [x, y] = d.children[0].style.backgroundPosition.split(" ").map((v) => Math.round(-px(v) / S));
  const k = win.KanpekiGarden.load().placed.find((p) => p.id === id).k;
  const i = win.KanpekiGarden.items[k].frames.findIndex((f) => f.x === x && f.y === y);
  assert.ok(i >= 0, "item " + id + " shows none of its frames");
  return i;
}
function pointer(root, type, target, x = 200, y = 150) {
  const view = byClass(root, "kg-view")[0];
  view.on[type].forEach((f) => f({ type, pointerId: 1, clientX: x, clientY: y, target }));
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
const button = (root, text) => hint(root).all((n) => n.tagName === "button" && n.textContent === text)[0];

test("planted Monday with reviews every day: sprout Monday, young from Tuesday 04:00, mature from Wednesday 04:00", () => {
  const stored = stored2({ inv: { rose_pink: 1 } });
  let g = look(stored, at(MON), 1);
  byClass(g.root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
  byClass(g.root, "kg-card")[0].click();
  touch(g.root, null);                                         // tap the map: placed
  const p = saved(stored).placed[0];
  assert.deepStrictEqual([p.k, p.t, p.g], ["rose_pink", iso(MON), undefined]);
  assert.strictEqual(frameOf(g, p.id), SPROUT);
  assert.strictEqual(frameOf(look(stored, at(TUE, 3, 59)), 1), SPROUT);      // the planting day isn't over yet
  assert.strictEqual(frameOf(look(stored, at(TUE, 4), 1), 1), YOUNG);        // the planting day counts
  assert.strictEqual(frameOf(look(stored, at(WED, 3, 59)), 1), YOUNG);
  assert.strictEqual(frameOf(look(stored, at(WED, 4), 1), 1), MATURE);
  for (let d = THU; d <= 25; d++) assert.strictEqual(frameOf(look(stored, at(d), 1), 1), MATURE, iso(d));
});

test("planted on a day with reviews, none after: young from 04:00 the next day, then dying and dead on the usual days", () => {
  const stored = stored2({ placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: iso(MON) }], next: 2, days: days(MON) });
  assert.strictEqual(frameOf(look(stored, at(MON, 23)), 1), SPROUT);
  assert.strictEqual(frameOf(look(stored, at(TUE, 3, 59)), 1), SPROUT);
  assert.strictEqual(frameOf(look(stored, at(TUE, 4)), 1), YOUNG);
  assert.strictEqual(frameOf(look(stored, at(THU, 3, 59)), 1), YOUNG);
  assert.strictEqual(frameOf(look(stored, at(THU, 4)), 1), DYING);           // Tuesday and Wednesday missed
  assert.strictEqual(frameOf(look(stored, at(SAT, 3, 59)), 1), DYING);
  assert.strictEqual(frameOf(look(stored, at(SAT, 4)), 1), DEAD);            // ... and Thursday and Friday
});

test("planted on a day without reviews: it doesn't grow that day, which still counts as reviewed for wilting", () => {
  const stored = stored2({ placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: iso(MON) }], next: 2 });
  assert.strictEqual(frameOf(look(stored, at(TUE, 4)), 1), SPROUT);
  assert.strictEqual(frameOf(look(stored, at(THU, 3, 59)), 1), SPROUT);
  assert.strictEqual(frameOf(look(stored, at(THU, 4)), 1), DYING);           // Tuesday and Wednesday missed
  assert.strictEqual(frameOf(look(stored, at(SAT, 4)), 1), DEAD);
  // with reviews the next day, that day grows it
  const next = stored2({ placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: iso(MON) }], next: 2, days: days(TUE) });
  assert.strictEqual(frameOf(look(next, at(WED, 3, 59)), 1), SPROUT);
  assert.strictEqual(frameOf(look(next, at(WED, 4)), 1), YOUNG);
});

test("reviews Monday, none after: dying from Thursday 04:00, dead from Saturday 04:00", () => {
  const stored = stored2({ placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: iso(9), g: MATURE }], next: 2,
    days: days(9, 10, 11, MON) });
  assert.strictEqual(frameOf(look(stored, at(TUE)), 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(WED)), 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(THU, 3, 59)), 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(THU, 4)), 1), DYING);
  assert.strictEqual(frameOf(look(stored, at(FRI)), 1), DYING);
  assert.strictEqual(frameOf(look(stored, at(SAT, 3, 59)), 1), DYING);
  assert.strictEqual(frameOf(look(stored, at(SAT, 4)), 1), DEAD);
  assert.strictEqual(frameOf(look(stored, at(25)), 1), DEAD);
});

test("a dying plant recovers the moment a card is answered, and needs 2 new missed days to wilt again", () => {
  const stored = stored2({ placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: iso(9), g: MATURE }], next: 2,
    days: days(MON) });
  assert.strictEqual(frameOf(look(stored, at(THU, 9)), 1), DYING);
  assert.strictEqual(frameOf(look(stored, at(THU, 9, 1), 1), 1), MATURE);     // the card's chip opens it recovered
  assert.strictEqual(frameOf(look(stored, at(FRI)), 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(SAT)), 1), MATURE);             // one missed day (Friday)
  assert.strictEqual(frameOf(look(stored, at(SUN, 3, 59)), 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(SUN, 4)), 1), DYING);           // Friday and Saturday
  assert.strictEqual(frameOf(look(stored, at(20, 4)), 1), DEAD);             // ... and Sunday and Monday
});

test("a dying young plant recovers to young, not mature", () => {
  const stored = stored2({ placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: iso(MON) }], next: 2,
    days: days(TUE) });                                                      // nothing on the planting day
  assert.strictEqual(frameOf(look(stored, at(WED)), 1), YOUNG);
  assert.strictEqual(frameOf(look(stored, at(FRI)), 1), DYING);              // nothing on Wednesday or Thursday
  assert.strictEqual(frameOf(look(stored, at(FRI), 1), 1), YOUNG);
  assert.strictEqual(frameOf(look(stored, at(SAT)), 1), MATURE);             // Friday was a day with reviews
});

test("a dead plant stays dead after reviews and can't be moved; tapping it composts it for a quarter of its price", () => {
  const stored = stored2({ coins: 3, placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: iso(MON) }], next: 2,
    days: days(MON) });
  for (let d = SAT; d <= 22; d++) review(stored, at(d), d);
  const g = look(stored, at(22, 12), 1);
  assert.strictEqual(frameOf(g, 1), DEAD);
  touch(g.root, 1);                                          // select
  assert.strictEqual(hint(g.root).textContent, "たいひにする？ +5はい✕");
  assert.ok(!button(g.root, "しまう"));
  touch(g.root, 1, 80, 40);                                  // a drag only pans
  assert.deepStrictEqual([saved(stored).placed[0].x, saved(stored).placed[0].y], [500, 600]);
  button(g.root, "はい").click();
  assert.deepStrictEqual(plain(saved(stored).placed), []);
  assert.strictEqual(saved(stored).coins, 3 + 7 + 5);        // + the 7 cards answered
  assert.ok(!node(g.root, 1));
  assert.ok(hint(g.root).hidden);
  assert.ok(!byClass(look(stored, at(23)).root, "kg-item").length, "back after composting");
});

test("composting pays floor(25%): 20 → 5, 50 → 12, 100 → 25, 200 → 50", () => {
  const keys = { rose_pink: [20, 5], phlox: [50, 12], bamboo_log: [100, 25], palm: [200, 50] };
  const placed = Object.keys(keys).map((k, i) => ({ id: i + 1, k, x: 300 + 300 * i, y: 700, t: iso(1) }));
  const stored = stored2({ placed, next: 5 });
  const g = look(stored, at(MON));
  placed.forEach((p) => {
    const item = g.win.KanpekiGarden.items[p.k];
    assert.strictEqual(item.price, keys[p.k][0], p.k);
    assert.strictEqual(frameOf(g, p.id), item.frames.length - 1, p.k + " not dead");
    const before = saved(stored).coins;
    touch(g.root, p.id);
    assert.match(hint(g.root).textContent, new RegExp("^たいひにする？ \\+" + keys[p.k][1] + "はい"));
    button(g.root, "はい").click();
    assert.strictEqual(saved(stored).coins - before, keys[p.k][1], p.k);
  });
  assert.deepStrictEqual(plain(saved(stored).placed), []);
});

test("✕ keeps a dead plant", () => {
  const stored = stored2({ coins: 1, placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: iso(1) }], next: 2 });
  const g = look(stored, at(MON));
  touch(g.root, 1);
  hint(g.root).all((n) => n.tagName === "button" && n.attrs["aria-label"] === "やめる")[0].click();
  assert.ok(hint(g.root).hidden);
  assert.strictEqual(saved(stored).placed.length, 1);
  assert.strictEqual(saved(stored).coins, 1);
});

test("a living plant has no しまう, only moving; a decoration still does", () => {
  const stored = stored2({ placed: [
    { id: 1, k: "rose_pink", x: 500, y: 600, t: iso(MON) },                  // sprout
    { id: 2, k: "palm", x: 900, y: 700, t: iso(5), g: MATURE },              // dying
    { id: 3, k: "rose_red", x: 1200, y: 700 },                               // no stage art yet
    { id: 4, k: "stump", x: 1500, y: 700 },
  ], next: 5, days: days(5, 6, 7, 8, 9) });
  const g = look(stored, at(MON), undefined, NO_ART);
  assert.strictEqual(frameOf(g, 2), DYING);
  for (const id of [1, 2, 3]) {
    touch(g.root, id);
    assert.strictEqual(hint(g.root).textContent, "ゆびで うごかせるよOK", "item " + id);
    touch(g.root, id, 50, 0);                                // and it moves
    assert.notStrictEqual(saved(stored).placed[id - 1].x, [500, 900, 1200][id - 1], "item " + id + " didn't move");
    touch(g.root, id);
  }
  touch(g.root, 4);
  button(g.root, "しまう").click();
  assert.deepStrictEqual(plain(saved(stored).inv), { stump: 1 });
  assert.deepStrictEqual(saved(stored).placed.map((p) => p.id), [1, 2, 3]);
});

test("opening the garden after a week away gives the same result as opening it every day", () => {
  // reviews: Mon, Tue, (none Wed, Thu), Fri, Sat, (none Sun), Mon 19, then a week away, then Tue 27
  const reviewDays = [MON, TUE, FRI, SAT, 19, 27];
  const start = () => stored2({ inv: {}, next: 6, placed: [
    { id: 1, k: "rose_pink", x: 500, y: 600, t: iso(MON) },
    { id: 2, k: "palm", x: 900, y: 700, t: iso(11), g: MATURE },
    { id: 3, k: "tulip_yellow", x: 1200, y: 700, t: iso(TUE) },
    { id: 4, k: "rose_red", x: 1500, y: 700 },
    { id: 5, k: "stump", x: 1700, y: 700 },
  ], days: {} });
  const snap = (g) => [1, 2, 3, 4, 5].map((id) => frameOf(g, id));
  const daily = start(), seen = {};
  for (let d = MON; d <= 29; d++) {
    const g = look(daily, at(d), reviewDays.includes(d) ? 1 : undefined, NO_ART);
    seen[d] = snap(g);
    // the same history, with the garden opened only today
    const once = start();
    reviewDays.filter((r) => r <= d).forEach((r) => review(once, at(r), 1, NO_ART));
    assert.deepStrictEqual(snap(look(once, at(d), undefined, NO_ART)), seen[d], iso(d));
    // the same plants, dead or not (dead says the day it was first seen dead, which differs)
    const plants = (st) => saved(st).placed.map((p) => Object.assign(p, p.dead ? { dead: true } : {}));
    assert.deepStrictEqual(plants(once), plants(daily), iso(d));
    assert.deepStrictEqual(saved(once).days, saved(daily).days, iso(d));
  }
  // and the history went through every stage
  assert.deepStrictEqual(seen[MON], [SPROUT, MATURE, SPROUT, 0, 0]);
  assert.deepStrictEqual(seen[TUE], [YOUNG, MATURE, SPROUT, 0, 0]);                 // Monday, its planting day, grew it
  assert.deepStrictEqual(seen[THU], [MATURE, MATURE, YOUNG, 0, 0]);
  assert.deepStrictEqual(seen[FRI], [MATURE, MATURE, YOUNG, 0, 0]);                 // dying, then Friday's card
  assert.deepStrictEqual(seen[SAT], [MATURE, MATURE, MATURE, 0, 0]);
  assert.deepStrictEqual(seen[22], [DYING, DYING, DYING, 0, 0]);
  assert.deepStrictEqual(seen[24], [DEAD, DEAD, DEAD, 0, 0]);
  assert.deepStrictEqual(seen[29], [DEAD, DEAD, DEAD, 0, 0]);
});

test("a v: 1 save migrates: placed plants become mature with today as their last review day; coins and もちもの unchanged", () => {
  const v1 = { v: 1, coins: 33, earned: 90, seen: { 5: iso(MON) }, inv: { rose_pink: 2, stump: 1, rose_red: 1 },
    placed: [{ id: 1, k: "rose_pink", x: 500, y: 600 }, { id: 2, k: "palm", x: 900, y: 700 },
      { id: 3, k: "stump", x: 1200, y: 700 }, { id: 4, k: "rose_red", x: 1500, y: 700 }], next: 5 };
  const stored = { [OLD_KEY]: JSON.stringify(v1) };
  const g = look(stored, at(MON), undefined, NO_ART);
  const s = saved(stored);
  assert.strictEqual(s.v, 2);
  assert.deepStrictEqual([s.coins, s.earned, s.seen, s.inv, s.next], [33, 90, v1.seen, v1.inv, 5]);
  assert.deepStrictEqual(s.placed.map((p) => [p.id, p.k, p.x, p.y, p.t, p.g]), [
    [1, "rose_pink", 500, 600, iso(MON), MATURE], [2, "palm", 900, 700, iso(MON), MATURE],
    [3, "stump", 1200, 700, undefined, undefined], [4, "rose_red", 1500, 700, undefined, undefined]]);
  assert.deepStrictEqual(s.days, {});
  assert.deepStrictEqual([frameOf(g, 1), frameOf(g, 2)], [MATURE, MATURE]);
  // Monday counts as reviewed: no reviews Tuesday or Wednesday → dying from Thursday 04:00
  assert.strictEqual(frameOf(look(stored, at(THU, 3, 59), undefined, NO_ART), 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(THU, 4), undefined, NO_ART), 1), DYING);
});

test("plants enrolled on a day with reviews stay mature, and wilt on the usual days", () => {
  const v1 = { v: 1, coins: 0, earned: 0, seen: {}, inv: {}, placed: [{ id: 1, k: "rose_pink", x: 500, y: 600 }], next: 2 };
  const stored = { [OLD_KEY]: JSON.stringify(v1) };
  const g = look(stored, at(MON), 1);                        // enrolled, and Monday has reviews
  assert.deepStrictEqual([saved(stored).placed[0].t, saved(stored).days], [iso(MON), days(MON)]);
  assert.strictEqual(frameOf(g, 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(TUE, 4), 1), 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(WED, 4)), 1), MATURE);
  assert.deepStrictEqual(plain(g.win.KanpekiGarden.life(saved(stored), saved(stored).placed[0])),
    { g: MATURE, missed: 0, dead: false });
  assert.strictEqual(frameOf(look(stored, at(FRI, 3, 59)), 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(FRI, 4)), 1), DYING);           // Wednesday and Thursday missed
});

test("a v: 1 save with removed items is refunded and migrated", () => {
  const stored = { [OLD_KEY]: JSON.stringify({ v: 1, coins: 0, earned: 0, seen: {}, inv: { tomato_ripe: 1 },
    placed: [{ id: 1, k: "seed_tray", x: 100, y: 200 }, { id: 2, k: "rose_pink", x: 500, y: 600 }], next: 3 }) };
  const win = page(stored, { now: at(MON) });
  const s = win.KanpekiGarden.load();
  assert.strictEqual(s.v, 2);
  assert.strictEqual(s.coins, win.KG_REMOVED.tomato_ripe[2] + win.KG_REMOVED.seed_tray[2]);
  assert.deepStrictEqual(plain(s.placed), [{ id: 2, k: "rose_pink", x: 500, y: 600, t: iso(MON), g: MATURE }]);
  assert.ok(s.refunded, "no note to show");
});

test("a card answered again the same day still counts that day as reviewed", () => {
  // paid under v: 1 earlier today, before the update; answered again after it
  const stored = { [OLD_KEY]: JSON.stringify({ v: 1, coins: 4, earned: 4, seen: { 7: iso(MON) }, inv: {},
    placed: [{ id: 1, k: "rose_pink", x: 500, y: 600 }], next: 2 }) };
  review(stored, at(MON, 9), 7);
  review(stored, at(TUE, 9), 7);
  review(stored, at(TUE, 9, 5), 7);
  const s = saved(stored);
  assert.deepStrictEqual(s.days, days(MON, TUE));
  assert.strictEqual(s.coins, 5);
});

test("owned plants without stage art stay mature through missed days, then join the life cycle when their strip comes", () => {
  const stored = stored2({ inv: { rose_red: 1 }, placed: [{ id: 1, k: "rose_red", x: 500, y: 600 }], next: 2,
    days: days(MON) });
  for (const d of [TUE, FRI, 25]) {
    const g = look(stored, at(d), undefined, NO_ART);
    assert.strictEqual(frameOf(g, 1), 0);
    assert.strictEqual(g.win.KanpekiGarden.life(saved(stored), saved(stored).placed[0]), null);
  }
  assert.strictEqual(saved(stored).placed[0].t, undefined);
  // its strip comes on the 26th: the real catalog
  let g = look(stored, at(26));
  assert.deepStrictEqual([saved(stored).placed[0].t, saved(stored).placed[0].g], [iso(26), MATURE]);
  assert.strictEqual(frameOf(g, 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(29, 3, 59)), 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(29, 4)), 1), DYING);                   // the 26th counts as reviewed
  // one from もちもの starts at its first frame
  g = look(stored, at(29, 5), 1);
  byClass(g.root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
  byClass(g.root, "kg-card")[0].click();
  touch(g.root, null);
  assert.strictEqual(saved(stored).placed[1].t, iso(29));
  assert.strictEqual(frameOf(g, 2), SPROUT);
  assert.strictEqual(frameOf(g, 1), MATURE);                          // the card brought the first one back
});

test("v: 2 goes under its own key: v: 1's save is moved over once and left as it was, for an old copy of the script", () => {
  const old = JSON.stringify({ v: 1, coins: 9, earned: 9, seen: {}, inv: { stump: 1 },
    placed: [{ id: 1, k: "rose_pink", x: 500, y: 600 }], next: 2 });
  const stored = { [OLD_KEY]: old };
  const g = look(stored, at(MON), 1);
  byClass(g.root, "kg-btn").find((n) => n.textContent === "とじる").click();
  assert.strictEqual(stored[OLD_KEY], old);
  assert.deepStrictEqual([saved(stored).v, saved(stored).coins], [2, 10]);
  // the old script goes on paying into its own save; the new one keeps to the v: 2 save
  stored[OLD_KEY] = JSON.stringify(Object.assign(JSON.parse(old), { coins: 30 }));
  review(stored, at(TUE), 1);
  assert.deepStrictEqual([saved(stored).coins, saved(stored).placed.length], [11, 1]);
});

test("a save from a newer script is never written over: no coins, nothing stored", () => {
  const v3 = JSON.stringify({ v: 3, coins: 50, things: [1, 2, 3] });
  const old = JSON.stringify({ v: 1, coins: 9, earned: 9, seen: {}, inv: {}, placed: [], next: 1 });
  const stored = { [KEY]: v3, [OLD_KEY]: old };
  const win = page(stored, { now: at(MON) });
  assert.strictEqual(win.KanpekiGarden.earn("1").gained, false);
  assert.strictEqual(win.KanpekiGarden.save(win.KanpekiGarden.load()), false);
  const g = look(stored, at(TUE), 2);
  assert.strictEqual(byClass(g.root, "kg-purse-n")[0].textContent, "0");
  const note = byClass(g.root, "kg-confirm")[0];
  assert.ok(!note.hidden && note.textContent === "いまは にわを ひらけないよ");
  byClass(g.root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
  byClass(g.root, "kg-btn").find((n) => n.textContent === "とじる").click();
  assert.deepStrictEqual(stored, { [KEY]: v3, [OLD_KEY]: old });
  const chip = look(stored, at(WED), 3).win.document.body.all((n) => n.classList.contains("kg-chip"))[0];
  assert.ok(!chip.all((n) => n.classList.contains("kg-plus")).length, "+1 on the chip");
});

test("a v: 2 save under the old key (from a test build) is moved over too", () => {
  const old = JSON.stringify({ v: 2, coins: 12, earned: 20, seen: {}, inv: {}, next: 2, days: days(MON),
    placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: iso(MON) }] });
  const stored = { [OLD_KEY]: old };
  assert.strictEqual(frameOf(look(stored, at(WED)), 1), YOUNG);                 // Monday grew it, Tuesday didn't
  assert.strictEqual(stored[OLD_KEY], old);
  assert.deepStrictEqual([saved(stored).v, saved(stored).coins, saved(stored).placed[0].t], [2, 12, iso(MON)]);
});

test("a dead plant stays dead when the clock goes back", () => {
  const stored = stored2({ placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: iso(MON) }], next: 2, days: days(MON) });
  assert.strictEqual(frameOf(look(stored, at(SAT)), 1), DEAD);
  assert.strictEqual(saved(stored).placed[0].dead, iso(SAT));
  review(stored, at(WED), 5);                                // clock back to Wednesday, a card answered
  assert.strictEqual(frameOf(look(stored, at(WED, 11)), 1), DEAD);
  assert.strictEqual(frameOf(look(stored, at(SAT, 9), 6), 1), DEAD);
});

test("a card answered with the clock set forward doesn't stop later days from counting", () => {
  const stored = stored2({ days: days(MON), inv: { rose_pink: 1 } });
  review(stored, new Date(2027, 9, 12, 10).getTime(), 5);       // clock a year ahead, then put right
  const g = look(stored, at(TUE), 1);
  byClass(g.root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
  byClass(g.root, "kg-card")[0].click();
  touch(g.root, null);                                           // planted Tuesday, then reviews every day
  for (let d = WED; d <= 24; d++) review(stored, at(d), 1);
  assert.strictEqual(frameOf(look(stored, at(25), 1), 1), MATURE);
  assert.strictEqual(saved(stored).placed[0].dead, undefined);
});

test("a damaged days or t doesn't break the garden", () => {
  for (const bad of [[iso(MON)], "2026-10-12", 7, null]) {
    const stored = stored2({ placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: iso(MON) }], next: 2, days: bad });
    review(stored, at(TUE), 1);
    assert.deepStrictEqual(saved(stored).days, days(TUE), JSON.stringify(bad));
    assert.strictEqual(frameOf(look(stored, at(WED)), 1), YOUNG, JSON.stringify(bad));
  }
  for (const bad of [12345, "Monday", "2026-1-2", {}, [iso(MON)], true]) {
    const stored = stored2({ placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: bad, g: YOUNG },
      { id: 2, k: "stump", x: 900, y: 600, t: bad }], next: 3, days: days(MON) });
    const g = look(stored, at(WED));                          // joins again today, at its stage
    assert.deepStrictEqual([saved(stored).placed[0].t, saved(stored).placed[0].g], [iso(WED), YOUNG], JSON.stringify(bad));
    assert.strictEqual(frameOf(g, 1), YOUNG);
    assert.strictEqual(frameOf(g, 2), 0);
    assert.strictEqual(g.win.KanpekiGarden.life(saved(stored), { k: "rose_pink", t: bad }).g, 0);
  }
});

test("4 missed days between two days with reviews kill a plant, even if the garden wasn't opened then", () => {
  const plant = { id: 1, k: "rose_pink", x: 500, y: 600, t: iso(MON) };
  let stored = stored2({ placed: [plant], next: 2, days: days(MON, SAT, SUN) });         // none Tue–Fri
  assert.strictEqual(frameOf(look(stored, at(19)), 1), DEAD);
  stored = stored2({ placed: [plant], next: 2, days: days(MON, FRI, SAT) });             // none Tue–Thu
  assert.strictEqual(frameOf(look(stored, at(SUN)), 1), MATURE);
});
