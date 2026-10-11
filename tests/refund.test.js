// Shop cleanup: items in KG_REMOVED are not sold, are refunded once, and the garden tells the player once.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, OLD_KEY, page, openGarden } = require("./harness");
const note = (root) => root.all((n) => n.classList.contains("kg-confirm") && !n.hidden && /なくなったよ/.test(n.textContent))[0];

function save(over) {
  return { [OLD_KEY]: JSON.stringify(Object.assign({ v: 1, coins: 7, earned: 40, seen: {}, inv: {}, placed: [], next: 1 }, over)) };
}

test("removed items are in no shop tab", () => {
  const win = page({});
  const removed = Object.keys(win.KG_REMOVED);
  assert.strictEqual(removed.length, 11);
  for (const k of removed) {
    assert.ok(!win.KG_CATALOG.some((e) => e[0] === k), k + " still in KG_CATALOG");
    assert.ok(!(k in win.KanpekiGarden.items), k + " still an item");
  }
  // and the shop grid never draws one, in any tab
  const root = openGarden(win);
  const names = removed.map((k) => win.KG_REMOVED[k][0]);
  for (const tab of root.all((n) => n.classList.contains("kg-tab"))) {
    tab.click();
    const shown = root.all((n) => n.classList.contains("kg-name")).map((n) => n.textContent);
    assert.ok(shown.length || /もちもの/.test(tab.textContent), "empty tab " + tab.textContent);
    for (const nm of names) assert.ok(!shown.includes(nm), nm + " shown in " + tab.textContent);
  }
});

test("owned removed items are refunded at full price and taken away, once", () => {
  const stored = save({
    coins: 7,
    inv: { tomato_ripe: 2, seed_tray: 1, rose_pink: 3 },
    placed: [
      { id: 1, k: "carrot_bed", x: 100, y: 200 },
      { id: 2, k: "rose_pink", x: 300, y: 400 },
      { id: 3, k: "tomato_ripe", x: 500, y: 600 },
    ],
    next: 4,
  });
  const win = page(stored);
  const s = win.KanpekiGarden.load();
  const R = win.KG_REMOVED;
  assert.strictEqual(s.coins, 7 + 3 * R.tomato_ripe[1] + R.seed_tray[1] + R.carrot_bed[1]);
  assert.strictEqual(s.earned, 40);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.inv)), { rose_pink: 3 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s.placed.map((p) => p.k))), ["rose_pink"]);
  assert.strictEqual(s.v, 2);                                // and moved on to v: 2 (the life cycle's save)
  // saved, and loading again pays nothing more
  const again = page(stored).KanpekiGarden.load();
  assert.strictEqual(again.coins, s.coins);
});

test("the note shows on the first open after the refund, not the next", () => {
  const stored = save({ coins: 0, inv: { tomato_ripe: 2 }, placed: [{ id: 1, k: "seed_tray", x: 100, y: 200 }], next: 2 });
  const first = note(openGarden(page(stored)));
  assert.ok(first, "no note on first open");
  assert.match(first.textContent, /^なえのトレー、まっかなトマト×2 は おみせから なくなったよ。/);
  assert.match(first.textContent, /\+250/);
  assert.strictEqual(JSON.parse(stored[KEY]).coins, 250);
  assert.ok(!note(openGarden(page(stored))), "note shown again");
  assert.strictEqual(JSON.parse(stored[KEY]).coins, 250);
});

test("a damaged save is not reset by the refund", () => {
  const stored = save({ inv: null, placed: { k: "tomato_ripe" } });
  const s = page(stored).KanpekiGarden.load();
  assert.strictEqual(s.coins, 7);
  assert.strictEqual(s.earned, 40);
});

test("a save without removed items shows no note", () => {
  const stored = save({ inv: { rose_pink: 1 }, placed: [{ id: 1, k: "rose_pink", x: 100, y: 200 }], next: 2 });
  const before = stored[OLD_KEY];
  assert.ok(!note(openGarden(page(stored))));
  assert.strictEqual(JSON.parse(stored[KEY]).coins, JSON.parse(before).coins);
  assert.ok(!note(openGarden(page({}))), "note on a fresh garden");
});
