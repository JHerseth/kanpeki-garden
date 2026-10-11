// Compost all: from a dead plant's compost question, every dead plant in the garden goes to the compost at once.
// Every check runs on a fake clock (KG_CLOCK). 2026-10-12 is a Monday.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, page, openGarden, openSettings } = require("./harness");

const at = (day, h = 10, m = 0) => new Date(2026, 9, day, h, m).getTime();     // October 2026, local time
const iso = (day) => "2026-10-" + String(day).padStart(2, "0");
const MON = 12;
const [MATURE, DYING, DEAD] = [2, 3, 4];                                         // a 5-frame strip

const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const stored2 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 2, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const saved = (stored) => JSON.parse(stored[KEY]);
const px = (v) => Number(String(v).replace("px", ""));
const EN = { lang: "en" };

// reviews only on Friday the 9th: on Monday a plant from that day is dying (the 10th and 11th missed), one found dead
// on the 6th stays dead, and one planted Sunday the 11th is living (its planting day counts as reviewed)
const DAYS = { [iso(9)]: 1 };
const deadOne = (id, k) => ({ id, k, x: 200 * id, y: 700, t: iso(1), dead: iso(6) });
const dyingOne = (id, k) => ({ id, k, x: 200 * id, y: 700, t: iso(9), g: MATURE });
const livingOne = (id, k) => ({ id, k, x: 200 * id, y: 700, t: iso(11) });
const decoration = (id, k) => ({ id, k, x: 200 * id, y: 700 });
/** Dead: 2 phlox (50 → 12 each) and a pink rose (20 → 5), 29 in all (a quarter of the 120 together would be 30).
 *  Left alone: a dying palm, a living rose and a watering can. */
const MIXED = () => [deadOne(1, "phlox"), dyingOne(2, "palm"), deadOne(3, "phlox"), livingOne(4, "rose_pink"),
  decoration(5, "watering_can"), deadOne(6, "rose_pink")];

/** The garden from a save with `placed` in it, opened on Monday; saves counts the save's writes from then on. */
function garden(placed, opts = {}) {
  const stored = stored2(Object.assign({ coins: 3, earned: 40, placed, next: placed.length + 1, days: DAYS }, opts.save));
  const counted = { saves: 0 };
  const watched = new Proxy(stored, { set(t, k, v) { if (k === KEY) counted.saves++; t[k] = v; return true; } });
  const win = page(watched, { now: at(MON, 12) });
  const root = openGarden(win, undefined, opts.data);
  counted.saves = 0;
  return { win, root, stored, counted };
}
function node(root, id) { return byClass(root, "kg-item").find((d) => d.dataset.id === String(id)); }
/** Which of its item's frames placed item `id` shows. */
function frameOf({ win, root }, id) {
  const d = node(root, id), S = win.KG_SCALE;
  const [x, y] = d.children[0].style.backgroundPosition.split(" ").map((v) => Math.round(-px(v) / S));
  const k = win.KanpekiGarden.load().placed.find((p) => p.id === id).k;
  return win.KanpekiGarden.items[k].frames.findIndex((f) => f.x === x && f.y === y);
}
/** A tap on placed item `id`, or on the empty map. */
function touch(root, id) {
  const d = id == null ? null : node(root, id);
  const target = { closest: (sel) => (sel === ".kg-item" ? d : null) };
  const view = byClass(root, "kg-view")[0];
  ["pointerdown", "pointerup"].forEach((type) =>
    view.on[type].forEach((f) => f({ type, pointerId: 1, clientX: 200, clientY: 150, target })));
}
const hint = (root) => byClass(root, "kg-hint")[0];
const buttons = (root) => hint(root).all((n) => n.tagName === "button");
const button = (root, text) => buttons(root).find((n) => n.textContent === text);
/** The ids of the placed items outlined as selected. */
const outlined = (root) => byClass(root, "kg-sel").map((d) => Number(d.dataset.id)).sort((a, b) => a - b);
const bugs = (root) => byClass(root, "kg-bug");

test("the garden for these tests: 3 dead, 1 dying, 1 living, 1 decoration", () => {
  const g = garden(MIXED());
  assert.deepStrictEqual([1, 2, 3, 4, 6].map((id) => frameOf(g, id)), [DEAD, DYING, DEAD, 0, DEAD]);
});

test("with 2 or more dead plants the compost question has 「ぜんぶ ×n」 next to 「はい」; with 1 it doesn't", () => {
  let g = garden(MIXED());
  touch(g.root, 1);
  assert.strictEqual(hint(g.root).textContent, "たいひにする？ +12はいぜんぶ ×3✕");
  assert.deepStrictEqual(buttons(g.root).map((b) => b.textContent), ["はい", "ぜんぶ ×3", "✕"]);
  g = garden([deadOne(1, "phlox"), deadOne(2, "rose_pink")]);
  touch(g.root, 2);
  assert.strictEqual(hint(g.root).textContent, "たいひにする？ +5はいぜんぶ ×2✕");
  // one dead plant, with a dying one, a living one and a decoration: as it always was
  g = garden([deadOne(1, "phlox"), dyingOne(2, "palm"), livingOne(3, "rose_pink"), decoration(4, "watering_can")]);
  touch(g.root, 1);
  assert.strictEqual(hint(g.root).textContent, "たいひにする？ +12はい✕");
  // and not on a living plant's hint
  g = garden(MIXED());
  touch(g.root, 4);
  assert.ok(!button(g.root, "ぜんぶ ×3"));
});

test("a count past 9 stays a ×n: 12 dead plants", () => {
  const g = garden(Array.from({ length: 12 }, (_, i) => deadOne(i + 1, "rose_pink")));
  touch(g.root, 5);
  button(g.root, "ぜんぶ ×12").click();
  assert.strictEqual(hint(g.root).textContent, "かれた くさばな ×12 を ぜんぶ たいひにする？ +60はい✕");
});

test("the confirm step asks with the summed coins and outlines every dead plant, and nothing else", () => {
  const g = garden(MIXED());
  touch(g.root, 3);
  assert.deepStrictEqual(outlined(g.root), [3]);
  button(g.root, "ぜんぶ ×3").click();
  assert.strictEqual(hint(g.root).textContent, "かれた くさばな ×3 を ぜんぶ たいひにする？ +29はい✕");
  assert.strictEqual(byClass(hint(g.root), "kg-coin").length, 1);
  assert.deepStrictEqual(outlined(g.root), [1, 3, 6]);
  assert.ok(hint(g.root).classList.contains("kg-hint-all"), "the long question may wrap");
  assert.strictEqual(g.counted.saves, 0, "nothing saved yet");
  assert.strictEqual(saved(g.stored).placed.length, 6);
});

test("✕ in the confirm step goes back to the tapped plant's compost question, with only it outlined", () => {
  const g = garden(MIXED());
  touch(g.root, 6);
  button(g.root, "ぜんぶ ×3").click();
  const no = button(g.root, "✕");
  assert.strictEqual(no.attrs["aria-label"], "やめる");
  no.click();
  assert.strictEqual(hint(g.root).textContent, "たいひにする？ +5はいぜんぶ ×3✕");
  assert.deepStrictEqual(outlined(g.root), [6]);
  assert.ok(!hint(g.root).classList.contains("kg-hint-all"));
  assert.strictEqual(saved(g.stored).placed.length, 6);
  // and its 「はい」 still composts only that plant
  button(g.root, "はい").click();
  assert.deepStrictEqual(saved(g.stored).placed.map((p) => p.id), [1, 2, 3, 4, 5]);
  assert.strictEqual(saved(g.stored).coins, 3 + 5);
});

test("tapping the map or another plant in the confirm step leaves it, and the outlines go", () => {
  const g = garden(MIXED());
  touch(g.root, 1);
  button(g.root, "ぜんぶ ×3").click();
  touch(g.root, null);
  assert.ok(hint(g.root).hidden);
  assert.deepStrictEqual(outlined(g.root), []);
  touch(g.root, 1);
  button(g.root, "ぜんぶ ×3").click();
  touch(g.root, 4);                                          // the living rose
  assert.strictEqual(hint(g.root).textContent, "ゆびで うごかせるよOK");
  assert.deepStrictEqual(outlined(g.root), [4]);
  touch(g.root, 3);
  assert.strictEqual(hint(g.root).textContent, "たいひにする？ +12はいぜんぶ ×3✕");
});

test("「はい」 composts every dead plant and nothing else, for the summed coins, in one save; earned stays", () => {
  const g = garden(MIXED());
  touch(g.root, 1);
  button(g.root, "ぜんぶ ×3").click();
  button(g.root, "はい").click();
  const s = saved(g.stored);
  assert.deepStrictEqual(s.placed.map((p) => p.id), [2, 4, 5]);
  assert.strictEqual(s.coins, 3 + 12 + 12 + 5);
  assert.strictEqual(s.earned, 40);
  assert.strictEqual(g.counted.saves, 1);
  assert.deepStrictEqual(byClass(g.root, "kg-item").map((d) => Number(d.dataset.id)), [2, 4, 5]);
  assert.deepStrictEqual(outlined(g.root), []);
  assert.ok(hint(g.root).hidden);
  assert.strictEqual(byClass(g.root, "kg-purse-n")[0].textContent, "32");
  // the dying palm is still dying, and the next opening has the 3 left
  const again = garden([], { save: s });
  assert.strictEqual(frameOf(again, 2), DYING);
  assert.strictEqual(byClass(again.root, "kg-item").length, 3);
});

test("the shop and the butterflies are redrawn: the bag's count stays, 5 living flowers keep their butterfly", () => {
  const living = Array.from({ length: 5 }, (_, i) => livingOne(i + 1, "rose_pink"));
  const dead = [deadOne(6, "rose_pink"), deadOne(7, "phlox")];
  const g = garden(living.concat(dead), { save: { inv: { watering_can: 2 } } });
  assert.strictEqual(bugs(g.root).length, 1);
  touch(g.root, 7);
  button(g.root, "ぜんぶ ×2").click();
  button(g.root, "はい").click();
  assert.strictEqual(bugs(g.root).length, 1);
  const bag = byClass(g.root, "kg-tab").find((n) => /もちもの/.test(n.textContent));
  assert.strictEqual(byClass(bag, "kg-badge")[0].textContent, "2");
  assert.deepStrictEqual(saved(g.stored).placed.map((p) => p.id), [1, 2, 3, 4, 5]);
});

test("compost all works on vacation, which stays on", () => {
  const g = garden(MIXED(), { save: { vac: iso(10) } });
  assert.ok(!byClass(g.root, "kg-vac-badge")[0].hidden, "on vacation");
  touch(g.root, 1);
  button(g.root, "ぜんぶ ×3").click();
  button(g.root, "はい").click();
  const s = saved(g.stored);
  assert.deepStrictEqual(s.placed.map((p) => p.id), [2, 4, 5]);
  assert.strictEqual(s.coins, 3 + 29);
  assert.strictEqual(s.vac, iso(10));
  assert.strictEqual(g.counted.saves, 1);
});

test("moving the test day ends the confirm step", () => {
  const g = garden(MIXED(), { data: { dev: "1" } });
  touch(g.root, 1);
  button(g.root, "ぜんぶ ×3").click();
  const panel = openSettings(g.root);
  byClass(panel, "kg-dev").find((n) => n.textContent === "+1日").click();
  assert.deepStrictEqual(outlined(g.root), [1]);
  assert.strictEqual(hint(g.root).textContent, "たいひにする？ +12はいぜんぶ ×3✕");
});

test("data-lang=\"en\": both steps are in English", () => {
  const g = garden(MIXED(), { data: EN });
  touch(g.root, 1);
  assert.strictEqual(hint(g.root).textContent, "Compost it? +12YesAll ×3✕");
  button(g.root, "All ×3").click();
  assert.strictEqual(hint(g.root).textContent, "Compost all 3 dead plants? +29Yes✕");
  assert.strictEqual(button(g.root, "✕").attrs["aria-label"], "Cancel");
  button(g.root, "Yes").click();
  assert.deepStrictEqual(saved(g.stored).placed.map((p) => p.id), [2, 4, 5]);
});
