// Stage-art frames: the shop sells only plants with frames and shows their mature frame; plants
// without stage art still show if the player owns them; placed items sit on their anchor.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, OLD_KEY, page, openGarden, unsoldEdit } = require("./harness");

const PLANT_TABS = ["花", "はちうえ", "やさい", "草木", "木"];
// Every plant has its strip now. The 7 new plants have no sheet sprite: stage art only.
const NEW = { forget_me_not: ["ワスレナグサ", "Forget-me-not", "花", 20], marigold: ["マリーゴールド", "Marigold", "花", 20],
  primrose: ["サクラソウ", "Primrose", "花", 20], cotton: ["ワタ", "Cotton", "花", 50], chili: ["トウガラシ", "Chili pepper", "やさい", 100],
  zucchini: ["ズッキーニ", "Zucchini", "やさい", 100], grape_vine: ["ブドウ", "Grapes", "やさい", 100],
  apple: ["りんごの木", "Apple tree", "木", 200] };

function save(over) {
  return { [OLD_KEY]: JSON.stringify(Object.assign({ v: 1, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1 }, over)) };
}
const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const plain = (v) => JSON.parse(JSON.stringify(v));      // the page's arrays come from another realm
const px = (v) => Number(String(v).replace("px", ""));
/** The atlas box a sprite div shows, in atlas pixels. */
function shown(win, d, s) {
  const [x, y] = d.style.backgroundPosition.split(" ").map(px);
  const file = d.style.backgroundImage.slice(4, -1);
  return { a: win.KG_ATLAS.findIndex((at) => at[0] === file), x: Math.round(-x / s), y: Math.round(-y / s),
    w: Math.round(px(d.style.width) / s), h: Math.round(px(d.style.height) / s) };
}

test("every frame lies on its atlas; every plant has frames and is sold, the new ones too", () => {
  const win = page({});
  for (const [key, , , tab, , sold, frames] of win.KG_CATALOG) {
    assert.ok(frames.length === 1 || frames.length >= 3, key);
    for (const [a, x, y, w, h] of frames) {
      const at = win.KG_ATLAS[a];
      assert.ok(at && x >= 0 && y >= 0 && x + w <= at[1] && y + h <= at[2], key + " off its atlas");
    }
    const plant = PLANT_TABS.includes(tab);
    assert.strictEqual(sold, !plant || frames.length > 1, key);
    if (!plant) assert.strictEqual(frames.length, 1, key);
  }
  const unsold = win.KG_CATALOG.filter((e) => !e[5]).map((e) => e[0]);
  assert.deepStrictEqual(plain(unsold), []);
  for (const [key, want] of Object.entries(NEW)) {
    const e = win.KG_CATALOG.find((x) => x[0] === key);
    assert.deepStrictEqual(plain(e.slice(1, 6)), want.concat([true]), key);
    assert.strictEqual(e[6].length, 5, key);
  }
  assert.strictEqual(win.KG_CATALOG.find((e) => e[0] === "corn")[1], "トウモロコシ");
});

test("the shop lists only sold items, each showing its mature frame", () => {
  const win = page(save({ coins: 1000 }));
  const root = openGarden(win);
  for (const tab of byClass(root, "kg-tab")) {
    tab.click();
    const t = tab.textContent;
    if (/もちもの|とち/.test(t)) continue;            // the maps' signs (とち) are in maps.test.js
    const names = byClass(root, "kg-name").map((n) => n.textContent);
    const want = win.KG_CATALOG.filter((e) => e[3] === t && e[5]);
    assert.deepStrictEqual(names, plain(want.map((e) => e[1])), t);
    byClass(root, "kg-card").forEach((card, i) => {
      const frames = want[i][6], f = frames[frames.length > 1 ? frames.length - 3 : 0];
      const d = byClass(card, "kg-sprite")[0];
      const s = Math.min(1, 56 / Math.max(f[3], f[4]));
      assert.deepStrictEqual(shown(win, d, s), { a: f[0], x: f[1], y: f[2], w: f[3], h: f[4] }, want[i][0]);
    });
  }
});

test("a plant without stage art that the player owns still shows, in もちもの and placed, but is not sold", () => {
  const win = page(save({ inv: { rose_red: 1 }, placed: [{ id: 1, k: "rose_red", x: 400, y: 500 }], next: 2 }),
    { edit: unsoldEdit("rose_red") });
  const root = openGarden(win);
  assert.strictEqual(byClass(root, "kg-item").length, 1);
  byClass(root, "kg-tab").find((n) => n.textContent === "花").click();
  assert.ok(!byClass(root, "kg-name").some((n) => n.textContent === "赤いバラ"));
  byClass(root, "kg-tab").find((n) => /もちもの/.test(n.textContent)).click();
  assert.deepStrictEqual(byClass(root, "kg-name").map((n) => n.textContent), ["赤いバラ", "わたしのにわ の かんばん"]);   // and the home sign
});

test("a placed plant shows its mature frame on its anchor; a hanging plant hangs from one hook", () => {
  const win = page(save({ placed: [{ id: 1, k: "tulip_yellow", x: 500, y: 600 }, { id: 2, k: "basket", x: 900, y: 400 }], next: 3 }));
  const root = openGarden(win);
  const S = win.KG_SCALE, items = win.KanpekiGarden.items;
  for (const d of byClass(root, "kg-item")) {
    const p = { 1: { k: "tulip_yellow", x: 500, y: 600 }, 2: { k: "basket", x: 900, y: 400 } }[d.dataset.id];
    const f = items[p.k].frames[2];
    assert.strictEqual(items[p.k].pic, f);
    assert.deepStrictEqual(shown(win, d.children[0], S), { a: f.a, x: f.x, y: f.y, w: f.w, h: f.h });
    assert.ok(Math.abs(px(d.style.left) - (p.x - f.ax * S)) < 1e-9 && Math.abs(px(d.style.top) - (p.y - f.ay * S)) < 1e-9);
  }
  // the hook is the top of every basket frame, so all share one anchor height: the mature frame's bottom
  const basket = items.basket.frames;
  assert.ok(basket.every((f) => f.ay === basket[2].h), JSON.stringify(basket));
});

test("an old save's item whose new picture pokes off the map is moved back onto it, and saved", () => {
  // placed with the old, smaller basket sprite near the top edge and a tree at the left edge
  const stored = save({ placed: [{ id: 1, k: "basket", x: 900, y: 120 }, { id: 2, k: "sakura", x: 60, y: 700 },
    { id: 3, k: "rose_pink", x: 500, y: 600 }], next: 4 });
  const win = page(stored);
  const root = openGarden(win);
  const S = win.KG_SCALE, items = win.KanpekiGarden.items;
  for (const d of byClass(root, "kg-item")) {       // spots are whole pixels, so within half a pixel
    assert.ok(px(d.style.left) >= -0.5 && px(d.style.top) >= -0.5, d.dataset.id + " off the map");
    assert.ok(px(d.style.left) + px(d.children[0].style.width) <= 2000.5, d.dataset.id + " off the map");
  }
  const placed = JSON.parse(stored[KEY]).placed;
  assert.strictEqual(placed[0].y, Math.round(items.basket.pic.ay * S));
  assert.strictEqual(placed[1].x, Math.round(items.sakura.pic.ax * S));
  assert.deepStrictEqual([placed[2].x, placed[2].y], [500, 600]);          // on the map already: unchanged
});
