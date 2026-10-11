// The garden fills the card's view edge to edge, with no room for the phone's bars, and the tab row shows no scrollbar.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { page, openGarden } = require("./harness");

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("the CSS: the garden fills the view edge to edge, with no safe-area room; the tab row scrolls with no scrollbar", () => {
  const win = page({});
  openGarden(win);
  const css = win.document.getElementById("kg-style").textContent;
  // a rule's declarations, from a top-level rule for exactly this selector
  const rule = (sel) => new RegExp("(^|\\})" + esc(sel) + "\\{([^}]*)\\}").exec(css)[2];
  assert.ok(!css.includes("safe-area-inset") && !css.includes("env("));
  assert.ok(!/padding/.test(rule(".kg-root")));
  assert.match(rule(".kg-menu"), /(^|;)padding:56px 8px 8px;/);
  assert.match(rule(".kg-tabs"), /(^|;)overflow-x:auto;.*(^|;)scrollbar-width:none(;|$)/);
  assert.strictEqual(rule(".kg-tabs::-webkit-scrollbar"), "display:none");
});
