/* かんぺきくん garden: coins for reviewing in AnkiDroid, spent on plants for a garden.
 *
 * Card template (answer side):
 *     <div id="kg" data-kg="garden" data-card="{{CardID}}"></div>
 *     <script src="_garden.js"></script>
 * data-kg="garden": coin chip that opens the garden; "toast": only a short "+1" on the card.
 * data-lang="en": every text in English, item names too (TEXT.en); without it, or with any other value, Japanese.
 * The save is the same in both, so a template can switch at any time.
 * data-dev="1" (only in a test profile's templates, never in the ones the player studies with): the garden's
 * settings get a 「テスト」 section: 「+100」 adds coins without counting them in earned, 「+150」 places 150 mature
 * plants for free (a performance test), and 「−1日」「+1日」 move the garden's day (the test day offset; see
 * today()). Without it nothing changes, and a stored day offset is never read.
 *
 * Coins and the garden live in AnkiDroid's localStorage (Settings → Advanced → localStorage in
 * Study Screen), so they stay on the phone and are not synced. A card pays one coin per day
 * (the day starts at 04:00, as in Anki), so undo or showing the answer again pays nothing.
 * No AnkiDroid JS API: the new study screen does not support it yet.
 * Shown only in AnkiDroid's new study screen, the one page that loads ankidroid-reviewer.js;
 * desktop Anki, the previewer and the card browser show nothing and pay nothing.
 *
 * Life cycle: a placed plant grows one stage for each finished day with reviews (the planting day
 * too), is dying after 2 finished days in a row without reviews and dead after 4. A review brings
 * a dying plant back at once; a dead one only goes to the compost (+25% of its price). With 2 or more
 * dead, its compost question also offers 「ぜんぶ ×n」, compost all: every dead plant at once, each paying
 * its own 25%, in one save (askAll); dying ones, which can still recover, stay. The garden
 * runs only while a card is open, so it never ticks: the save keeps the days that had reviews,
 * and each plant's stage is worked out from them whenever the garden loads (lifeOf).
 * Plants can be moved but not put back in もちもの; decorations can.
 *
 * Harvest: every plant on the やさい tab and the fruit trees (cropOf) has a crop to pick once it has been mature
 * through a growth day (a finished day with reviews) since it matured or was last picked. One at most, however many
 * growth days pass; none while it's dying or dead (one it had is lost then, and the day it comes back on brings the
 * next) or while vacation is on. Like its stage, its crop is worked out from the save whenever the garden loads
 * (lifeOf). A ready plant shows a still glint above it, swaying with it (showCrop); a tap picks it for ¤2 (a
 * vegetable) or ¤5 (a fruit tree), with the coins floating up from it, and the next tap selects it as before. Picking
 * pays PICK_CAP (¤50) a day at most: later picks clear the crop for nothing, and the first that the cap cuts short
 * in a day says so in the hint (harvest). Its coins aren't counted in earned.
 *
 * Maps (MAPS): the home map, 「わたしのにわ」, and two more, 「かわべの はらっぱ」 and 「たきの たかだい」. A map's signpost is its
 * key: the shop's とち tab sells 「かわべの はらっぱ」's for ¤500, then, once that is owned, 「たきの たかだい」's for ¤1000
 * (buying spends coins but leaves earned as it is), and the home map's is owned from the start, free. Owned signs stay
 * in もちもの for good: placing one doesn't use it up, but a map takes one of each at most, and never its own (a sign
 * that can't go on the map shown is greyed, with why). A placed sign is an item (sign_<map>) like a decoration: the
 * first tap selects it, to drag it, flip its arrow (↔) or put it away (しまう), with a label over it, 「かわべの はらっぱ
 * へ ▶」; a second tap on it or its label walks there. A walk fades the view over to the next map, centred on its sign
 * back to the map left, or on its middle without one; a map's picture loads the first time the player walks there,
 * and the garden opens on the map visited last. Placed items belong to the map they were placed on, and placing,
 * moving, putting away, composting, compost all, picking and the butterflies only see the map shown; coins, もちもの,
 * the shop and vacation are shared, and the life cycle runs on every map, shown or not.
 *
 * Settings: the gear in the garden's top bar opens a panel with this phone's motion preferences
 * (prefSwitch), the vacation switch, on a dev slot the test section, and at the bottom the build's version
 * (KG_VERSION), in small quiet text, to tell builds apart when someone reports a problem.
 *
 * Vacation (おやすみ): a switch in the garden's settings that the player turns on and off. While it's on the
 * garden is frozen: no growth, no wilting, no dying, no crops (one ready before waits for it to end), and no
 * coins, but a card answered then still uses up its coin for the day. A day it was on at some point is never a
 * missed day; reviews made while it was off still make it a growth day. Shopping, placing, moving and composting
 * all still work.
 *
 * Sway: flowers, vegetables, shrubs and trees sway in a breeze, a CSS animation on each picture (swayOf);
 * the settings' 「くさばなが ゆれる」 and reduced motion stop it.
 *
 * Butterflies: one for every 5 living flowers, at most 6 (butterflies, blooms), fly about the open garden and
 * now and then sit on a flower, riding its sway. A requestAnimationFrame loop moves them, only while there are
 * some, the garden is open and the page is shown. None on vacation; 「ちょうちょが とぶ」 and reduced motion stop them.
 *
 * Shop fold: ▼ folds the shop down to its tab row (▶ sideways: a strip of tabs written top to bottom), and ▲/◀
 * or any tab opens it; this phone remembers which (fold). Upright, a fold at whole-map view zooms the map to fill the
 * view's height, and opening goes back to the whole map. While the player places something the shop folds by
 * itself and opens again after (setPlacing).
 *
 * Built by scripts/build_assets.py, which puts KG_CATALOG / KG_ATLAS / KG_SCALE / KG_REMOVED in front of this file,
 * and KG_VERSION: "dev", or the release's version (e.g. "1.2.0") that scripts/release.py stamps in.
 */
(function () {
  "use strict";
  var KEY = "kanpekikun-garden-2";          // the save, v: 3 (the key is v: 2's: an older script finds it and locks)
  // v: 1's save: moved over once and then left alone, so an old copy of this script (cached, or put
  // back) still finds its own save instead of starting fresh over the new one
  var OLD_KEY = "kanpekikun-garden";
  // the test day offset: whole days today() adds, kept apart from the save; only a dev slot reads it
  var DAY_KEY = "kanpekikun-garden-dev-day";
  var shift = 0;
  // this phone's preferences, kept apart from the save: {name: false} for each one switched off. The motion
  // switches, and shop: false while the shop is folded
  var PREFS_KEY = "kanpekikun-garden-opts";
  // the sideways layout: the shop on the right, beside the map, instead of under it
  var SIDEWAYS = "(orientation:landscape) and (max-height:500px)";
  // the build's version, shown at the bottom of the settings: "dev" unless a release stamped one in
  var VERSION = typeof KG_VERSION === "string" && KG_VERSION ? KG_VERSION : "dev";
  var BASE = window.KG_BASE || "";          // media folder; Anki serves media next to the card
  var WORLD_W = 2000, WORLD_H = 1116;
  var POND = [1655, 685, 270, 180];         // the home map's pond, round its stones: centre x, y and radii x, y
  /* The maps, in the order the top bar's dots show them and the shop sells their signs; their names are T.maps, in
   * the same order. Each has:
   *   key: its name in the save (s.maps, s.at, a placed item's m); home is the one every garden starts with, free.
   *   bg: its picture in the media folder, WORLD_W x WORLD_H like every map (scripts/build_assets.py makes it).
   *   price: the coins its sign (sign_<key>) costs, which unlocks it; on sale once the map before it is open.
   *   water: its water as ellipses [centre x, y, radii x, y], which 「+150」 keeps out of (the player isn't kept out).
   * Each map's paths, bridge or stairs at its edges are where the player might put its signs; the game doesn't say. */
  var MAPS = [
    { key: "home", bg: "_garden_bg.webp", price: 0, water: [POND] },
    { key: "riverside", bg: "_garden_bg_riverside.webp", price: 500,
      // the stream, from the bushes on the left, under the bridge, to the falls on the right
      water: [[230, 860, 90, 70], [370, 950, 100, 70], [560, 1000, 130, 50], [760, 1005, 110, 45], [1120, 1025, 130, 45],
        [1340, 1000, 110, 55], [1580, 945, 160, 60], [1800, 900, 90, 60], [1880, 830, 60, 80]] },
    { key: "waterfall", bg: "_garden_bg_waterfall.webp", price: 1000,
      water: [[1770, 535, 185, 110], [1845, 130, 50, 150], [1855, 330, 45, 100]] }  // the pool, and the falls into it
  ];
  var MAP = {};
  MAPS.forEach(function (m, i) { m.n = i; MAP[m.key] = m; });
  /** Map `key`'s entry in MAPS, or null for anything that isn't a map's key ("toString" too). */
  function mapOf(key) { return typeof key === "string" && Object.prototype.hasOwnProperty.call(MAP, key) ? MAP[key] : null; }
  /** Whether garden spot x, y is in map m's water. */
  function wet(m, x, y) {
    return m.water.some(function (w) { return Math.pow((x - w[0]) / w[2], 2) + Math.pow((y - w[1]) / w[3], 2) < 1; });
  }
  // the signpost every map's sign is drawn with: a frame like an item's (catalog.js's KG_SIGN), its arrow pointing right
  var SIGN = { a: KG_SIGN[0], x: KG_SIGN[1], y: KG_SIGN[2], w: KG_SIGN[3], h: KG_SIGN[4], ax: KG_SIGN[5], ay: KG_SIGN[6] };
  /** The map placed item or item key k's sign leads to, or null for anything but a sign. */
  function signTo(k) {
    var item = ITEMS[k && typeof k === "object" ? k.k : k];
    return item && item.to || null;
  }
  var TABS = ["もちもの", "花", "はちうえ", "やさい", "草木", "木", "かざり", "とち"];
  var ITEMS = {};
  KG_CATALOG.forEach(function (e) {
    // frames (format in catalog.js): a, x, y, w, h on atlas a; ax, ay: the anchor that goes on the item's place.
    // pic: the frame that shows the item, its mature frame (the last growth frame) or its only one.
    var frames = e[6].map(function (f) { return { a: f[0], x: f[1], y: f[2], w: f[3], h: f[4], ax: f[5], ay: f[6] }; });
    ITEMS[e[0]] = { key: e[0], name: e[1], en: e[2], tab: e[3], price: e[4], sold: e[5], frames: frames,
      pic: frames[frames.length > 1 ? frames.length - 3 : 0] };
  });

  // ---- text ----------------------------------------------------------------------------------
  /* Every piece of the UI's text, one table per language with the same keys: TEXT.ja, or TEXT.en on a slot with
   * data-lang="en" (langOf). tabs: the shop tabs' labels, in TABS' order (TABS' own names stay the keys the catalog
   * and the code use). name(ja, en): an item's name, from its two in the catalog. Text with a number in it is a
   * function of the number; a ¤ in a text is where a coin goes (coined). */
  var TEXT = {
    ja: {
      tabs: ["もちもの", "花", "はちうえ", "やさい", "草木", "木", "かざり", "とち"],
      name: function (ja) { return ja; },
      // the card's chip and toast
      openGarden: "にわを ひらく",
      openResting: "にわを ひらく（おやすみ中）",
      resting: "おやすみ中",
      toast: function (n) { return "¤ +1（" + n + "）"; },
      // the top bar and the map
      garden: "にわ",
      maps: ["わたしのにわ", "かわべの はらっぱ", "たきの たかだい"],      // MAPS' names, in its order
      settings: "せってい",
      close: "とじる",
      zoomIn: "おおきく",
      zoomOut: "ちいさく",
      // hints over the map
      tapToPlace: "タップ して おいてね",
      cancel: "やめる",
      compost: function (n) { return "たいひにする？ ¤+" + n; },
      // compost all: the button beside 「はい」 with the count of dead plants, then its question with their coins
      compostAll: function (n) { return "ぜんぶ " + TEXT.ja.count(n); },
      compostAllAsk: function (n, back) { return "かれた くさばな " + TEXT.ja.count(n) + " を ぜんぶ たいひにする？ ¤+" + back; },
      // the harvest's note, after the first pick in a day that the day's cap of n coins cut short
      pickCap: function (n) { return "きょうの しゅうかくは ¤" + n + " まで"; },
      yes: "はい",
      drag: "ゆびで うごかせるよ",
      putAway: "しまう",
      ok: "OK",
      // the maps' signs: a sign's name; the label over a selected one (its arrow as the sign's, \uFE0E: never an emoji),
      // and its hint's flip; why one in もちもの can't go on this map; one bought in the とち tab
      sign: function (name) { return name + " の かんばん"; },
      goTo: function (name, left) { return left ? "◀\uFE0E " + name + " へ" : name + " へ ▶\uFE0E"; },
      goLabel: function (name) { return name + " へ いく"; },
      flip: "やじるしの むきを かえる",
      signHere: "いまの にわだよ",
      signPlaced: "もう おいてあるよ",
      owned: "もっているよ",
      // the shop
      emptyBag: "まだ なにも もっていないよ。おみせで かってね。",
      emptyTab: "ここには なにも ないよ。",
      buyAsk: function (price, left) { return "¤" + price + " で かう？ のこりは " + left; },
      buy: "かう",
      tooFew: function (n) { return "あと " + n + " コイン たりないよ。カードを がんばろう！"; },
      openShop: "おみせを ひらく",
      foldShop: "おみせを たたむ",
      // notes
      listSep: "、",
      count: function (n) { return "×" + n; },
      goneFromShop: function () { return " は おみせから なくなったよ。"; },
      locked: "いまは にわを ひらけないよ",
      noStorage: "AnkiDroid の せっていで「localStorage in Study Screen」を オンに してね",
      // the settings
      closeSettings: "せっていを とじる",
      motionOff: "スマホの せっていで とまっているよ",
      sway: "くさばなが ゆれる",
      butterflies: "ちょうちょが とぶ",
      vacation: "おやすみ",
      vacationAsk: "おやすみに する？",
      vacationKeep: "にわが とまるよ。コインは もらえないよ。",
      test: "テスト",
      testCoins: "テスト：コイン +100",
      testPlants: "テスト：しょくぶつ +150",
      dayBack: "−1日",
      dayOn: "+1日",
      testDayBack: "テスト：1日 もどす",
      testDayOn: "テスト：1日 すすめる",
      dayMoved: function (n) { return "きょう" + signed(n) + "日 ✕"; },
      testDayMoved: function (n) { return "テスト：きょうを " + signed(n) + "日 ずらしている（タップで もどす）"; }
    },
    en: {
      tabs: ["Bag", "Flowers", "Pots", "Veggies", "Greenery", "Trees", "Decor", "Land"],
      name: function (ja, en) { return en; },
      openGarden: "Open the garden",
      openResting: "Open the garden (on vacation)",
      resting: "On vacation",
      toast: function (n) { return "¤ +1 (" + n + ")"; },
      garden: "Garden",
      maps: ["My garden", "Riverside meadow", "Waterfall plateau"],
      settings: "Settings",
      close: "Close",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      tapToPlace: "Tap to put it down",
      cancel: "Cancel",
      compost: function (n) { return "Compost it? ¤+" + n; },
      compostAll: function (n) { return "All ×" + n; },
      compostAllAsk: function (n, back) { return "Compost all " + n + " dead plants? ¤+" + back; },
      // \u00a0: wrapped on a phone, "each day" goes to the second line together
      pickCap: function (n) { return "You can earn up to ¤" + n + " from picking each\u00a0day"; },
      yes: "Yes",
      drag: "Drag it to move it",
      putAway: "Put away",
      ok: "OK",
      sign: function (name) { return "Sign to " + name; },
      goTo: function (name, left) { return left ? "◀\uFE0E " + name : name + " ▶\uFE0E"; },
      goLabel: function (name) { return "Go to " + name; },
      flip: "Turn the arrow around",
      signHere: "You're in this garden",
      signPlaced: "Already here",
      owned: "Owned",
      emptyBag: "Your bag is empty. Buy something in the shop!",
      emptyTab: "Nothing here.",
      buyAsk: function (price, left) { return "Buy for ¤" + price + "? You'll have " + left + " left."; },
      buy: "Buy",
      tooFew: function (n) {
        return "You need " + n + (n === 1 ? " more coin" : " more coins") + ". Keep going with your cards!";
      },
      openShop: "Show the shop",
      foldShop: "Hide the shop",
      listSep: ", ",
      count: function (n) { return " ×" + n; },
      goneFromShop: function (many) { return many ? " are gone from the shop." : " is gone from the shop."; },
      locked: "The garden can't open right now",
      noStorage: "Turn on \"localStorage in Study Screen\" in AnkiDroid's settings (Advanced)",
      closeSettings: "Close settings",
      motionOff: "Turned off in your phone's settings",
      sway: "Plants sway",
      butterflies: "Butterflies fly",
      vacation: "Vacation",
      vacationAsk: "Go on vacation?",
      vacationKeep: "The garden stops. No coins until you turn it off.",
      test: "Test",
      testCoins: "Test: 100 more coins",
      testPlants: "Test: add 150 plants",
      dayBack: "−1 day",
      dayOn: "+1 day",
      testDayBack: "Test: one day back",
      testDayOn: "Test: one day forward",
      dayMoved: function (n) { return signed(n) + (Math.abs(n) === 1 ? " day" : " days") + " ✕"; },
      testDayMoved: function (n) {
        return "Test: today " + signed(n) + (Math.abs(n) === 1 ? " day" : " days") + " (tap to reset)";
      }
    }
  };
  // the maps' signs, as items of the とち tab: sign_<map>, priced as the map, one frame (the signpost), to: the map
  MAPS.forEach(function (m, i) {
    var key = "sign_" + m.key;
    ITEMS[key] = { key: key, name: TEXT.ja.sign(TEXT.ja.maps[i]), en: TEXT.en.sign(TEXT.en.maps[i]), tab: "とち",
      price: m.price, sold: true, frames: [SIGN], pic: SIGN, to: m.key };
  });

  /** The language of a card slot's text: "en" with data-lang="en", else "ja". */
  function langOf(slot) { return slot.dataset.lang === "en" ? "en" : "ja"; }
  /** Mark node n as text in lang, for its font and screen readers; Japanese, the garden's own, stays unmarked. */
  function inLang(n, lang) {
    if (lang !== "ja") n.setAttribute("lang", lang);
    return n;
  }
  /** Whole number n with its sign: +2, −1 (a minus sign, not a hyphen). */
  function signed(n) { return (n > 0 ? "+" : "−") + Math.abs(n); }

  // ---- state -------------------------------------------------------------------------------
  /* Save, v: 3:
   *   coins, earned; seen {cardId: day it last paid}; inv {key: count}; next: the next placed id;
   *   placed [{id, k, x, y, m?, f?, t?, g?, h?, dead?}]: m is the map it was placed on (MAPS' key; left out for
   *     home); a map's sign is k: sign_<map>, with f: 1 while its arrow points left (flipped); t is the day a
   *     plant joined the life cycle (placed, or enrolled), g the stage it joined at (0 if left out), h the day its
   *     crop was last picked (left out until the first pick), dead the day it was first found dead, so it
   *     stays dead even if the phone's clock goes back. No t: outside the life cycle (decorations, and
   *     plants without stage art, which stay at their one frame until their strip comes; see enrol).
   *   days {day: flags}: REVIEWED for a day with reviews (made while vacation was off), VACATION for a
   *     day vacation was on at some point. VACATION is written when it is switched off, for every day
   *     from vac through that day, so days alone tell the walk which days were frozen;
   *   vac: while vacation is on, the day it was switched on. Left out while it's off.
   *   maps: the maps whose signs the player owns, so they're open, besides home (whose sign everyone owns), in the
   *     order bought; left out while there are none. Signs are never in inv: owning one is being in maps.
   *   at: the map the player was on last, where the garden opens; left out for home.
   *   picked {day, coins}: the crops picked on that day, as the coins they were worth together, paid or not (picking
   *     pays PICK_CAP a day at most; see harvest). One from a day before today counts as none. Left out until the
   *     first pick.
   * Days are YYYY-MM-DD, starting at 04:00 (today()). v: 1 had no t, g, days or vac; v: 2 no maps, at or m, so it
   * moves over as it is, with everything on home. h and picked came after v: 3 without changing it: a v: 3 script
   * from before them keeps fields it doesn't know, on the save and on placed items, so it loads and saves them as
   * they are.
   * The save is on the player's phone alone, so one written over is a garden gone. Damage that load() can mend is
   * mended and the rest kept (tidyFields, tidyMaps); a save it can't read at all is locked and never written over. */
  var REVIEWED = 1, VACATION = 2;
  var DYING = 2, DEAD = 4;                  // finished days in a row without reviews
  function fresh() { return { v: 3, coins: 0, earned: 0, seen: {}, inv: {}, placed: [], next: 1, days: {} }; }
  /** The save; the old key's is moved over the first time (v: 1, or v: 2 from a test build), and a v: 2 save
   *  becomes v: 3 as it is (an older script, which wants v: 2, then locks it as below). Damaged fields are mended
   *  (tidyFields, tidyMaps), and the save written once for it. No save under KEY starts fresh, and so does an old
   *  key's that isn't v: 1 or v: 2 (or isn't an object): only KEY is ever written, so the old key's stays as it is.
   *  A save under KEY that this script can't read is never written over: one from a newer script (any v but 2 or
   *  3), one that isn't JSON or isn't an object, and any other that makes a step here throw (an old key's that isn't
   *  JSON, and storage that can't be read, too). This one then gives a locked, empty garden that save() won't store
   *  and earn() won't pay into, and the garden only says it can't open; with no localStorage at all (AnkiDroid's
   *  「localStorage in Study Screen」 off), it names that setting instead. */
  function load() {
    try {
      if (!window.localStorage) return locked(true);
      var raw = localStorage.getItem(KEY), changed = false, s;
      if (raw == null) {
        s = JSON.parse(localStorage.getItem(OLD_KEY));
        if (!s || (s.v !== 1 && s.v !== 2)) return fresh();
        s.v = 3;
        changed = true;
      } else {
        s = JSON.parse(raw);
        if (!s || typeof s !== "object") return locked();
        if (s.v === 2) { s.v = 3; changed = true; }
        else if (s.v !== 3) return locked();
      }
      if (tidyFields(s)) changed = true;
      if (tidyMaps(s)) changed = true;
      if (refundRemoved(s)) changed = true;
      if (s.vac != null && !isDay(s.vac)) { s.vac = today(); changed = true; }    // damaged: still on, from today
      if (enrol(s)) changed = true;
      if (markDead(s)) changed = true;
      if (changed) save(s);
      return s;
    } catch (e) { return locked(); }    // unreadable, or damage nothing here foresaw: leave the stored save be
  }
  /** A locked, empty save (see load). nostore: there's no localStorage at all, so the garden's note names the setting
   *  that turns it on. Both are left out of the JSON, as save() never stores a locked save anyway. */
  function locked(nostore) {
    var s = fresh();
    Object.defineProperty(s, "locked", { value: true });
    if (nostore) Object.defineProperty(s, "nostore", { value: true });
    return s;
  }
  function save(s) {
    if (s.locked) return false;
    try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  }

  /** Whether v is an object as JSON gives one: not null, and not an array. */
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  /** Whether v is a number and finite (JSON has no NaN; 1e999 parses to Infinity). */
  function finite(v) { return typeof v === "number" && isFinite(v); }
  /** Mend the fields every part of the garden reads, after damage, each so that nothing throws on it or quietly
   *  loses what the player has. Whether it changed anything.
   *  - placed: an array (a missing or non-array one becomes []) of objects (null, a number or an array in it is
   *    dropped, the rest kept). A plant's g that isn't a whole number from 0 is dropped, so it's at stage 0: any
   *    other picks no frame and the map can't be drawn. A damaged t is enrol's to mend (it joins again today). An h
   *    that isn't a day is dropped, as if it had never been picked: a crop it may then have again is a few coins,
   *    where a guess at the day could lose one.
   *  - ids and next: next goes past every id, and every placed item gets an id of its own. Without that, a missing
   *    next gives new items id NaN, stored as null, and the next opening's null++ counts from 0 into ids in use;
   *    two items with one id are taken away together (takeAway) though only one is paid for or put back. An item
   *    whose id is missing, not a finite number, or taken by one before it gets the next id; ids only tie a placed
   *    item to its node and selection within one opening, so a new one loses nothing.
   *  - inv, seen and days: objects; a missing or non-object one becomes {}.
   *  - coins and earned: finite numbers; anything else becomes its Number() if that's finite, else 0 (a string
   *    "500" would otherwise earn a coin as "5001").
   *  - refunded: {items: object, coins: finite number}, or left out; a damaged one is dropped, as showing it throws.
   *  - picked: {day: a day, coins: a finite number from 0}, or left out; a damaged one is dropped, so nothing counts
   *    as picked today (a coins of "12" would otherwise add up as a string, and one below 0 pay past the cap). */
  function tidyFields(s) {
    var changed = false;
    if (!Array.isArray(s.placed)) { s.placed = []; changed = true; }
    else if (!s.placed.every(isObj)) { s.placed = s.placed.filter(isObj); changed = true; }
    s.placed.forEach(function (p) {
      if ("g" in p && !(Number.isInteger(p.g) && p.g >= 0)) { delete p.g; changed = true; }
      if ("h" in p && !isDay(p.h)) { delete p.h; changed = true; }
    });
    var top = 0, used = {};
    s.placed.forEach(function (p) { if (finite(p.id) && p.id > top) top = p.id; });
    if (!finite(s.next) || s.next <= top) { s.next = Math.floor(top) + 1; changed = true; }
    s.placed.forEach(function (p) {
      if (!finite(p.id) || used[p.id]) { p.id = s.next++; changed = true; }
      used[p.id] = true;
    });
    ["inv", "seen", "days"].forEach(function (f) {
      if (!isObj(s[f])) { s[f] = {}; changed = true; }
    });
    ["coins", "earned"].forEach(function (f) {
      if (finite(s[f])) return;
      var n = Number(s[f]);
      s[f] = isFinite(n) ? n : 0;
      changed = true;
    });
    if ("refunded" in s && !(isObj(s.refunded) && isObj(s.refunded.items) && finite(s.refunded.coins))) {
      delete s.refunded;
      changed = true;
    }
    if ("picked" in s && !(isObj(s.picked) && isDay(s.picked.day) && finite(s.picked.coins) && s.picked.coins >= 0)) {
      delete s.picked;
      changed = true;
    }
    return changed;
  }

  /** Whether map `key` is open in save s: home, or one whose sign the player owns. */
  function opened(s, key) { return key === "home" || Array.isArray(s.maps) && s.maps.indexOf(key) >= 0; }
  /** The key of the map the player is on in save s. */
  function mapAt(s) { return s.at || "home"; }
  /** The key of the map placed item p is on. */
  function onMapOf(p) { return p.m || "home"; }
  /** Keep the save's maps to what a v: 3 save holds, after damage: maps, known maps but home, each once (left out
   *  when none); at, an open map (left out for home); a placed item's m, an open map (left out for home); placed signs
   *  only to open maps, never on their own map, one of each on a map, f only as 1; and no sign in inv. Anything
   *  else falls back to home, or is dropped. Whether it changed anything. */
  function tidyMaps(s) {
    var changed = false;
    if ("maps" in s) {
      var keep = Array.isArray(s.maps) ? s.maps.filter(function (k, i) {
        return mapOf(k) && k !== "home" && s.maps.indexOf(k) === i;
      }) : [];
      if (!keep.length) { delete s.maps; changed = true; }
      else if (keep.length !== s.maps.length) { s.maps = keep; changed = true; }
    }
    function home(o, f) {
      if (!(f in o) || o[f] !== "home" && mapOf(o[f]) && opened(s, o[f])) return;
      delete o[f];
      changed = true;
    }
    home(s, "at");
    if (Array.isArray(s.placed)) {
      s.placed.forEach(function (p) { if (p && typeof p === "object") home(p, "m"); });
      var seen = {};
      s.placed = s.placed.filter(function (p) {
        var to = p && typeof p === "object" && typeof p.k === "string" && signTo(p.k);
        if (!to) return true;
        var spot = onMapOf(p) + " " + p.k;          // one of each sign per map: the same sign on two maps is fine
        if (!opened(s, to) || to === onMapOf(p) || seen[spot]) { changed = true; return false; }
        seen[spot] = true;
        if ("f" in p && p.f !== 1) { delete p.f; changed = true; }
        return true;
      });
    }
    if (s.inv && typeof s.inv === "object") {
      for (var k in s.inv) if (signTo(k)) { delete s.inv[k]; changed = true; }
    }
    return changed;
  }

  /** Pay back items no longer sold (KG_REMOVED), placed or in もちもの, and take them away.
   *  s.refunded {items: {name: count}, coins} is the note the garden shows once. */
  function refundRemoved(s) {
    if (!Array.isArray(s.placed) || !s.inv || typeof s.inv !== "object") return false;   // damaged save: leave it be
    var got = {}, coins = 0;
    function take(k, n) {
      var name = KG_REMOVED[k][0];
      got[name] = (got[name] || 0) + n;
      coins += KG_REMOVED[k][2] * n;
    }
    s.placed = s.placed.filter(function (p) {
      if (!KG_REMOVED[p.k]) return true;
      take(p.k, 1);
      return false;
    });
    Object.keys(s.inv).forEach(function (k) {
      if (!KG_REMOVED[k]) return;
      take(k, s.inv[k]);
      delete s.inv[k];
    });
    if (!coins) return false;
    s.coins += coins;
    var note = s.refunded || (s.refunded = { items: {}, coins: 0 });
    for (var name in got) note.items[name] = (note.items[name] || 0) + got[name];
    note.coins += coins;
    return true;
  }

  /** Put placed plants into the life cycle once their item has stage frames: a v: 1 save's plants,
   *  and one placed before its strip came. They join mature, with today as their last review day.
   *  A plant whose day t is damaged joins again today, at its stage. */
  function enrol(s) {
    if (!Array.isArray(s.placed)) return false;
    var day = today(), changed = false;
    s.placed.forEach(function (p) {
      var item = p && ITEMS[p.k];
      if (!item || item.frames.length < 2 || isDay(p.t)) return;
      if (p.t == null) p.g = item.frames.length - 3;
      p.t = day;
      changed = true;
    });
    return changed;
  }
  /** Note the day each plant is first found dead (see lifeOf). */
  function markDead(s) {
    if (!Array.isArray(s.placed)) return false;
    var hist = history(s), changed = false;
    s.placed.forEach(function (p) {
      if (!p || p.dead) return;
      var life = lifeOf(s, p, hist);
      if (life && life.dead) { p.dead = today(); changed = true; }
    });
    return changed;
  }

  /** Today as YYYY-MM-DD, with the day starting at 04:00 like Anki's: 04:00 on the clock, DST days too.
   *  On a dev slot, moved by shift calendar days (not 24 h each, so a clock change can't skip a day). */
  function today() {
    var d = new Date(window.KG_CLOCK ? window.KG_CLOCK() : Date.now());
    if (d.getHours() < 4) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12);
    if (shift) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + shift, 12);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  /** The stored test day offset; read only for a slot with data-dev="1". */
  function devShift() {
    try {
      var n = Number(localStorage.getItem(DAY_KEY));
      return Number.isInteger(n) && Math.abs(n) <= 36500 ? n : 0;
    } catch (e) { return 0; }
  }
  function isDay(v) { return typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v); }
  /** A day as a number that goes up by one a day. */
  function dayNo(day) { return Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 864e5; }
  /** dayNo's day back as YYYY-MM-DD. */
  function dayOf(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  /** s.days as [[dayNo, flags], ...], oldest first: worked out once and shared by every plant's lifeOf. */
  function history(s) {
    return Object.keys(s.days).filter(isDay).map(function (d) { return [dayNo(d), s.days[d]]; })
      .sort(function (a, b) { return a[0] - b[0]; });
  }

  // Harvest: what a crop pays when it's picked, by the plant: VEG_PAY for every plant on the やさい tab, FRUIT_PAY for
  // the FRUIT trees; flowers, pots, 草木 and the other trees have none. Picking pays PICK_CAP a day at most (harvest)
  var VEG_PAY = 2, FRUIT_PAY = 5, PICK_CAP = 50;
  var FRUIT = ["apple", "orange_tree", "pear_tree"];
  /** The coins a crop of item pays when it's picked, or 0 for an item that has no crop. */
  function cropOf(item) { return item.tab === "やさい" ? VEG_PAY : FRUIT.indexOf(item.key) >= 0 ? FRUIT_PAY : 0; }

  /** Where placed plant p is in its life cycle now: {g: growth stage, missed: finished days in a row
   *  without reviews, dead, crop}, or null outside the life cycle. Worked out from s.days, s.vac and p.h alone
   *  (hist: its history(), if at hand), so it comes out the same whenever it is asked. Its day t counts as a
   *  review day whatever happens on it, and as a growth day if it had reviews, like any other day. Only
   *  finished days grow it or count as missed; a review today brings a dying plant back now. Vacation days
   *  (VACATION, and every day since vac while it's on) are frozen: they neither count as missed nor end a run
   *  of missed days. Once found dead (p.dead) it stays dead.
   *  crop: whether it has a crop to pick, for a plant that has one (cropOf): once it has been mature through a growth
   *  day since it matured or was last picked, that is once a growth day is over that's on or after both the first day
   *  it was mature (t, if it joined mature) and the day it was last picked (p.h). One crop at most, however many
   *  growth days pass. A dying plant loses its crop, and the first day that can bring the next is the one it came back
   *  on (a growth day once it's over, as it is for growth). None while it's dying or dead, or while vacation is on: a
   *  crop ready before waits for it to end, and vacation days are no growth days. The walk notes the first day it's
   *  mature and its last growth day as it goes, so the crop needs no second walk over the days. */
  function lifeOf(s, p, hist) {
    var item = ITEMS[p.k];
    if (!item || p.t == null || item.frames.length < 2) return null;
    var mature = item.frames.length - 3, g = Math.min(p.g || 0, mature);
    if (p.dead) return { g: g, missed: DEAD, dead: true, crop: false };
    hist = hist || history(s);
    var day = today(), now = dayNo(day);
    var last = isDay(p.t) ? dayNo(p.t) : now;       // the last day with reviews, so far
    var on = isDay(s.vac) ? dayNo(s.vac) : Infinity; // vacation on since this day, if it still is
    var frozen = 0;                                  // VACATION days since last, before on
    // the crop: the first day a growth day can bring one (none while it isn't mature), and the last growth day
    var since = g === mature ? last : Infinity, grew = -Infinity;
    // finished days without reviews from last up to day d, leaving out vacation days
    function missedTo(d) { return d - last - 1 - frozen - Math.max(0, d - Math.max(last + 1, on)); }
    var i = 0, j = hist.length;                      // skip to day t, or the first day after it if it has no entry
    while (i < j) { var m = (i + j) >> 1; if (hist[m][0] < last) i = m + 1; else j = m; }
    // t without reviews: step past it; it already counts as reviewed, so it's no vacation day to leave out either
    if (i < hist.length && hist[i][0] === last && !(hist[i][1] & REVIEWED)) i++;
    for (; i < hist.length && hist[i][0] < now; i++) {
      if (!(hist[i][1] & REVIEWED)) {
        if (hist[i][1] & VACATION && hist[i][0] < on) frozen++;
        continue;
      }
      if (missedTo(hist[i][0]) >= DEAD) return { g: g, missed: DEAD, dead: true, crop: false };
      if (g < mature && ++g === mature) since = hist[i][0] + 1; // mature from the day after
      grew = last = hist[i][0];
      frozen = 0;
    }
    var missed = Math.max(0, missedTo(now));
    if (missed >= DEAD) return { g: g, missed: missed, dead: true, crop: false };
    if (missed >= DYING) since = now;               // dying, or back from it today: its crop is lost
    if (s.days[day] & REVIEWED) missed = 0;
    var picked = isDay(p.h) ? dayNo(p.h) : -Infinity;
    return { g: g, missed: missed, dead: false,
      crop: cropOf(item) > 0 && on === Infinity && grew >= Math.max(since, picked) };
  }
  /** The frame a placed item shows, given its lifeOf. */
  function stageFrame(item, life) {
    if (!life) return item.pic;
    var n = item.frames.length;
    return item.frames[life.dead ? n - 1 : life.missed >= DYING ? n - 2 : life.g];
  }

  // Sway, by shop tab: the most skew in degrees (each plant gets ±20% of it) and one swing's length in
  // seconds, from .. to. Pots don't sway, as skewing the picture would bend the pot too: はちうえ (which holds
  // every hanging plant too; scripts/build_assets.py checks that) and かざり aren't here.
  var SWAY = { "花": [3.2, 2.2, 3.2], "やさい": [2.2, 2.6, 3.4], "草木": [1.8, 3, 4], "木": [0.7, 4.5, 6] };
  var BREEZE = 1.6;                         // seconds the breeze takes across the map
  /** How placed plant `id` at x sways, given its lifeOf: {a: the most skew in degrees, d: one swing in
   *  seconds, delay: seconds}, or null for still. Its skew at time t is about -a·cos(π·(t + delay)/d), the curve
   *  the CSS draws (ease-in-out, alternate), with t in seconds on the page's timeline: document.timeline.currentTime
   *  / 1000, or a requestAnimationFrame time / 1000. The random parts come from
   *  id, so a plant sways the same way every time; delay grows with x, so the motion runs across the garden
   *  like a wave. A dying plant sways at half the angle and half again as slowly; a dead one doesn't. */
  function swayOf(item, life, id, x) {
    var w = SWAY[item.tab];
    if (!w || (life && life.dead)) return null;
    var a = w[0] * (0.8 + 0.4 * steady(id, 1)), d = w[1] + (w[2] - w[1]) * steady(id, 2);
    if (life && life.missed >= DYING) { a /= 2; d *= 1.5; }
    return { a: a, d: d, delay: x / WORLD_W * BREEZE + 0.3 * steady(id, 3) };
  }
  /** A random-looking number in [0, 1) that is always the same for placed id and n. */
  function steady(id, n) {
    var h = Math.imul((id | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(n, 0xc2b2ae35);
    h = Math.imul(h ^ h >>> 16, 0x7feb352d);
    h = Math.imul(h ^ h >>> 15, 0x846ca68b);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }

  // A selected sign's label: LABEL_GAP px above the signpost (room for its tail), and LABEL_EDGE px in from the view's sides
  var LABEL_GAP = 6, LABEL_EDGE = 4;

  // Butterflies: one for every BUGS_PER living flowers, at most BUGS_MAX
  var BUGS_PER = 5, BUGS_MAX = 6;
  /** How many butterflies a garden with n living flowers has. */
  function butterflies(n) { return Math.min(BUGS_MAX, Math.floor(n / BUGS_PER)); }
  /** The placed items among `placed` a butterfly can land on, given life(p), their lifeOf: the living flowers,
   *  from the 花 tab and neither dying nor dead. Their number is what butterflies() counts. */
  function blooms(placed, life) {
    return placed.filter(function (p) {
      if (!ITEMS[p.k] || ITEMS[p.k].tab !== "花") return false;
      var l = life(p);
      return !(l && (l.dead || l.missed >= DYING));
    });
  }
  // The butterflies' art: two 11×8 pixel maps, wings open and shut (X outline, B body, a feelers, o and p the
  // wings' two colours), drawn in each of BUG_COLOURS on one sheet: the two frames across, the colours down.
  // Shown at BUG_PX garden px a pixel, pixelated.
  var BUG_OPEN = ["..a.....a..", "...a...a...", ".XXX.B.XXX.", "XoppXBXppoX", "XoooXBXoooX", ".XXoXBXoXX.", "..XoXBXoX..", "...X.B.X..."];
  var BUG_SHUT = ["...a...a...", "....a.a....", "....XBX....", "...XoBoX...", "...XpBpX...", "...XoBoX...", "....XBX....", ".....B....."];
  var BUG_COLOURS = [["#f08a24", "#ffe0a0"], ["#f6f2e4", "#9aa0a8"], ["#f6d84a", "#e88a1a"], ["#6bb6f5", "#d9f0ff"]];  // monarch, white, yellow, blue
  var BUG_W = 11, BUG_H = 8, BUG_PX = 3;
  var bugArt = null;
  /** The butterflies' sheet as an image URL, drawn once a page. Drawn art can take its place: a file in the
   *  media folder with the same layout, returned from here. */
  function bugSheet() {
    if (bugArt) return bugArt;
    var c = document.createElement("canvas");
    c.width = BUG_W * 2;
    c.height = BUG_H * BUG_COLOURS.length;
    var g = c.getContext("2d");
    BUG_COLOURS.forEach(function (pal, r) {
      var ink = { X: "#2a1a12", B: "#3a2614", a: "#3a2614", o: pal[0], p: pal[1] };
      [BUG_OPEN, BUG_SHUT].forEach(function (rows, fi) {
        rows.forEach(function (row, y) {
          for (var x = 0; x < row.length; x++) {
            if (!ink[row[x]]) continue;
            g.fillStyle = ink[row[x]];
            g.fillRect(fi * BUG_W + x, r * BUG_H + y, 1, 1);
          }
        });
      });
    });
    return (bugArt = c.toDataURL());
  }

  // A ready crop's glint: a 4-point star, its arms narrowing to the tips, as one 11×11 pixel map (W white, w cream,
  // g gold, d deep gold at the tips) shown at GLINT_PX garden px a pixel, pixelated. A ready plant shows one, still,
  // above its picture (showCrop)
  var GLINT = [".....d.....", ".....g.....", ".....g.....", "....gwg....", "...gwWwg...", "dggwWWWwggd",
    "...gwWwg...", "....gwg....", ".....g.....", ".....g.....", ".....d....."];
  var GLINT_INK = { W: "#ffffff", w: "#fff3b8", g: "#f3b72f", d: "#d98a1c" };
  var GLINT_W = 11, GLINT_PX = 4;
  var GLINT_SINK = 10;                      // garden px of the still glint that reach down onto the top of its plant
  var glintArt = null;
  /** The glint's picture as an image URL, drawn once a page. */
  function glintSheet() {
    if (glintArt) return glintArt;
    var c = document.createElement("canvas");
    c.width = c.height = GLINT_W;
    var g = c.getContext("2d");
    GLINT.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        if (!GLINT_INK[row[x]]) continue;
        g.fillStyle = GLINT_INK[row[x]];
        g.fillRect(x, y, 1, 1);
      }
    });
    return (glintArt = c.toDataURL());
  }
  /** A new glint: a .kg-glint div showing the star, GLINT_W·GLINT_PX garden px a side, for the caller to place. */
  function glint() {
    var d = el("div", "kg-glint"), size = GLINT_W * GLINT_PX + "px";
    d.style.width = d.style.height = d.style.backgroundSize = size;
    d.style.backgroundImage = "url(" + glintSheet() + ")";
    return d;
  }

  /** Pay one coin unless this card already paid today. Either way, today is a day with reviews.
   *  On vacation nothing is paid and today isn't a day with reviews, but the card's coin for today is
   *  used up all the same: answered again after vacation is switched off, it pays nothing. */
  function earn(cardId) {
    var s = load(), day = today(), reviewed = s.days[day] & REVIEWED;
    if (s.locked) return { s: s, gained: false };
    if (isDay(s.vac)) {
      if (s.seen[cardId] !== day) { s.seen[cardId] = day; save(s); }
      return { s: s, gained: false };
    }
    s.days[day] = (s.days[day] || 0) | REVIEWED;
    if (s.seen[cardId] === day) {
      if (!reviewed) save(s);
      return { s: s, gained: false };
    }
    s.seen[cardId] = day;
    s.coins += 1;
    s.earned += 1;
    save(s);
    return { s: s, gained: true };
  }

  /** Switch vacation on (from today) or off. Off marks every day it was on VACATION, from vac through
   *  today. If the clock is now behind vac (a flight west, say), it marks today and vac's day, so that day
   *  never turns into a missed day later, but never more than one day ahead (a clock set a year ahead
   *  would otherwise freeze the year to come). Switching it doesn't change any plant's stage now; only its crop,
   *  which is none while it's on (lifeOf). */
  function vacation(s, on) {
    if (on) { if (!isDay(s.vac)) s.vac = today(); return; }
    if (!isDay(s.vac)) return;
    var a = dayNo(s.vac), b = dayNo(today());
    for (var d = Math.min(a, b); d <= Math.max(b, Math.min(a, b + 1)); d++) s.days[dayOf(d)] = (s.days[dayOf(d)] || 0) | VACATION;
    delete s.vac;
  }

  // ---- preferences -----------------------------------------------------------------------------
  /** The stored preferences; missing or damaged is {}, so every one is on (and the shop open). */
  function prefs() {
    try {
      var o = JSON.parse(localStorage.getItem(PREFS_KEY));
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
  }
  /** Whether preference `name` is on as stored: anything but false is on. */
  function pref(name) { return prefs()[name] !== false; }
  function setPref(name, on) {
    var o = prefs();
    o[name] = !!on;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(o)); } catch (e) { /* storage blocked: this opening only */ }
  }
  /** prefers-reduced-motion: every motion preference is off then, whatever is stored. */
  function stillMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  /** Whether the garden has its sideways layout now (SIDEWAYS, as the CSS has it). */
  function sidewaysNow() { return !!(window.matchMedia && window.matchMedia(SIDEWAYS).matches); }

  // ---- helpers -------------------------------------------------------------------------------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function coinIcon() { return el("span", "kg-coin"); }
  /** Text t as nodes to append, with a coin icon for each ¤ in it. */
  function coined(t) {
    var out = [];
    t.split("¤").forEach(function (part, i) {
      if (i) out.push(coinIcon());
      if (part) out.push(document.createTextNode(part));
    });
    return out;
  }
  /** A div showing one frame from its atlas, scaled by s (or div d, redrawn). */
  function sprite(f, s, d) {
    var atlas = KG_ATLAS[f.a];
    d = d || el("div", "kg-sprite");
    d.style.width = f.w * s + "px";
    d.style.height = f.h * s + "px";
    d.style.backgroundImage = "url(" + BASE + atlas[0] + ")";
    d.style.backgroundSize = atlas[1] * s + "px " + atlas[2] * s + "px";
    d.style.backgroundPosition = -f.x * s + "px " + -f.y * s + "px";
    return d;
  }
  /** An item's picture, at most `size` px a side. */
  function thumb(item, size) { return sprite(item.pic, Math.min(1, size / Math.max(item.pic.w, item.pic.h))); }
  // A thin scrollbar: a 4 px thumb, BAR_END px in from the ends of its track, at least BAR_MIN px long, that fades
  // out BAR_REST ms after the last scroll
  var BAR_END = 3, BAR_MIN = 24, BAR_REST = 1000;
  /** Put scroller n in a box (a .kg-scroll div with class cls, which takes n's place in the layout) with a thin
   *  thumb over n's right edge, in place of its native bar, which the CSS hides: the page's own ::-webkit-scrollbar
   *  styles (AnkiDroid's study screen has a 12 px grey one) would show through a scrollbar-width alone. The thumb
   *  sits in the box, not in n, so it stays put while n's content scrolls, and taps go through it. On each scroll it
   *  is sized and placed from n's scrollTop, scrollHeight and clientHeight and shown, and BAR_REST ms after the last
   *  one it fades out; with nothing to scroll it stays hidden. Returns {box, fit, stop}: fit() sizes and places a
   *  shown thumb again after n's size or content changed without a scroll (nothing while it's hidden), and stop()
   *  removes its listener and timer (the garden closing). */
  function scrollBar(n, cls) {
    var box = el("div", "kg-scroll " + cls), bar = el("div", "kg-bar"), timer = 0;
    bar.setAttribute("aria-hidden", "true");
    box.append(n, bar);
    /** Size and place the thumb; false if there's nothing to scroll. */
    function place() {
      var h = n.clientHeight, all = n.scrollHeight;
      if (all <= h) return false;
      var track = h - 2 * BAR_END, len = Math.min(track, Math.max(BAR_MIN, track * h / all));
      // the share scrolled, kept to 0..1 for an overscroll's bounce
      var at = Math.max(0, Math.min(1, n.scrollTop / (all - h)));
      bar.style.height = len + "px";
      bar.style.transform = "translateY(" + at * (track - len) + "px)";
      return true;
    }
    function show() {
      if (!place()) { hide(); return; }
      bar.classList.add("kg-bar-on");
      clearTimeout(timer);
      timer = setTimeout(hide, BAR_REST);
    }
    function hide() {
      clearTimeout(timer);
      timer = 0;
      bar.classList.remove("kg-bar-on");
    }
    n.addEventListener("scroll", show, { passive: true });
    return { box: box, fit: function () { if (timer && !place()) hide(); },
      stop: function () { n.removeEventListener("scroll", show); hide(); } };
  }
  /** A spot for an item's anchor that keeps its picture on the map. */
  function onMap(item, x, y) {
    var f = item.pic;
    return {
      x: Math.round(Math.max(f.ax * KG_SCALE, Math.min(WORLD_W - (f.w - f.ax) * KG_SCALE, x))),
      y: Math.round(Math.max(f.ay * KG_SCALE, Math.min(WORLD_H, y)))
    };
  }

  // ---- card chip -------------------------------------------------------------------------------
  function mount(slot) {
    if (!slot || slot.dataset.kgMounted) return;
    slot.dataset.kgMounted = "1";
    injectStyle();
    var mode = slot.dataset.kg || "garden";
    var card = slot.dataset.card;
    var dev = slot.dataset.dev === "1";
    var lang = langOf(slot), T = TEXT[lang];
    shift = dev ? devShift() : 0;     // before earn(), so a test day pays and counts as that day
    var res = /^\d+$/.test(card || "") ? earn(card) : { s: load(), gained: false };
    if (mode === "toast") {
      if (res.gained) {
        var t = inLang(el("div", "kg-toast"), lang);
        t.append.apply(t, coined(T.toast(res.s.coins)));
        slot.append(t);
        setTimeout(function () { t.remove(); }, 1600);
      }
      return;
    }
    var chip = inLang(el("button", "kg-chip tappable"), lang);
    chip.type = "button";
    var n = el("span", "kg-chip-n", String(res.s.coins));
    var vac = el("span", "kg-chip-vac", T.resting);
    function showVacation(s) {
      vac.hidden = !isDay(s.vac);
      chip.setAttribute("aria-label", vac.hidden ? T.openGarden : T.openResting);
    }
    showVacation(res.s);
    chip.append(coinIcon(), n, vac);
    if (res.gained) {
      var plus = el("span", "kg-plus", "+1");
      chip.append(plus);
    }
    chip.addEventListener("click", function (ev) {
      ev.stopPropagation();
      openGarden(slot, function (s) { n.textContent = String(s.coins); showVacation(s); }, dev);
    });
    slot.append(chip);
  }

  // ---- garden overlay ----------------------------------------------------------------------------
  /** dev: show the test section in the settings (data-dev="1", see the top of the file). */
  function openGarden(slot, onClose, dev) {
    shift = dev ? devShift() : 0;
    var s = load();
    var ui = {};
    var lang = langOf(slot), T = TEXT[lang];
    var root = inLang(el("div", "kg-root tappable"), lang);
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", T.garden);

    // top bar
    var top = el("div", "kg-top");
    // the title: the map's name, and a dot per map (showTop)
    var title = el("div", "kg-title"), mapName = el("span", "kg-map-name"), mapDots = el("span", "kg-dots");
    mapDots.setAttribute("aria-hidden", "true");
    title.append(mapName, mapDots);
    var purse = el("div", "kg-purse");
    ui.coins = el("span", "kg-purse-n");
    purse.append(coinIcon(), ui.coins);
    var gear = el("button", "kg-btn kg-gear");
    gear.type = "button";
    gear.setAttribute("aria-label", T.settings);
    gear.setAttribute("aria-haspopup", "dialog");
    var close = el("button", "kg-btn kg-close", T.close);
    close.type = "button";
    top.append(title, purse, gear, close);

    // settings: a panel over the garden, from the gear. In order: this phone's motion preferences (prefSwitch),
    // the vacation switch, the test section on a dev slot, and the version
    var menu = el("div", "kg-menu");          // the dimmed garden around the panel; a tap on it closes the panel
    var panel = el("div", "kg-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", T.settings);
    var head = el("div", "kg-panel-h");
    var menuClose = el("button", "kg-btn", T.close);
    menuClose.type = "button";
    menuClose.setAttribute("aria-label", T.closeSettings);
    head.append(el("strong", null, T.settings), menuClose);
    var prefList = el("div", "kg-prefs");
    var stillNote = el("p", "kg-note", T.motionOff);
    stillNote.hidden = true;
    // the vacation switch: the player's to turn on and off
    var vacBtn = el("button", "kg-opt kg-vac");
    vacBtn.type = "button";
    vacBtn.setAttribute("role", "switch");
    vacBtn.append(el("span", null, T.vacation), el("span", "kg-switch"));
    vacBtn.disabled = !!s.locked;
    panel.append(head, prefList, stillNote, vacBtn);
    // test controls, on a dev slot only: coins without reviews (not counted in earned), 150 free plants, and the
    // day moved back or on; the label shows the offset, and a tap on it resets it
    if (dev) {
      var devSet = el("div", "kg-devset");
      devSet.setAttribute("role", "group");
      devSet.setAttribute("aria-label", T.test);
      var devBtn = devButton("+100", T.testCoins), fillBtn = devButton("+150", T.testPlants);
      var dayBack = devButton(T.dayBack, T.testDayBack), dayOn = devButton(T.dayOn, T.testDayOn);
      var dayLabel = devButton("", "");
      dayLabel.classList.add("kg-dev-day");
      devSet.append(el("span", "kg-devset-h", T.test), devBtn, fillBtn, dayBack, dayLabel, dayOn);
      panel.append(devSet);
    }
    panel.append(el("p", "kg-ver", VERSION === "dev" ? VERSION : "v" + VERSION));
    // the panel, the shop's grid and its folded sideways tab strip each scroll with a thin thumb (scrollBar)
    var panelBar = scrollBar(panel, "kg-panel-box");
    menu.append(panelBar.box);

    // map
    var view = el("div", "kg-view");
    var world = el("div", "kg-world");
    world.style.width = WORLD_W + "px";
    world.style.height = WORLD_H + "px";
    var ground = el("div", "kg-ground");     // the maps' pictures, under everything on them (showMap)
    world.append(ground);
    view.append(world);
    ui.hint = el("div", "kg-hint");
    ui.hint.hidden = true;
    view.append(ui.hint);
    ui.vac = el("div", "kg-vac-badge", T.resting);
    view.append(ui.vac);
    var zoom = el("div", "kg-zoom");
    var zin = el("button", "kg-btn kg-zbtn", "＋"), zout = el("button", "kg-btn kg-zbtn", "－");
    zin.type = zout.type = "button";
    zin.setAttribute("aria-label", T.zoomIn);
    zout.setAttribute("aria-label", T.zoomOut);
    zoom.append(zin, zout);
    view.append(zoom);
    // a selected sign's label, over the map at screen size (showGo): a tap on it walks to the sign's map
    ui.go = el("button", "kg-btn kg-go");
    ui.go.type = "button";
    ui.go.hidden = true;
    view.append(ui.go);

    // shop
    var shop = el("div", "kg-shop");
    var tabs = el("div", "kg-tabs");
    tabs.setAttribute("role", "tablist");
    var grid = el("div", "kg-grid");
    ui.confirm = el("div", "kg-confirm");
    ui.confirm.hidden = true;
    // the fold button: outside the tabs, which renderTabs rebuilds, so it stays put while they scroll
    var foldBtn = el("button", "kg-btn kg-fold");
    foldBtn.type = "button";
    var tabsBar = scrollBar(tabs, "kg-tabs-box"), gridBar = scrollBar(grid, "kg-grid-box");
    var bars = [panelBar, tabsBar, gridBar];
    shop.append(tabsBar.box, foldBtn, gridBar.box, ui.confirm);

    root.append(top, view, shop, menu);
    document.body.append(root);
    document.documentElement.classList.add("kg-open");

    var cam = { s: 1, x: 0, y: 0, fit: 1 };
    var tab = "花";
    var placing = null;       // item key being placed
    var selected = null;      // placed id
    var composting = false;   // the hint asks to compost every dead plant (compost all), all of them outlined
    var capped = false;       // the hint says today's picking has reached PICK_CAP (harvest), until a tap or its OK
    var here = mapAt(s);      // the map shown
    var goSize = [0, 0];      // the selected sign's label's size, read once each time it's shown (showGo)
    var shownScale = null;    // the camera's scale as the world's --kg-s last had it
    var bgs = {};             // map key -> its picture, once the player has been there
    var veil = null;          // the walk's fade over the view, while it lasts
    var nodes = {};           // placed id -> div, on the map shown
    var lives = {};           // placed id -> lifeOf, worked out once per opening
    var hist = history(s);

    function persist() { save(s); ui.coins.textContent = String(s.coins); }
    /** The confirm box, emptied. Only the vacation question (over) shows above the settings panel; the
     *  others stay under its dimmed layer, out of reach while it's open. */
    function confirmBox(over) {
      ui.confirm.textContent = "";
      ui.confirm.classList.toggle("kg-over", !!over);
      return ui.confirm;
    }
    function devButton(text, label) {
      var b = el("button", "kg-btn kg-dev", text);
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.disabled = !!s.locked;
      return b;
    }
    /** The name T gives the removed item that a refund note calls `name`, its Japanese name. */
    function removedName(name) {
      for (var k in KG_REMOVED) if (KG_REMOVED[k][0] === name) return T.name(name, KG_REMOVED[k][1]);
      return name;
    }
    /** The placed items on the map shown. */
    function onHere() { return s.placed.filter(function (p) { return onMapOf(p) === here; }); }
    function life(p) { return p.id in lives ? lives[p.id] : (lives[p.id] = lifeOf(s, p, hist)); }
    function dead(p) { var l = life(p); return !!(l && l.dead); }

    // camera
    function fitScale() { return Math.min(view.clientWidth / WORLD_W, view.clientHeight / WORLD_H); }
    function clamp() {
      var vw = view.clientWidth, vh = view.clientHeight, ww = WORLD_W * cam.s, wh = WORLD_H * cam.s;
      cam.x = ww <= vw ? (vw - ww) / 2 : Math.min(0, Math.max(vw - ww, cam.x));
      cam.y = wh <= vh ? (vh - wh) / 2 : Math.min(0, Math.max(vh - wh, cam.y));
      world.style.transform = "translate(" + cam.x + "px," + cam.y + "px) scale(" + cam.s + ")";
      if (shownScale !== cam.s) {            // the signs' hit area, a fixed size on the screen (only when the scale changed)
        shownScale = cam.s;
        world.style.setProperty("--kg-s", String(cam.s));
      }
      placeGo();
    }
    function zoomAt(f, px, py) {
      var ns = Math.max(cam.fit, Math.min(cam.fit * 6, cam.s * f));
      cam.x = px - (px - cam.x) * ns / cam.s;
      cam.y = py - (py - cam.y) * ns / cam.s;
      cam.s = ns;
      clamp();
    }
    function refit() {
      var old = cam.fit;
      cam.fit = fitScale();
      if (cam.s <= old * 1.001 || cam.s < cam.fit) cam.s = cam.fit;
      clamp();
    }
    function toWorld(cx, cy) {
      var r = view.getBoundingClientRect();
      return { x: (cx - r.left - cam.x) / cam.s, y: (cy - r.top - cam.y) / cam.s };
    }

    // placed items: a .kg-item (its spot, depth, selection and pop) around its picture (frame, shadow and sway), and
    // over the picture, while it has a crop, its glint (showCrop)
    function drawPlaced(p) {
      var item = ITEMS[p.k];
      if (!item || onMapOf(p) !== here) return;
      var f = stageFrame(item, life(p));
      // keep it on the map: a picture can be bigger than the sprite it was placed with (saved when the garden opens)
      var at = onMap(item, p.x, p.y);
      p.x = at.x;
      p.y = at.y;
      var d = nodes[p.id] || el("div", "kg-item");
      if (!d.children.length) d.append(el("div", "kg-sprite"));
      d.style.left = p.x - f.ax * KG_SCALE + "px";
      d.style.top = p.y - f.ay * KG_SCALE + "px";
      d.style.zIndex = String(Math.round(p.y));
      d.dataset.id = String(p.id);
      d.classList.toggle("kg-sel", p.id === selected || composting && dead(p));
      if (!nodes[p.id]) { nodes[p.id] = d; world.append(d); }
      var pic = sprite(f, KG_SCALE, d.children[0]);
      if (signTo(p)) {
        // a sign: a hit area round it (kg-signpost), and its arrow turned about the post's foot while flipped (f)
        d.classList.add("kg-signpost");
        pic.style.transformOrigin = f.ax * KG_SCALE + "px 0";
        pic.style.transform = p.f ? "scaleX(-1)" : "";
      }
      var sw = swaying(p);
      swing(pic, f, sw);
      showCrop(d, p, f, sw);
    }
    /** Show the glint of placed plant p, on its node d, while it has a crop (ripe), or take it away. The glint sits in
     *  a .kg-ripe box after the picture (f: the frame it shows), the picture's size and place and swaying with it
     *  (sw, swing), so it rides the sway and the map's zoom without the picture's shadow: centred over the picture,
     *  just above its top. The box is the node's second child; more glints can go in it. */
    function showCrop(d, p, f, sw) {
      var box = d.children[1] || null;
      if (!ripe(p)) { if (box) box.remove(); return; }
      if (!box) {
        box = el("div", "kg-ripe");
        box.append(glint());
        d.append(box);
      }
      var w = f.w * KG_SCALE, size = GLINT_W * GLINT_PX, star = box.children[0];
      box.style.width = w + "px";
      box.style.height = f.h * KG_SCALE + "px";
      star.style.left = (w - size) / 2 + "px";
      star.style.top = GLINT_SINK - size + "px";
      swing(box, f, sw);
    }
    /** Whether placed plant p has a crop to pick now (lifeOf). */
    function ripe(p) { var l = life(p); return !!(l && l.crop); }

    // sway: on unless turned off in the settings (setSway), or by reduced motion; starts as prefSwitch
    // will set it, so the first drawing is already right
    var swayOn = !stillMotion() && pref("sway"), anchoring = false;
    /** Turn the sway of every plant on or off at once: the settings switch 「くさばなが ゆれる」. */
    function setSway(on) {
      if (swayOn === !!on) return;
      swayOn = !!on;
      onHere().forEach(drawPlaced);
    }
    /** How placed item p sways now (swayOf), or null: still while selected or dragged, so it's easy to place. */
    function swaying(p) {
      return swayOn && p.id !== selected ? swayOf(ITEMS[p.k], life(p), p.id, p.x) : null;
    }
    /** Sway picture pic (showing frame f) as sw says, or stop it (null): skewX about the frame's anchor, so the
     *  soil mound or pot base stays put and the top moves. A sway that starts gets its delay and is anchored
     *  (anchorSway), so that its skew is swayOf's curve at t = document.timeline.currentTime / 1000. */
    function swing(pic, f, sw) {
      var was = pic.classList.contains("kg-sway");
      pic.classList.toggle("kg-sway", !!sw);
      if (!sw) return;
      pic.style.transformOrigin = f.ax * KG_SCALE + "px " + f.ay * KG_SCALE + "px";
      pic.style.setProperty("--kg-a", sw.a + "deg");
      pic.style.animationDuration = sw.d + "s";
      if (was) return;
      pic.style.animationDelay = -sw.delay + "s";
      if (!anchoring) { anchoring = true; Promise.resolve().then(anchorSway); }
    }
    /** Start every sway that has just started at the timeline's 0, as the CSS curve then lines up with swayOf's.
     *  On its own, Chrome starts a CSS animation when it first reaches the screen, half a second late on a first
     *  opening while the atlas decodes. Once per task, after its drawing: each look at the animations
     *  makes the page work out its style. Without getAnimations (or with reduced motion) there's nothing to do. */
    function anchorSway() {
      anchoring = false;
      var an = world.getAnimations ? world.getAnimations({ subtree: true }) : [];
      an.forEach(function (a) { if (a.animationName === "kg-sway" && a.startTime !== 0) a.startTime = 0; });
    }

    // butterflies: as many as the living flowers call for (flutter), each in a .kg-bug above every plant,
    // moved by one requestAnimationFrame loop (fly). Each one wanders about, now and then picks a flower to fly
    // to, sits on it a while riding its sway, and takes off again. Off with the settings switch or reduced
    // motion (setBugs), on vacation, and when the garden closes
    var bugsOn = false, bugs = [], bugReq = 0, bugLast = null;
    /** Turn the butterflies on or off: the settings switch 「ちょうちょが とぶ」. */
    function setBugs(on) {
      bugsOn = !!on;
      flutter(false);
    }
    /** Have as many butterflies as the living flowers call for now (none while they're off or on vacation), and
     *  send off any that sit on, or fly to, a flower that is gone or no longer living. New ones come in just
     *  inside the side of the map, or with edge false (the garden opening, the switch turned on) are already about. */
    function flutter(edge) {
      var fl = bugsOn && !isDay(s.vac) ? blooms(onHere(), life) : [], n = butterflies(fl.length);
      while (bugs.length > n) bugs.pop().el.remove();
      while (bugs.length < n) bugs.push(newBug(edge));
      bugs.forEach(function (b) { if (b.to && fl.indexOf(b.to) < 0) takeOff(b); });
      flight();
    }
    /** Run the loop while there are butterflies and the page is shown, and stop it otherwise. */
    function flight() {
      var go = bugs.length > 0 && !document.hidden;
      if (go && !bugReq) { bugLast = null; bugReq = requestAnimationFrame(fly); }
      if (!go && bugReq) { cancelAnimationFrame(bugReq); bugReq = 0; }
    }
    /** One frame of the loop, at rAF time now (ms): move and draw every butterfly, and ask for the next frame. */
    function fly(now) {
      bugReq = requestAnimationFrame(fly);
      var t = now / 1000, dt = bugLast == null ? 0 : Math.min(0.05, t - bugLast);    // a long frame doesn't jump
      bugLast = t;
      bugs.forEach(function (b) { stepBug(b, dt, t); drawBug(b); });
    }
    /** A butterfly: b.to is the flower it sits on or flies to, b.sit the seconds left sitting (null in flight),
     *  b.timer the seconds until it picks a flower, b.th its heading. Its feet are at b.x, b.y. */
    function newBug(edge) {
      var left = Math.random() < 0.5, d = el("div", "kg-bug"), b = {
        el: d, pal: bugs.length % BUG_COLOURS.length, sp: 45 + Math.random() * 25, seed: Math.random() * 100,
        x: edge ? (left ? 10 : WORLD_W - 10) : 200 + Math.random() * (WORLD_W - 400),
        y: 300 + Math.random() * 700,
        th: edge ? (left ? 0 : Math.PI) + (Math.random() - 0.5) * 0.6 : Math.random() * 2 * Math.PI,
        to: null, sit: null, timer: 2 + Math.random() * 8, jx: 0, frame: 0, bob: 0, shown: -1 };
      d.style.width = BUG_W * BUG_PX + "px";
      d.style.height = BUG_H * BUG_PX + "px";
      d.style.backgroundImage = "url(" + bugSheet() + ")";
      d.style.backgroundSize = 2 * BUG_W * BUG_PX + "px " + BUG_COLOURS.length * BUG_H * BUG_PX + "px";
      world.append(d);
      drawBug(b);
      return b;
    }
    /** Send butterfly b off its flower, or off the way to it: upward if it sat, and on to another in 6–14 s. */
    function takeOff(b) {
      if (b.sit != null) b.th = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      b.to = b.sit = null;
      b.timer = 6 + Math.random() * 8;
    }
    /** Send off every butterfly on placed item id, or on its way there: the item is selected, about to be moved. */
    function scare(id) { bugs.forEach(function (b) { if (b.to && b.to.id === id) takeOff(b); }); }
    /** A living flower for butterfly b to fly to, or null: never the selected one (it's about to be moved), and
     *  one no other butterfly is on or flying to, while there is such a one. */
    function pick(b) {
      var fl = blooms(onHere(), life).filter(function (p) { return p.id !== selected; });
      var free = fl.filter(function (p) { return !bugs.some(function (o) { return o !== b && o.to === p; }); });
      if (free.length) fl = free;
      return fl.length ? fl[Math.floor(Math.random() * fl.length)] : null;
    }
    /** Where butterfly b sits on its flower at time t (s): 82% of the way up the picture, a little to one side
     *  (b.jx), carried by the sway: a point h px above the anchor goes -tan(skew)·h across. */
    function perch(b, t) {
      var p = b.to, f = stageFrame(ITEMS[p.k], life(p)), h = f.ay * KG_SCALE * 0.82, sw = swaying(p);
      var skew = sw ? -sw.a * Math.cos(Math.PI * (t + sw.delay) / sw.d) * Math.PI / 180 : 0;
      return { x: p.x + (f.w / 2 - f.ax + b.jx * f.w) * KG_SCALE - Math.tan(skew) * h, y: p.y - h };
    }
    /** Move butterfly b on by dt seconds, to time t. */
    function stepBug(b, dt, t) {
      var at = b.to && perch(b, t), dist = at ? Math.hypot(at.x - b.x, at.y - b.y) : 0;
      if (at && b.sit == null && dist < 5) b.sit = 2.5 + Math.random() * 3.5;     // landed
      if (b.sit != null) {
        b.x = at.x;
        b.y = at.y;
        b.bob = 0;
        b.frame = Math.floor(t / 0.7 + b.seed) % 2;      // wings open and shut, slowly
        if ((b.sit -= dt) <= 0) takeOff(b);
        return;
      }
      var speed = b.sp, want = null;
      if (!b.to && (b.timer -= dt) <= 0) {
        b.to = pick(b);
        b.jx = (Math.random() - 0.5) * 0.3;
        if (!b.to) b.timer = 5;
      }
      if (at) {
        want = Math.atan2(at.y - b.y, at.x - b.x);
        speed = Math.min(b.sp, 18 + dist * 1.5);         // slowing down as it gets close
      } else if (b.x < 80 || b.x > WORLD_W - 80 || b.y < 220 || b.y > WORLD_H - 40) {
        want = Math.atan2(WORLD_H * 0.6 - b.y, WORLD_W / 2 - b.x);   // back to the middle before it leaves the map
      } else {
        b.th += (Math.sin(t * 0.9 + b.seed) * 1.4 + (Math.random() - 0.5) * 3) * dt;    // a gentle wander
      }
      if (want != null) {
        var turn = want - b.th;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        b.th += Math.max(-3 * dt, Math.min(3 * dt, turn));
      }
      b.x += Math.cos(b.th) * speed * dt;
      b.y += Math.sin(b.th) * speed * dt;
      b.frame = Math.floor(t * 14 + b.seed) % 2;         // 7 flaps a second
      b.bob = b.to ? 0 : Math.sin(t * 5 + b.seed) * 4;
    }
    /** Put butterfly b's element where b is, showing its frame and colour on the sheet. */
    function drawBug(b) {
      b.el.style.transform = "translate(" + (b.x - BUG_W * BUG_PX / 2) + "px," + (b.y - BUG_H * BUG_PX + 2 + b.bob) + "px)";
      if (b.shown === b.frame) return;
      b.shown = b.frame;
      b.el.style.backgroundPosition = -b.frame * BUG_W * BUG_PX + "px " + -b.pal * BUG_H * BUG_PX + "px";
    }
    function find(id) { for (var i = 0; i < s.placed.length; i++) if (s.placed[i].id === id) return s.placed[i]; return null; }
    function select(id) {
      var prev = selected;
      selected = id;
      capped = false;              // the cap's note goes with the next tap, on the map or an item
      if (id != null) scare(id);   // no butterfly on the flower the player is about to move (pick leaves it out too)
      if (composting) askAll(false, true);
      if (prev != null && find(prev)) drawPlaced(find(prev));
      if (id != null) drawPlaced(find(id));
      showHint();
    }
    function showHint() {
      var noted = false;
      ui.hint.textContent = "";
      if (placing) {
        var it = ITEMS[placing];
        ui.hint.append(thumb(it, 26), el("span", null, T.tapToPlace));
        var cancel = el("button", "kg-btn kg-x", "✕");
        cancel.type = "button";
        cancel.setAttribute("aria-label", T.cancel);
        cancel.addEventListener("click", function () { setPlacing(null); showHint(); renderGrid(); });
        ui.hint.append(cancel);
        ui.hint.hidden = false;
      } else if (selected != null && find(selected)) {
        var p = find(selected), item = ITEMS[p.k];
        if (dead(p)) {
          // a dead plant can't move: it can only go to the compost, for a quarter of its price. With 2 or more
          // dead, 「ぜんぶ ×n」 beside 「はい」 asks to compost them all (askAll), each for a quarter of its own
          // price, summed; ✕ there comes back to this plant's question. Dying plants, which can still recover, stay
          var gone = onHere().filter(dead), back = Math.floor(item.price / 4), all = 0;
          gone.forEach(function (q) { all += Math.floor(ITEMS[q.k].price / 4); });
          var ask = el("span");
          ask.append.apply(ask, coined(composting ? T.compostAllAsk(gone.length, all) : T.compost(back)));
          var yes = el("button", "kg-btn kg-btn-go", T.yes);
          yes.type = "button";
          yes.addEventListener("click", function () {
            if (composting) { s.coins += all; takeAway(gone); } else { s.coins += back; takeAway([p]); }
          });
          var no = el("button", "kg-btn kg-x", "✕");
          no.type = "button";
          no.setAttribute("aria-label", T.cancel);
          no.addEventListener("click", function () { if (composting) askAll(false); else select(null); });
          ui.hint.append(ask, yes);
          if (!composting && gone.length >= 2) {
            var every = el("button", "kg-btn", T.compostAll(gone.length));
            every.type = "button";
            every.addEventListener("click", function () { askAll(true); });
            ui.hint.append(every);
          }
          ui.hint.append(no);
        } else {
          ui.hint.append(el("span", null, T.drag));
          if (signTo(p)) {                   // a sign: ↔ turns its arrow around
            var turn = el("button", "kg-btn kg-x", "↔");
            turn.type = "button";
            turn.setAttribute("aria-label", T.flip);
            turn.addEventListener("click", function () {
              if (p.f) delete p.f; else p.f = 1;
              persist();
              drawPlaced(p);
              showGo();
            });
            ui.hint.append(turn);
          }
          if (item.tab === "かざり" || signTo(p)) {   // plants stay in the garden; decorations can go back, signs too
            var stash = el("button", "kg-btn", T.putAway);
            stash.type = "button";
            // a sign stays owned, in もちもの, whatever happens to it on the map
            stash.addEventListener("click", function () { if (!signTo(p)) s.inv[p.k] = (s.inv[p.k] || 0) + 1; takeAway([p]); });
            ui.hint.append(stash);
          }
          var ok = el("button", "kg-btn kg-btn-go", T.ok);
          ok.type = "button";
          ok.addEventListener("click", function () { select(null); });
          ui.hint.append(ok);
        }
        ui.hint.hidden = false;
      } else if (capped) {
        // today's picking has reached PICK_CAP (harvest): its OK, or the next tap (select), puts the note away
        var note = el("span");
        note.append.apply(note, coined(T.pickCap(PICK_CAP)));
        var gotIt = el("button", "kg-btn kg-btn-go", T.ok);
        gotIt.type = "button";
        gotIt.addEventListener("click", function () { capped = false; showHint(); });
        ui.hint.append(note, gotIt);
        ui.hint.hidden = false;
        noted = true;
      } else {
        ui.hint.hidden = true;
      }
      ui.hint.classList.toggle("kg-hint-all", composting && !ui.hint.hidden);
      ui.hint.classList.toggle("kg-hint-note", noted);
      showGo();
    }
    /** Ask to compost every dead plant (on), outlining them all, or leave the question (off) for the selected
     *  plant's own; quiet: only the outlines, for select, which calls it after selected has already changed (so
     *  the newly selected plant keeps its outline) and then shows its own hint. */
    function askAll(on, quiet) {
      composting = on;
      onHere().forEach(function (p) { if (dead(p) && p.id !== selected) drawPlaced(p); });
      if (!quiet) showHint();
    }
    /** Take placed items ps off the map, with one save and one redraw of the hint, the shop and the butterflies;
     *  the caller has already paid for them or put them back in もちもの. */
    function takeAway(ps) {
      var ids = ps.map(function (p) { return p.id; });
      s.placed = s.placed.filter(function (q) { return ids.indexOf(q.id) < 0; });
      ps.forEach(function (p) {
        nodes[p.id].remove();
        delete nodes[p.id];
        delete lives[p.id];
      });
      selected = null;
      composting = false;
      persist();
      showHint();
      renderGrid();
      flutter(true);
    }
    /** Pick placed plant p's crop (ripe): pay what it's worth as far as today's PICK_CAP goes, note the day on it (h)
     *  and the crops picked today (s.picked), float the coins up from it (gain) and take its glint away, in one save;
     *  earned stays as it is. A selection ends, as at a tap on the map. The first pick in a day that the cap cuts short
     *  (paying less than its worth, or nothing) says so in the hint: s.picked counts what the crops were worth, paid
     *  or not, so a count already past PICK_CAP means an earlier pick today was cut short, and said so. */
    function harvest(p) {
      var day = today(), worth = cropOf(ITEMS[p.k]);
      var before = s.picked && s.picked.day === day ? s.picked.coins : 0;
      var pay = Math.min(PICK_CAP, before + worth) - Math.min(PICK_CAP, before);
      select(null);
      s.picked = { day: day, coins: before + worth };
      s.coins += pay;
      p.h = day;
      delete lives[p.id];
      persist();
      drawPlaced(p);
      if (pay) {
        gain(p, pay);
        renderGrid();           // prices the player can now pay lose their grey
      }
      capped = before <= PICK_CAP && before + worth > PICK_CAP;
      showHint();
    }
    /** Float n coins up from placed plant p, from the top of its picture, as a card's coin floats up from its chip
     *  (kg-up): at screen size over the map, whatever the zoom, and taken away once that's done (1.1 s). */
    function gain(p, n) {
      var f = stageFrame(ITEMS[p.k], life(p)), up = el("div", "kg-gain"), coins = el("span");
      coins.append.apply(coins, coined("¤+" + n));
      up.append(coins);
      up.style.left = cam.x + (p.x + (f.w / 2 - f.ax) * KG_SCALE) * cam.s + "px";
      up.style.top = cam.y + (p.y - f.ay * KG_SCALE) * cam.s + "px";
      view.append(up);
      setTimeout(function () { up.remove(); }, 1100);
    }
    // maps: the one shown (here), the label of a selected sign, and walking to another
    /** Show map `here`: its picture (loaded the first time it's shown), its placed items, and its name and dots in the
     *  top bar; the items of the map shown before go. */
    function showMap() {
      var m = MAP[here];
      if (!bgs[here]) {
        var bg = el("img", "kg-bg");
        bg.src = BASE + m.bg;
        bg.alt = "";
        bg.draggable = false;
        bg.dataset.map = here;
        ground.append(bg);
        bgs[here] = bg;
      }
      for (var k in bgs) bgs[k].hidden = k !== here;
      for (var id in nodes) nodes[id].remove();
      nodes = {};
      onHere().forEach(drawPlaced);
      showTop();
    }
    /** The top bar's title: the map's name, and a dot per map in MAPS' order, filled for this one, hollow for another
     *  open one, a lock for one still locked. */
    function showTop() {
      mapName.textContent = T.maps[MAP[here].n];
      mapDots.textContent = "";
      MAPS.forEach(function (m) {
        mapDots.append(el("span", "kg-dot " + (m.key === here ? "kg-dot-here" : opened(s, m.key) ? "kg-dot-open" : "kg-dot-lock")));
      });
    }
    /** The selected item if it's a sign, else null. */
    function selectedSign() {
      var p = selected != null && !placing ? find(selected) : null;
      return p && signTo(p) ? p : null;
    }
    /** Show the label over the selected sign (its map's name, the arrow as the sign's), or hide it when no sign is
     *  selected. Its size is read here, once each time it's shown, and placeGo puts it. */
    function showGo() {
      var p = selectedSign();
      ui.go.hidden = !p;
      if (!p) return;
      var to = MAP[signTo(p)];
      ui.go.textContent = T.goTo(T.maps[to.n], !!p.f);
      ui.go.setAttribute("aria-label", T.goLabel(T.maps[to.n]));
      ui.go.dataset.to = to.key;
      goSize = [ui.go.offsetWidth || 0, ui.go.offsetHeight || 0];
      placeGo();
    }
    /** Put the selected sign's label over it at screen size, whatever the zoom: centred over its post, LABEL_GAP px
     *  above its top. While the post's foot is in the view, the label moves in to stay whole in it. */
    function placeGo() {
      var p = !ui.go.hidden && selectedSign();
      if (!p) return;
      var vw = view.clientWidth, vh = view.clientHeight, w = goSize[0], h = goSize[1];
      var fx = cam.x + p.x * cam.s, fy = cam.y + p.y * cam.s;
      var x = fx - w / 2, y = cam.y + (p.y - SIGN.ay * KG_SCALE) * cam.s - LABEL_GAP - h;
      if (fx >= 0 && fx <= vw && fy >= 0 && fy <= vh) {
        x = Math.max(LABEL_EDGE, Math.min(vw - w - LABEL_EDGE, x));
        y = Math.max(LABEL_EDGE, Math.min(vh - h - LABEL_EDGE, y));
      }
      ui.go.style.left = x + "px";
      ui.go.style.top = y + "px";
    }
    ui.go.addEventListener("click", function () { var p = selectedSign(); if (p) walk(signTo(p)); });
    /** Why sign `key` can't go on the map shown (its own map, or one of it there already), or null if it can. */
    function signWhy(key) {
      if (signTo(key) === here) return T.signHere;
      return onHere().some(function (p) { return p.k === key; }) ? T.signPlaced : null;
    }
    /** Walk to open map `key`: a drag or pan under way ends there (its item already moved, and saved below), the
     *  shop's question closes, nothing stays selected, placing goes on unless it's a sign that can't go there, the
     *  view fades over to it (a veil that its animation takes away) centred on its sign back to the map left (its
     *  middle without one) at the same zoom, and its own butterflies come for its flowers. */
    function walk(key) {
      if (s.locked || !opened(s, key) || key === here) return;
      var from = here;
      gesture = null;         // the item a drag moved so far stays where it got to, saved with the walk below
      ui.confirm.hidden = true;
      select(null);
      here = key;
      if (key === "home") delete s.at; else s.at = key;
      persist();
      if (placing && signTo(placing) && signWhy(placing)) setPlacing(null);
      showMap();
      while (bugs.length) bugs.pop().el.remove();
      flutter(false);
      var back = onHere().filter(function (p) { return p.k === "sign_" + from; })[0];
      var x = back ? back.x : WORLD_W / 2, y = back ? back.y - SIGN.ay * KG_SCALE / 2 : WORLD_H / 2;
      cam.x = view.clientWidth / 2 - x * cam.s;
      cam.y = view.clientHeight / 2 - y * cam.s;
      clamp();
      if (veil) veil.remove();
      var v = veil = el("div", "kg-veil");
      v.addEventListener("animationend", function () { v.remove(); if (veil === v) veil = null; });
      view.append(v);
      showHint();
      renderGrid();           // which signs can go on this map
    }
    function place(key, w) {
      var item = ITEMS[key], f = item.frames[0];
      if (signTo(key) && signWhy(key)) { setPlacing(null); showHint(); renderGrid(); return; }
      // the tap is the middle of the picture it starts with
      var at = onMap(item, w.x, w.y + (f.ay - f.h / 2) * KG_SCALE);
      var p = { id: s.next++, k: key, x: at.x, y: at.y };
      if (here !== "home") p.m = here;
      if (item.frames.length > 1) p.t = today();      // a plant with stage art starts at its first frame
      s.placed.push(p);
      if (!signTo(key)) {                               // a sign is never used up
        s.inv[key] -= 1;
        if (!s.inv[key]) delete s.inv[key];
      }
      setPlacing(null);
      persist();
      drawPlaced(p);
      nodes[p.id].classList.add("kg-pop");
      select(p.id);
      renderGrid();
      flutter(true);
    }

    // shop
    function renderTabs() {
      tabs.textContent = "";
      TABS.forEach(function (t, i) {
        var b = el("button", "kg-tab", T.tabs[i]);
        b.type = "button";
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", String(t === tab));
        if (t === "もちもの") {
          var n = 0;
          for (var k in s.inv) n += s.inv[k];
          if (n) b.append(el("span", "kg-badge", String(n)));
        }
        b.addEventListener("click", function () {
          tab = t;
          ui.confirm.hidden = true;
          if (folded) fold(false, true);       // a tab opens the shop on that tab
          renderGrid();
        });
        tabs.append(b);
      });
    }
    function renderGrid() {
      renderTabs();
      grid.textContent = "";
      // the maps' signs: in もちもの the owned ones, after the rest; in とち each one on sale, the map before it open
      var signs = MAPS.map(function (m) { return ITEMS["sign_" + m.key]; });
      var list = tab === "もちもの"
        ? Object.keys(s.inv).map(function (k) { return ITEMS[k]; }).filter(Boolean)
        : tab === "とち" ? signs.filter(function (i) { return i.to !== "home" && opened(s, MAPS[MAP[i.to].n - 1].key); })
        : KG_CATALOG.map(function (e) { return ITEMS[e[0]]; }).filter(function (i) { return i.tab === tab && i.sold; });
      // the owned signs go after the rest of the bag (so it's never empty: the home sign is always there); with nothing
      // else in it and no sign that can go on this map, the bag still says to go shopping, above them
      if (tab === "もちもの") {
        var owned = signs.filter(function (i) { return opened(s, i.to); });
        if (!list.length && owned.every(function (i) { return signWhy(i.key); })) grid.append(el("p", "kg-empty", T.emptyBag));
        list = list.concat(owned);
      }
      if (!list.length) grid.append(el("p", "kg-empty", T.emptyTab));
      list.forEach(function (item) {
        var b = el("button", "kg-card");
        b.type = "button";
        var box = el("div", "kg-thumb");
        box.append(thumb(item, 56));
        b.append(box, el("span", "kg-name", T.name(item.name, item.en)));
        if (tab === "もちもの" && item.to) {
          // an owned sign: never used up, so no count; greyed, with why, where it can't go on this map
          var why = signWhy(item.key);
          if (why) {
            b.classList.add("kg-off");
            b.setAttribute("aria-disabled", "true");
            b.append(el("span", "kg-why", why));
          } else {
            if (placing === item.key) b.classList.add("kg-on");
            b.addEventListener("click", function () { setPlacing(item.key); select(null); showHint(); renderGrid(); });
          }
        } else if (tab === "もちもの") {
          b.append(el("span", "kg-count", "×" + s.inv[item.key]));
          if (placing === item.key) b.classList.add("kg-on");
          b.addEventListener("click", function () { setPlacing(item.key); select(null); showHint(); renderGrid(); });
        } else if (item.to && opened(s, item.to)) {
          b.classList.add("kg-owned");              // a sign the player has: in もちもの now
          b.setAttribute("aria-disabled", "true");
          b.append(el("span", "kg-why", T.owned));
        } else {
          var price = el("span", "kg-price");
          price.append(coinIcon(), document.createTextNode(String(item.price)));
          b.append(price);
          if (s.coins < item.price) b.classList.add("kg-poor");
          b.addEventListener("click", function () { askBuy(item); });
        }
        grid.append(b);
      });
      tabsBar.fit();
      gridBar.fit();
    }
    function askBuy(item) {
      var c = confirmBox();
      var box = el("div", "kg-thumb");
      box.append(thumb(item, 56));
      var text = el("div", "kg-ctext");
      text.append(el("strong", null, T.name(item.name, item.en)));
      if (s.coins >= item.price) {
        var line = el("span", null, "");
        line.append.apply(line, coined(T.buyAsk(item.price, s.coins - item.price)));
        text.append(line);
        var buy = el("button", "kg-btn kg-btn-go", T.buy);
        buy.type = "button";
        buy.addEventListener("click", function () {
          // checked again at the tap: coins spent since the question came up, or a sign since owned, don't pay twice
          if (item.to && opened(s, item.to)) { c.hidden = true; renderGrid(); return; }
          if (s.coins < item.price) { askBuy(item); return; }
          s.coins -= item.price;
          if (item.to) {                    // a map's sign: owning it opens the map
            (s.maps = s.maps || []).push(item.to);
            showTop();
          } else {
            s.inv[item.key] = (s.inv[item.key] || 0) + 1;
          }
          persist();
          c.hidden = true;
          setPlacing(item.to && signWhy(item.key) ? null : item.key);
          select(null);
          showHint();
          renderGrid();
        });
        var no = el("button", "kg-btn", T.cancel);
        no.type = "button";
        no.addEventListener("click", function () { c.hidden = true; });
        c.append(box, text, buy, no);
      } else {
        text.append(el("span", null, T.tooFew(item.price - s.coins)));
        var okb = el("button", "kg-btn", T.ok);
        okb.type = "button";
        okb.addEventListener("click", function () { c.hidden = true; });
        c.append(box, text, okb);
      }
      c.hidden = false;
    }

    // the shop's fold: the player's ▼/▲ (▶/◀ sideways) or a tab, remembered as the preference shop, or by itself
    // while the player places something (byItself: it opens again when that's done). Upright, a fold at whole-map
    // view zooms the map to fill the view's height (filled), and opening goes back to the whole map; sideways it stays
    // the whole map
    var folded = !pref("shop"), byItself = false, filled = false, sideways = false;
    function showFold() {
      root.classList.toggle("kg-shop-min", folded);
      foldBtn.textContent = sideways ? (folded ? "◀\uFE0E" : "▶\uFE0E") : (folded ? "▲" : "▼");   // FE0E: never an emoji
      foldBtn.setAttribute("aria-label", folded ? T.openShop : T.foldShop);
      foldBtn.setAttribute("aria-expanded", String(!folded));
    }
    /** Fold the shop (on) or open it, and fit the map to the space it leaves. mine: the player's own, so remembered. */
    function fold(on, mine) {
      byItself = false;
      if (mine) setPref("shop", !on);
      folded = on;
      showFold();
      refit();
      bars.forEach(function (b) { b.fit(); });
      if (!on) { if (filled) wholeMap(); filled = false; }
      else if (!sideways && wholeShown()) fillHeight();
    }
    /** Start placing item `key`, folding the shop by itself if it's open, or stop (null): opening it again if so. */
    function setPlacing(key) {
      placing = key;
      if (key && !folded) { fold(true, false); byItself = true; }
      else if (!key && byItself) fold(false, false);
    }
    function wholeShown() { return cam.s <= cam.fit * 1.001; }
    function wholeMap() { zoomAt(cam.fit / cam.s, view.clientWidth / 2, view.clientHeight / 2); }
    /** Zoom the map, about the view's middle, until it fills the view's height (or its width, if that takes more). */
    function fillHeight() {
      if (!cam.fit) return;                  // a view not laid out yet (0 x 0): the first frame's refit fills it
      zoomAt(fillScale() / cam.s, view.clientWidth / 2, view.clientHeight / 2);
      filled = true;
    }
    function fillScale() { return Math.max(view.clientWidth / WORLD_W, view.clientHeight / WORLD_H); }
    /** The window's size changed: fit the map to it (refit), and on a turn of the phone while folded, fill the height
     *  if it's now upright at whole-map view, or go back to the whole map from a fill if it's now sideways. A fill
     *  that's now short of the view's height (a taller view, the same way up) fills it again. */
    function relayout() {
      var was = sideways;
      sideways = sidewaysNow();
      showFold();
      refit();
      bars.forEach(function (b) { b.fit(); });
      if (!folded) return;
      if (sideways === was) { if (!sideways && filled && cam.s < fillScale()) fillHeight(); }
      else if (!sideways) { if (wholeShown()) fillHeight(); }
      else if (filled) { wholeMap(); filled = false; }
    }
    foldBtn.addEventListener("click", function () { fold(!folded, true); });

    // the settings panel: the gear opens it; its とじる, a tap beside it, or closing the garden closes it.
    // Focus goes to its とじる, and back to the gear if it was in the panel
    function showMenu(open) {
      var back = !open && panel.contains(document.activeElement);
      menu.hidden = !open;
      gear.setAttribute("aria-expanded", String(open));
      if (open) menuClose.focus();
      else if (back) gear.focus();
    }
    gear.addEventListener("click", function () { showMenu(menu.hidden); });
    menuClose.addEventListener("click", function () { showMenu(false); });
    menu.addEventListener("click", function (e) { if (e.target === menu) showMenu(false); });
    showMenu(false);
    /** Add a switch for this phone's motion preference `name` to the settings, under the ones added before
     *  it (sway, then butterflies). apply(on) runs now and at every change; the root has
     *  kg-no-<name> while it's off, which is all a CSS-only one needs. Stored in PREFS_KEY, not the save,
     *  so a locked save doesn't stop it. With prefers-reduced-motion it's off and can't be changed. */
    function prefSwitch(name, label, apply) {
      var still = stillMotion(), on = !still && pref(name);
      var b = el("button", "kg-opt");
      b.type = "button";
      b.setAttribute("role", "switch");
      b.append(el("span", null, label), el("span", "kg-switch"));
      b.disabled = still;
      if (still) stillNote.hidden = false;
      function show() {
        b.setAttribute("aria-checked", String(on));
        root.classList.toggle("kg-no-" + name, !on);
        if (apply) apply(on);
      }
      b.addEventListener("click", function () {
        if (still) return;
        on = !on;
        setPref(name, on);
        show();
      });
      prefList.append(b);
      show();
    }

    // vacation: on after a yes, off at once
    function showVacation() {
      var on = isDay(s.vac);
      vacBtn.setAttribute("aria-checked", String(on));
      ui.vac.hidden = !on;
    }
    function setVacation(on) {
      vacation(s, on);
      hist = history(s);
      // the stages stay as they are, but no crop is ready while it's on: their glints go, and come back after
      lives = {};
      onHere().forEach(drawPlaced);
      persist();
      showVacation();
      flutter(true);          // none while it's on
    }
    vacBtn.addEventListener("click", function () {
      if (isDay(s.vac)) { setVacation(false); return; }
      var c = confirmBox(true);
      var text = el("div", "kg-ctext");
      text.append(el("strong", null, T.vacationAsk), el("span", "kg-keep", T.vacationKeep));
      var yes = el("button", "kg-btn kg-btn-go", T.yes);
      yes.type = "button";
      yes.addEventListener("click", function () { c.hidden = true; setVacation(true); });
      var no = el("button", "kg-btn", T.cancel);
      no.type = "button";
      no.addEventListener("click", function () { c.hidden = true; });
      c.append(text, yes, no);
      c.hidden = false;
    });

    if (dev) devBtn.addEventListener("click", function () {
      if (s.locked) return;
      s.coins += 100;
      persist();
      renderGrid();           // prices the player can now pay lose their grey
    });
    // 「+150」: 150 plants at once, for a performance test: picked at random from every plant with a life cycle but
    // the hanging ones (whose anchor is below the hook: ay > h), at random spots on the map shown out of its water. Each
    // joins the life cycle today at its mature stage, as enrol has a plant join; nothing is paid or taken from もちもの
    if (dev) fillBtn.addEventListener("click", function () {
      if (s.locked) return;
      var kinds = KG_CATALOG.map(function (e) { return ITEMS[e[0]]; }).filter(function (i) {
        return i.sold && i.frames.length > 1 && i.frames[0].ay <= i.frames[0].h;
      });
      var day = today();
      for (var n = 0; n < 150; n++) {
        var item = kinds[Math.floor(Math.random() * kinds.length)], at;
        do at = onMap(item, Math.random() * WORLD_W, Math.random() * WORLD_H);
        while (wet(MAP[here], at.x, at.y));
        var p = { id: s.next++, k: item.key, x: at.x, y: at.y };
        if (here !== "home") p.m = here;
        p.t = day;
        p.g = item.frames.length - 3;
        s.placed.push(p);
        drawPlaced(p);
      }
      persist();
      flutter(true);          // more flowers, more butterflies
    });

    // the test day: by days on from the offset now, or null for the real day. Everything that depends on the
    // day is worked out again; plants found dead stay dead, as on a real day
    function showDay() {
      dayLabel.hidden = !shift;
      dayLabel.textContent = shift ? T.dayMoved(shift) : "";
      dayLabel.setAttribute("aria-label", shift ? T.testDayMoved(shift) : "");
    }
    function moveDay(by) {
      if (s.locked) return;
      shift = by == null ? 0 : devShift() + by;    // from the stored offset, the one later cards use
      try { localStorage.setItem(DAY_KEY, String(shift)); } catch (e) { /* storage blocked: this opening only */ }
      markDead(s);
      hist = history(s);
      lives = {};
      composting = false;     // which plants are dead may change: back to the selected plant's own question
      capped = false;         // the cap's note was for the day left
      onHere().forEach(drawPlaced);
      persist();
      showVacation();
      showHint();
      renderGrid();
      showDay();
      flutter(true);          // flowers may have started dying, or come back
    }
    if (dev) {
      dayBack.addEventListener("click", function () { moveDay(-1); });
      dayOn.addEventListener("click", function () { moveDay(1); });
      dayLabel.addEventListener("click", function () { moveDay(null); });
      showDay();
    }

    // once, after load() paid back items the shop no longer sells. The note names them in Japanese, as the save
    // is the same in every language: removedName gives T's name for each
    function showRefund() {
      var r = s.refunded;
      if (!r) return;
      delete s.refunded;
      var c = confirmBox();
      var got = Object.keys(r.items);
      var names = got.map(function (n) { return removedName(n) + (r.items[n] > 1 ? T.count(r.items[n]) : ""); });
      var text = el("div", "kg-ctext");
      var what = el("span", null, "");
      what.append(el("strong", null, names.join(T.listSep)),
        document.createTextNode(T.goneFromShop(got.length > 1 || r.items[got[0]] > 1)));
      text.append(what);
      var line = el("span", null, "");
      line.append(coinIcon(), document.createTextNode(" +" + r.coins));
      text.append(line);
      var okb = el("button", "kg-btn", T.ok);
      okb.type = "button";
      okb.addEventListener("click", function () { c.hidden = true; });
      c.append(text, okb);
      c.hidden = false;
    }

    // touch: pan, pinch, tap (to select, or to pick a ready crop), drag the selected item
    var pts = {}, gesture = null;
    function count() { return Object.keys(pts).length; }
    function pair() { var k = Object.keys(pts); return [pts[k[0]], pts[k[1]]]; }
    view.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".kg-hint button, .kg-zoom, .kg-go")) return;
      view.setPointerCapture(e.pointerId);
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count() === 2) {
        var p = pair();
        gesture = { type: "pinch", d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), s: cam.s };
        return;
      }
      var hit = e.target.closest(".kg-item");
      var id = hit ? Number(hit.dataset.id) : null;
      gesture = { type: id != null && id === selected && !placing && !dead(find(id)) ? "drag" : "pan",
        sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, id: id, moved: false };
      if (gesture.type === "drag") {
        var w0 = toWorld(e.clientX, e.clientY), p0 = find(id);
        gesture.dx = p0.x - w0.x;
        gesture.dy = p0.y - w0.y;
      }
    });
    view.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId] || !gesture) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (gesture.type === "pinch" && count() === 2) {
        var p = pair(), r = view.getBoundingClientRect();
        var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        zoomAt(gesture.s * d / gesture.d / cam.s, (p[0].x + p[1].x) / 2 - r.left, (p[0].y + p[1].y) / 2 - r.top);
        return;
      }
      if (Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 8) gesture.moved = true;
      if (!gesture.moved) return;
      if (gesture.type === "drag") {
        var w = toWorld(e.clientX, e.clientY), q = find(gesture.id);
        var at = onMap(ITEMS[q.k], w.x + gesture.dx, w.y + gesture.dy);
        q.x = at.x;
        q.y = at.y;
        drawPlaced(q);
        if (q.id === selected) placeGo();
      } else if (gesture.type === "pan") {
        cam.x = gesture.cx + e.clientX - gesture.sx;
        cam.y = gesture.cy + e.clientY - gesture.sy;
        clamp();
      }
    });
    function up(e) {
      if (!pts[e.pointerId]) return;
      delete pts[e.pointerId];
      if (!gesture) return;
      if (gesture.type === "pinch") { if (!count()) gesture = null; return; }
      if (gesture.type === "drag" && gesture.moved) persist();
      if (!gesture.moved && e.type === "pointerup") {
        if (placing) place(placing, toWorld(e.clientX, e.clientY));
        else if (gesture.id != null && gesture.id === selected && selectedSign()) walk(signTo(selectedSign()));   // a second tap
        else if (gesture.id != null && ripe(find(gesture.id))) harvest(find(gesture.id));     // the next tap selects it
        else if (gesture.id != null) select(gesture.id === selected ? null : gesture.id);
        else select(null);
      }
      gesture = null;
    }
    view.addEventListener("pointerup", up);
    view.addEventListener("pointercancel", up);
    view.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = view.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    zin.addEventListener("click", function () { zoomAt(1.5, view.clientWidth / 2, view.clientHeight / 2); });
    zout.addEventListener("click", function () { zoomAt(1 / 1.5, view.clientWidth / 2, view.clientHeight / 2); });
    // AnkiDroid reads touches on the document for its own gestures; keep them inside the garden
    ["touchstart", "touchend", "touchmove", "click"].forEach(function (t) {
      root.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true });
    });

    function shut() {
      if (gesture && gesture.type === "drag" && gesture.moved) persist();
      watch.disconnect();
      window.removeEventListener("resize", relayout);
      document.removeEventListener("visibilitychange", flight);
      bars.forEach(function (b) { b.stop(); });
      bugsOn = false;
      flutter(false);         // stops their loop
      root.remove();
      document.documentElement.classList.remove("kg-open");
      if (onClose) onClose(s);
    }
    close.addEventListener("click", shut);
    window.addEventListener("resize", relayout);
    document.addEventListener("visibilitychange", flight);     // no butterfly loop while the page is hidden
    // The answer buttons are native AnkiDroid controls outside this page, so they can't be blocked.
    // Answering swaps in the next card, which removes the slot: close the garden then.
    var watch = new MutationObserver(function () { if (!slot.isConnected) shut(); });
    watch.observe(document.body, { childList: true, subtree: true });

    showMap();
    showVacation();
    if (s.locked) {           // a save from a newer script, or one it can't read (see load): say so, not an empty garden
      confirmBox().append(el("div", "kg-ctext", s.nostore ? T.noStorage : T.locked));
      ui.confirm.hidden = false;
    }
    showRefund();
    persist();
    renderGrid();
    sideways = sidewaysNow();
    showFold();
    cam.fit = fitScale();
    cam.s = cam.fit;
    clamp();
    if (folded && !sideways) fillHeight();    // opened folded, upright: at fill height
    prefSwitch("sway", T.sway, setSway);
    prefSwitch("butterflies", T.butterflies, setBugs);
    requestAnimationFrame(function () {
      refit();
      if (folded && !sideways && !filled && wholeShown()) fillHeight();    // opened before the view was laid out
    });
  }

  // ---- style ----------------------------------------------------------------------------------
  function injectStyle() {
    if (document.getElementById("kg-style")) return;
    var st = el("style");
    st.id = "kg-style";
    st.textContent = CSS;
    document.head.append(st);
  }
  var CSS = [
    "@font-face{font-family:'KG Klee';src:url('_kleeone-regular.ttf');font-display:swap}",
    ".kg-root,.kg-chip,.kg-toast{--kg-wood:#7a4b2a;--kg-wood-dark:#4a2c17;--kg-paper:#f4e6c4;--kg-paper-2:#e9d4a4;",
    "--kg-ink:#3a2614;--kg-gold:#f3b72f;--kg-gold-dark:#a86c0c;--kg-leaf:#3f7d32;--kg-shade:#203a1c;--kg-night:#2f3a63;",
    "--kg-font:'KG Klee','Klee One','Hiragino Maru Gothic ProN','Noto Sans JP',sans-serif;font-family:var(--kg-font)}",
    // English (inLang): a rounded sans the phone may have, else its own; Klee One is for kana
    ".kg-root[lang=en],.kg-chip[lang=en],.kg-toast[lang=en]{--kg-font:ui-rounded,'SF Pro Rounded','Nunito','Varela Round',",
    "'Quicksand',system-ui,sans-serif}",
    ".kg-coin{display:inline-block;width:1em;height:1em;border-radius:50%;flex:none;vertical-align:-.12em;",
    "background:radial-gradient(circle at 35% 30%,#fff3b8 0 18%,var(--kg-gold) 19% 62%,var(--kg-gold-dark) 63%);",
    "box-shadow:inset 0 0 0 .08em var(--kg-gold-dark)}",
    ".kg-chip{position:fixed;right:12px;bottom:12px;z-index:9000;display:flex;align-items:center;gap:6px;",
    "padding:6px 12px 6px 9px;font-size:18px;font-weight:700;color:var(--kg-ink);background:var(--kg-paper);",
    "border:3px solid var(--kg-wood-dark);border-radius:6px;box-shadow:0 3px 0 var(--kg-wood-dark);cursor:pointer;",
    "font-variant-numeric:tabular-nums}",
    ".kg-chip:active{transform:translateY(2px);box-shadow:0 1px 0 var(--kg-wood-dark)}",
    ".kg-chip-vac{padding:1px 7px;border-radius:9px;background:var(--kg-night);color:#ffe9a6;font-size:12px;white-space:nowrap}",
    ".kg-chip-vac[hidden]{display:none}",
    ".kg-plus{position:absolute;right:8px;top:-4px;color:var(--kg-gold-dark);font-size:16px;font-weight:700;",
    "text-shadow:0 1px 0 #fff;animation:kg-up 1.1s ease-out forwards;pointer-events:none}",
    ".kg-toast{position:fixed;left:50%;bottom:16px;z-index:9000;display:flex;align-items:center;gap:4px;",
    "transform:translateX(-50%);padding:6px 14px;font:700 17px var(--kg-font);color:var(--kg-ink);",
    "background:var(--kg-paper);border:3px solid var(--kg-wood-dark);border-radius:6px;pointer-events:none;",
    "font-variant-numeric:tabular-nums;animation:kg-toast 1.6s ease-out forwards}",
    "@keyframes kg-toast{from{opacity:0;transform:translate(-50%,8px)}12%{opacity:1;transform:translate(-50%,0)}",
    "75%{opacity:1}to{opacity:0}}",
    "@keyframes kg-up{from{opacity:0;transform:translateY(6px)}20%{opacity:1}to{opacity:0;transform:translateY(-26px)}}",
    "html.kg-open,html.kg-open body{overflow:hidden}",
    // edge to edge, with no room for the phone's bars: on a card the web view sits between AnkiDroid's toolbar and
    // its answer buttons, never under the bars, though it still reports their safe-area insets
    ".kg-root{position:fixed;inset:0;z-index:9500;display:flex;flex-direction:column;background:var(--kg-shade);",
    "color:var(--kg-ink);font-size:15px;line-height:1.35;-webkit-user-select:none;user-select:none}",
    ".kg-root button{font:inherit}",
    ".kg-root [hidden]{display:none!important}",
    ".kg-top{display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--kg-wood);",
    "border-bottom:3px solid var(--kg-wood-dark);color:var(--kg-paper)}",
    // the title: the map's name and a dot per map (showTop): filled for this map, hollow for another open one, a lock for
    // one still locked
    ".kg-title{flex:1;min-width:0;display:flex;align-items:center;gap:10px}",
    ".kg-map-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:18px;font-weight:700;",
    "letter-spacing:.05em}",
    ".kg-dots{flex:none;display:flex;align-items:center;gap:5px}",
    ".kg-dot{width:8px;height:8px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--kg-paper)}",
    ".kg-dot-here{background:var(--kg-paper)}",
    ".kg-dot-lock{width:9px;height:11px;border-radius:0;box-shadow:none;opacity:.8;background:url(\"data:image/svg+xml,",
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 9 11'%3E%3Cpath d='M2.2 5V3.4a2.3 2.3 0 0 1 4.6 0V5' fill='none' ",
    "stroke='%23f4e6c4' stroke-width='1.5'/%3E%3Crect x='.5' y='4.6' width='8' height='6' rx='1' fill='%23f4e6c4'/%3E%3C/svg%3E\") ",
    "center/contain no-repeat}",
    // a narrow phone: the name smaller, over the dots, and the purse and とじる narrower, so the longest name still fits
    // beside a five-digit purse, the gear and とじる
    "@media (max-width:480px){.kg-top{gap:6px}.kg-title{flex-direction:column;align-items:flex-start;gap:3px}",
    ".kg-map-name{max-width:100%;font-size:13px;letter-spacing:0}.kg-top .kg-purse{padding:3px 8px}.kg-top .kg-close{padding:4px 10px}.kg-top .kg-gear{width:36px}}",
    // the narrowest phones (320 px): smaller still, the purse's digits too
    "@media (max-width:359px){.kg-top{padding:8px 8px}.kg-map-name{font-size:12px}.kg-top .kg-purse{padding:3px 6px;font-size:15px;gap:4px}",
    ".kg-top .kg-close{padding:4px 8px}}",
    ".kg-purse{display:flex;align-items:center;gap:6px;padding:3px 10px;background:var(--kg-wood-dark);",
    "border-radius:4px;font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;color:#ffe9a6}",
    ".kg-btn{min-height:36px;padding:4px 14px;color:var(--kg-ink);background:var(--kg-paper);border:2px solid var(--kg-wood-dark);",
    "border-radius:5px;box-shadow:0 2px 0 var(--kg-wood-dark);cursor:pointer;font-weight:700;white-space:nowrap}",
    ".kg-btn:active{transform:translateY(2px);box-shadow:none}",
    ".kg-btn-go{background:#9fd36f}",
    ".kg-btn:disabled{opacity:.5;cursor:default}",
    // the gear: a drawn one, so it looks the same whatever fonts the phone has
    ".kg-gear{display:flex;align-items:center;justify-content:center;width:40px;padding:0}",
    ".kg-gear::before{content:'';width:22px;height:22px;background:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' ",
    "viewBox='0 0 24 24' fill='%233a2614'%3E%3Crect x='10' y='1' width='4' height='22' rx='1'/%3E",
    "%3Crect x='10' y='1' width='4' height='22' rx='1' transform='rotate(45 12 12)'/%3E",
    "%3Crect x='10' y='1' width='4' height='22' rx='1' transform='rotate(90 12 12)'/%3E",
    "%3Crect x='10' y='1' width='4' height='22' rx='1' transform='rotate(135 12 12)'/%3E",
    "%3Ccircle cx='12' cy='12' r='7.5'/%3E%3Ccircle cx='12' cy='12' r='3' fill='%23f4e6c4'/%3E%3C/svg%3E\") center/contain no-repeat}",
    // a scroller in its box, with a thin thumb (scrollBar) for its native bar, which each scroller's own rules hide
    // (scrollbar-width, and ::-webkit-scrollbar where the page styles that). The thumb shows at once and fades out
    ".kg-scroll{position:relative;display:flex;flex-direction:column;min-height:0}",
    ".kg-bar{position:absolute;top:3px;right:3px;width:4px;border-radius:2px;background:var(--kg-wood);opacity:0;",
    "pointer-events:none;transition:opacity .3s}",
    ".kg-bar-on{opacity:.5;transition:none}",
    ".kg-panel-box>.kg-bar{top:6px;right:6px}",     // inside the panel's 3 px border
    // the settings: the garden dimmed, and a panel under the gear; the vacation question goes over it (kg-over)
    ".kg-menu{position:absolute;inset:0;z-index:6;display:flex;align-items:flex-start;justify-content:flex-end;",
    "padding:56px 8px 8px;background:rgba(20,30,15,.45)}",
    // the panel's box (scrollBar) takes its width and height; the panel shrinks to it and scrolls
    ".kg-panel-box{width:min(100%,360px);max-height:100%}",
    ".kg-panel{box-sizing:border-box;display:flex;flex-direction:column;gap:8px;overflow-y:auto;overscroll-behavior:contain;",
    "padding:8px 10px 10px;background:var(--kg-paper);border:3px solid var(--kg-wood-dark);border-radius:8px;",
    "box-shadow:0 4px 0 var(--kg-wood-dark);scrollbar-width:none}",
    ".kg-panel::-webkit-scrollbar{display:none}",
    ".kg-panel-h{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:17px}",
    ".kg-prefs{display:flex;flex-direction:column;gap:8px}",
    ".kg-prefs:empty{display:none}",
    ".kg-note{margin:-2px 2px 0;font-size:12px}",
    ".kg-ver{margin:0 2px;font-size:11px;text-align:right;opacity:.5}",     // the version: small and quiet
    // a switch row: the knob goes right and the track turns green while it's on (night blue for vacation)
    ".kg-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:44px;",
    "padding:6px 10px 6px 12px;color:var(--kg-ink);background:#fffaf0;border:2px solid var(--kg-paper-2);border-radius:6px;",
    "cursor:pointer;font-weight:700;text-align:left}",
    ".kg-opt:disabled{opacity:.5;cursor:default}",
    ".kg-switch{position:relative;flex:none;width:30px;height:18px;border-radius:9px;background:var(--kg-paper-2);",
    "box-shadow:inset 0 0 0 2px var(--kg-wood-dark)}",
    ".kg-switch::after{content:'';position:absolute;left:3px;top:3px;width:12px;height:12px;border-radius:50%;",
    "background:var(--kg-wood-dark);transition:left .15s}",
    ".kg-opt[aria-checked=true] .kg-switch{background:var(--kg-leaf)}",
    ".kg-opt[aria-checked=true] .kg-switch::after{left:15px;background:#fff}",
    ".kg-vac[aria-checked=true]{background:#d9def2}",
    ".kg-vac[aria-checked=true] .kg-switch{background:var(--kg-night)}",
    ".kg-vac[aria-checked=true] .kg-switch::after{background:#ffe9a6}",
    // the test controls: dashed and flat on dark wood, so they never pass for part of the game
    ".kg-devset{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 8px 8px;background:var(--kg-wood-dark);",
    "border:2px dashed #ffe9a6;border-radius:6px}",
    ".kg-devset-h{width:100%;color:#ffe9a6;font-size:12px;font-weight:700}",
    ".kg-dev{min-height:26px;padding:0 8px;font-size:12px;color:#ffe9a6;background:none;border:2px dashed #ffe9a6;",
    "box-shadow:none;font-variant-numeric:tabular-nums}",
    ".kg-dev-day{color:var(--kg-wood-dark);background:#ffe9a6}",   // the day offset; a tap goes back to the real day
    ".kg-vac-badge{position:absolute;left:8px;bottom:8px;z-index:5;padding:4px 12px;background:var(--kg-night);color:#ffe9a6;",
    "border:2px solid #1c2442;border-radius:999px;font-size:14px;font-weight:700;pointer-events:none}",
    ".kg-btn:focus-visible,.kg-opt:focus-visible,.kg-card:focus-visible,.kg-tab:focus-visible,.kg-chip:focus-visible{outline:3px solid #fff;outline-offset:2px}",
    ".kg-panel .kg-btn:focus-visible,.kg-opt:focus-visible{outline-color:var(--kg-wood-dark)}",   // white is lost on paper
    ".kg-view{position:relative;flex:1;min-height:120px;overflow:hidden;touch-action:none;background:var(--kg-shade)}",
    ".kg-world{position:absolute;left:0;top:0;transform-origin:0 0}",
    ".kg-ground,.kg-bg{position:absolute;inset:0;width:100%;height:100%;max-width:none;pointer-events:none}",
    // a placed sign's hit area reaches 16 px round it on the screen whatever the zoom: the world's --kg-s is its scale
    // (clamp); its picture goes over it
    ".kg-signpost::before{content:'';position:absolute;inset:calc(-16px / var(--kg-s,1))}",
    ".kg-signpost>.kg-sprite{position:relative}",
    // a selected sign's label, over the map at screen size above the post (placeGo), a tail pointing down at it
    ".kg-go{position:absolute;left:0;top:0;z-index:3;display:flex;align-items:center;gap:3px;min-height:28px;",
    "padding:2px 10px;font-size:13px;border-radius:999px}",
    ".kg-go::after{content:'';position:absolute;left:50%;top:100%;margin:2px 0 0 -5px;border:5px solid transparent;",
    "border-bottom:0;border-top-color:var(--kg-wood-dark)}",
    ".kg-go:active::after{display:none}",
    // the walk: the view goes dark and the next map fades in (walk)
    ".kg-veil{position:absolute;inset:0;z-index:4;background:var(--kg-shade);pointer-events:none;",
    "animation:kg-veil .45s ease-in forwards}",
    "@keyframes kg-veil{from{opacity:1}to{opacity:0}}",
    ".kg-sprite{background-repeat:no-repeat}",
    ".kg-item{position:absolute}",
    // the shadow is on the picture, with the sway, so it sways with it; the pop scales the whole item
    ".kg-item>.kg-sprite{filter:drop-shadow(0 6px 3px rgba(20,40,10,.35))}",
    ".kg-sel>.kg-sprite{filter:drop-shadow(0 0 4px #fff) drop-shadow(0 0 4px #fff) drop-shadow(0 6px 3px rgba(20,40,10,.35))}",
    ".kg-pop{animation:kg-pop .35s ease-out}",
    "@keyframes kg-pop{from{transform:scale(.6);transform-origin:50% 100%}to{transform:scale(1)}}",
    // the sway: angle, length, delay and transform-origin per plant (swing)
    ".kg-sway{animation:kg-sway 3s ease-in-out infinite alternate}",
    "@keyframes kg-sway{from{transform:skewX(calc(-1*var(--kg-a)))}to{transform:skewX(var(--kg-a))}}",
    // a ready crop's glint (glint: its size and picture), in a box over its plant's picture that sways with it
    // (showCrop: the box's size, and the glint's place)
    ".kg-ripe{position:absolute;left:0;top:0}",
    ".kg-glint{position:absolute;background-repeat:no-repeat;image-rendering:pixelated}",
    // a butterfly: above every item (an item's z-index is its y, at most WORLD_H), under the garden's UI
    // (outside the world); taps go through it. Size, sheet and place per butterfly (newBug, drawBug)
    ".kg-bug{position:absolute;left:0;top:0;z-index:2000;background-repeat:no-repeat;image-rendering:pixelated;",
    "pointer-events:none;will-change:transform}",
    // a small pill; taps on it (outside its buttons) still reach the map, so it never blocks a spot. Centred, as
    // wide as its content, at most the view's width less 6px on each side (a left:50% would leave it only half)
    ".kg-hint{position:absolute;left:6px;right:6px;top:6px;z-index:5;display:flex;align-items:center;gap:6px;",
    "width:fit-content;margin:0 auto;padding:3px 4px 3px 10px;background:rgba(244,230,196,.92);",
    "border:2px solid var(--kg-wood-dark);border-radius:999px;font-size:13px;font-weight:700;white-space:nowrap;pointer-events:none}",
    ".kg-hint>span{overflow:hidden;text-overflow:ellipsis}",
    // the compost-all question is too long for one line on a phone, as is the harvest's note in English: each wraps,
    // at its spaces only (keep-all keeps the kana words whole), in a pill with smaller corners for two lines
    ".kg-hint-all,.kg-hint-note{border-radius:18px}",
    ".kg-hint-all>span,.kg-hint-note>span{white-space:normal;word-break:keep-all;overflow-wrap:anywhere;line-height:1.35}",
    ".kg-hint .kg-sprite{flex:none}",
    ".kg-hint .kg-btn{flex:none;min-height:30px;padding:2px 10px;pointer-events:auto;border-radius:999px}",   // only the text gives way
    ".kg-hint .kg-x{width:30px;padding:0}",
    // the coins from a pick, floating up over the map at screen size (gain): the div is the spot, set in px, and its
    // coins sit centred above it
    ".kg-gain{position:absolute;z-index:3;pointer-events:none;animation:kg-up 1.1s ease-out forwards}",
    ".kg-gain>span{position:absolute;left:0;bottom:0;display:flex;align-items:center;gap:3px;transform:translateX(-50%);",
    "color:#ffe9a6;font-size:18px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums;",
    "text-shadow:1px 1px 0 var(--kg-wood-dark),-1px 1px 0 var(--kg-wood-dark),1px -1px 0 var(--kg-wood-dark),",
    "-1px -1px 0 var(--kg-wood-dark),0 2px 0 var(--kg-wood-dark)}",
    ".kg-zoom{position:absolute;right:8px;bottom:8px;z-index:5;display:flex;flex-direction:column;gap:6px}",
    ".kg-zbtn{width:40px;min-height:40px;padding:0;font-size:20px}",
    ".kg-shop{position:relative;display:flex;flex-direction:column;height:clamp(170px,40%,340px);background:var(--kg-paper);",
    "border-top:3px solid var(--kg-wood-dark)}",
    // no scrollbar under the tabs, also where the page styles ::-webkit-scrollbar (AnkiDroid's study screen does); they
    // still scroll sideways by touch
    ".kg-tabs{display:flex;gap:4px;padding:6px 52px 0 6px;overflow-x:auto;background:var(--kg-wood);scrollbar-width:none}",
    ".kg-tabs::-webkit-scrollbar{display:none}",
    ".kg-tabs-box{flex:none}",
    ".kg-tab{color:var(--kg-ink);position:relative;flex:none;padding:6px 12px;border:2px solid var(--kg-wood-dark);border-bottom:0;",
    "border-radius:6px 6px 0 0;background:var(--kg-paper-2);cursor:pointer;font-weight:700}",
    ".kg-tab[aria-selected=true]{background:var(--kg-paper)}",
    ".kg-badge{display:inline-block;min-width:1.4em;margin-left:4px;padding:0 4px;border-radius:9px;",
    "background:var(--kg-leaf);color:#fff;font-size:12px;text-align:center}",
    ".kg-grid-box{flex:1}",
    ".kg-grid{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;padding:10px;",
    "align-content:start;overscroll-behavior:contain;scrollbar-width:none}",
    ".kg-grid::-webkit-scrollbar{display:none}",
    ".kg-card{color:var(--kg-ink);display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;background:#fffaf0;",
    "border:2px solid var(--kg-paper-2);border-radius:6px;cursor:pointer;min-width:0}",
    ".kg-card:active{border-color:var(--kg-wood)}",
    ".kg-on{border-color:var(--kg-leaf);background:#eef8df}",
    ".kg-poor{opacity:.55}",
    ".kg-poor .kg-price{color:#a3372a}",
    // a sign in もちもの that can't go on this map, with why; one in とち the player owns
    ".kg-off,.kg-owned{opacity:.55;cursor:default}",
    ".kg-why{font-size:11px;line-height:1.2;text-align:center}",
    ".kg-thumb{display:flex;align-items:flex-end;justify-content:center;width:60px;height:60px;flex:none}",
    ".kg-name{font-size:12px;line-height:1.25;text-align:center;overflow-wrap:anywhere}",
    ".kg-price,.kg-count{display:flex;align-items:center;gap:3px;font-weight:700;font-variant-numeric:tabular-nums}",
    ".kg-empty{grid-column:1/-1;margin:16px 4px;text-align:center}",
    ".kg-confirm{position:absolute;left:8px;right:8px;bottom:8px;z-index:3;display:flex;flex-wrap:wrap;align-items:center;gap:10px;",
    "padding:10px;background:#fffaf0;border:3px solid var(--kg-wood-dark);border-radius:8px;box-shadow:0 4px 0 var(--kg-wood-dark)}",
    // the shop folded: only its tab row, each tab a whole one, and a message floats over the bottom of the map,
    // above it. The fold button sits at the row's right end, over its padding
    ".kg-btn.kg-fold{position:absolute;top:5px;right:6px;z-index:4;width:40px;min-height:32px;padding:0;font-size:15px;line-height:1}",
    ".kg-shop-min .kg-shop{height:auto}",
    ".kg-shop-min .kg-grid-box{display:none}",
    ".kg-shop-min .kg-tabs{padding-bottom:6px}",
    ".kg-shop-min .kg-tab{border-bottom:2px solid var(--kg-wood-dark);border-radius:6px}",
    ".kg-shop-min .kg-tab[aria-selected=true]{background:var(--kg-paper-2)}",
    ".kg-shop-min .kg-confirm{bottom:calc(100% + 8px);z-index:5}",
    ".kg-confirm.kg-over{z-index:7}",      // after the folded one: the vacation question still goes over the settings
    ".kg-ctext{flex:1 1 150px;display:flex;flex-direction:column;gap:2px;min-width:0}",
    ".kg-keep{word-break:keep-all}",           // break only at the spaces between words
    "@media " + SIDEWAYS + "{.kg-root{flex-direction:row;flex-wrap:wrap}",
    ".kg-top{width:100%}.kg-view{height:calc(100% - 56px)}.kg-shop{width:min(46%,340px);height:calc(100% - 56px);border-top:0;",
    "border-left:3px solid var(--kg-wood-dark)}.kg-opt{min-height:38px}",
    // folded sideways: a 54 px strip of tabs written top to bottom, under the fold button (English lies on its side
    // there, reading down like a book's spine); a message floats over the bottom of the map, left of the strip
    ".kg-shop-min .kg-shop{width:54px;height:calc(100% - 56px)}",
    ".kg-shop-min .kg-tabs-box{flex:1}",
    ".kg-shop-min .kg-tabs{flex-direction:column;align-items:flex-end;flex:1;min-height:0;box-sizing:border-box;padding:46px 0 8px 6px;",
    "overflow-x:hidden;overflow-y:auto}",
    ".kg-shop-min .kg-tab{writing-mode:vertical-rl;padding:10px 6px;border-right:0;border-radius:6px 0 0 6px}",
    ".kg-shop-min .kg-badge{margin:4px 0 0;padding:3px 0;text-combine-upright:all}",    // the count upright, below the name
    ".kg-shop-min .kg-confirm{position:fixed;left:8px;right:62px;bottom:8px}",
    ".kg-shop-min .kg-btn.kg-fold{right:7px}}",
    "@media (prefers-reduced-motion:reduce){.kg-plus,.kg-gain,.kg-pop,.kg-toast,.kg-sway{animation:none}.kg-plus{opacity:0}.kg-bug{display:none}.kg-veil{display:none}",
    ".kg-switch::after,.kg-bar{transition:none}}"
  ].join("");

  window.KanpekiGarden = { mount: mount, load: load, save: save, earn: earn, life: lifeOf, swayOf: swayOf,
    butterflies: butterflies, blooms: blooms, cropOf: cropOf, items: ITEMS, text: TEXT, maps: MAPS };

  // On a card: mount into #kg in AnkiDroid's study screen only (ankidroid-reviewer.js defines
  // ankidroid.userAction; the previewer and desktop Anki do not).
  var slot = document.getElementById("kg");
  var g = typeof globalThis !== "undefined" ? globalThis : window;
  if (slot && g.ankidroid && typeof g.ankidroid.userAction === "function") mount(slot);
})();
