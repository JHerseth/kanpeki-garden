// Decorations from their own picture: the bench is one frame, sold in かざり, about 180 px wide,
// and is bought, placed, moved and put away like any decoration.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, page, openGarden } = require("./harness");

const plain = (v) => JSON.parse(JSON.stringify(v));      // the page's arrays come from another realm
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const byText = (root, c, t) => byClass(root, c).find((n) => n.textContent.trim() === t);
const card = (root, name) => byClass(root, "kg-card").find((c) => byClass(c, "kg-name")[0].textContent === name);
const stored2 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 2, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const saved = (stored) => JSON.parse(stored[KEY]);

test("the bench is a sold かざり item at 100, one frame about 180 x 105 garden px, anchored at its bottom centre", () => {
  const win = page({});
  const e = win.KG_CATALOG.find((x) => x[0] === "bench");
  assert.ok(e, "no bench in KG_CATALOG");
  assert.deepStrictEqual(plain(e.slice(1, 6)), ["ベンチ", "Bench", "かざり", 100, true]);
  assert.strictEqual(e[6].length, 1);
  const [, , , w, h, ax, ay] = e[6][0], S = win.KG_SCALE;
  assert.ok(Math.abs(w * S - 180) <= 4, "width " + w * S);
  assert.ok(Math.abs(h * S - 105) <= 8, "height " + h * S);
  assert.ok(Math.abs(ax - w / 2) <= 2 && ay <= h && ay > h - 4, "anchor " + [ax, ay]);
});

test("the bench shows in the かざり tab at 100", () => {
  const root = openGarden(page(stored2({ coins: 1000 })));
  byText(root, "kg-tab", "かざり").click();
  const c = card(root, "ベンチ");
  assert.ok(c, "no bench card");
  assert.strictEqual(byClass(c, "kg-price")[0].textContent.trim(), "100");
});

test("the bench: buy, place, drag, しまう, place again; drawn in front of what stands behind it", () => {
  const stored = stored2({ coins: 1000, placed: [{ id: 1, k: "gnome", x: 1000, y: 600 }], next: 2 });
  const win = page(stored);
  const root = openGarden(win);
  const view = byClass(root, "kg-view")[0];
  const S = win.KG_SCALE, [, , , w, h, ax, ay] = win.KG_CATALOG.find((e) => e[0] === "bench")[6][0];
  // the fake view is 400 x 300: the 2000 x 1116 map fits at 0.2, centred 38.4 px down
  const toClient = (x, y) => ({ clientX: x * 0.2, clientY: y * 0.2 + 38.4 });
  const ev = (type, c, target) => view.on[type].forEach((f) => f(Object.assign({ type, pointerId: 1, target }, c)));
  const nothing = { closest: () => null };
  const tap = (x, y) => { const c = toClient(x, y); ev("pointerdown", c, nothing); ev("pointerup", c, nothing); };

  // buy
  byText(root, "kg-tab", "かざり").click();
  card(root, "ベンチ").click();
  const confirm = byClass(root, "kg-confirm")[0];
  assert.ok(!confirm.hidden);
  byClass(confirm, "kg-btn-go")[0].click();
  assert.strictEqual(saved(stored).coins, 900);
  assert.deepStrictEqual(saved(stored).inv, { bench: 1 });

  // place: the tap is the middle of the picture; a decoration stays outside the life cycle (no t)
  tap(500, 700);
  let st = saved(stored);
  assert.deepStrictEqual(st.inv, {});
  const p = st.placed.find((q) => q.k === "bench");
  assert.ok(p, "not placed");
  assert.strictEqual(p.y, Math.round(700 + (ay - h / 2) * S));
  assert.ok(!("t" in p), "a decoration in the life cycle");
  const node = byClass(root, "kg-item").find((n) => n.dataset.id === String(p.id));
  assert.ok(node.classList.contains("kg-sel"));
  assert.strictEqual(parseFloat(node.children[0].style.width), w * S);

  // drag it 200 right and 100 down: now in front of the gnome (y 600)
  const onBench = { closest: (sel) => (sel === ".kg-item" ? node : null) };
  const c0 = toClient(500, 700), c1 = toClient(700, 800);
  ev("pointerdown", c0, onBench); ev("pointermove", c1, onBench); ev("pointerup", c1, onBench);
  const p2 = saved(stored).placed.find((q) => q.k === "bench");
  assert.deepStrictEqual([p2.x - p.x, p2.y - p.y], [200, 100]);
  const gnome = byClass(root, "kg-item").find((n) => n.dataset.id === "1");
  assert.ok(Number(node.style.zIndex) > Number(gnome.style.zIndex));
  // dragged past the corner, it stays on the map
  const off = { clientX: -500, clientY: -500 };
  ev("pointerdown", c1, onBench); ev("pointermove", off, onBench); ev("pointerup", off, onBench);
  const pc = saved(stored).placed.find((q) => q.k === "bench");
  assert.ok(pc.x - ax * S >= -0.5 && pc.y - ay * S >= -0.5, JSON.stringify(pc));
  assert.ok(parseFloat(node.style.left) >= -0.5 && parseFloat(node.style.top) >= -0.5);

  // しまう: back in もちもの
  const hint = byClass(root, "kg-hint")[0];
  assert.ok(!hint.hidden);
  byText(hint, "kg-btn", "しまう").click();
  st = saved(stored);
  assert.deepStrictEqual(st.inv, { bench: 1 });
  assert.ok(!st.placed.some((q) => q.k === "bench"));
  assert.ok(!node.isConnected);
  assert.strictEqual(byClass(root, "kg-item").length, 1);

  // and placed again from もちもの
  byClass(root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
  card(root, "ベンチ").click();
  tap(1500, 900);
  st = saved(stored);
  assert.deepStrictEqual(st.inv, {});
  const p3 = st.placed.find((q) => q.k === "bench");
  assert.ok(p3 && p3.id !== p.id);
  assert.strictEqual(st.coins, 900);
  assert.strictEqual(byClass(root, "kg-item").length, 2);

  // still there when the garden opens again
  assert.strictEqual(byClass(openGarden(page(stored)), "kg-item").length, 2);
});
