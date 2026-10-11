// The UI's language: a slot with data-lang="en" shows every text and item name in English (TEXT.en); without it, or
// with any other value, the garden is in Japanese as it always was. The save is the same in both.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, Node, page, openGarden, openSettings } = require("./harness");

const NOW = new Date(2026, 9, 12, 10).getTime();          // 2026-10-12, a Monday
const DAY_KEY = "kanpekikun-garden-dev-day";
const JAPANESE = /[\u3000-\u30ff\u4e00-\u9fff]/;           // kana, kanji and Japanese punctuation
const FULLWIDTH = /[\uff01-\uff5e]/;                      // fullwidth ！ to ～, for TEXT.en (the zoom ＋/－ are in both)
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const stored2 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 2, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const saved = (stored) => JSON.parse(stored[KEY]);
const texts = (root, c) => byClass(root, c).map((n) => n.textContent);
const tab = (root, i) => byClass(root, "kg-tab")[i];
const confirm = (root) => byClass(root, "kg-confirm")[0];
const hint = (root) => byClass(root, "kg-hint")[0];
const button = (root, text) => root.all((n) => n.tagName === "button" && n.textContent === text)[0];
const EN = { lang: "en" };

/** Every text and attribute under node n (shown or hidden) that has Japanese in it, as "where: text". */
function japanese(n) {
  return n.all(() => true).flatMap((m) => [["text", m.text]].concat(Object.entries(m.attrs))
    .filter(([, v]) => JAPANESE.test(String(v))).map(([k, v]) => m.className + " " + k + ": " + v));
}
/** A finger down and up on placed item d (or the empty map, with null). */
function touch(root, d) {
  const target = { closest: (sel) => (sel === ".kg-item" ? d : null) };
  ["pointerdown", "pointerup"].forEach((type) => byClass(root, "kg-view")[0].on[type].forEach((f) =>
    f({ type, pointerId: 1, clientX: 200, clientY: 150, target })));
}
/** Mount a slot with data-kg `kg` and more data- attributes, as a card does; returns the slot. */
function mount(win, kg, data) {
  const slot = new Node("div");
  Object.assign(slot.dataset, { kg }, data);
  win.document.body.append(slot);
  win.KanpekiGarden.mount(slot);
  return slot;
}

test("the two text tables have the same keys, each the same kind of thing; no Japanese in TEXT.en", () => {
  const { ja, en } = page({}).KanpekiGarden.text;
  assert.deepStrictEqual(Object.keys(en).sort(), Object.keys(ja).sort());
  for (const k of Object.keys(ja)) assert.strictEqual(typeof en[k], typeof ja[k], k);
  // the tabs: one label for each of TABS, in its order; TABS' own names are the Japanese labels
  assert.deepStrictEqual(Array.from(ja.tabs), ["もちもの", "花", "はちうえ", "やさい", "草木", "木", "かざり"]);
  assert.strictEqual(en.tabs.length, ja.tabs.length);
  for (const [k, v] of Object.entries(en)) {
    const calls = k === "name" ? [["ばら", "Rose"]] : [[1, 2], [2, 3], [-1, 0], [0, 0]];
    const out = typeof v === "function" ? calls.map((a) => v(...a)) : [].concat(v);
    for (const t of out) assert.ok(typeof t === "string" && t && !JAPANESE.test(t) && !FULLWIDTH.test(t), k + ": " + t);
  }
});

test("every item has an English name, the removed ones too, each its own", () => {
  const win = page({});
  const names = win.KG_CATALOG.map((e) => e[2]).concat(Object.values(win.KG_REMOVED).map((r) => r[1]));
  assert.strictEqual(names.length, win.KG_CATALOG.length + Object.keys(win.KG_REMOVED).length);
  for (const n of names) assert.ok(typeof n === "string" && /^[A-Z][A-Za-z -]*[a-z]$/.test(n), JSON.stringify(n));
  assert.strictEqual(new Set(names).size, names.length, "two items share an English name");
  assert.strictEqual(win.KanpekiGarden.items.rose_pink.en, "Pink rose");
  assert.strictEqual(win.KanpekiGarden.items.flytrap.en, "Venus flytrap");
  assert.strictEqual(win.KG_REMOVED.tomato_ripe[1], "Ripe tomato");
});

test("data-lang=\"en\": the top bar, the tabs, the shop's cards and questions are in English", () => {
  const stored = stored2({ coins: 30, inv: { fence: 1 } });
  const root = openGarden(page(stored, { now: NOW }), undefined, EN);
  assert.deepStrictEqual([root.attrs.lang, root.attrs["aria-label"]], ["en", "Garden"]);
  assert.deepStrictEqual([texts(root, "kg-title")[0], texts(root, "kg-close")[0]], ["My garden", "Close"]);
  assert.strictEqual(byClass(root, "kg-gear")[0].attrs["aria-label"], "Settings");
  assert.deepStrictEqual(byClass(root, "kg-zbtn").map((n) => n.attrs["aria-label"]), ["Zoom in", "Zoom out"]);
  assert.deepStrictEqual(texts(root, "kg-tab"), ["Bag1", "Flowers", "Pots", "Veggies", "Greenery", "Trees", "Decor"]);
  assert.deepStrictEqual(texts(root, "kg-name").slice(0, 3), ["Pink rose", "Red rose", "Yellow tulip"]);
  // buying: enough coins, and too few
  byClass(root, "kg-card")[0].click();
  assert.strictEqual(confirm(root).textContent, "Pink roseBuy for 20? You'll have 10 left.BuyCancel");
  assert.strictEqual(byClass(confirm(root), "kg-coin").length, 1);
  button(root, "Cancel").click();
  tab(root, 5).click();
  byClass(root, "kg-card")[0].click();
  assert.strictEqual(confirm(root).textContent, "Orange treeYou need 170 more coins. Keep going with your cards!OK");
  assert.deepStrictEqual(japanese(root), []);
  // the bag, and placing from it
  tab(root, 0).click();
  assert.deepStrictEqual(byClass(root, "kg-card").map((n) => n.textContent), ["Fence×1"]);
  byClass(root, "kg-card")[0].click();
  assert.strictEqual(hint(root).textContent, "Tap to put it down✕");
  assert.strictEqual(button(hint(root), "✕").attrs["aria-label"], "Cancel");
  assert.strictEqual(byClass(root, "kg-fold")[0].attrs["aria-label"], "Show the shop");   // folded by itself
  touch(root, null);
  assert.strictEqual(hint(root).textContent, "Drag it to move itPut awayOK");
  button(hint(root), "OK").click();
  assert.strictEqual(byClass(root, "kg-fold")[0].attrs["aria-label"], "Hide the shop");
  assert.strictEqual(byClass(root, "kg-empty")[0].textContent, "Your bag is empty. Buy something in the shop!");
  assert.deepStrictEqual(japanese(root), []);
});

test("data-lang=\"en\": the compost question, the notes, the vacation badge and the settings are in English", () => {
  const stored = stored2({ coins: 3, vac: "2026-10-10", days: { "2026-10-01": 1 },
    placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: "2026-10-01", dead: "2026-10-06" }], next: 2,
    refunded: { items: { "なえのトレー": 1, "まっかなトマト": 2 }, coins: 250 } });
  stored[DAY_KEY] = "2";
  const root = openGarden(page(stored, { now: NOW, reduceMotion: true }), undefined, Object.assign({ dev: "1" }, EN));
  assert.match(confirm(root).textContent, /^Seedling tray, Ripe tomato ×2 are gone from the shop\. \+250OK$/);
  assert.strictEqual(byClass(root, "kg-vac-badge")[0].textContent, "On vacation");
  touch(root, byClass(root, "kg-item")[0]);
  assert.strictEqual(hint(root).textContent, "Compost it? +5Yes✕");
  assert.deepStrictEqual(japanese(root), []);
  const panel = openSettings(root);
  assert.strictEqual(panel.attrs["aria-label"], "Settings");
  assert.strictEqual(button(panel, "Close").attrs["aria-label"], "Close settings");
  assert.deepStrictEqual(texts(panel, "kg-opt"), ["Plants sway", "Butterflies fly", "Vacation"]);
  assert.strictEqual(texts(panel, "kg-note")[0], "Turned off in your phone's settings");
  const dev = byClass(panel, "kg-devset")[0];
  assert.deepStrictEqual([dev.attrs["aria-label"], texts(dev, "kg-devset-h")[0]], ["Test", "Test"]);
  assert.deepStrictEqual(texts(dev, "kg-dev"), ["+100", "+150", "−1 day", "+2 days ✕", "+1 day"]);
  assert.deepStrictEqual(byClass(dev, "kg-dev").map((n) => n.attrs["aria-label"]), ["Test: 100 more coins",
    "Test: add 150 plants", "Test: one day back", "Test: today +2 days (tap to reset)", "Test: one day forward"]);
  button(dev, "+1 day").click();
  assert.strictEqual(texts(dev, "kg-dev-day")[0], "+3 days ✕");
  assert.strictEqual(page({}).KanpekiGarden.text.en.testDayMoved(-1), "Test: today −1 day (tap to reset)");
  // vacation off at once, and on after the question
  byClass(panel, "kg-vac")[0].click();
  byClass(panel, "kg-vac")[0].click();
  assert.strictEqual(confirm(root).textContent, "Go on vacation?The garden stops. No coins until you turn it off.YesCancel");
  assert.deepStrictEqual(japanese(root), []);
});

test("data-lang=\"en\": the chip, the toast, an empty tab and the locked note are in English", () => {
  const stored = stored2({ coins: 4, vac: "2026-10-10" });
  const win = page(stored, { now: NOW });
  const chip = byClass(mount(win, "garden", EN), "kg-chip")[0];
  assert.deepStrictEqual([chip.attrs.lang, chip.attrs["aria-label"]], ["en", "Open the garden (on vacation)"]);
  assert.strictEqual(texts(chip, "kg-chip-vac")[0], "On vacation");
  const awake = byClass(mount(page(stored2({ coins: 4 }), { now: NOW }), "garden", EN), "kg-chip")[0];
  assert.strictEqual(awake.attrs["aria-label"], "Open the garden");
  const toast = byClass(mount(page(stored2({ coins: 4 }), { now: NOW }), "toast", { lang: "en", card: "9" }), "kg-toast")[0];
  assert.deepStrictEqual([toast.attrs.lang, toast.textContent], ["en", " +1 (5)"]);
  // no かざり item sold: that tab is empty
  const edit = (w) => w.KG_CATALOG.forEach((e) => { if (e[3] === "かざり") e[5] = false; });
  const root = openGarden(page(stored2({}), { now: NOW, edit }), undefined, EN);
  tab(root, 6).click();
  assert.strictEqual(byClass(root, "kg-empty")[0].textContent, "Nothing here.");
  // a save from a newer script
  const locked = openGarden(page({ [KEY]: JSON.stringify({ v: 3 }) }, { now: NOW }), undefined, EN);
  assert.strictEqual(confirm(locked).textContent, "The garden can't open right now");
});

test("English has a rounded sans of its own, not Klee One; Japanese keeps Klee One", () => {
  const win = page({});
  openGarden(win, undefined, EN);
  const css = win.document.getElementById("kg-style").textContent;
  const en = /\.kg-root\[lang=en\],\.kg-chip\[lang=en\],\.kg-toast\[lang=en\]\{--kg-font:([^}]*)\}/.exec(css);
  assert.ok(en, "no font for English");
  assert.match(en[1], /^ui-rounded,/);
  assert.match(en[1], /sans-serif$/);
  assert.doesNotMatch(en[1], /Klee/);
  assert.match(css, /\.kg-root,\.kg-chip,\.kg-toast\{[^}]*--kg-font:'KG Klee','Klee One'/);
});

test("without data-lang, or with another value, everything is in Japanese, unmarked, as before", () => {
  for (const data of [{}, { lang: "fr" }, { lang: "EN" }, { lang: "" }]) {
    const win = page(stored2({ coins: 30, vac: "2026-10-10" }), { now: NOW });
    const chip = byClass(mount(win, "garden", data), "kg-chip")[0];
    assert.deepStrictEqual([chip.attrs.lang, chip.attrs["aria-label"]], [undefined, "にわを ひらく（おやすみ中）"]);
    chip.click();
    const root = byClass(win.document.body, "kg-root")[0];
    assert.deepStrictEqual([root.attrs.lang, root.attrs["aria-label"]], [undefined, "にわ"]);
    assert.deepStrictEqual([texts(root, "kg-title")[0], texts(root, "kg-close")[0]], ["わたしのにわ", "とじる"]);
    assert.deepStrictEqual(texts(root, "kg-tab"), ["もちもの", "花", "はちうえ", "やさい", "草木", "木", "かざり"]);
    assert.deepStrictEqual(texts(root, "kg-name").slice(0, 2), ["ピンクのバラ", "赤いバラ"]);
    byClass(root, "kg-card")[0].click();
    assert.strictEqual(confirm(root).textContent, "ピンクのバラ20 で かう？ のこりは 10かうやめる");
    assert.strictEqual(byClass(root, "kg-vac-badge")[0].textContent, "おやすみ中");
    assert.deepStrictEqual(texts(openSettings(root), "kg-opt"), ["くさばなが ゆれる", "ちょうちょが とぶ", "おやすみ"]);
  }
});

test("the save is the same in both: bought in English, it's in もちもの in Japanese", () => {
  const stored = stored2({ coins: 30 });
  const en = openGarden(page(stored, { now: NOW }), undefined, EN);
  byClass(en, "kg-card")[0].click();
  button(en, "Buy").click();
  const after = saved(stored);
  assert.deepStrictEqual([after.coins, after.inv], [10, { rose_pink: 1 }]);
  assert.deepStrictEqual(Object.keys(after).sort(), ["coins", "days", "earned", "inv", "next", "placed", "seen", "v"]);
  const ja = openGarden(page(stored, { now: NOW }));
  tab(ja, 0).click();
  assert.deepStrictEqual(byClass(ja, "kg-card").map((n) => n.textContent), ["ピンクのバラ×1"]);
  assert.strictEqual(texts(ja, "kg-purse-n")[0], "10");
});
