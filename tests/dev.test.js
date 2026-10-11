// The test controls, only on a slot with data-dev="1" (put it only in a test profile's templates, never in the
// ones the player studies with): 「+100」 and the test day, 「−1日」「+1日」.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, page, openGarden, openSettings } = require("./harness");

const NOW = new Date(2026, 9, 12, 10).getTime();
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const stored2 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 2, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const saved = (stored) => JSON.parse(stored[KEY]);
const dev = (root) => byClass(root, "kg-dev").filter((b) => b.textContent === "+100");
const purse = (root) => byClass(root, "kg-purse-n")[0].textContent;
/** A node and everything under it as plain data, to compare two gardens. */
function shape(n) {
  return { tag: n.tagName, cls: n.className, text: n.text, attrs: n.attrs, hidden: n.hidden, data: n.dataset,
    disabled: n.disabled, style: n.style, kids: n.children.map(shape) };
}

test("with data-dev=\"1\": +100 in the settings' test section adds 100 coins, saved, earned unchanged", () => {
  const stored = stored2({ coins: 37, earned: 120 });
  const win = page(stored, { now: NOW });
  const root = openGarden(win, undefined, { dev: "1" });
  const panel = openSettings(root);
  const b = dev(root);
  assert.strictEqual(b.length, 1);
  const set = byClass(root, "kg-devset")[0];
  assert.strictEqual(b[0].parent, set);
  assert.strictEqual(set.parent, panel);
  assert.strictEqual(panel.children[panel.children.length - 1], set);          // last, under vacation
  assert.deepStrictEqual(set.children.map((n) => n.textContent), ["テスト", "+100", "+150", "−1日", "", "+1日"]);
  assert.strictEqual(byClass(root, "kg-devrow").length, 0);
  assert.strictEqual(b[0].textContent, "+100");
  assert.ok(!b[0].disabled);
  byClass(root, "kg-tab").find((t) => t.textContent === "かざり").click();
  const bench = () => byClass(root, "kg-card").find((c) => c.textContent.includes("ベンチ"));
  assert.ok(bench().classList.contains("kg-poor"));                // 100 coins; the player has 37
  b[0].click();
  assert.ok(!bench().classList.contains("kg-poor"));               // the shop sees the coins at once
  assert.strictEqual(purse(root), "137");
  assert.strictEqual(saved(stored).coins, 137);
  assert.strictEqual(saved(stored).earned, 120);
  b[0].click();
  assert.strictEqual(saved(stored).coins, 237);
  assert.strictEqual(saved(stored).earned, 120);
  // and the chip on the card after closing
  byClass(root, "kg-close")[0].click();
  assert.strictEqual(byClass(win.document.body, "kg-chip-n")[0].textContent, "237");
});

test("+100 works the same with vacation on, and a card review still adds to earned", () => {
  const stored = stored2({ coins: 5, earned: 5, vac: "2026-10-10" });
  let root = openGarden(page(stored, { now: NOW }), undefined, { dev: "1" });
  dev(root)[0].click();
  assert.deepStrictEqual([saved(stored).coins, saved(stored).earned, saved(stored).vac], [105, 5, "2026-10-10"]);
  const s = stored2({ coins: 0, earned: 0 });
  root = openGarden(page(s, { now: NOW }), 7, { dev: "1" });
  dev(root)[0].click();
  assert.deepStrictEqual([saved(s).coins, saved(s).earned], [101, 1]);
});

test("without the marker there is no test section and the garden is otherwise the same", () => {
  const base = { coins: 250, earned: 300, inv: { bench: 1 }, next: 2, days: { "2026-10-11": 1 },
    placed: [{ id: 1, k: "rose_pink", x: 600, y: 700, t: "2026-10-10", g: 1 }] };
  const a = stored2(base), b = stored2(base), c = stored2(base);
  const plain = openGarden(page(a, { now: NOW }), 9);
  const other = openGarden(page(c, { now: NOW }), 9, { dev: "0" });
  const marked = openGarden(page(b, { now: NOW }), 9, { dev: "1" });
  assert.strictEqual(byClass(plain, "kg-dev").length, 0);
  assert.strictEqual(byClass(other, "kg-dev").length, 0);
  assert.strictEqual(byClass(plain, "kg-devset").length, 0);
  assert.strictEqual(a[KEY], b[KEY]);
  // the marked garden, less its test section, is the plain one
  byClass(marked, "kg-devset")[0].remove();
  assert.deepStrictEqual(shape(marked), shape(plain));
  assert.deepStrictEqual(shape(other), shape(plain));
});

test("a locked save (from a newer script): the button is disabled and does nothing", () => {
  const stored = { [KEY]: JSON.stringify({ v: 3, coins: 40, earned: 40 }) };
  const before = stored[KEY];
  const root = openGarden(page(stored, { now: NOW }), undefined, { dev: "1" });
  const b = dev(root)[0];
  assert.ok(b.disabled);
  b.click();                  // the fake DOM fires it anyway
  assert.strictEqual(stored[KEY], before);
  assert.strictEqual(purse(root), "0");
});

// ---- the test day ----
const DAY_KEY = "kanpekikun-garden-dev-day";
const btn = (root, text) => byClass(root, "kg-dev").find((b) => b.textContent === text && !b.classList.contains("kg-dev-day"));
const label = (root) => byClass(root, "kg-dev-day")[0];
const px = (v) => Number(String(v).replace("px", ""));
/** Which of its item's frames placed item `id` shows. */
function frameOf(win, root, id, k) {
  const d = byClass(root, "kg-item").find((n) => n.dataset.id === String(id)), S = win.KG_SCALE;
  const [x, y] = d.children[0].style.backgroundPosition.split(" ").map((v) => Math.round(-px(v) / S));
  return win.KanpekiGarden.items[k].frames.findIndex((f) => f.x === x && f.y === y);
}
// a rose placed on the 10th, reviewed on the 11th: young (1 of 0..2) on the 12th; frames 3 and 4 are dying and dead
const rose = () => stored2({ next: 2, days: { "2026-10-11": 1 },
  placed: [{ id: 1, k: "rose_pink", x: 600, y: 700, t: "2026-10-10", g: 0 }] });

test("+1日 moves the day on: a plant reviewed on the real day grows, and a card answered today pays again", () => {
  const stored = rose();
  let win = page(stored, { now: NOW });
  let root = openGarden(win, 7, { dev: "1" });                      // the 12th: card 7 pays, the 12th has reviews
  assert.strictEqual(frameOf(win, root, 1, "rose_pink"), 1);
  assert.ok(label(root).hidden);
  btn(root, "+1日").click();
  assert.strictEqual(frameOf(win, root, 1, "rose_pink"), 2);       // the 12th is a finished day with reviews
  assert.strictEqual(label(root).textContent, "きょう+1日 ✕");
  assert.ok(!label(root).hidden);
  assert.strictEqual(stored[DAY_KEY], "1");
  assert.strictEqual(label(root).attrs["aria-label"], "テスト：きょうを +1日 ずらしている（タップで もどす）");
  btn(root, "+1日").click();
  btn(root, "+1日").click();                                        // the 15th: the 13th and 14th missed
  assert.strictEqual(frameOf(win, root, 1, "rose_pink"), 3);
  assert.strictEqual(label(root).textContent, "きょう+3日 ✕");
  btn(root, "−1日").click();
  btn(root, "−1日").click();
  assert.strictEqual(frameOf(win, root, 1, "rose_pink"), 2);
  byClass(root, "kg-close")[0].click();
  assert.deepStrictEqual([saved(stored).coins, saved(stored).seen["7"]], [1, "2026-10-12"]);
  // the next card, still on the 13th: card 7 pays again, and the 13th has reviews
  win = page(stored, { now: NOW });
  root = openGarden(win, 7, { dev: "1" });
  assert.strictEqual(byClass(win.document.body, "kg-plus").length, 1);
  assert.deepStrictEqual([saved(stored).coins, saved(stored).earned, saved(stored).seen["7"]], [2, 2, "2026-10-13"]);
  assert.deepStrictEqual(saved(stored).days, { "2026-10-11": 1, "2026-10-12": 1, "2026-10-13": 1 });
  assert.strictEqual(purse(root), "2");
});

test("−1日 moves the day back and the label shows the offset; a tap on the label goes back to the real day", () => {
  const stored = rose();
  const win = page(stored, { now: NOW });
  const root = openGarden(win, undefined, { dev: "1" });
  btn(root, "−1日").click();
  assert.strictEqual(label(root).textContent, "きょう−1日 ✕");
  assert.strictEqual(frameOf(win, root, 1, "rose_pink"), 0);       // the 11th: not finished yet
  btn(root, "−1日").click();
  assert.strictEqual(label(root).textContent, "きょう−2日 ✕");
  assert.strictEqual(stored[DAY_KEY], "-2");
  label(root).click();
  assert.ok(label(root).hidden);
  assert.strictEqual(stored[DAY_KEY], "0");
  assert.strictEqual(frameOf(win, root, 1, "rose_pink"), 1);
  // on the real day again: a card pays on the 12th
  openGarden(page(stored, { now: NOW }), 7, { dev: "1" });
  assert.strictEqual(saved(stored).seen["7"], "2026-10-12");
});

test("the offset stays on closing and on later cards, until it's changed back", () => {
  const stored = rose();
  let root = openGarden(page(stored, { now: NOW }), 7, { dev: "1" });
  btn(root, "+1日").click();
  btn(root, "+1日").click();
  byClass(root, "kg-close")[0].click();
  root = openGarden(page(stored, { now: NOW }), 8, { dev: "1" });
  assert.strictEqual(label(root).textContent, "きょう+2日 ✕");
  assert.strictEqual(saved(stored).seen["8"], "2026-10-14");
  root = openGarden(page(stored, { now: NOW + 3600e3 }), 9, { dev: "1" });
  assert.strictEqual(saved(stored).seen["9"], "2026-10-14");
  assert.strictEqual(stored[DAY_KEY], "2");
  // ±1 starts from the stored offset, not one this page read earlier
  stored[DAY_KEY] = "5";
  btn(root, "+1日").click();
  assert.strictEqual(stored[DAY_KEY], "6");
  assert.strictEqual(label(root).textContent, "きょう+6日 ✕");
});

test("without the marker: no day buttons, and a stored offset is never read", () => {
  const base = rose(), reads = [];
  base[DAY_KEY] = "3";
  const stored = new Proxy(base, { has(t, k) { reads.push(k); return k in t; } });
  const win = page(stored, { now: NOW });
  const root = openGarden(win, 7);
  assert.strictEqual(byClass(root, "kg-dev").length, 0);
  assert.strictEqual(byClass(root, "kg-devset").length, 0);
  assert.ok(!reads.includes(DAY_KEY));
  assert.deepStrictEqual([saved(base).seen["7"], Object.keys(saved(base).days)], ["2026-10-12", ["2026-10-11", "2026-10-12"]]);
  assert.strictEqual(frameOf(win, root, 1, "rose_pink"), 1);       // as on the real day; +3 would make it dying
  assert.strictEqual(base[DAY_KEY], "3");
  // nor after a marked slot on the same page used it
  const w2 = page(stored, { now: NOW });
  openGarden(w2, 8, { dev: "1" });
  assert.strictEqual(saved(base).seen["8"], "2026-10-15");
  reads.length = 0;
  openGarden(w2, 9);
  assert.ok(!reads.includes(DAY_KEY));
  assert.strictEqual(saved(base).seen["9"], "2026-10-12");
});

test("a locked save: the day buttons are disabled and write nothing", () => {
  const stored = { [KEY]: JSON.stringify({ v: 3, coins: 40, earned: 40 }) };
  const before = stored[KEY];
  const root = openGarden(page(stored, { now: NOW }), 7, { dev: "1" });
  for (const t of ["−1日", "+1日"]) {
    assert.ok(btn(root, t).disabled, t);
    btn(root, t).click();     // the fake DOM fires it anyway
  }
  assert.ok(label(root).disabled);
  label(root).click();
  assert.ok(label(root).hidden);
  assert.deepStrictEqual(Object.keys(stored), [KEY]);
  assert.strictEqual(stored[KEY], before);
});
