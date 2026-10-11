// The shop's grid and the settings panel scroll with a thin thumb that shows while they scroll and fades out a
// second after, in place of their native bars, which the CSS hides (also where the page styles ::-webkit-scrollbar).
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { page, openGarden, openSettings } = require("./harness");

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const thumbOf = (n) => n.parent.children.find((c) => c.classList.contains("kg-bar"));
const on = (bar) => bar.classList.contains("kg-bar-on");
/** Scroller n, 200 px high with content `all` px high, scrolled to `top`; fires its scroll event. */
function scroll(n, top, all = 800) {
  n.size = () => [300, 200];
  n.scrollHeight = all;
  n.scrollTop = top;
  n.fire("scroll");
}

test("the CSS: the grid and the panel hide their native bars; the thumb is thin, wood, out of the way of taps", () => {
  const win = page({});
  openGarden(win);
  const css = win.document.getElementById("kg-style").textContent;
  // a rule's declarations, from a top-level rule for exactly this selector
  const rule = (sel) => new RegExp("(^|\\})" + esc(sel) + "\\{([^}]*)\\}").exec(css)[2];
  for (const sel of [".kg-grid", ".kg-panel"]) {
    assert.match(rule(sel), /(^|;)overflow-y:auto;/);
    assert.match(rule(sel), /(^|;)overscroll-behavior:contain(;|$)/);
    assert.match(rule(sel), /(^|;)scrollbar-width:none(;|$)/);
    assert.strictEqual(rule(sel + "::-webkit-scrollbar"), "display:none");
  }
  // the boxes hold the thumb and take the scrollers' places
  assert.match(rule(".kg-scroll"), /(^|;)position:relative(;|$)/);
  assert.match(rule(".kg-scroll"), /(^|;)min-height:0(;|$)/);
  assert.strictEqual(rule(".kg-grid-box"), "flex:1");
  assert.strictEqual(rule(".kg-panel-box"), "width:min(100%,360px);max-height:100%");
  assert.ok(!/(^|;)(width|max-height):/.test(rule(".kg-panel")));
  assert.strictEqual(rule(".kg-shop-min .kg-grid-box"), "display:none");
  const bar = rule(".kg-bar");
  for (const d of ["position:absolute", "top:3px", "right:3px", "width:4px", "background:var(--kg-wood)", "opacity:0",
    "pointer-events:none", "transition:opacity .3s"]) assert.match(bar, new RegExp("(^|;)" + esc(d) + "(;|$)"));
  assert.strictEqual(rule(".kg-bar-on"), "opacity:.5;transition:none");    // shows at once, fades out
  assert.strictEqual(rule(".kg-panel-box>.kg-bar"), "top:6px;right:6px");
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{(?:[^{}]*\{[^}]*\})*?[^{}]*\.kg-bar\{transition:none\}/);
});

test("the grid and the panel each sit in a box with a hidden thumb, and listen to scrolls passively", () => {
  const root = openGarden(page({}));
  const shop = byClass(root, "kg-shop")[0], grid = byClass(root, "kg-grid")[0], panel = byClass(root, "kg-panel")[0];
  assert.deepStrictEqual(shop.children.map((n) => n.className.split(" ").pop()),
    ["kg-tabs", "kg-fold", "kg-grid-box", "kg-confirm"]);
  assert.strictEqual(grid.parent.className, "kg-scroll kg-grid-box");
  assert.strictEqual(panel.parent.className, "kg-scroll kg-panel-box");
  assert.ok(panel.parent.parent.classList.contains("kg-menu"));
  for (const n of [grid, panel]) {
    assert.deepStrictEqual(n.parent.children, [n, thumbOf(n)]);
    assert.ok(!on(thumbOf(n)));
    assert.strictEqual(n.on.scroll.length, 1);
    assert.strictEqual(n.how.get(n.on.scroll[0]).passive, true);
  }
});

test("a scroll shows the thumb; it hides 1 s after the last one", () => {
  const win = page({});
  const root = openGarden(win);
  const grid = byClass(root, "kg-grid")[0], bar = thumbOf(grid);
  scroll(grid, 100);
  assert.ok(on(bar));
  win.wait(600);
  scroll(grid, 140);           // still scrolling: the second counts from here
  win.wait(900);
  assert.ok(on(bar));
  win.wait(100);
  assert.ok(!on(bar));
  // the settings panel's the same
  const panel = openSettings(root), pbar = thumbOf(panel);
  scroll(panel, 50);
  assert.ok(on(pbar));
  win.wait(999);
  assert.ok(on(pbar));
  win.wait(1);
  assert.ok(!on(pbar));
});

test("the thumb's length is the share shown and its place the share scrolled, within 3 px of the ends", () => {
  const win = page({});
  const grid = byClass(openGarden(win), "kg-grid")[0], bar = thumbOf(grid);
  // 200 of 800 px shown: a track of 194 px, a quarter of it long; half scrolled: half of the rest down
  scroll(grid, 300);
  assert.strictEqual(bar.style.height, "48.5px");
  assert.strictEqual(bar.style.transform, "translateY(72.75px)");
  scroll(grid, 0);
  assert.strictEqual(bar.style.transform, "translateY(0px)");
  scroll(grid, 600);
  assert.strictEqual(bar.style.transform, "translateY(145.5px)");
  // an overscroll's bounce keeps it in the track
  scroll(grid, -30);
  assert.strictEqual(bar.style.transform, "translateY(0px)");
  scroll(grid, 640);
  assert.strictEqual(bar.style.transform, "translateY(145.5px)");
  // long content: never shorter than 24 px
  scroll(grid, 4900, 10000);
  assert.strictEqual(bar.style.height, "24px");
  assert.strictEqual(bar.style.transform, "translateY(85px)");
});

test("nothing to scroll, no thumb; content that shrinks to fit hides it at once", () => {
  const win = page({});
  const grid = byClass(openGarden(win), "kg-grid")[0], bar = thumbOf(grid);
  scroll(grid, 0, 200);
  assert.ok(!on(bar));
  assert.deepStrictEqual(win.timers, {});
  scroll(grid, 300);
  assert.ok(on(bar));
  scroll(grid, 0, 150);        // another tab's fewer items: the page scrolls back to the top
  assert.ok(!on(bar));
  assert.deepStrictEqual(win.timers, {});
});

test("closing the garden removes the scroll listeners and their timers", () => {
  const win = page({});
  const root = openGarden(win);
  const grid = byClass(root, "kg-grid")[0], panel = byClass(root, "kg-panel")[0];
  scroll(grid, 300);
  scroll(panel, 300);
  assert.strictEqual(Object.keys(win.timers).length, 2);
  byClass(root, "kg-close")[0].click();
  assert.ok(!root.parent);
  assert.deepStrictEqual(grid.on.scroll, []);
  assert.deepStrictEqual(panel.on.scroll, []);
  assert.deepStrictEqual(win.timers, {});
});
