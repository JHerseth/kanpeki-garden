// Butterflies: one for every 5 living flowers (at most 6), flying about the open garden and sitting on its
// living flowers, riding their sway; none on vacation, with reduced motion or with the switch off, and no loop
// once the garden is closed or the page hidden.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, page, openGarden, openSettings } = require("./harness");

const NOW = new Date(2026, 9, 12, 10).getTime(), TODAY = "2026-10-12";
const PREFS_KEY = "kanpekikun-garden-opts";
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const stored2 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 2, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
/** n placed plants of key k from id `from` on, joined on day t (planted today: alive), each at its own y. */
const plants = (n, k = "rose_pink", t = TODAY, from = 1) => Array.from({ length: n }, (_, i) =>
  ({ id: from + i, k, x: 150 + (i % 10) * 170, y: 400 + (from + i) * 9, t, g: 2 }));
const DYING_T = "2026-10-09", DEAD_T = "2026-10-07";     // 2 and 4 finished days without reviews by today
const bugs = (root) => byClass(root, "kg-bug");
const S = page({}).KG_SCALE;
/** 6 living roses and 5 dying ones: 1 butterfly. */
const MIXED = () => plants(6).concat(plants(5, "rose_pink", DYING_T, 7));
const pending = (win) => Object.keys(win.frames).length;
/** Garden from the save with `placed` in it, opened today; Math.random is seeded, so a run can be played again. */
function garden(placed, opts = {}) {
  const stored = opts.stored || stored2(Object.assign({ placed, next: placed.length + 1 }, opts.save));
  const seed = opts.seed || 1;
  const win = page(stored, Object.assign({ now: NOW, src: (code) =>
    "Math.random = (function (a) { return function () { a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a);" +
    " t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(" + seed + ");\n" + code,
  }, opts.page));
  const root = openGarden(win, null, opts.data);
  return { win, root, stored, G: win.KanpekiGarden };
}
/** A butterfly's feet (see drawBug), from its transform; bob is 0 while it sits or flies to a flower. */
function feet(d) {
  const m = /translate\((-?[\d.e-]+)px,(-?[\d.e-]+)px\)/.exec(d.style.transform);
  return { x: +m[1] + 16.5, y: +m[2] + 24 - 2 };
}
/** Run the page's animation frames at 60 a second, from ms on, for secs; each(t) after every frame. */
function run(win, ms, secs, each) {
  for (let i = 0; i <= secs * 60; i++) { win.tick(ms + i * 1000 / 60); if (each && each((ms + i * 1000 / 60) / 1000) === false) break; }
  return ms + secs * 1000;
}
/** Placed flower p's perch height above its anchor: 82% of its picture's (its stage frame now). */
function perchH(G, s, p) {
  const item = G.items[p.k], l = G.life(s, p), n = item.frames.length;
  const f = item.frames[l.dead ? n - 1 : l.missed >= 2 ? n - 2 : l.g];
  return { h: f.ay * 0.82 * S, f };
}

test("the count: one butterfly for every 5 living flowers, at most 6", () => {
  const G = page({}).KanpekiGarden;
  const want = { 0: 0, 1: 0, 4: 0, 5: 1, 9: 1, 10: 2, 14: 2, 15: 3, 25: 5, 29: 5, 30: 6, 31: 6, 100: 6 };
  for (const n in want) assert.strictEqual(G.butterflies(+n), want[n], n + " flowers");
});

test("the flowers they land on: living flowers from the 花 tab only, not dying or dead", () => {
  const save = { v: 2, days: {}, placed: [
    { id: 1, k: "rose_pink", x: 100, y: 500, t: TODAY, g: 0 },          // a sprout
    { id: 2, k: "tulip_yellow", x: 200, y: 500, t: TODAY, g: 2 },
    { id: 3, k: "rose_pink", x: 300, y: 500, t: "2026-10-10", g: 2 },  // 1 day missed: still fine
    { id: 4, k: "rose_pink", x: 400, y: 500, t: DYING_T, g: 2 },
    { id: 5, k: "rose_pink", x: 500, y: 500, t: DEAD_T, g: 2 },
    { id: 6, k: "rose_pink", x: 600, y: 500, t: TODAY, g: 2, dead: "2026-10-01" },
    { id: 7, k: "tomato", x: 700, y: 500, t: TODAY, g: 2 },
    { id: 8, k: "sakura", x: 800, y: 500, t: TODAY, g: 2 },
    { id: 9, k: "gnome", x: 900, y: 500 },
    { id: 10, k: "nope", x: 1000, y: 500 },
  ] };
  const G = page({}, { now: NOW }).KanpekiGarden;
  assert.ok(G.items.tulip_yellow.tab === "花" && G.items.tomato.tab !== "花" && G.items.gnome.tab !== "花");
  const pots = Object.values(G.items).filter((i) => i.tab === "はちうえ" && i.frames.length > 1);
  save.placed.push({ id: 11, k: pots[0].key, x: 1100, y: 500, t: TODAY, g: 2 });      // a flower in a pot is a pot
  assert.deepStrictEqual(G.blooms(save.placed, (p) => G.life(save, p)).map((p) => p.id), [1, 2, 3]);
  // a plant without stage art (no life cycle) on the 花 tab is a living flower
  assert.deepStrictEqual(G.blooms([{ id: 1, k: "rose_pink" }], () => null).map((p) => p.id), [1]);
});

test("in the garden: 10 living flowers have 2 butterflies, 30 have 6, 40 still 6, none none", () => {
  for (const [n, want] of [[0, 0], [4, 0], [5, 1], [10, 2], [30, 6], [40, 6]]) {
    const { root } = garden(plants(n));
    assert.strictEqual(bugs(root).length, want, n + " flowers");
  }
  // dying and dead flowers, and other plants, don't count
  const { root } = garden(plants(10).concat(plants(10, "rose_pink", DYING_T, 11), plants(10, "rose_pink", DEAD_T, 21),
    plants(10, "tomato", TODAY, 31)));
  assert.strictEqual(bugs(root).length, 2);
});

test("a butterfly is above every plant in the map, under the garden's UI, and lets taps through", () => {
  const { win, root } = garden(plants(5));
  const d = bugs(root)[0];
  assert.ok(d.parent.classList.contains("kg-world"));
  assert.deepStrictEqual([d.style.width, d.style.height], ["33px", "24px"]);
  assert.match(d.style.backgroundImage, /^url\(data:image\/png/);
  assert.strictEqual(d.style.backgroundSize, "66px 96px");
  const css = win.document.getElementById("kg-style").textContent;
  const rule = /\.kg-bug\{([^}]*)\}/.exec(css)[1];
  assert.match(rule, /pointer-events:none/);
  assert.match(rule, /image-rendering:pixelated/);
  // items' z-index is their y, at most the map's height
  const z = +/z-index:(\d+)/.exec(rule)[1];
  assert.ok(z > 1116, z);
  assert.ok(byClass(root, "kg-item").every((n) => +n.style.zIndex < z));
  // with reduced motion the style hides them too
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{(?:[^{}]*\{[^}]*\})*?[^{}]*\.kg-bug\{display:none\}/);
});

test("the loop runs only while there are butterflies, the page is shown and the garden open", () => {
  const { win, root } = garden(plants(10));
  run(win, 1000, 0.5);
  assert.strictEqual(pending(win), 1, "one frame waiting: the butterflies'");
  // hidden: no frame waiting; shown again: on
  win.document.hidden = true;
  win.document.fire("visibilitychange");
  assert.strictEqual(pending(win), 0);
  win.tick(2000);
  assert.strictEqual(pending(win), 0);
  win.document.hidden = false;
  win.document.fire("visibilitychange");
  assert.strictEqual(pending(win), 1);
  // closed: no frame waiting, no butterflies, and the page's visibility no longer starts it
  byClass(root, "kg-close")[0].click();
  assert.strictEqual(pending(win), 0);
  assert.strictEqual(bugs(root).length, 0);
  win.document.fire("visibilitychange");
  assert.strictEqual(pending(win), 0);
  // no flowers: no loop at all
  const empty = garden([]);
  empty.win.tick(1000);
  assert.strictEqual(pending(empty.win), 0);
});

test("none on vacation: switched on they go at once, switched off they come in at the side", () => {
  let { root } = garden(plants(10), { save: { vac: "2026-10-10" } });
  assert.strictEqual(bugs(root).length, 0);
  const g = garden(plants(10));
  root = g.root;
  run(g.win, 1000, 0.2);
  const vac = byClass(openSettings(root), "kg-vac")[0];
  vac.click();
  byClass(root, "kg-confirm")[0].all((n) => n.textContent === "はい")[0].click();
  assert.strictEqual(bugs(root).length, 0);
  assert.strictEqual(pending(g.win), 0);
  vac.click();
  assert.strictEqual(bugs(root).length, 2);
  assert.strictEqual(pending(g.win), 1);
  for (const d of bugs(root)) assert.ok([10, 1990].includes(Math.round(feet(d).x)), feet(d).x);   // on the map, not the shade around it
});

test("none with reduced motion, and the switch 「ちょうちょが とぶ」 takes them away and brings them back at once", () => {
  let g = garden(plants(10), { page: { reduceMotion: true } });
  g.win.tick(1000);
  assert.strictEqual(bugs(g.root).length, 0);
  assert.strictEqual(pending(g.win), 0);

  g = garden(plants(10));
  run(g.win, 1000, 0.2);
  const b = byClass(openSettings(g.root), "kg-opt").find((n) => n.textContent === "ちょうちょが とぶ");
  b.click();
  assert.strictEqual(bugs(g.root).length, 0);
  assert.strictEqual(pending(g.win), 0);
  assert.deepStrictEqual(JSON.parse(g.stored[PREFS_KEY]), { butterflies: false });
  // the next card's garden starts without them
  const next = garden(null, { stored: g.stored });
  assert.strictEqual(bugs(next.root).length, 0);
  b.click();
  assert.strictEqual(bugs(g.root).length, 2);
  assert.strictEqual(pending(g.win), 1);
});

test("planting the 10th flower brings a second butterfly", () => {
  const { win, root } = garden(plants(9), { save: { inv: { tulip_yellow: 2 } } });
  const view = byClass(root, "kg-view")[0];
  const nothing = { closest: () => null };
  const tap = (x, y) => ["pointerdown", "pointerup"].forEach((type) =>
    view.on[type].forEach((fn) => fn({ type, pointerId: 1, target: nothing, clientX: x, clientY: y })));
  assert.strictEqual(bugs(root).length, 1);
  run(win, 1000, 0.1);
  byClass(root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
  byClass(root, "kg-card")[0].click();
  tap(200, 200);
  assert.strictEqual(bugs(root).length, 2, "the 10th flower");
  assert.strictEqual(pending(win), 1);
});

/** Watch the butterfly in a MIXED garden until it has sat on a flower and flown off twice (or 2 minutes). */
function watchSit(seed) {
  const g = garden(MIXED(), { seed });
  const s = g.G.load(), d = bugs(g.root)[0];
  let prev = null, sits = [], cur = null;
  run(g.win, 1000, 120, (t) => {
    const at = feet(d);
    if (prev && at.y === prev.y) {                  // in flight its y always changes
      if (!cur) sits.push(cur = { from: t, xs: [], y: at.y });
      cur.xs.push([t, at.x]);
    } else if (cur) { cur.to = t; cur = null; if (sits.length >= 2) return false; }
    prev = at;
  });
  return Object.assign(g, { s, d, sits });
}

test("a butterfly sits on living flowers only, 2.5–6 s, riding the sway, and flies off again", () => {
  for (const seed of [1, 2, 3]) {
    const { G, s, sits } = watchSit(seed);
    assert.ok(sits.length >= 2 && sits.every((x) => x.to), "seed " + seed + ": sat and flew off twice in 2 minutes");
    for (const sit of sits) {
      // on which flower: the one whose perch is at this height
      const on = s.placed.filter((p) => Math.abs(p.y - perchH(G, s, p).h - sit.y) < 1e-6);
      assert.strictEqual(on.length, 1, "seed " + seed + ": sat at y " + sit.y);
      const p = on[0], { h, f } = perchH(G, s, p);
      assert.ok(p.id <= 6, "seed " + seed + ": sat on dying flower " + p.id);
      const len = sit.to - sit.from;
      assert.ok(len >= 2.4 && len <= 6.1, "seed " + seed + ": sat " + len + " s");
      // a little to one side of the middle of its picture
      const mid = p.x + (f.w / 2 - f.ax) * S;
      assert.ok(sit.xs.every(([, x]) => Math.abs(x - mid) <= 0.15 * f.w * S + 8), "seed " + seed + ": off the flower");
      // carried by the sway: x moves by -tan(skew)·h, skew at t = -a·cos(π·(t + delay)/d)
      const sw = G.swayOf(G.items[p.k], G.life(s, p), p.id, p.x);
      const off = (t) => -Math.tan(-sw.a * Math.cos(Math.PI * (t + sw.delay) / sw.d) * Math.PI / 180) * h;
      const [t0, x0] = sit.xs[0];
      assert.ok(sit.xs.some(([, x]) => Math.abs(x - x0) > 0.5), "seed " + seed + ": still on a swaying flower");
      for (const [t, x] of sit.xs) assert.ok(Math.abs(x - x0 - (off(t) - off(t0))) < 1e-6, "seed " + seed + " at " + t);
    }
  }
});

/** Replay watchSit(seed)'s run up to secs before the middle of its first sit, then tap the flower it sat on, which
 *  selects it. Returns that run and the flower's perch height y. */
function selectPerch(seed, before) {
  const first = watchSit(seed).sits[0];
  const g = garden(MIXED(), { seed });
  const ms = run(g.win, 1000, (first.from + first.to) / 2 - 1 - before);
  const d = bugs(g.root)[0], s = g.G.load();
  const p = s.placed.filter((q) => Math.abs(q.y - perchH(g.G, s, q).h - first.y) < 1e-6)
    .sort((u, v) => Math.abs(u.x - first.xs[0][1]) - Math.abs(v.x - first.xs[0][1]))[0];
  const view = byClass(g.root, "kg-view")[0], item = byClass(g.root, "kg-item").find((n) => n.dataset.id === String(p.id));
  const on = { closest: (sel) => (sel === ".kg-item" ? item : null) };
  const toClient = (x, y) => ({ clientX: x * 0.2, clientY: y * 0.2 + 38.4 });      // the 400 x 300 fake view, map at 0.2
  const ev = (type, c) => view.on[type].forEach((fn) => fn(Object.assign({ type, pointerId: 1, target: on }, c)));
  const atY = feet(d).y;
  ev("pointerdown", toClient(p.x, p.y)); ev("pointerup", toClient(p.x, p.y));
  assert.ok(item.classList.contains("kg-sel"));
  return { g, d, ms, y: first.y, atY, ev, toClient, p };
}

test("selecting the flower a butterfly sits on sends it off, and it doesn't come back while it's moved", () => {
  const { g, d, ms, y, atY, ev, toClient, p } = selectPerch(1, 0);
  assert.strictEqual(atY, y, "sitting on it when the player tapped");
  run(g.win, ms, 0.2);
  assert.notStrictEqual(feet(d).y, y);
  // dragged 100 to the right, then left selected: no butterfly lands on it
  ev("pointerdown", toClient(p.x, p.y)); ev("pointermove", toClient(p.x + 100, p.y)); ev("pointerup", toClient(p.x + 100, p.y));
  let back = false;
  run(g.win, ms + 200, 20, () => { if (feet(d).y === y) back = true; });
  assert.ok(!back);
});

test("selecting the flower a butterfly is flying to sends it elsewhere", () => {
  const first = watchSit(1).sits[0];
  const { g, d, ms, y, atY } = selectPerch(1, (first.to - first.from) / 2 + 0.3);    // 0.3 s before it lands
  assert.notStrictEqual(atY, y, "still on its way");
  let landed = false;
  run(g.win, ms, 3, () => { if (feet(d).y === y) landed = true; });
  assert.ok(!landed);
});

test("a butterfly doesn't land on the selected flower: it's about to be moved", () => {
  const g = garden(plants(5), { seed: 4 });
  const s = g.G.load(), d = bugs(g.root)[0], view = byClass(g.root, "kg-view")[0];
  const p = s.placed[2], item = byClass(g.root, "kg-item").find((n) => n.dataset.id === String(p.id));
  const on = { closest: (sel) => (sel === ".kg-item" ? item : null) };
  ["pointerdown", "pointerup"].forEach((type) => view.on[type].forEach((fn) => fn({ type, pointerId: 1, target: on, clientX: 0, clientY: 0 })));
  assert.ok(item.classList.contains("kg-sel"));
  const y = p.y - perchH(g.G, s, p).h, sat = new Set();
  let prev = null;
  run(g.win, 1000, 300, () => { const at = feet(d).y; if (at === prev) sat.add(at); prev = at; });
  assert.ok(sat.size >= 4, "sat on the others " + sat.size);
  assert.ok(!sat.has(y));
});

test("a flower that starts dying (a test day on) sends its butterfly off", () => {
  const a = watchSit(2), first = a.sits[0];
  const k = a.s.placed.find((q) => Math.abs(q.y - perchH(a.G, a.s, q).h - first.y) < 1e-6).id;
  // the same run again, but with flower k planted 2 days ago: fine today, dying tomorrow
  const placed = MIXED();
  placed[k - 1].t = "2026-10-10";
  const g = garden(placed, { seed: 2, data: { dev: "1" } });
  const ms = run(g.win, 1000, (first.from + first.to) / 2 - 1);
  const d = bugs(g.root)[0];
  assert.strictEqual(feet(d).y, first.y, "sitting on it, as in the first run");
  byClass(g.root, "kg-dev").find((b) => b.textContent === "+1日").click();
  assert.strictEqual(bugs(g.root).length, 1, "5 living flowers left");
  run(g.win, ms, 0.2);
  assert.notStrictEqual(feet(d).y, first.y);
  // a day on again: the 5 die too, and with them the butterfly goes
  byClass(g.root, "kg-dev").find((b) => b.textContent === "+1日").click();
  byClass(g.root, "kg-dev").find((b) => b.textContent === "+1日").click();
  assert.strictEqual(bugs(g.root).length, 0);
  assert.strictEqual(pending(g.win), 0);
});
