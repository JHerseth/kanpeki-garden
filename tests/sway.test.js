// Sway: flowers, vegetables, shrubs and trees sway by their shop tab, steady per plant, in a breeze that
// runs across the map; pots, hanging plants and decorations stay still, as do selected and dead plants.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, page, openGarden, openSettings } = require("./harness");

const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const plain = (v) => JSON.parse(JSON.stringify(v));      // the page's objects come from another realm
const stored2 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 2, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const near = (a, b) => Math.abs(a - b) < 1e-9;
const ALIVE = { g: 2, missed: 0, dead: false }, DYING = { g: 2, missed: 2, dead: false }, DEAD = { g: 2, missed: 4, dead: true };
// angle and one swing's range, by tab
const TABLE = { "花": [3.2, 2.2, 3.2], "やさい": [2.2, 2.6, 3.4], "草木": [1.8, 3, 4], "木": [0.7, 4.5, 6] };
const HANGING = ["hang_fern", "hang_ivy", "hang_spider", "basket", "ivy_hanging"];

function node(root, id) { return byClass(root, "kg-item").find((d) => d.dataset.id === String(id)); }
/** Placed item id's picture: the sprite inside its .kg-item. */
const pic = (root, id) => node(root, id).children[0];
const swaying = (root, id) => pic(root, id).classList.contains("kg-sway");
/** Placed item id's sway animation (the fake DOM's), or undefined. */
const anim = (root, id) => pic(root, id).getAnimations()[0];
/** Let the page finish its task: it anchors the sways that started in it after its drawing. */
const settle = () => new Promise((r) => setImmediate(r));

test("every plant sways by its tab: ±20% of the angle, a length in the range, a delay from x plus up to 0.3 s", () => {
  const { KanpekiGarden: G } = page({});
  for (const item of Object.values(G.items)) {
    const w = TABLE[item.tab];
    for (let id = 1; id <= 40; id++) {
      const sw = G.swayOf(item, ALIVE, id, 1000);
      if (!w) { assert.strictEqual(sw, null, item.key + " sways"); continue; }
      assert.ok(sw.a >= w[0] * 0.8 && sw.a <= w[0] * 1.2, item.key + " angle " + sw.a);
      assert.ok(sw.d >= w[1] && sw.d <= w[2], item.key + " length " + sw.d);
      assert.ok(sw.delay >= 0.8 && sw.delay < 1.1, item.key + " delay " + sw.delay);
    }
  }
});

test("pots, hanging plants and decorations don't sway", () => {
  const { KanpekiGarden: G } = page({});
  const still = Object.values(G.items).filter((i) => i.tab === "はちうえ" || i.tab === "かざり");
  assert.ok(still.some((i) => i.tab === "はちうえ") && still.some((i) => i.tab === "かざり"));
  for (const item of still) assert.strictEqual(G.swayOf(item, item.frames.length > 1 ? ALIVE : null, 1, 500), null, item.key);
  for (const k of HANGING) assert.strictEqual(G.swayOf(G.items[k], ALIVE, 1, 500), null, k);
});

test("each plant sways its own way, the same way every time the garden opens", () => {
  const a = page({}).KanpekiGarden, b = page({}).KanpekiGarden;
  const rose = a.items.rose_pink, sws = [];
  for (let id = 1; id <= 200; id++) {
    const sw = a.swayOf(rose, ALIVE, id, 0);
    assert.deepStrictEqual(plain(sw), plain(b.swayOf(b.items.rose_pink, ALIVE, id, 0)));
    sws.push(sw);
  }
  // the random parts cover their ranges: not one plant copied 200 times
  const span = (k) => [Math.min(...sws.map((s) => s[k])), Math.max(...sws.map((s) => s[k]))];
  const [a0, a1] = span("a"), [d0, d1] = span("d"), [l0, l1] = span("delay");
  assert.ok(a0 < 3.2 * 0.85 && a1 > 3.2 * 1.15, [a0, a1]);
  assert.ok(d0 < 2.3 && d1 > 3.1, [d0, d1]);
  assert.ok(l0 >= 0 && l0 < 0.03 && l1 > 0.27 && l1 < 0.3, [l0, l1]);
});

test("the breeze: delay grows with x, 1.6 s across the map", () => {
  const G = page({}).KanpekiGarden, tree = G.items.sakura;
  const at = (x) => G.swayOf(tree, ALIVE, 7, x).delay;
  assert.ok(near(at(2000) - at(0), 1.6));
  assert.ok(near(at(1000) - at(0), 0.8));
});

test("growing stages sway like the mature plant; dying at half the angle, half again as slowly; dead not at all", () => {
  const G = page({}).KanpekiGarden, rose = G.items.rose_pink;
  const mature = G.swayOf(rose, ALIVE, 3, 600);
  assert.deepStrictEqual(plain(G.swayOf(rose, { g: 0, missed: 1, dead: false }, 3, 600)), plain(mature));
  assert.deepStrictEqual(plain(G.swayOf(rose, null, 3, 600)), plain(mature));      // a plant without stage art
  const dying = G.swayOf(rose, DYING, 3, 600);
  assert.ok(near(dying.a, mature.a / 2) && near(dying.d, mature.d * 1.5) && near(dying.delay, mature.delay));
  assert.strictEqual(G.swayOf(rose, DEAD, 3, 600), null);
});

test("in the garden: a flower's picture sways about its anchor, in step with swayOf's curve; pots and decorations are still", async () => {
  const stored = stored2({ next: 5, placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: "2026-10-01", g: 2 },
    { id: 2, k: "cactus", x: 800, y: 600, t: "2026-10-01", g: 2 }, { id: 3, k: "gnome", x: 1000, y: 600 },
    { id: 4, k: "basket", x: 1200, y: 400, t: "2026-10-01", g: 2 }] });
  const win = page(stored, { now: new Date(2026, 9, 1, 10).getTime() });
  const root = openGarden(win), G = win.KanpekiGarden, S = win.KG_SCALE;
  const p = G.load().placed[0], item = G.items.rose_pink, f = item.frames[2];
  const sw = G.swayOf(item, G.life(G.load(), p), 1, 500);
  const d = pic(root, 1);
  assert.ok(swaying(root, 1));
  assert.strictEqual(d.style.transformOrigin, f.ax * S + "px " + f.ay * S + "px");
  assert.strictEqual(d.style["--kg-a"], sw.a + "deg");
  assert.strictEqual(d.style.animationDuration, sw.d + "s");
  // started at the timeline's 0, with -delay: local time = t + delay, as in -a·cos(π·(t + delay)/d)
  assert.strictEqual(d.style.animationDelay, -sw.delay + "s");
  assert.strictEqual(anim(root, 1).startTime, null, "anchored before the page's task is done");
  await settle();
  assert.strictEqual(anim(root, 1).startTime, 0);
  for (const id of [2, 3, 4]) assert.ok(!swaying(root, id), id + " sways");
  // the item around the picture isn't the one that sways (it pops), and the picture carries the shadow
  assert.ok(!node(root, 1).classList.contains("kg-sway"));
  const css = win.document.getElementById("kg-style").textContent;
  assert.match(css, /\.kg-item>\.kg-sprite\{filter:drop-shadow/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[^}]*\.kg-sway\{animation:none\}/);
});

test("a dead plant is still", () => {
  const stored = stored2({ next: 2, placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: "2026-10-01", g: 2, dead: "2026-10-05" }] });
  const root = openGarden(page(stored, { now: new Date(2026, 9, 6, 10).getTime() }));
  assert.ok(!swaying(root, 1));
});

test("planting pops; the selected or dragged plant is still, and sways again once let go, in step", async () => {
  const stored = stored2({ next: 1, inv: { tulip_yellow: 1 } });
  const win = page(stored, { now: new Date(2026, 9, 1, 10).getTime() });
  const root = openGarden(win, null, { dev: "1" }), view = byClass(root, "kg-view")[0];
  const toClient = (x, y) => ({ clientX: x * 0.2, clientY: y * 0.2 + 38.4 });      // the 400 x 300 fake view, map at 0.2
  const ev = (type, c, target) => view.on[type].forEach((fn) => fn(Object.assign({ type, pointerId: 1, target }, c)));
  byClass(root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
  byClass(root, "kg-card")[0].click();
  const nothing = { closest: () => null }, c0 = toClient(500, 700);
  ev("pointerdown", c0, nothing); ev("pointerup", c0, nothing);

  assert.ok(node(root, 1).classList.contains("kg-pop") && node(root, 1).classList.contains("kg-sel"));
  assert.ok(!swaying(root, 1), "sways while selected");
  // drag it 200 right: still while dragged
  const on = { closest: (sel) => (sel === ".kg-item" ? node(root, 1) : null) }, c1 = toClient(700, 700);
  ev("pointerdown", c0, on); ev("pointermove", c1, on);
  assert.ok(!swaying(root, 1), "sways while dragged");
  ev("pointerup", c1, on);
  assert.ok(!swaying(root, 1), "sways while selected");

  // OK lets it go: it sways from its new spot, a new animation, anchored like the others
  byClass(root, "kg-hint")[0].all((n) => n.tagName === "button" && n.textContent === "OK")[0].click();
  assert.ok(swaying(root, 1));
  const G = win.KanpekiGarden, p = G.load().placed[0];
  const sw = G.swayOf(G.items.tulip_yellow, G.life(G.load(), p), 1, p.x);
  assert.strictEqual(pic(root, 1).style.animationDelay, -sw.delay + "s");
  await settle();
  const a = anim(root, 1);
  assert.strictEqual(a.startTime, 0);
  // drawn again while it sways (here by the test day button): the same animation goes on
  byClass(root, "kg-dev").find((b) => b.textContent === "+1日").click();
  assert.ok(swaying(root, 1));
  assert.strictEqual(anim(root, 1), a);
  assert.strictEqual(pic(root, 1).style.animationDelay, -sw.delay + "s");
});

test("the settings switch 「くさばなが ゆれる」 stops and starts every sway at once, and is remembered", async () => {
  const stored = stored2({ next: 4, placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: "2026-10-01", g: 2 },
    { id: 2, k: "sakura", x: 900, y: 700, t: "2026-10-01", g: 2 }, { id: 3, k: "tomato", x: 1300, y: 600, t: "2026-10-01", g: 2 }] });
  const when = { now: new Date(2026, 9, 1, 10).getTime() };
  const ids = [1, 2, 3];
  const toggle = (root) => byClass(openSettings(root), "kg-opt").find((n) => n.textContent === "くさばなが ゆれる");
  let root = openGarden(page(stored, when));
  await settle();
  assert.ok(ids.every((id) => swaying(root, id)));
  let b = toggle(root);
  assert.strictEqual(b.attrs["aria-checked"], "true");
  b.click();
  assert.strictEqual(b.attrs["aria-checked"], "false");
  assert.ok(ids.every((id) => !swaying(root, id)), "still swaying after off");
  assert.deepStrictEqual(JSON.parse(stored["kanpekikun-garden-opts"]), { sway: false });

  // the next card's garden: still off, and drawn still from the start (no sway started and stopped again)
  root = openGarden(page(stored, when), 5);
  await settle();
  assert.ok(ids.every((id) => !swaying(root, id)), "sways again on the next card");
  assert.ok(ids.every((id) => pic(root, id).style.animationDelay === undefined), "drawn swaying first");
  b = toggle(root);
  assert.strictEqual(b.attrs["aria-checked"], "false");
  // on again: every plant sways, each anchored to the timeline so the breeze is as before
  b.click();
  assert.ok(ids.every((id) => swaying(root, id)));
  await settle();
  assert.ok(ids.every((id) => anim(root, id).startTime === 0));
  assert.deepStrictEqual(JSON.parse(stored["kanpekikun-garden-opts"]), { sway: true });
});

test("with reduced motion nothing sways, from the first drawing", () => {
  const stored = stored2({ next: 2, placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: "2026-10-01", g: 2 }] });
  const root = openGarden(page(stored, { now: new Date(2026, 9, 1, 10).getTime(), reduceMotion: true }));
  assert.ok(!swaying(root, 1));
  assert.strictEqual(pic(root, 1).style.animationDelay, undefined, "drawn swaying first");
});
