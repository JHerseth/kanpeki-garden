// Damaged saves. The save lives only in localStorage on the player's phone, so one written over is a garden gone.
// A damaged field the garden can mend (placed, inv, seen, days) is mended and the rest of the save kept; a save it
// can't read at all (not JSON, not an object, or anything else that makes load() throw) is locked: nothing is
// written, no coin is paid, and the garden shows the locked note, as for a newer script's save. Only no save at all
// starts fresh.
// Every check runs on a fake clock (KG_CLOCK). 2026-10-12 is a Monday.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, OLD_KEY, page, openGarden } = require("./harness");

const NOW = new Date(2026, 9, 12, 10).getTime(), TODAY = "2026-10-12", YESTERDAY = "2026-10-11";
const LOCKED = "いまは にわを ひらけないよ";
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const confirm = (root) => byClass(root, "kg-confirm")[0];
const ids = (root) => byClass(root, "kg-item").map((d) => Number(d.dataset.id)).sort((a, b) => a - b);
const purse = (root) => byClass(root, "kg-purse-n")[0].textContent;
const tabNamed = (root, t) => byClass(root, "kg-tab").find((n) => n.textContent.startsWith(t));
const card = (root, text) => byClass(root, "kg-card").find((c) => byClass(c, "kg-name")[0].textContent === text);
const saved = (stored) => JSON.parse(stored[KEY]);
const plain = (v) => JSON.parse(JSON.stringify(v));

const rose = (id) => ({ id, k: "rose_pink", x: 300 + 100 * id, y: 700, t: YESTERDAY });
const bench = (id) => ({ id, k: "bench", x: 300 + 100 * id, y: 900 });
/** A sound v: 3 save, as a plain object, with `over` laid over it (a field set to undefined is left out). */
const sound = (over) => Object.assign({ v: 3, coins: 500, earned: 900, seen: { 7: YESTERDAY }, inv: { bench: 2 },
  placed: [rose(1), bench(2)], next: 3, days: { [YESTERDAY]: 1 } }, over);
/** localStorage holding `raw` under the save's key, and the number of writes to it from then on (n()). */
function watched(raw) {
  const stored = raw == null ? {} : { [KEY]: raw };
  let writes = 0;
  return { stored: new Proxy(stored, { set(t, k, v) { writes++; t[k] = v; return true; } }), n: () => writes };
}
/** Everything the player can do that writes the save, on a page over `stored`: answer card 5 (a coin, if it pays),
 *  open the garden, buy a bench, close the garden. Returns the garden's root, and its note as it opened (note). */
function play(stored, opts) {
  const root = openGarden(page(stored, Object.assign({ now: NOW }, opts)), 5);
  root.note = confirm(root).hidden ? "" : confirm(root).textContent;
  tabNamed(root, "かざり").click();
  const c = card(root, "ベンチ");
  if (c) c.click();
  byClass(confirm(root), "kg-btn-go").forEach((b) => b.click());
  byClass(root, "kg-close")[0].click();
  return root;
}
/** Locked: play() changes nothing in `stored`, and the garden says it can't open, with no coins in its purse. */
function assertLocked(stored, opts, why) {
  const before = JSON.stringify(stored);
  const root = play(stored, opts);
  assert.strictEqual(JSON.stringify(stored), before, why + ": the stored save changed");
  assert.strictEqual(root.note, LOCKED, why + ": no locked note");
  assert.strictEqual(purse(root), "0", why);
  assert.deepStrictEqual(ids(root), [], why);
}

// ---- mended: the good part is kept ------------------------------------------------------------------

test("entries in placed that aren't objects are dropped when loading, the rest kept and written once", () => {
  for (const junk of [null, 5, "rose_pink", true, [], [1, 2]]) {
    const w = watched(JSON.stringify(sound({ placed: [junk, rose(1), junk, bench(2), junk] })));
    const s = plain(page(w.stored, { now: NOW }).KanpekiGarden.load());
    assert.deepStrictEqual(s.placed, [rose(1), bench(2)], JSON.stringify(junk));
    assert.deepStrictEqual(saved(w.stored), s, JSON.stringify(junk) + ": saved as loaded");
    assert.strictEqual(w.n(), 1, JSON.stringify(junk));
    assert.deepStrictEqual([s.coins, s.earned, s.inv, s.next], [500, 900, { bench: 2 }, 3]);
  }
});

test("a null in placed (the issue's case): the garden opens with the other items, pays and buys as usual", () => {
  const stored = { [KEY]: JSON.stringify(sound({ placed: [rose(1), null, bench(2)] })) };
  const root = play(stored);
  assert.strictEqual(root.note, "");
  assert.deepStrictEqual(ids(root), [1, 2]);
  const s = saved(stored);
  assert.deepStrictEqual(s.placed.map((p) => p.id), [1, 2]);
  assert.deepStrictEqual([s.coins, s.earned, s.inv.bench, s.seen[5]], [500 + 1 - 100, 901, 3, TODAY]);
});

test("a missing or non-array placed becomes [], and the rest of the save is kept", () => {
  for (const placed of [undefined, null, "x", 3, {}, { 0: rose(1) }]) {
    const stored = { [KEY]: JSON.stringify(sound({ placed })) };
    const s = plain(page(stored, { now: NOW }).KanpekiGarden.load());
    assert.deepStrictEqual(s.placed, [], JSON.stringify(placed));
    assert.deepStrictEqual(saved(stored), s, JSON.stringify(placed) + ": saved as loaded");
    assert.deepStrictEqual([s.coins, s.earned, s.inv, s.seen, s.next], [500, 900, { bench: 2 }, { 7: YESTERDAY }, 3]);
    // and the garden opens, pays and buys
    const root = play(stored);
    assert.deepStrictEqual(ids(root), [], JSON.stringify(placed));
    assert.deepStrictEqual([saved(stored).coins, saved(stored).inv.bench], [401, 3], JSON.stringify(placed));
  }
});

test("a missing or non-object inv or seen becomes {}: buying and paying work, the rest is kept", () => {
  for (const bad of [undefined, null, "x", 3, [], ["bench"]]) {
    const why = JSON.stringify(bad);
    let stored = { [KEY]: JSON.stringify(sound({ inv: bad })) };
    let s = plain(page(stored, { now: NOW }).KanpekiGarden.load());
    assert.deepStrictEqual([s.inv, saved(stored).inv], [{}, {}], why);
    assert.deepStrictEqual(s.placed, [rose(1), bench(2)], why);
    play(stored);                                     // a bench bought into the mended inv, which an array would lose
    assert.deepStrictEqual([saved(stored).inv, saved(stored).coins], [{ bench: 1 }, 401], why);

    stored = { [KEY]: JSON.stringify(sound({ seen: bad })) };
    s = plain(page(stored, { now: NOW }).KanpekiGarden.load());
    assert.deepStrictEqual([s.seen, saved(stored).seen], [{}, {}], why);
    assert.deepStrictEqual(s.placed, [rose(1), bench(2)], why);
    const win = page(stored, { now: NOW });
    assert.strictEqual(win.KanpekiGarden.earn("1700000000001").gained, true, why);   // a real card id, past any array's length
    assert.strictEqual(page(stored, { now: NOW }).KanpekiGarden.earn("1700000000001").gained, false, why + ": paid twice");
    assert.deepStrictEqual([saved(stored).coins, saved(stored).seen], [501, { 1700000000001: TODAY }], why);
  }
});

test("a non-object days becomes {} (as before), and the rest is kept", () => {
  for (const days of [undefined, null, "x", 3, []]) {
    const stored = { [KEY]: JSON.stringify(sound({ days })) };
    const s = plain(page(stored, { now: NOW }).KanpekiGarden.load());
    assert.deepStrictEqual([s.days, saved(stored).days], [{}, {}], JSON.stringify(days));
    assert.strictEqual(s.placed.length, 2);
  }
});

test("a sound save loads with no write, and so does each one mended once", () => {
  const w = watched(JSON.stringify(sound()));
  const s = page(w.stored, { now: NOW }).KanpekiGarden.load();
  assert.strictEqual(w.n(), 0);
  assert.deepStrictEqual(plain(s), sound());
  // the trap counts: a damaged one is written once, and then it's sound
  const bad = watched(JSON.stringify(sound({ placed: [null, rose(1)], inv: null, seen: [] })));
  page(bad.stored, { now: NOW }).KanpekiGarden.load();
  assert.strictEqual(bad.n(), 1);
  page(bad.stored, { now: NOW }).KanpekiGarden.load();
  assert.strictEqual(bad.n(), 1);
});

// ---- locked: nothing written ------------------------------------------------------------------------

test("a save that isn't JSON is locked: nothing is paid, bought or written, and the garden says it can't open", () => {
  for (const raw of ["{not json", "", "{\"v\":3,\"coins\":500,", "undefined"]) {
    assertLocked({ [KEY]: raw }, {}, JSON.stringify(raw));
  }
});

test("a save that is JSON but not an object is locked", () => {
  for (const raw of ["null", "5", "\"x\"", "true", "[]", "[{\"v\":3}]"]) {
    assertLocked({ [KEY]: raw }, {}, raw);
  }
});

test("a save whose tidying throws, for any reason, is locked rather than started fresh", () => {
  // a fault in the tidy steps, standing for any damage they don't foresee
  for (const step of ["tidyMaps", "refundRemoved", "enrol", "markDead"]) {
    const src = (code) => code.replace("function " + step + "(s) {", "function " + step + "(s) { throw new Error('damaged');");
    const stored = { [KEY]: JSON.stringify(sound()) };
    assert.ok(page(stored, { now: NOW, src }).KanpekiGarden.load().locked, step);
    assertLocked(stored, { src }, step);
    // the save is still there for a script that can read it
    assert.deepStrictEqual(plain(page(stored, { now: NOW }).KanpekiGarden.load()), sound(), step);
  }
  // one it doesn't foresee today: a damaged refund note when an item is refunded
  const stored = { [KEY]: JSON.stringify(sound({ refunded: 5, inv: { tomato_ripe: 1 } })) };
  assertLocked(stored, {}, "refunded: 5");
});

test("storage that can't be read locks the garden, and nothing is written", () => {
  const stored = {};
  let writes = 0;
  const edit = (win) => {
    win.localStorage.getItem = () => { throw new Error("blocked"); };
    win.localStorage.setItem = () => { writes++; };
  };
  const root = play(stored, { edit });
  assert.strictEqual(root.note, LOCKED);
  assert.strictEqual(writes, 0);
});

test("a v: 1 save under the old key that isn't JSON is locked: nothing is written under either key", () => {
  const stored = { [OLD_KEY]: "{\"v\":1,\"coins\":" };
  const before = JSON.stringify(stored);
  const root = play(stored);
  assert.strictEqual(JSON.stringify(stored), before);
  assert.strictEqual(root.note, LOCKED);
});

test("a v: 1 save under the old key with a null in placed moves over without it", () => {
  const stored = { [OLD_KEY]: JSON.stringify({ v: 1, coins: 7, earned: 7, seen: {}, inv: {},
    placed: [null, { id: 1, k: "bench", x: 500, y: 700 }], next: 2 }) };
  const s = plain(page(stored, { now: NOW }).KanpekiGarden.load());
  assert.deepStrictEqual([s.v, s.coins, s.placed.map((p) => p.id)], [3, 7, [1]]);
  assert.deepStrictEqual(saved(stored), s);
});

// ---- no save: fresh ---------------------------------------------------------------------------------

test("no save at all starts fresh, as before: the garden opens, pays and is written", () => {
  const w = watched(null);
  const s = page(w.stored, { now: NOW }).KanpekiGarden.load();
  assert.ok(!s.locked);
  assert.strictEqual(w.n(), 0);                     // loading alone writes nothing
  const root = openGarden(page(w.stored, { now: NOW }), 5);
  assert.ok(confirm(root).hidden);
  assert.strictEqual(purse(root), "1");
  assert.deepStrictEqual([saved(w.stored).v, saved(w.stored).coins, saved(w.stored).placed], [3, 1, []]);
});
