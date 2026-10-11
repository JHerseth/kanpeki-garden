// Vacation mode: a switch that freezes the garden and pays no coins. Every check runs on a fake
// clock (KG_CLOCK). 2026-10-12 is a Monday.
// Run: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, page, openGarden, openSettings, unsoldEdit } = require("./harness");

const at = (day, h = 10, m = 0) => new Date(2026, 9, day, h, m).getTime();     // October 2026, local time
const iso = (day) => "2026-10-" + String(day).padStart(2, "0");
const NO_ART = unsoldEdit("rose_red");                                             // a plant without stage art
const MON = 12, TUE = 13, WED = 14, THU = 15, FRI = 16, SAT = 17, SUN = 18;
const [SPROUT, YOUNG, MATURE, DYING, DEAD] = [0, 1, 2, 3, 4];                    // a 5-frame strip
const REVIEWED = 1, VACATION = 2;

const byClass = (root, c) => root.all((n) => n.classList.contains(c));
const px = (v) => Number(String(v).replace("px", ""));
const stored2 = (over) => ({ [KEY]: JSON.stringify(Object.assign(
  { v: 2, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }, over)) });
const saved = (stored) => JSON.parse(stored[KEY]);
/** Review days for a save's `days`. */
const days = (...ds) => Object.fromEntries(ds.map((d) => [iso(d), REVIEWED]));
const plant = (id, k, t, g) => ({ id, k, x: 300 * id, y: 700, t: iso(t), g });

/** Open the garden at `when` (answering card `card` first, if given). */
function look(stored, when, card, edit) {
  const win = page(stored, { now: when, edit });
  return { win, root: openGarden(win, card) };
}
/** Answer card `card` at `when` without opening the garden; true if it paid a coin. */
function review(stored, when, card = 1, edit) {
  return page(stored, { now: when, edit }).KanpekiGarden.earn(String(card)).gained;
}
/** Open the garden at `when` and switch vacation on (with a yes) or off in its settings. */
function vacation(stored, when, on, edit) {
  const g = look(stored, when, undefined, edit);
  const sw = byClass(openSettings(g.root), "kg-vac")[0];
  assert.strictEqual(sw.attrs["aria-checked"], String(!on), "already " + (on ? "on" : "off"));
  sw.click();
  if (on) byClass(g.root, "kg-confirm")[0].all((n) => n.tagName === "button" && n.textContent === "はい")[0].click();
  assert.strictEqual(sw.attrs["aria-checked"], String(on));
  return g;
}
function node(root, id) { return byClass(root, "kg-item").find((d) => d.dataset.id === String(id)); }
/** Which of its item's frames placed item `id` shows. */
function frameOf({ win, root }, id) {
  const d = node(root, id), S = win.KG_SCALE;
  const [x, y] = d.children[0].style.backgroundPosition.split(" ").map((v) => Math.round(-px(v) / S));
  const k = win.KanpekiGarden.load().placed.find((p) => p.id === id).k;
  const i = win.KanpekiGarden.items[k].frames.findIndex((f) => f.x === x && f.y === y);
  assert.ok(i >= 0, "item " + id + " shows none of its frames");
  return i;
}
const frames = (g, ids) => ids.map((id) => frameOf(g, id));
const shown = (n) => !n.hidden;

test("a week of vacation with no reviews: no plant changes stage", () => {
  // reviews on the 8th and 9th. Monday: a sprout and a young plant planted Sunday the 11th, a mature one planted
  // the 10th (1 missed day), one dying (the 10th and 11th missed), one without stage art
  const stored = stored2({ next: 6, days: days(8, 9), placed: [
    plant(1, "rose_pink", 11), plant(2, "tulip_yellow", 11, YOUNG), plant(3, "palm", 10, MATURE),
    plant(4, "phlox", 8, MATURE), { id: 5, k: "rose_red", x: 1700, y: 700 }] });
  const ids = [1, 2, 3, 4, 5], before = [SPROUT, YOUNG, MATURE, DYING, 0];
  assert.deepStrictEqual(frames(look(stored, at(MON, 9), undefined, NO_ART), ids), before);
  vacation(stored, at(MON, 9, 30), true, NO_ART);                  // before any card today
  for (let d = TUE; d <= 19; d++) {
    assert.deepStrictEqual(frames(look(stored, at(d, 4), undefined, NO_ART), ids), before, iso(d));
    assert.deepStrictEqual(frames(look(stored, at(d, 23), undefined, NO_ART), ids), before, iso(d));
  }
  vacation(stored, at(19, 23, 30), false, NO_ART);
  assert.deepStrictEqual(frames(look(stored, at(20, 9), undefined, NO_ART), ids), before);
  assert.ok(!saved(stored).placed.some((p) => p.dead));
  // then the days count again, on from where they were
  assert.deepStrictEqual(frames(look(stored, at(22, 3, 59), undefined, NO_ART), ids), [SPROUT, YOUNG, DYING, DYING, 0]);
  assert.deepStrictEqual(frames(look(stored, at(22, 4), undefined, NO_ART), ids), [DYING, DYING, DYING, DEAD, 0]);
  assert.deepStrictEqual(frames(look(stored, at(24, 4), undefined, NO_ART), ids), [DEAD, DEAD, DEAD, DEAD, 0]);
});

test("a dying plant stays dying through vacation, and recovers on the first review after it", () => {
  const stored = stored2({ placed: [plant(1, "rose_pink", 9, MATURE)], next: 2, days: days(MON) });
  assert.strictEqual(frameOf(look(stored, at(THU, 9)), 1), DYING);           // nothing Tuesday or Wednesday
  vacation(stored, at(THU, 9, 5), true);
  assert.strictEqual(frameOf(look(stored, at(SAT, 9), 1), 1), DYING);        // a card answered on vacation: still dying
  for (let d = SUN; d <= 22; d++) assert.strictEqual(frameOf(look(stored, at(d, 4)), 1), DYING, iso(d));
  vacation(stored, at(22, 20), false);
  assert.strictEqual(frameOf(look(stored, at(23, 9)), 1), DYING);
  assert.strictEqual(frameOf(look(stored, at(23, 9, 1), 2), 1), MATURE);     // the first card after it
  assert.strictEqual(frameOf(look(stored, at(25, 4)), 1), MATURE);           // only the 24th missed
  assert.strictEqual(frameOf(look(stored, at(26, 4)), 1), DYING);
});

test("vacation started while dying, then ended: the missed days pick up where they were", () => {
  const stored = stored2({ placed: [plant(1, "rose_pink", 9, MATURE)], next: 2, days: days(MON) });
  vacation(stored, at(THU, 9), true);                                        // missed Tuesday and Wednesday
  vacation(stored, at(22, 9), false);                                        // Thursday to the 22nd frozen
  assert.strictEqual(frameOf(look(stored, at(23, 9)), 1), DYING);
  assert.strictEqual(frameOf(look(stored, at(24, 4)), 1), DYING);            // + the 23rd: 3 missed
  assert.strictEqual(frameOf(look(stored, at(25, 3, 59)), 1), DYING);
  assert.strictEqual(frameOf(look(stored, at(25, 4)), 1), DEAD);             // + the 24th: 4
});

test("vacation switched on for part of a day: that day isn't a missed day", () => {
  const stored = stored2({ placed: [plant(1, "rose_pink", 9, MATURE)], next: 2, days: days(MON) });
  vacation(stored, at(TUE, 10), true);
  vacation(stored, at(TUE, 11), false);
  assert.deepStrictEqual(saved(stored).days, { [iso(MON)]: REVIEWED, [iso(TUE)]: VACATION });
  assert.strictEqual(frameOf(look(stored, at(THU, 4)), 1), MATURE);          // only Wednesday missed
  assert.strictEqual(frameOf(look(stored, at(FRI, 3, 59)), 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(FRI, 4)), 1), DYING);           // Wednesday and Thursday
  // and one switched on late in the day, still on the next morning
  const late = stored2({ placed: [plant(1, "rose_pink", 9, MATURE)], next: 2, days: days(MON) });
  vacation(late, at(TUE, 23, 50), true);
  assert.strictEqual(frameOf(look(late, at(FRI, 4)), 1), MATURE);
});

test("reviews before switching vacation on, on the same day, still make it a growth day", () => {
  const stored = stored2({ placed: [plant(1, "rose_pink", MON)], next: 2 });          // nothing on the planting day
  assert.strictEqual(review(stored, at(TUE, 9), 1), true);
  vacation(stored, at(TUE, 10), true);
  assert.deepStrictEqual(saved(stored).days, days(TUE));
  assert.strictEqual(saved(stored).vac, iso(TUE));
  assert.strictEqual(frameOf(look(stored, at(WED, 4)), 1), YOUNG);           // Tuesday grew it
  review(stored, at(WED, 9), 2);                                             // on vacation: no growth
  assert.strictEqual(frameOf(look(stored, at(THU, 4)), 1), YOUNG);
  // reviews after switching it off count too: Thursday off, then a card
  vacation(stored, at(THU, 9), false);
  review(stored, at(THU, 10), 3);
  assert.deepStrictEqual(saved(stored).days, { [iso(TUE)]: REVIEWED | VACATION,
    [iso(WED)]: VACATION, [iso(THU)]: REVIEWED | VACATION });
  assert.strictEqual(frameOf(look(stored, at(FRI, 4)), 1), MATURE);
});

test("a planting day frozen by vacation doesn't grow the plant; one with reviews made while it was off does", () => {
  // on since Sunday the 11th, the plant placed Monday, a card answered then, vacation switched off Monday evening
  const frozen = stored2({ placed: [plant(1, "rose_pink", MON)], next: 2, vac: iso(11) });
  assert.strictEqual(review(frozen, at(MON, 9), 1), false);
  vacation(frozen, at(MON, 20), false);
  assert.deepStrictEqual(saved(frozen).days, { [iso(11)]: VACATION, [iso(MON)]: VACATION });
  assert.strictEqual(frameOf(look(frozen, at(TUE, 4)), 1), SPROUT);
  assert.strictEqual(frameOf(look(frozen, at(THU, 3, 59)), 1), SPROUT);
  assert.strictEqual(frameOf(look(frozen, at(THU, 4)), 1), DYING);           // Tuesday and Wednesday missed
  // still on: the planting day stays frozen
  const still = stored2({ placed: [plant(1, "rose_pink", MON)], next: 2, vac: iso(MON) });
  assert.strictEqual(review(still, at(MON, 9), 1), false);
  assert.strictEqual(frameOf(look(still, at(WED, 4)), 1), SPROUT);
  // reviews made on the planting day while vacation was off: it grows, even with vacation on since
  const before = stored2({ placed: [plant(1, "rose_pink", MON)], next: 2 });
  assert.strictEqual(review(before, at(MON, 9), 1), true);
  vacation(before, at(MON, 10), true);
  assert.strictEqual(frameOf(look(before, at(TUE, 3, 59)), 1), SPROUT);
  assert.strictEqual(frameOf(look(before, at(TUE, 4)), 1), YOUNG);
  assert.strictEqual(frameOf(look(before, at(FRI, 4)), 1), YOUNG);           // and then frozen
  // ... or after switching it off, the same day
  const after = stored2({ placed: [plant(1, "rose_pink", MON)], next: 2, vac: iso(MON) });
  vacation(after, at(MON, 9), false);
  assert.strictEqual(review(after, at(MON, 10), 1), true);
  assert.deepStrictEqual(saved(after).days, { [iso(MON)]: REVIEWED | VACATION });
  assert.strictEqual(frameOf(look(after, at(TUE, 4)), 1), YOUNG);
});

test("a card answered during vacation pays nothing, and nothing again after vacation is switched off that day", () => {
  const stored = stored2({ coins: 5, earned: 5 });
  vacation(stored, at(MON, 9), true);
  const g = look(stored, at(MON, 10), 7);
  const chip = g.win.document.body.all((n) => n.classList.contains("kg-chip"))[0];
  assert.ok(!byClass(chip, "kg-plus").length, "+1 on the chip");
  assert.strictEqual(byClass(chip, "kg-chip-n")[0].textContent, "5");
  assert.deepStrictEqual([saved(stored).coins, saved(stored).earned, saved(stored).seen], [5, 5, { 7: iso(MON) }]);
  assert.strictEqual(review(stored, at(MON, 10, 5), 7), false);
  vacation(stored, at(MON, 11), false);
  assert.strictEqual(review(stored, at(MON, 12), 7), false);                 // used up
  assert.strictEqual(review(stored, at(MON, 12, 1), 8), true);               // a card not seen on vacation
  assert.strictEqual(saved(stored).coins, 6);
  assert.strictEqual(review(stored, at(TUE, 9), 7), true);                   // tomorrow it pays again
  assert.strictEqual(saved(stored).coins, 7);
  // toast mode shows no +1 on vacation either
  vacation(stored, at(WED, 9), true);
  const win = page(stored, { now: at(WED, 10) });
  const slot = win.document.createElement("div");
  Object.assign(slot.dataset, { kg: "toast", card: "9" });
  win.document.body.append(slot);
  win.KanpekiGarden.mount(slot);
  assert.ok(!byClass(slot, "kg-toast").length);
});

test("on and off several times in one day", () => {
  const stored = stored2({ placed: [plant(1, "rose_pink", MON)], next: 2 });          // nothing on the planting day
  const pays = [];
  pays.push(review(stored, at(TUE, 9), 1));
  vacation(stored, at(TUE, 10), true);
  pays.push(review(stored, at(TUE, 10, 30), 2));
  vacation(stored, at(TUE, 11), false);
  pays.push(review(stored, at(TUE, 11, 30), 2), review(stored, at(TUE, 11, 31), 3));
  vacation(stored, at(TUE, 12), true);
  pays.push(review(stored, at(TUE, 12, 30), 4), review(stored, at(TUE, 12, 31), 1));
  vacation(stored, at(TUE, 13), false);
  pays.push(review(stored, at(TUE, 13, 30), 4));
  vacation(stored, at(TUE, 14), true);                                       // and left on
  assert.deepStrictEqual(pays, [true, false, false, true, false, false, false]);
  const s = saved(stored);
  assert.deepStrictEqual([s.coins, s.vac, s.days], [2, iso(TUE), { [iso(TUE)]: REVIEWED | VACATION }]);
  assert.strictEqual(frameOf(look(stored, at(WED, 4)), 1), YOUNG);           // Tuesday had reviews while off
  assert.strictEqual(frameOf(look(stored, at(25, 4)), 1), YOUNG);            // and it's been on since
});

test("a dying plant switched on, off and on again in one day stays dying, and the day counts once", () => {
  const stored = stored2({ placed: [plant(1, "rose_pink", 9, MATURE)], next: 2, days: days(MON) });
  vacation(stored, at(THU, 9), true);                                        // missed Tuesday and Wednesday
  vacation(stored, at(THU, 10), false);
  vacation(stored, at(THU, 11), true);                                       // and left on
  for (const d of [FRI, SAT, 25]) assert.strictEqual(frameOf(look(stored, at(d)), 1), DYING, iso(d));
  vacation(stored, at(25, 12), false);
  assert.strictEqual(frameOf(look(stored, at(27, 4)), 1), DYING);            // Tuesday, Wednesday, the 26th
  assert.strictEqual(frameOf(look(stored, at(28, 3, 59)), 1), DYING);
  assert.strictEqual(frameOf(look(stored, at(28, 4)), 1), DEAD);             // and the 27th
});

test("switched off with the clock behind the day it went on (a flight west): both days are vacation days", () => {
  const stored = stored2({ placed: [plant(1, "rose_pink", 9, MATURE)], next: 2, days: days(MON, TUE) });
  vacation(stored, at(WED, 5), true);                                        // early on the 14th
  vacation(stored, at(TUE, 23), false);                                      // landed: the 13th, local time
  assert.deepStrictEqual(saved(stored).days, { [iso(MON)]: REVIEWED, [iso(TUE)]: REVIEWED | VACATION,
    [iso(WED)]: VACATION });
  assert.strictEqual(saved(stored).vac, undefined);
  // no more cards: the 14th isn't missed, so dying only from Saturday 04:00 (the 15th and 16th) and dead from Monday
  assert.strictEqual(frameOf(look(stored, at(SAT, 3, 59)), 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(SAT, 4)), 1), DYING);
  assert.strictEqual(frameOf(look(stored, at(SUN, 4)), 1), DYING);
  assert.strictEqual(frameOf(look(stored, at(19, 3, 59)), 1), DYING);
  assert.strictEqual(frameOf(look(stored, at(19, 4)), 1), DEAD);
});

test("switched off with the clock put right after a clock a year ahead: today and tomorrow marked, no more", () => {
  const stored = stored2({ days: days(MON) });
  vacation(stored, new Date(2027, 9, 12, 10).getTime(), true);
  assert.strictEqual(saved(stored).vac, "2027-10-12");
  // a plant from Monday (put in now: the garden opened a year ahead would have found it dead)
  stored[KEY] = JSON.stringify(Object.assign(saved(stored), { placed: [plant(1, "rose_pink", 9, MATURE)], next: 2 }));
  vacation(stored, at(TUE, 10), false);
  assert.deepStrictEqual(saved(stored).days, { [iso(MON)]: REVIEWED, [iso(TUE)]: VACATION, [iso(WED)]: VACATION });
  // the 15th and 16th missed: dying from the 17th, as usual
  assert.strictEqual(frameOf(look(stored, at(SAT, 3, 59)), 1), MATURE);
  assert.strictEqual(frameOf(look(stored, at(SAT, 4)), 1), DYING);
});

test("a week of vacation without opening AnkiDroid at all, then off: no plant changed", () => {
  const stored = stored2({ next: 4, days: days(MON), placed: [            // nothing on the 11th, 1's and 3's planting day
    plant(1, "rose_pink", 11), plant(2, "palm", 9, MATURE), plant(3, "tulip_yellow", 11, YOUNG)] });
  const g0 = vacation(stored, at(MON, 21), true);                            // after Monday's cards
  assert.deepStrictEqual(frames(g0, [1, 2, 3]), [SPROUT, MATURE, YOUNG]);
  // nine days later, the first opening: Monday grew them (its cards came before vacation), and that's all
  const g = vacation(stored, at(21, 18), false);
  assert.deepStrictEqual(frames(g, [1, 2, 3]), [YOUNG, MATURE, MATURE]);
  assert.deepStrictEqual(frames(look(stored, at(23, 9)), [1, 2, 3]), [YOUNG, MATURE, MATURE]);   // the 22nd missed
  assert.deepStrictEqual(frames(look(stored, at(24, 4)), [1, 2, 3]), [DYING, DYING, DYING]);     // and the 23rd
  const s = saved(stored);
  assert.strictEqual(s.vac, undefined);
  for (let d = MON; d <= 21; d++) assert.strictEqual(s.days[iso(d)] & VACATION, VACATION, iso(d));
  assert.strictEqual(Object.keys(s.days).length, 10);                        // Monday to the 21st
  assert.ok(!s.placed.some((p) => p.dead));
});

test("with vacation in the mix, opening the garden after a week away gives the same result as opening it every day", () => {
  // what happens on which day, an hour apart from 10:00: c = a card answered, on / off = vacation switched
  const plan = {
    [MON]: ["c"], [TUE]: ["c", "on"], [THU]: ["c"], [SAT]: ["off"], [SUN]: ["on", "off"], 20: ["c"],
    24: ["on"], 29: ["off"], 30: ["on", "c", "off", "c"],
  };
  const start = () => stored2({ next: 4, days: {}, placed: [
    plant(1, "rose_pink", MON), plant(2, "palm", 9, MATURE), plant(3, "tulip_yellow", TUE)] });
  const act = (stored, d, open) => (plan[d] || []).forEach((a, h) => {
    const when = at(d, 10 + h);
    if (a === "c") return open ? look(stored, when, h + 1) : review(stored, when, h + 1);
    vacation(stored, when, a === "on");
  });
  const snap = (g) => frames(g, [1, 2, 3]);
  const plants = (st) => saved(st).placed.map((p) => Object.assign(p, p.dead ? { dead: true } : {}));
  const daily = start(), seen = {};
  for (let d = MON; d <= 31; d++) {
    look(daily, at(d, 5));
    act(daily, d, true);
    seen[d] = snap(look(daily, at(d, 22)));
    const once = start();
    for (let e = MON; e <= d; e++) act(once, e, false);
    assert.deepStrictEqual(snap(look(once, at(d, 22))), seen[d], iso(d));
    assert.deepStrictEqual(plants(once), plants(daily), iso(d));
    assert.deepStrictEqual(saved(once).days, saved(daily).days, iso(d));
    assert.strictEqual(saved(once).vac, saved(daily).vac, iso(d));
  }
  // and the plan does what it says
  assert.deepStrictEqual(seen[MON], [SPROUT, MATURE, SPROUT]);
  assert.deepStrictEqual(seen[TUE], [YOUNG, MATURE, SPROUT]);                  // Monday, its planting day, grew it
  assert.deepStrictEqual(seen[WED], [MATURE, MATURE, YOUNG]);                  // Tuesday's card came before vacation
  assert.deepStrictEqual(seen[FRI], [MATURE, MATURE, YOUNG]);                  // Thursday's was on vacation
  assert.deepStrictEqual(seen[21], [MATURE, MATURE, MATURE]);                  // the 19th missed, the 20th grew them
  assert.deepStrictEqual(seen[23], [DYING, DYING, DYING]);                     // the 21st and 22nd missed
  assert.deepStrictEqual(seen[29], [DYING, DYING, DYING]);                     // the 23rd too, then vacation
  assert.deepStrictEqual(seen[30], [MATURE, MATURE, MATURE]);                  // the card after it brought them back
  assert.deepStrictEqual(seen[31], [MATURE, MATURE, MATURE]);
});

test("the おやすみ中 badge shows in the garden and on the chip while vacation is on", () => {
  const stored = stored2({ coins: 3 });
  let g = look(stored, at(MON), 1);
  const badge = () => byClass(g.root, "kg-vac-badge")[0];
  const chipBadge = () => byClass(g.win.document.body, "kg-chip-vac")[0];
  const chipLabel = () => byClass(g.win.document.body, "kg-chip")[0].attrs["aria-label"];
  assert.ok(!shown(badge()) && !shown(chipBadge()));
  assert.strictEqual(chipLabel(), "にわを ひらく");
  // the switch, in the settings, asks first; やめる leaves it off
  const sw = byClass(openSettings(g.root), "kg-vac")[0];
  const menu = byClass(g.root, "kg-menu")[0];
  assert.deepStrictEqual([sw.attrs.role, sw.attrs["aria-checked"], sw.textContent], ["switch", "false", "おやすみ"]);
  sw.click();
  const confirm = byClass(g.root, "kg-confirm")[0];
  assert.ok(shown(confirm) && /おやすみに する？/.test(confirm.textContent));
  confirm.all((n) => n.textContent === "やめる")[0].click();
  assert.ok(!shown(confirm) && !shown(badge()) && sw.attrs["aria-checked"] === "false");
  assert.strictEqual(saved(stored).vac, undefined);
  sw.click();
  confirm.all((n) => n.textContent === "はい")[0].click();
  assert.ok(shown(badge()) && badge().textContent === "おやすみ中");
  assert.strictEqual(sw.attrs["aria-checked"], "true");
  assert.ok(shown(menu), "the settings stay open");
  byClass(g.root, "kg-close")[0].click();
  assert.ok(shown(chipBadge()), "the card's chip shows it once the garden closes");
  assert.strictEqual(chipLabel(), "にわを ひらく（おやすみ中）");
  // the next card: on the chip, and in the garden it opens
  g = look(stored, at(MON, 11), 2);
  assert.ok(shown(chipBadge()) && chipBadge().textContent === "おやすみ中");
  assert.strictEqual(chipLabel(), "にわを ひらく（おやすみ中）");
  assert.ok(shown(badge()));
  byClass(openSettings(g.root), "kg-vac")[0].click();                         // off: no question
  assert.ok(!shown(badge()) && !shown(byClass(g.root, "kg-confirm")[0]));
  assert.strictEqual(byClass(g.root, "kg-vac")[0].attrs["aria-checked"], "false");
  byClass(g.root, "kg-close")[0].click();
  assert.ok(!shown(chipBadge()));
  assert.strictEqual(chipLabel(), "にわを ひらく");
  assert.ok(!shown(byClass(look(stored, at(TUE), 3).win.document.body, "kg-chip-vac")[0]));
});

test("buying, placing, moving and composting all still work on vacation", () => {
  const stored = stored2({ coins: 100, placed: [plant(1, "rose_pink", 1), plant(2, "palm", 9, MATURE)], next: 3,
    days: days(MON) });
  vacation(stored, at(MON, 9), true);
  const g = look(stored, at(TUE));
  assert.strictEqual(frameOf(g, 1), DEAD);
  // buy and place
  const rose = g.win.KanpekiGarden.items.rose_pink;
  byClass(g.root, "kg-tab").find((n) => n.textContent === rose.tab).click();
  byClass(g.root, "kg-card").find((n) => byClass(n, "kg-name")[0].textContent === rose.name).click();
  byClass(g.root, "kg-confirm")[0].all((n) => n.textContent === "かう")[0].click();
  const view = byClass(g.root, "kg-view")[0];
  const pointer = (type, target, x = 200, y = 150) =>
    view.on[type].forEach((f) => f({ type, pointerId: 1, clientX: x, clientY: y, target }));
  const touch = (id, dx = 0) => {
    const d = id == null ? null : node(g.root, id);
    const target = { closest: (sel) => (sel === ".kg-item" ? d : null) };
    pointer("pointerdown", target);
    if (dx) pointer("pointermove", target, 200 + dx, 150);
    pointer("pointerup", target, 200 + dx, 150);
  };
  touch(null);
  let s = saved(stored);
  assert.strictEqual(s.placed.length, 3);
  assert.strictEqual(s.placed[2].t, iso(TUE));
  assert.strictEqual(s.coins, 100 - rose.price);
  touch(null);                                                               // deselect
  // move
  const x = s.placed[1].x;
  touch(2);
  touch(2, 60);
  assert.notStrictEqual(saved(stored).placed[1].x, x);
  touch(2);
  // compost
  touch(1);
  g.root.all((n) => n.tagName === "button" && n.textContent === "はい")[0].click();
  s = saved(stored);
  assert.deepStrictEqual(s.placed.map((p) => p.id), [2, 3]);
  assert.strictEqual(s.vac, iso(MON));
});

test("a damaged vac stays on, from today", () => {
  for (const bad of [true, 5, "Monday", {}]) {
    const stored = stored2({ vac: bad, coins: 2 });
    assert.strictEqual(review(stored, at(TUE), 1), false, JSON.stringify(bad));
    assert.deepStrictEqual([saved(stored).vac, saved(stored).coins], [iso(TUE), 2]);
  }
});

test("a locked save (from a newer script) disables the switch and writes nothing", () => {
  const v3 = JSON.stringify({ v: 3, coins: 50, vac: null, things: [1, 2, 3] });
  const stored = { [KEY]: v3 };
  const g = look(stored, at(MON), 1);
  const sw = byClass(openSettings(g.root), "kg-vac")[0];
  assert.strictEqual(sw.disabled, true);
  // even if a tap got through
  sw.click();
  g.root.all((n) => n.tagName === "button" && n.textContent === "はい").forEach((b) => b.click());
  byClass(g.root, "kg-close")[0].click();
  assert.deepStrictEqual(stored, { [KEY]: v3 });
});
