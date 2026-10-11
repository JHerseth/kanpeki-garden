// The day starts at 04:00 on the wall clock, also on the days the clocks change. Pinned to central European time here
// (node --test runs each file in its own process, so this doesn't reach the other tests).
// Run: node --test tests/*.test.js
"use strict";
process.env.TZ = "Europe/Berlin";
const test = require("node:test");
const assert = require("node:assert");

const { KEY, page, openGarden } = require("./harness");

// skip where node has no time zone data
const cet = new Date(2026, 6, 1).getTimezoneOffset() === -120 && new Date(2026, 0, 1).getTimezoneOffset() === -60;

/** The day a card answered at local time y-m-d h:mi is recorded on. */
function dayAt(y, m, d, h, mi) {
  const stored = {};
  page(stored, { now: new Date(y, m - 1, d, h, mi).getTime() }).KanpekiGarden.earn("1");
  return Object.keys(JSON.parse(stored[KEY]).days)[0];
}

test("2026-03-29 (clocks go forward at 02:00): the day starts at 04:00, not 05:00", { skip: !cet && "no Europe/Berlin" }, () => {
  assert.strictEqual(dayAt(2026, 3, 29, 1, 59), "2026-03-28");
  assert.strictEqual(dayAt(2026, 3, 29, 3, 59), "2026-03-28");
  assert.strictEqual(dayAt(2026, 3, 29, 4, 0), "2026-03-29");
  assert.strictEqual(dayAt(2026, 3, 30, 3, 59), "2026-03-29");
  assert.strictEqual(dayAt(2026, 3, 30, 4, 0), "2026-03-30");
});

test("2026-10-25 (clocks go back at 03:00): the day starts at 04:00, not 03:00", { skip: !cet && "no Europe/Berlin" }, () => {
  assert.strictEqual(dayAt(2026, 10, 25, 2, 30), "2026-10-24");
  assert.strictEqual(dayAt(2026, 10, 25, 3, 0), "2026-10-24");
  assert.strictEqual(dayAt(2026, 10, 25, 3, 59), "2026-10-24");
  assert.strictEqual(dayAt(2026, 10, 25, 4, 0), "2026-10-25");
  assert.strictEqual(dayAt(2026, 10, 26, 3, 59), "2026-10-25");
});

test("a card pays once per day across a clock change", { skip: !cet && "no Europe/Berlin" }, () => {
  const stored = {};
  const pay = (d, h, mi) => page(stored, { now: new Date(2026, 9, d, h, mi).getTime() }).KanpekiGarden.earn("1").gained;
  assert.deepStrictEqual([pay(24, 20, 0), pay(25, 3, 30), pay(25, 4, 0), pay(25, 23, 0), pay(26, 4, 0)],
    [true, false, true, false, true]);
});

// vacation: which days it covers comes from the 04:00 day too
const at = (d, h, mi = 0) => new Date(2026, 9, d, h, mi).getTime();
function vacation(stored, when, on) {
  const root = openGarden(page(stored, { now: when }));
  root.all((n) => n.classList.contains("kg-vac"))[0].click();
  if (on) root.all((n) => n.tagName === "button" && n.textContent === "はい")[0].click();
}
/** The first placed plant's life at `when`. */
function lifeAt(stored, when) {
  const g = page(stored, { now: when }).KanpekiGarden, s = g.load();
  return g.life(s, s.placed[0]);
}
const garden = () => ({ [KEY]: JSON.stringify({ v: 2, coins: 0, earned: 0, seen: {}, inv: {}, next: 2,
  placed: [{ id: 1, k: "rose_pink", x: 500, y: 600, t: "2026-10-20", g: 2 }], days: { "2026-10-22": 1, "2026-10-23": 1 } }) });

test("vacation on the night the clocks go back covers only the day it was on", { skip: !cet && "no Europe/Berlin" }, () => {
  const stored = garden();
  vacation(stored, at(24, 20), true);
  assert.strictEqual(page(stored, { now: at(25, 3, 30) }).KanpekiGarden.earn("1").gained, false);
  vacation(stored, at(25, 3, 45), false);                             // still the 24th
  assert.deepStrictEqual(JSON.parse(stored[KEY]).days, { "2026-10-22": 1, "2026-10-23": 1, "2026-10-24": 2 });
  // the 24th isn't missed: the 25th and 26th are, so dying from the 27th 04:00 (not the 26th)
  assert.strictEqual(lifeAt(stored, at(26, 4)).missed, 1);
  assert.strictEqual(lifeAt(stored, at(27, 3, 59)).missed, 1);
  assert.strictEqual(lifeAt(stored, at(27, 4)).missed, 2);
});

test("vacation over the clock change freezes exactly the days it was on", { skip: !cet && "no Europe/Berlin" }, () => {
  const stored = garden();
  vacation(stored, at(24, 3, 59), true);                              // the 23rd, late
  for (const [d, h, mi] of [[24, 4], [25, 2], [25, 3], [25, 4], [26, 3, 59], [27, 3]]) {
    assert.strictEqual(lifeAt(stored, at(d, h, mi)).missed, 0, d + " " + h);
  }
  vacation(stored, at(27, 4, 1), false);
  const days = JSON.parse(stored[KEY]).days;
  assert.deepStrictEqual(days, { "2026-10-22": 1, "2026-10-23": 3, "2026-10-24": 2, "2026-10-25": 2, "2026-10-26": 2,
    "2026-10-27": 2 });
  assert.strictEqual(lifeAt(stored, at(28, 4)).missed, 0);
  assert.strictEqual(lifeAt(stored, at(29, 4)).missed, 1);
});

// the test day moves by calendar days, so a clock change never skips or repeats one
test("the dev day offset across the clock changes lands on the right day", { skip: !cet && "no Europe/Berlin" }, () => {
  /** The day card 1 is recorded on at local time y-m-d h:mi with a stored offset of `by` days. */
  function shifted(by, y, m, d, h, mi) {
    const stored = { "kanpekikun-garden-dev-day": String(by) };
    openGarden(page(stored, { now: new Date(y, m - 1, d, h, mi).getTime() }), 1, { dev: "1" });
    return JSON.parse(stored[KEY]).seen["1"];
  }
  assert.strictEqual(shifted(1, 2026, 10, 24, 4, 30), "2026-10-25");      // + 24 h would be 03:30, still the 24th
  assert.strictEqual(shifted(-1, 2026, 10, 26, 3, 30), "2026-10-24");     // − 24 h would be 04:30, the 25th
  assert.strictEqual(shifted(1, 2026, 10, 25, 3, 30), "2026-10-25");
  assert.strictEqual(shifted(-1, 2026, 3, 30, 4, 30), "2026-03-29");      // − 24 h would be 03:30, the 28th
  assert.strictEqual(shifted(1, 2026, 3, 28, 3, 30), "2026-03-28");       // + 24 h would be 04:30, the 29th
  assert.strictEqual(shifted(1, 2026, 3, 28, 2, 30), "2026-03-28");       // 02:30 on the 29th doesn't exist
  // and with the button: the 24th 04:30, +1 → the 25th; a card then pays on the 25th
  const stored = {};
  const root = openGarden(page(stored, { now: at(24, 4, 30) }), 1, { dev: "1" });
  root.all((n) => n.textContent === "+1日" && n.tagName === "button")[0].click();      // the label is hidden at 0
  openGarden(page(stored, { now: at(24, 4, 30) }), 2, { dev: "1" });
  assert.deepStrictEqual(JSON.parse(stored[KEY]).seen, { 1: "2026-10-24", 2: "2026-10-25" });
});
