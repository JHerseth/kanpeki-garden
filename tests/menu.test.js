// The settings: the gear in the top bar opens a panel with this phone's motion preferences, the vacation
// switch and, on a dev slot, the test section (dev.test.js, vacation.test.js).
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, page, openGarden, openSettings } = require("./harness");

const NOW = new Date(2026, 9, 12, 10).getTime();
const PREFS_KEY = "kanpekikun-garden-opts";
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const stored3 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 3, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const shown = (n) => !n.hidden;
const menu = (root) => byClass(root, "kg-menu")[0];
const gear = (root) => byClass(root, "kg-gear")[0];

const withPrefs = (stored, opts = {}) => page(stored, Object.assign({ now: NOW }, opts));
/** 10 roses planted today: 2 butterflies while they're on. */
const FLOWERS = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, k: "rose_pink", x: 200 + i * 150, y: 700, t: "2026-10-12" }));
const bugs = (root) => byClass(root, "kg-bug").length;
const sw = (root, label) => byClass(root, "kg-opt").find((n) => n.textContent === label);

test("the top bar is title, coins, gear, とじる; the settings start closed", () => {
  const root = openGarden(page(stored3({ coins: 12 }), { now: NOW }), 7);
  const top = byClass(root, "kg-top")[0];
  assert.deepStrictEqual(top.children.map((n) => n.className.split(" ").pop()),
    ["kg-title", "kg-purse", "kg-gear", "kg-close"]);
  assert.deepStrictEqual([gear(root).attrs["aria-label"], gear(root).attrs["aria-expanded"]], ["せってい", "false"]);
  assert.strictEqual(byClass(top, "kg-vac").length, 0);
  assert.ok(!shown(menu(root)));
  assert.strictEqual(menu(root).parent, root);
});

test("the gear opens the panel; its とじる, a tap beside it or the gear again closes it", () => {
  const root = openGarden(page(stored3({}), { now: NOW }));
  const panel = openSettings(root);
  assert.ok(shown(menu(root)));
  assert.strictEqual(gear(root).attrs["aria-expanded"], "true");
  assert.deepStrictEqual([panel.attrs.role, panel.attrs["aria-label"]], ["dialog", "せってい"]);
  panel.all((n) => n.tagName === "button" && n.textContent === "とじる")[0].click();
  assert.ok(!shown(menu(root)));
  assert.strictEqual(gear(root).attrs["aria-expanded"], "false");
  assert.ok(root.parent, "only the panel closed, not the garden");
  // a tap inside the panel leaves it open; one on the dimmed garden around it closes it
  openSettings(root);
  menu(root).on.click.forEach((f) => f({ target: panel }));
  assert.ok(shown(menu(root)));
  menu(root).click();
  assert.ok(!shown(menu(root)));
  gear(root).click();
  gear(root).click();
  assert.ok(!shown(menu(root)));
});

test("closing the garden closes the panel, and the next garden opens without it", () => {
  const stored = stored3({});
  const win = page(stored, { now: NOW });
  let root = openGarden(win, 7);
  openSettings(root);
  byClass(root, "kg-close")[0].click();
  assert.strictEqual(byClass(win.document.body, "kg-menu").length, 0);
  byClass(win.document.body, "kg-chip")[0].click();
  root = byClass(win.document.body, "kg-root")[0];
  assert.ok(!shown(menu(root)));
});

test("in the panel: the sway switch, the butterflies switch, the vacation switch, then the version", () => {
  const root = openGarden(page(stored3({}), { now: NOW }));
  const panel = openSettings(root);
  assert.deepStrictEqual(panel.children.map((n) => n.className.split(" ").pop()),
    ["kg-panel-h", "kg-prefs", "kg-note", "kg-vac", "kg-ver"]);
  assert.strictEqual(byClass(panel, "kg-prefs")[0].children.length, 2);
  assert.ok(!shown(byClass(panel, "kg-note")[0]));
  assert.deepStrictEqual(byClass(panel, "kg-opt").map((n) => n.textContent), ["くさばなが ゆれる", "ちょうちょが とぶ", "おやすみ"]);
});

test("motion switches: on by default, in the order added, above vacation; a tap applies and stores it", () => {
  const stored = stored3({ placed: FLOWERS, next: 11 });
  const before = stored[KEY];
  let win = withPrefs(stored);
  let root = openGarden(win);
  const panel = openSettings(root);
  assert.deepStrictEqual(byClass(panel, "kg-opt").map((n) => n.textContent),
    ["くさばなが ゆれる", "ちょうちょが とぶ", "おやすみ"]);
  assert.strictEqual(bugs(root), 2);
  const sway = sw(root, "くさばなが ゆれる");
  assert.deepStrictEqual([sway.attrs.role, sway.attrs["aria-checked"], sway.disabled], ["switch", "true", false]);
  assert.ok(!root.classList.contains("kg-no-sway"));
  sway.click();
  assert.strictEqual(sway.attrs["aria-checked"], "false");
  assert.ok(root.classList.contains("kg-no-sway") && !root.classList.contains("kg-no-butterflies"));
  assert.strictEqual(bugs(root), 2);
  assert.deepStrictEqual(JSON.parse(stored[PREFS_KEY]), { sway: false });
  assert.strictEqual(stored[KEY], before, "not in the save");
  assert.ok(shown(menu(root)));
  // the next card's garden: still off, the other still on
  win = withPrefs(stored);
  root = openGarden(win, 3);
  assert.strictEqual(bugs(root), 2);
  assert.strictEqual(sw(root, "くさばなが ゆれる").attrs["aria-checked"], "false");
  sw(root, "ちょうちょが とぶ").click();
  sw(root, "くさばなが ゆれる").click();
  assert.deepStrictEqual(JSON.parse(stored[PREFS_KEY]), { sway: true, butterflies: false });
  assert.strictEqual(bugs(root), 0);
  assert.ok(root.classList.contains("kg-no-butterflies") && !root.classList.contains("kg-no-sway"));
  assert.strictEqual(sw(root, "くさばなが ゆれる").attrs["aria-checked"], "true");
});

test("a missing or damaged preference is on", () => {
  for (const bad of [undefined, "{", "null", "[false]", "\"off\"", "7", JSON.stringify({ sway: "no", butterflies: 0 })]) {
    const stored = stored3({ placed: FLOWERS, next: 11 });
    if (bad !== undefined) stored[PREFS_KEY] = bad;
    const root = openGarden(withPrefs(stored));
    assert.strictEqual(bugs(root), 2, String(bad));
    for (const label of ["くさばなが ゆれる", "ちょうちょが とぶ"]) {
      assert.strictEqual(sw(root, label).attrs["aria-checked"], "true", String(bad) + " " + label);
    }
  }
});

test("with reduced motion: the motion switches show off, can't be changed, and say why", () => {
  const stored = stored3({ placed: FLOWERS, next: 11 });
  stored[PREFS_KEY] = JSON.stringify({ butterflies: false });
  const win = withPrefs(stored, { reduceMotion: true });
  const root = openGarden(win);
  const panel = openSettings(root);
  assert.strictEqual(bugs(root), 0);
  for (const label of ["くさばなが ゆれる", "ちょうちょが とぶ"]) {
    const b = sw(root, label);
    assert.deepStrictEqual([b.attrs["aria-checked"], b.disabled], ["false", true], label);
    b.click();                // the fake DOM fires it anyway
    assert.strictEqual(b.attrs["aria-checked"], "false", label);
  }
  assert.ok(root.classList.contains("kg-no-sway") && root.classList.contains("kg-no-butterflies"));
  assert.strictEqual(bugs(root), 0);
  assert.strictEqual(stored[PREFS_KEY], JSON.stringify({ butterflies: false }), "the stored choice is kept");
  const note = byClass(panel, "kg-note")[0];
  assert.ok(shown(note));
  assert.strictEqual(note.textContent, "スマホの せっていで とまっているよ");
  // the vacation switch isn't a motion one
  assert.ok(!byClass(panel, "kg-vac")[0].disabled);
});

test("a locked save: vacation and the test buttons are disabled, the motion switches still work", () => {
  const stored = { [KEY]: JSON.stringify({ v: 4, coins: 40, earned: 40 }) };
  const before = stored[KEY];
  const win = withPrefs(stored);
  const root = openGarden(win, 7, { dev: "1" });
  const panel = openSettings(root);
  assert.ok(byClass(panel, "kg-vac")[0].disabled);
  assert.ok(byClass(panel, "kg-dev").every((b) => b.disabled));
  assert.ok(!gear(root).disabled);
  sw(root, "くさばなが ゆれる").click();
  assert.deepStrictEqual(JSON.parse(stored[PREFS_KEY]), { sway: false });
  assert.strictEqual(stored[KEY], before);
});

test("the dev row is gone, from the page and from the style", () => {
  const win = page(stored3({}), { now: NOW });
  const root = openGarden(win, 7, { dev: "1" });
  assert.strictEqual(byClass(root, "kg-devrow").length, 0);
  const css = win.document.getElementById("kg-style").textContent;
  assert.ok(!css.includes("kg-devrow"));
  assert.ok(css.includes(".kg-menu{") && css.includes(".kg-devset{"));
});

test("focus: opening the settings goes to their とじる, closing them goes back to the gear", () => {
  const win = page(stored3({}), { now: NOW });
  const root = openGarden(win);
  const panel = openSettings(root);
  const shut = panel.all((n) => n.tagName === "button" && n.textContent === "とじる")[0];
  assert.strictEqual(shut.attrs["aria-label"], "せっていを とじる");
  assert.strictEqual(byClass(root, "kg-close")[0].attrs["aria-label"], undefined);
  assert.strictEqual(win.document.activeElement, shut);
  shut.click();
  assert.strictEqual(win.document.activeElement, gear(root));
  // closed by a tap beside it with focus elsewhere: focus stays where it was
  openSettings(root);
  const tab = byClass(root, "kg-tab")[0];
  tab.focus();
  menu(root).click();
  assert.strictEqual(win.document.activeElement, tab);
});

test("only the vacation question shows over the settings; a buy question stays under the dimmed layer", () => {
  const root = openGarden(page(stored3({ coins: 500 }), { now: NOW }));
  const confirm = byClass(root, "kg-confirm")[0];
  byClass(root, "kg-card")[0].click();                                       // かう？
  assert.ok(shown(confirm) && !confirm.classList.contains("kg-over"));
  byClass(openSettings(root), "kg-vac")[0].click();                          // おやすみに する？
  assert.ok(/おやすみに する？/.test(confirm.textContent) && confirm.classList.contains("kg-over"));
  confirm.all((n) => n.textContent === "やめる")[0].click();
  byClass(root, "kg-card")[0].click();
  assert.ok(shown(confirm) && !confirm.classList.contains("kg-over"));
});

test("a locked save's note stays under the dimmed layer", () => {
  const root = openGarden(page({ [KEY]: JSON.stringify({ v: 4 }) }, { now: NOW }));
  const confirm = byClass(root, "kg-confirm")[0];
  assert.ok(shown(confirm) && /ひらけない/.test(confirm.textContent) && !confirm.classList.contains("kg-over"));
});
