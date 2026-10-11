// The shop's fold: ▼/▲ (▶/◀ sideways) folds the shop down to its tabs and opens it, a tab opens it, and this
// phone remembers it. Upright, a fold at whole-map view fills the view's height; sideways the whole map grows to the
// new space. While the player places something the shop folds by itself, and opens again after if it was open before.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, page, openGarden, openSettings } = require("./harness");

const NOW = new Date(2026, 9, 12, 10).getTime();
const PREFS_KEY = "kanpekikun-garden-opts";
const UPRIGHT = [360, 740], SIDEWAYS = [740, 360];
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const stored2 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 2, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const saved = (stored) => JSON.parse(stored[KEY]);
const prefs = (stored) => JSON.parse(stored[PREFS_KEY] || "{}");
const near = (a, b) => Math.abs(a - b) < 1e-6;

/** The garden on a phone screen [w, h] (or the harness's fixed sideways view without one). */
function open(stored, screen) {
  const win = page(stored, { now: NOW, screen });
  return { win, root: openGarden(win) };
}
const btn = (root) => byClass(root, "kg-fold")[0];
const folded = (root) => root.classList.contains("kg-shop-min");
const tabNamed = (root, t) => byClass(root, "kg-tab").find((n) => n.textContent.startsWith(t));
const confirm = (root) => byClass(root, "kg-confirm")[0];
/** The camera, from the world's transform: { x, y, s }. */
function cam(root) {
  const m = /translate\((-?[\d.e-]+)px,(-?[\d.e-]+)px\) scale\(([\d.e-]+)\)/.exec(byClass(root, "kg-world")[0].style.transform);
  return { x: +m[1], y: +m[2], s: +m[3] };
}
const scale = (root) => cam(root).s;
const view = (root) => byClass(root, "kg-view")[0];
/** A tap on the map at garden spot x, y, wherever the camera is (the fake view's corner is the page's). */
function tap(root, x, y) {
  const c = cam(root), at = { clientX: x * c.s + c.x, clientY: y * c.s + c.y };
  ["pointerdown", "pointerup"].forEach((type) => view(root).on[type].forEach((f) =>
    f(Object.assign({ type, pointerId: 1, target: { closest: () => null } }, at))));
}
/** Buy the first item on the 花 tab. */
function buy(root) {
  tabNamed(root, "花").click();
  byClass(root, "kg-card")[0].click();
  byClass(confirm(root), "kg-btn-go")[0].click();
}
const zbtn = (root, label) => byClass(root, "kg-zbtn").find((b) => b.attrs["aria-label"] === label);

// upright 360 x 740: the view is 360 x 386 open and 360 x 634 folded; the width decides the whole map, 0.18
const WHOLE_UP = 0.18, FILL_UP = 634 / 1116;
// sideways 740 x 360: 397 x 304 open and 683 x 304 folded (a 54 px strip): whole map 397 x 222 → 545 x 304
const WHOLE_SIDE = 397 / 2000, WHOLE_SIDE_FOLDED = 304 / 1116;

test("the fold button: in the shop beside the tabs, ▼ open and ▲ folded upright, with its label and aria-expanded", () => {
  const { root } = open({}, UPRIGHT);
  const b = btn(root), shop = byClass(root, "kg-shop")[0], tabs = byClass(root, "kg-tabs")[0];
  assert.strictEqual(b.parent, shop);
  assert.strictEqual(shop.children.indexOf(b), shop.children.indexOf(tabs) + 1);
  assert.deepStrictEqual([b.tagName, b.type, folded(root)], ["button", "button", false]);
  assert.deepStrictEqual([b.textContent, b.attrs["aria-label"], b.attrs["aria-expanded"]], ["▼", "おみせを たたむ", "true"]);
  b.click();
  assert.ok(folded(root));
  assert.deepStrictEqual([b.textContent, b.attrs["aria-label"], b.attrs["aria-expanded"]], ["▲", "おみせを ひらく", "false"]);
  // the tabs are rebuilt on every render; the button stays
  tabNamed(root, "木").click();
  assert.strictEqual(btn(root), b);
  b.click();
  b.click();
  assert.strictEqual(b.textContent, "▼");
});

test("sideways the button shows ▶ open and ◀ folded, as text (never an emoji); turning the phone switches them", () => {
  const { win, root } = open({}, SIDEWAYS);
  const b = btn(root);
  assert.strictEqual(b.textContent, "▶︎");
  b.click();
  assert.deepStrictEqual([b.textContent, b.attrs["aria-label"], b.attrs["aria-expanded"]], ["◀︎", "おみせを ひらく", "false"]);
  win.turn(...UPRIGHT);
  assert.strictEqual(b.textContent, "▲");
  win.turn(...SIDEWAYS);
  assert.strictEqual(b.textContent, "◀︎");
});

test("a tab opens the folded shop on that tab", () => {
  const stored = stored2({});
  const { root } = open(stored, UPRIGHT);
  btn(root).click();
  tabNamed(root, "やさい").click();
  assert.ok(!folded(root));
  assert.strictEqual(tabNamed(root, "やさい").attrs["aria-selected"], "true");
  assert.strictEqual(btn(root).attrs["aria-expanded"], "true");
  assert.ok(byClass(root, "kg-card").length > 0);
  assert.strictEqual(prefs(stored).shop, true, "opened by the player: remembered");
  // a tab on the open shop just changes the tab
  tabNamed(root, "木").click();
  assert.ok(!folded(root));
});

test("remembered on this phone next to the motion switches, not in the save; the next garden opens folded", () => {
  const stored = stored2({ coins: 3 });
  const save0 = stored[KEY];
  let { win, root } = open(stored, UPRIGHT);
  byClass(openSettings(root), "kg-opt")[0].click();         // sway off: stored beside it
  btn(root).click();
  assert.deepStrictEqual(prefs(stored), { sway: false, shop: false });
  byClass(root, "kg-close")[0].click();
  assert.strictEqual(stored[KEY], save0);
  ({ root } = open(stored, UPRIGHT));
  assert.ok(folded(root));
  assert.strictEqual(btn(root).textContent, "▲");
  btn(root).click();
  assert.deepStrictEqual(prefs(stored), { sway: false, shop: true });
  assert.ok(!folded(open(stored, UPRIGHT).root));
  // a locked save doesn't stop it
  const locked = { [KEY]: JSON.stringify({ v: 3 }) };
  btn(open(locked, UPRIGHT).root).click();
  assert.strictEqual(prefs(locked).shop, false);
  assert.ok(folded(open(locked, UPRIGHT).root));
});

test("a missing or damaged stored value means open", () => {
  for (const raw of [undefined, "", "{", "[]", "null", "5", '{"shop":0}', '{"shop":"no"}', '{"shop":null}']) {
    const stored = raw == null ? {} : { [PREFS_KEY]: raw };
    assert.ok(!folded(open(stored, UPRIGHT).root), String(raw));
  }
});

test("upright: folding at whole-map view fills the height, about the middle; opening goes back to the whole map", () => {
  const { root } = open({}, UPRIGHT);
  assert.ok(near(scale(root), WHOLE_UP));
  btn(root).click();
  const c = cam(root);
  assert.ok(near(c.s, FILL_UP), c.s);
  assert.ok(near(c.y, 0) && near(c.x, 180 - 1000 * c.s), JSON.stringify(c));  // the map's middle in the view's
  // about 3.2× the whole map: the player sees about a third of the width
  assert.ok(Math.abs(360 / (2000 * c.s) - 1 / 3) < 0.02);
  btn(root).click();
  assert.ok(near(scale(root), WHOLE_UP));
  // opened by a tab, the same
  btn(root).click();
  tabNamed(root, "木").click();
  assert.ok(near(scale(root), WHOLE_UP));
});

test("upright, folded: － zooms out to the whole map and no further, ＋ in again, and opening goes back to the whole map", () => {
  const { root } = open({}, UPRIGHT);
  btn(root).click();
  for (let i = 0; i < 5; i++) zbtn(root, "ちいさく").click();
  assert.ok(near(scale(root), WHOLE_UP));
  zbtn(root, "おおきく").click();
  assert.ok(near(scale(root), WHOLE_UP * 1.5));
  btn(root).click();
  assert.ok(near(scale(root), WHOLE_UP), "the fold zoomed, so opening goes back");
});

test("upright: a zoom the player made before folding is kept, folded and opened again", () => {
  const { root } = open({}, UPRIGHT);
  zbtn(root, "おおきく").click();
  const s0 = scale(root);
  assert.ok(near(s0, WHOLE_UP * 1.5));
  btn(root).click();
  assert.ok(near(scale(root), s0));
  btn(root).click();
  assert.ok(near(scale(root), s0));
});

test("upright, a garden that opens folded starts at fill height; sideways at the whole map", () => {
  const stored = { [PREFS_KEY]: JSON.stringify({ shop: false }) };
  let { root } = open(stored, SIDEWAYS);
  assert.ok(folded(root));
  assert.ok(near(scale(root), WHOLE_SIDE_FOLDED));
  ({ root } = open(stored, UPRIGHT));
  assert.ok(near(scale(root), FILL_UP));
  btn(root).click();
  assert.ok(near(scale(root), WHOLE_UP), "the fill was the fold's: opening goes back to the whole map");
});

test("sideways: no fill height; the whole map grows to the new space and back", () => {
  const { root } = open({}, SIDEWAYS);
  assert.ok(near(scale(root), WHOLE_SIDE));
  btn(root).click();
  const c = cam(root);
  assert.ok(near(c.s, WHOLE_SIDE_FOLDED));
  assert.ok(near(2000 * c.s, 2000 * 304 / 1116) && near(c.y, 0));             // 545 × 304
  btn(root).click();
  assert.ok(near(scale(root), WHOLE_SIDE));
  // and a zoom of the player's stays
  zbtn(root, "おおきく").click();
  btn(root).click();
  assert.ok(near(scale(root), WHOLE_SIDE * 1.5));
});

test("turning the phone while folded: sideways goes back to the whole map from a fill, upright fills again", () => {
  const { win, root } = open({}, UPRIGHT);
  btn(root).click();
  win.turn(...SIDEWAYS);
  assert.ok(near(scale(root), WHOLE_SIDE_FOLDED));
  win.turn(...UPRIGHT);
  assert.ok(near(scale(root), FILL_UP));
  // a zoom of the player's stays through a turn (one bigger than the whole map sideways)
  btn(root).click();
  zbtn(root, "おおきく").click();
  zbtn(root, "おおきく").click();
  btn(root).click();
  win.turn(...SIDEWAYS);
  assert.ok(near(scale(root), WHOLE_UP * 2.25));
  win.turn(...UPRIGHT);
  assert.ok(near(scale(root), WHOLE_UP * 2.25));
});

test("a taller view the same way up, folded and filled, fills its height again; a shorter one or the player's zoom stays", () => {
  const { win, root } = open({}, UPRIGHT);
  btn(root).click();
  win.turn(360, 800);                                // the toolbar goes: the view is 360 x 694
  assert.ok(near(scale(root), 694 / 1116), scale(root));
  assert.ok(near(cam(root).y, 0));
  win.turn(360, 700);                                // and comes back: zoomed in a little more, no bands
  assert.ok(near(scale(root), 694 / 1116));
  btn(root).click();
  assert.ok(near(scale(root), WHOLE_UP), "still the fold's fill: opening goes back to the whole map");
  // a zoom of the player's, not a fill, stays
  zbtn(root, "おおきく").click();
  btn(root).click();
  win.turn(360, 800);
  assert.ok(near(scale(root), WHOLE_UP * 1.5));
});

test("a view not laid out yet (0 x 0) when the garden opens folded: the first frame fills the height", () => {
  const stored = { [PREFS_KEY]: JSON.stringify({ shop: false }) };
  const { win, root } = open(stored, [0, 0]);
  assert.ok(!/NaN/.test(byClass(root, "kg-world")[0].style.transform));
  win.screen = UPRIGHT;                              // laid out by the first frame
  win.tick(16);
  assert.ok(near(scale(root), FILL_UP), scale(root));
  btn(root).click();
  assert.ok(near(scale(root), WHOLE_UP));
  // open, it's the whole map, as before
  const g = open({}, [0, 0]);
  g.win.screen = UPRIGHT;
  g.win.tick(16);
  assert.ok(near(scale(g.root), WHOLE_UP));
});

test("closing the garden stops listening for resizes", () => {
  const { win, root } = open({}, UPRIGHT);
  assert.strictEqual(win.on.resize.length, 1);
  byClass(root, "kg-close")[0].click();
  assert.strictEqual(win.on.resize.length, 0);
  win.turn(...SIDEWAYS);                             // nothing left to run
});

test("a turn refits the map: the whole map stays the whole map", () => {
  const { win, root } = open({}, UPRIGHT);
  win.turn(...SIDEWAYS);
  assert.ok(near(scale(root), WHOLE_SIDE));
  win.turn(...UPRIGHT);
  assert.ok(near(scale(root), WHOLE_UP));
});

test("buying folds the shop while placing, at fill height, and opens it again at the whole map; not remembered", () => {
  const stored = stored2({ coins: 1000 });
  const { root } = open(stored, UPRIGHT);
  buy(root);
  assert.ok(folded(root));
  assert.ok(near(scale(root), FILL_UP));
  assert.strictEqual(btn(root).textContent, "▲");
  assert.ok(!("shop" in prefs(stored)));
  tap(root, 1000, 700);
  assert.strictEqual(saved(stored).placed.length, 1);
  const p = saved(stored).placed[0];
  assert.ok(Math.abs(p.x - 1000) <= 1, "placed where the player tapped: " + p.x);
  assert.ok(!folded(root));
  assert.ok(near(scale(root), WHOLE_UP));
  assert.ok(!("shop" in prefs(stored)));
});

test("picking from もちもの folds it too, and ✕ opens it again", () => {
  const { root } = open(stored2({ inv: { rose_pink: 2 } }), UPRIGHT);
  tabNamed(root, "もちもの").click();
  byClass(root, "kg-card")[0].click();
  assert.ok(folded(root));
  assert.ok(near(scale(root), FILL_UP));
  byClass(root, "kg-hint")[0].all((n) => n.textContent === "✕")[0].click();
  assert.ok(!folded(root));
  assert.ok(near(scale(root), WHOLE_UP));
  assert.strictEqual(tabNamed(root, "もちもの").attrs["aria-selected"], "true");
});

test("sideways, placing folds the strip and opens it again, at the whole map", () => {
  const { root } = open(stored2({ coins: 1000 }), SIDEWAYS);
  buy(root);
  assert.ok(folded(root));
  assert.ok(near(scale(root), WHOLE_SIDE_FOLDED));
  tap(root, 1000, 700);
  assert.ok(!folded(root));
  assert.ok(near(scale(root), WHOLE_SIDE));
});

test("a shop that was folded before stays folded after placing", () => {
  const stored = stored2({ coins: 1000 });
  const { root } = open(stored, UPRIGHT);
  tabNamed(root, "花").click();
  byClass(root, "kg-card")[0].click();               // かう？ and then the player folds the shop: the question stays
  btn(root).click();
  assert.ok(!confirm(root).hidden);
  byClass(confirm(root), "kg-btn-go")[0].click();
  tap(root, 1000, 700);
  assert.strictEqual(saved(stored).placed.length, 1);
  assert.ok(folded(root));
  assert.strictEqual(prefs(stored).shop, false);
});

test("a fold the player makes while placing stays; so does opening it by hand", () => {
  const stored = stored2({ coins: 1000 });
  const { root } = open(stored, UPRIGHT);
  buy(root);
  btn(root).click();                                 // opens it
  assert.ok(!folded(root));
  btn(root).click();                                 // and folds it again
  tap(root, 1000, 700);
  assert.ok(folded(root));
  assert.strictEqual(prefs(stored).shop, false);
  // opened by the player while placing: it stays open
  btn(root).click();
  buy(root);
  assert.ok(folded(root));
  tabNamed(root, "花").click();
  assert.ok(!folded(root));
  byClass(root, "kg-hint")[0].all((n) => n.textContent === "✕")[0].click();
  assert.ok(!folded(root));
  assert.strictEqual(prefs(stored).shop, true);
});

test("messages while folded: the vacation question, the refund note and the locked note show and work", () => {
  // the vacation question, over the settings
  let { root } = open(stored2({}), UPRIGHT);
  btn(root).click();
  byClass(openSettings(root), "kg-vac")[0].click();
  assert.ok(!confirm(root).hidden && confirm(root).classList.contains("kg-over"));
  confirm(root).all((n) => n.textContent === "はい")[0].click();
  assert.ok(confirm(root).hidden);
  assert.strictEqual(byClass(root, "kg-vac")[0].attrs["aria-checked"], "true");
  assert.ok(folded(root));
  // the refund note, in a garden that opens folded
  const prefsFolded = { [PREFS_KEY]: JSON.stringify({ shop: false }) };
  ({ root } = open(Object.assign(stored2({ inv: { tomato_ripe: 1 } }), prefsFolded), SIDEWAYS));
  assert.ok(folded(root) && !confirm(root).hidden && /なくなったよ/.test(confirm(root).textContent));
  confirm(root).all((n) => n.textContent === "OK")[0].click();
  assert.ok(confirm(root).hidden);
  // the locked note
  ({ root } = open(Object.assign({ [KEY]: JSON.stringify({ v: 3 }) }, prefsFolded), UPRIGHT));
  assert.ok(folded(root) && !confirm(root).hidden && /ひらけない/.test(confirm(root).textContent));
});

test("the CSS: folded, a message floats above the tabs; the vacation question still goes over the settings; the strip", () => {
  const win = page({});
  openGarden(win);
  const css = win.document.getElementById("kg-style").textContent;
  const folded = css.indexOf(".kg-shop-min .kg-confirm{bottom:calc(100% + 8px);z-index:5}");
  assert.ok(folded >= 0 && folded < css.indexOf(".kg-confirm.kg-over{z-index:7}"));
  const media = "@media (orientation:landscape) and (max-height:500px){", side = css.slice(css.indexOf(media) + media.length);
  assert.match(side, /^[^@]*\.kg-shop-min \.kg-shop\{width:54px;/);
  assert.match(side, /^[^@]*\.kg-shop-min \.kg-tab\{writing-mode:vertical-rl;/);
  assert.match(side, /^[^@]*\.kg-shop-min \.kg-confirm\{position:fixed;left:8px;right:62px;bottom:8px\}/);
  assert.ok(!css.split("}").some((r) => /kg-shop-min|kg-fold/.test(r) && r.includes("!important")));
});
