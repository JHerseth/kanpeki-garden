// A tiny fake DOM and localStorage to run catalog.js + garden.js (as the _garden.js bundle does) in node.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DIR = path.join(__dirname, "..");
const CATALOG = fs.readFileSync(path.join(DIR, "catalog.js"), "utf8");
const GARDEN = fs.readFileSync(path.join(DIR, "garden.js"), "utf8");
const KEY = "kanpekikun-garden-2";           // the save, v: 2
const OLD_KEY = "kanpekikun-garden";         // v: 1's, left as it was

class Style { setProperty(k, v) { this[k] = v; } }

class Node {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.parent = null; this.text = ""; this.className = "";
    this.style = new Style(); this.dataset = {}; this.attrs = {}; this.hidden = false; this.on = {}; this.how = new Map();
    this.scrollTop = 0;
    this.classList = {
      add: (c) => { if (!this.classList.contains(c)) this.className += " " + c; },
      remove: (c) => {
        this.className = this.className.split(" ").filter((x) => x !== c).join(" ");
        if (c === "kg-sway") delete this.sway;     // its animation ends; the class back starts a new one
      },
      toggle: (c, on) => (on ? this.classList.add(c) : this.classList.remove(c)),
      contains: (c) => this.className.split(" ").includes(c),
    };
  }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(""); }
  set textContent(v) { this.text = String(v); this.children = []; }
  append(...ns) { for (let n of ns) { if (typeof n !== "object") n = Object.assign(new Node("#text"), { text: n }); n.parent = this; this.children.push(n); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  get isConnected() { let n = this; while (n.parent) n = n.parent; return n.tagName === "#document"; }
  setAttribute(k, v) { this.attrs[k] = v; }
  /** how: each listener's options, e.g. { passive: true }. */
  addEventListener(t, f, o) { (this.on[t] = this.on[t] || []).push(f); if (o) this.how.set(f, o); }
  removeEventListener(t, f) { this.on[t] = (this.on[t] || []).filter((g) => g !== f); }
  /** Fire event type t's listeners, as the page would. */
  fire(t) { (this.on[t] || []).forEach((f) => f({ type: t, target: this })); }
  click() { (this.on.click || []).forEach((f) => f({ stopPropagation() {}, target: this })); }
  closest() { return null; }
  setPointerCapture() {}
  /** The sway's CSS animations, on this node or, with { subtree: true }, below it too: one per .kg-sway
   *  node, kept until the class goes, and not started (startTime null) until the page sets it. */
  getAnimations(opts) {
    return (opts && opts.subtree ? this.all(() => true) : [this]).filter((n) => n.classList.contains("kg-sway"))
      .map((n) => n.sway || (n.sway = { animationName: "kg-sway", startTime: null }));
  }
  focus() { let n = this; while (n.parent) n = n.parent; n.activeElement = this; }
  contains(n) { while (n) { if (n === this) return true; n = n.parent; } return false; }
  getBoundingClientRect() { return { left: 0, top: 0 }; }
  /** A canvas's: draws nothing, and its picture is an empty PNG. */
  getContext() { return { fillRect() {} }; }
  toDataURL() { return "data:image/png;base64,"; }
  /** 400 x 300, or the size its page's layout gives it (see page's opts.screen). */
  get clientWidth() { return (this.size && this.size(this) || [400])[0]; }
  get clientHeight() { return (this.size && this.size(this) || [0, 300])[1]; }
  /** Its content's height: its clientHeight (nothing to scroll) unless a test sets one. */
  get scrollHeight() { return this.tall != null ? this.tall : this.clientHeight; }
  set scrollHeight(v) { this.tall = v; }
  all(pred, out = []) { if (pred(this)) out.push(this); this.children.forEach((c) => c.all(pred, out)); return out; }
}

/** A fresh page with the garden script loaded on it; `stored` is the localStorage map, kept between pages.
 *  opts.now: the time (ms) KG_CLOCK gives; opts.edit(win): runs between catalog.js and garden.js;
 *  opts.reduceMotion: the phone asks for prefers-reduced-motion; opts.src(code): changes garden.js first.
 *  opts.screen [w, h]: a phone's screen, whose map view (.kg-view) is the size the garden's CSS gives it, upright
 *  or sideways, with the shop open or folded (viewSize); win.turn(w, h) changes it and fires the window's resize.
 *  Without it every view is a fixed 400 x 300 and the page is sideways, so a fold never zooms the map.
 *  Animation frames wait in win.frames ({id: callback}) until win.tick(ms) runs them, as at time ms;
 *  document.hidden is the page's visibility (fire "visibilitychange" on the document after changing it).
 *  Timeouts wait in win.timers ({id: {f, at}}) until win.wait(ms) moves the page's timer clock (win.clock) on by
 *  ms and runs those due by then, in order. */
function page(stored, opts = {}) {
  const doc = new Node("#document");
  const html = new Node("html"), head = new Node("head"), body = new Node("body");
  doc.append(html); html.append(head, body);
  Object.assign(doc, {
    documentElement: html, head, body, activeElement: body, hidden: false,
    createElement: (t) => new Node(t),
    createTextNode: (t) => Object.assign(new Node("#text"), { text: String(t) }),
    getElementById: (id) => doc.all((n) => n.id === id)[0] || null,
  });
  const win = {
    document: doc,
    localStorage: { getItem: (k) => (k in stored ? stored[k] : null), setItem: (k, v) => { stored[k] = String(v); } },
    on: {},
    addEventListener(t, f) { (win.on[t] = win.on[t] || []).push(f); },
    removeEventListener(t, f) { win.on[t] = (win.on[t] || []).filter((g) => g !== f); },
    screen: opts.screen || null,
    turn(w, h) { win.screen = [w, h]; (win.on.resize || []).forEach((f) => f({ type: "resize" })); },
    frames: {}, nextFrame: 1,
    requestAnimationFrame(f) { win.frames[win.nextFrame] = f; return win.nextFrame++; },
    cancelAnimationFrame(id) { delete win.frames[id]; },
    tick(ms) { const fs = Object.values(win.frames); win.frames = {}; fs.forEach((f) => f(ms)); },
    MutationObserver: class { observe() {} disconnect() {} },
    timers: {}, nextTimer: 1, clock: 0,
    setTimeout(f, ms) { win.timers[win.nextTimer] = { f, at: win.clock + (ms || 0) }; return win.nextTimer++; },
    clearTimeout(id) { delete win.timers[id]; },
    wait(ms) {
      const end = win.clock + ms;
      for (;;) {
        const due = Object.keys(win.timers).filter((id) => win.timers[id].at <= end)
          .sort((a, b) => win.timers[a].at - win.timers[b].at || a - b)[0];
        if (due == null) break;
        const t = win.timers[due];
        delete win.timers[due];
        win.clock = t.at;
        t.f();
      }
      win.clock = end;
    },
    matchMedia: (q) => ({ matches: q === SIDEWAYS ? sideways(win.screen) : !!opts.reduceMotion && q === "(prefers-reduced-motion: reduce)" }),
  };
  const make = doc.createElement;
  doc.createElement = (t) => Object.assign(make(t), { size: (n) => win.screen && n.classList.contains("kg-view") ? viewSize(win.screen, n) : null });
  win.window = win;
  if (opts.now != null) win.KG_CLOCK = () => opts.now;
  vm.createContext(win);
  vm.runInContext(CATALOG, win);
  if (opts.edit) opts.edit(win);
  vm.runInContext(opts.src ? opts.src(GARDEN) : GARDEN, win);
  return win;
}

const SIDEWAYS = "(orientation:landscape) and (max-height:500px)";
function sideways(screen) { return !screen || (screen[0] > screen[1] && screen[1] <= 500); }
/** The map view's [w, h] on a phone screen [w, h], as the garden's CSS lays it out (measured in Chrome at 360 x 740
 *  and 740 x 360): under a 56 px top bar; upright above the shop (298 px, or its 50 px tab row folded), sideways
 *  left of it (343 px with its border, or a 57 px strip folded). */
function viewSize(screen, view) {
  const [w, h] = screen, folded = view.parent.classList.contains("kg-shop-min");
  return sideways(screen) ? [w - (folded ? 57 : 343), h - 56] : [w, Math.max(0, h - 56 - (folded ? 50 : 298))];
}

/** An opts.edit for page(): makes catalog item `key` what the build makes of a plant without stage art
 *  (one frame, its sheet sprite; not sold). The build has none left now that every plant has its strip, so tests
 *  fake one. */
function unsoldEdit(key) {
  return (win) => {
    const e = win.KG_CATALOG.find((x) => x[0] === key);
    e[4] = false;
    e[5] = [e[5][e[5].length - 3]];
  };
}

/** Mount the coin chip on a card (answered, if a card id is given) and tap it; returns the open garden's root.
 *  data: more of the slot's data- attributes, e.g. { dev: "1" }. */
function openGarden(win, card, data) {
  const slot = new Node("div");
  slot.dataset.kg = "garden";
  if (card != null) slot.dataset.card = String(card);
  Object.assign(slot.dataset, data);
  win.document.body.append(slot);
  win.KanpekiGarden.mount(slot);
  slot.all((n) => n.classList.contains("kg-chip"))[0].click();
  return win.document.body.all((n) => n.classList.contains("kg-root"))[0];
}

/** Tap the gear in an open garden's top bar; returns the settings panel. */
function openSettings(root) {
  root.all((n) => n.classList.contains("kg-gear"))[0].click();
  return root.all((n) => n.classList.contains("kg-panel"))[0];
}

module.exports = { KEY, OLD_KEY, Node, page, openGarden, openSettings, unsoldEdit };
