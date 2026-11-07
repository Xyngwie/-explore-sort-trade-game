/** Canvas UI core selftest (docs/CANVAS_SHELL_V0.md §3). */
import assert from "node:assert/strict";
import { CanvasUI, CANVAS_SCROLL_SLOP_PX, ContactRouter, canvasDebugEnabled, canvasNewGameDestination, ellipsize, wrapText, backingSize, clientToCanvas, type RawPointerHandler, type Rect } from "./canvas-ui";
import { createStubCtx } from "./canvas-ui/test-ctx";

const ctx = createStubCtx();
const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// --- DPR / coordinate conversion -----------------------------------------
assert.deepEqual(backingSize(390, 844, 3), { w: 1170, h: 2532 });
assert.deepEqual(backingSize(390.5, 844, 2), { w: 781, h: 1688 });
assert.deepEqual(backingSize(100, 100, 0), { w: 100, h: 100 });
// Canvas displayed at its CSS size: client → canvas is an offset only.
assert.deepEqual(clientToCanvas(110, 220, { left: 10, top: 20, width: 390, height: 844 }, 390, 844), { x: 100, y: 200 });
// Canvas stretched by CSS (e.g. zoomed): positions scale back to drawing coordinates.
assert.deepEqual(clientToCanvas(200, 100, { left: 0, top: 0, width: 800, height: 400 }, 400, 200), { x: 100, y: 50 });

// --- buttons: press, release, slide off, disabled, blocked ----------------
let blocked = false;
let hits: string[] = [];
const ui = new CanvasUI({ blocked: () => blocked });
const btnA: Rect = { x: 10, y: 10, w: 100, h: 44 };
const btnB: Rect = { x: 10, y: 60, w: 100, h: 44 };
let disabledB = false;
const frame = (extra?: () => void) => {
  ui.beginFrame(ctx, 400, 300);
  ui.button("a", btnA, "A", { onActivate: () => hits.push("a") });
  ui.button("b", btnB, "B", { disabled: disabledB, onActivate: () => hits.push("b") });
  extra?.();
  ui.endFrame();
};
frame();
ui.pointerDown(1, center(btnA));
assert.equal(ui.isPressed("a"), true, "pressed state while held");
frame();
assert.equal(hits.length, 0, "drawing never activates");
ui.pointerUp(1, center(btnA));
assert.deepEqual(hits, ["a"], "tap activates once");
// Slide off → cancel.
ui.pointerDown(2, center(btnA));
ui.pointerMove(2, { x: 300, y: 200 });
assert.equal(ui.isPressed("a"), false);
ui.pointerUp(2, { x: 300, y: 200 });
assert.deepEqual(hits, ["a"], "release outside does nothing");
// Press A, release on B → nothing.
ui.pointerDown(3, center(btnA));
ui.pointerUp(3, center(btnB));
assert.deepEqual(hits, ["a"], "release on another button does nothing");
// pointercancel → nothing.
ui.pointerDown(4, center(btnA));
ui.pointerCancel(4);
ui.pointerUp(4, center(btnA));
assert.deepEqual(hits, ["a"], "cancelled pointer does nothing");
// Disabled.
disabledB = true; frame();
ui.pointerDown(5, center(btnB)); ui.pointerUp(5, center(btnB));
assert.deepEqual(hits, ["a"], "disabled never activates");
disabledB = false; frame();
// Blocked (play log saving).
blocked = true;
ui.pointerDown(6, center(btnA)); ui.pointerUp(6, center(btnA));
assert.deepEqual(hits, ["a"], "blocked → no activation");
blocked = false;
// Second finger cancels the first and is ignored itself.
ui.pointerDown(7, center(btnA));
ui.pointerDown(8, center(btnB));
ui.pointerUp(7, center(btnA));
ui.pointerUp(8, center(btnB));
assert.deepEqual(hits, ["a"], "two fingers → nothing");
ui.pointerDown(9, center(btnB)); ui.pointerUp(9, center(btnB));
assert.deepEqual(hits, ["a", "b"], "next single tap works again");
// First finger stays down; the second lifts and taps again: still nothing (all fingers are tracked).
hits = [];
ui.pointerDown(30, center(btnA));
ui.pointerDown(31, center(btnB)); ui.pointerUp(31, center(btnB));
ui.pointerDown(32, center(btnB)); ui.pointerUp(32, center(btnB));
assert.deepEqual(hits, [], "a re-tap while the first finger stays down does nothing");
ui.pointerDown(33, center(btnA)); ui.pointerMove(33, center(btnA)); ui.pointerUp(33, center(btnA));
assert.deepEqual(hits, [], "still nothing while finger 30 touches");
ui.pointerUp(30, center(btnA));
assert.deepEqual(hits, [], "lifting the first finger does not fire either");
ui.pointerDown(34, center(btnA)); ui.pointerUp(34, center(btnA));
assert.deepEqual(hits, ["a"], "after every finger is lifted, a single tap works");
// A release that never arrived (e.g. the page was blocked while saving): the next primary touch forgets it.
ui.pointerDown(35, center(btnA)); // no pointerUp
ui.pointerDown(36, center(btnB), true); ui.pointerUp(36, center(btnB));
assert.deepEqual(hits, ["a", "b"], "a primary touch clears stale pointers");
// pointercancel of every pointer (blur / hidden) clears the tracking too.
ui.pointerDown(37, center(btnA)); ui.pointerCancel();
ui.pointerDown(38, center(btnA)); ui.pointerUp(38, center(btnA));
assert.deepEqual(hits, ["a", "b", "a"], "cancel-all clears the tracking");

// --- scroll area: drag scrolls and never activates ------------------------
hits = [];
const area: Rect = { x: 0, y: 100, w: 400, h: 200 };
const inScroll = (off: number): Rect => ({ x: 10, y: 110 - off, w: 100, h: 44 });
const below = (off: number): Rect => ({ x: 10, y: 500 - off, w: 100, h: 44 });
const sframe = () => {
  ui.beginFrame(ctx, 400, 300);
  ui.scrollArea("s", area, 800, (off) => {
    ui.button("s1", inScroll(off), "S1", { onActivate: () => hits.push("s1") });
    ui.button("s2", below(off), "S2", { onActivate: () => hits.push("s2") });
  });
  ui.endFrame();
};
sframe();
assert.equal(ui.maxScroll("s"), 600);
const p0 = center(inScroll(0));
ui.pointerDown(10, p0);
ui.pointerMove(10, { x: p0.x, y: p0.y - (CANVAS_SCROLL_SLOP_PX - 2) });
assert.equal(ui.isPressed("s1"), true, "small jitter keeps the press");
ui.pointerMove(10, { x: p0.x, y: p0.y - 60 });
assert.equal(ui.getScroll("s"), 60, "drag scrolls");
ui.pointerMove(10, { x: p0.x, y: p0.y });
ui.pointerUp(10, p0);
assert.deepEqual(hits, [], "a drag that returns to the button still does not buy");
// Clamp.
ui.wheel({ x: 50, y: 150 }, 10_000);
assert.equal(ui.getScroll("s"), 600);
ui.wheel({ x: 50, y: 150 }, -10_000);
assert.equal(ui.getScroll("s"), 0);
// A button scrolled outside the visible area cannot be hit through the clip.
sframe();
const hidden = center(below(0)); // y=522: below the area (ends at 300)
ui.pointerDown(11, { x: hidden.x, y: 299 });
ui.pointerUp(11, { x: hidden.x, y: 299 });
assert.deepEqual(hits, [], "clipped button is not hittable");
ui.wheel({ x: 50, y: 150 }, 400);
sframe();
const visible = center(below(400));
ui.pointerDown(12, visible); ui.pointerUp(12, visible);
assert.deepEqual(hits, ["s2"], "scrolled into view → hittable at its drawn position");
ui.wheel({ x: 50, y: 150 }, -10_000);

// --- modal: blocks what is under it ----------------------------------------
hits = [];
let modalOpen = false;
const box: Rect = { x: 100, y: 100, w: 200, h: 120 };
const ok: Rect = { x: 120, y: 160, w: 70, h: 44 };
const mframe = () => {
  ui.beginFrame(ctx, 400, 300);
  ui.button("under", { x: 0, y: 0, w: 400, h: 300 }, "under", { onActivate: () => { hits.push("under"); modalOpen = true; } });
  if (modalOpen) ui.modal("m", () => {
    ui.region("m:box", box);
    ui.button("m:ok", ok, "OK", { onActivate: () => { hits.push("ok"); modalOpen = false; } });
  }, () => { hits.push("dismiss"); modalOpen = false; });
  ui.endFrame();
};
mframe();
// Press on "under", the modal opens before release (e.g. opened by something else) → no activation.
ui.pointerDown(20, { x: 20, y: 20 });
modalOpen = true; mframe();
ui.pointerUp(20, { x: 20, y: 20 });
assert.deepEqual(hits, [], "press that started under a modal never activates");
assert.equal(ui.topLayer, 1);
// Tap inside the box (not a button) → nothing.
ui.pointerDown(21, { x: 280, y: 110 }); ui.pointerUp(21, { x: 280, y: 110 });
assert.deepEqual(hits, []);
// Tap where "under" is visible around the modal → dismiss only, never "under".
ui.pointerDown(22, { x: 20, y: 20 }); ui.pointerUp(22, { x: 20, y: 20 });
assert.deepEqual(hits, ["dismiss"], "backdrop tap dismisses, the button under it does not fire");
mframe();
assert.equal(ui.topLayer, 0);
// Open via "under", then OK.
ui.pointerDown(23, { x: 20, y: 20 }); ui.pointerUp(23, { x: 20, y: 20 });
mframe();
ui.pointerDown(24, center(ok)); ui.pointerUp(24, center(ok));
assert.deepEqual(hits, ["dismiss", "under", "ok"]);
// Escape dismisses the top modal.
modalOpen = true; mframe();
assert.equal(ui.key("Escape"), true);
assert.equal(modalOpen, false);

// --- text helpers ------------------------------------------------------------
ctx.font = "10px x";
assert.equal(ellipsize(ctx, "abc", 100), "abc");
const cut = ellipsize(ctx, "あいうえおかきくけこ", 45);
assert.ok(cut.endsWith("…") && ctx.measureText(cut).width <= 45, cut);
assert.deepEqual(wrapText(ctx, "あいうえお", 20), ["あい", "うえ", "お"]);
assert.deepEqual(wrapText(ctx, "a\nb", 100), ["a", "b"]);

// --- one contact owner for buttons and raw boards (docs/CANVAS_UNIFIED_V0.md §13) -------
{
  const fired: string[] = [];
  const boardLog: string[] = [];
  const boardRect: Rect = { x: 0, y: 200, w: 400, h: 100 };
  const btn: Rect = { x: 10, y: 10, w: 100, h: 44 };
  const board: RawPointerHandler = {
    down: (e) => boardLog.push(`down:${e.id}`), move: (e) => boardLog.push(`move:${e.id}`),
    up: (e) => boardLog.push(`up:${e.id}`), cancel: () => boardLog.push("cancel"),
  };
  const u = new CanvasUI({ blocked: () => false });
  const f = () => { u.beginFrame(ctx, 400, 300); u.button("btn", btn, "B", { onActivate: () => fired.push("btn") }); u.rawRegion("board", boardRect, board); u.endFrame(); };
  f();
  const r = new ContactRouter(u);
  const t = (id: number, pt: { x: number; y: number }, primary = false) => ({ id, type: "touch", button: 0, buttons: 1, x: pt.x, y: pt.y, ctrl: false, primary });
  const onBtn = center(btn), onBoard = { x: 200, y: 250 };
  // The reported case: finger 1 presses the button, finger 2 lands on the board, finger 1 lifts.
  r.down(t(1, onBtn, true)); r.down(t(2, onBoard)); r.up({ ...t(1, onBtn), buttons: 0 });
  assert.deepEqual(fired, [], "button + board: lifting the first finger does not fire");
  assert.deepEqual(boardLog, [], "the board never saw the mixed finger");
  r.up({ ...t(2, onBoard), buttons: 0 });
  assert.deepEqual(boardLog, [], "nor its release");
  // Board first, then a button: the second finger joins the board (pinch), the button is not pressed.
  r.down(t(3, onBoard, true)); r.down(t(4, onBtn)); r.up({ ...t(4, onBtn), buttons: 0 }); r.up({ ...t(3, onBoard), buttons: 0 });
  assert.deepEqual(fired, []);
  assert.deepEqual(boardLog, ["down:3", "down:4", "up:4", "up:3"], "board-first fingers stay the board's (pinch)");
  boardLog.length = 0;
  // Button, then another button: cancelled, nothing fires.
  r.down(t(5, onBtn, true)); r.down(t(6, onBtn)); r.up({ ...t(6, onBtn), buttons: 0 }); r.up({ ...t(5, onBtn), buttons: 0 });
  assert.deepEqual(fired, []);
  // A board gesture in progress is cancelled when a button finger is already down... (button first) covered above;
  // and a board gesture is cancelled if a finger lands while a button finger is down on top of it:
  r.down(t(7, onBoard, true)); r.down(t(8, onBoard)); // pinch
  r.up({ ...t(8, onBoard), buttons: 0 }); r.up({ ...t(7, onBoard), buttons: 0 });
  boardLog.length = 0;
  // After all contacts are lifted, a single tap works again.
  r.down(t(9, onBtn, true)); r.up({ ...t(9, onBtn), buttons: 0 });
  assert.deepEqual(fired, ["btn"], "single tap after everything is lifted");
  // A release that never arrived: the next primary touch forgets it.
  r.down(t(10, onBtn, true)); // lost
  r.down(t(11, onBtn, true)); r.up({ ...t(11, onBtn), buttons: 0 });
  assert.deepEqual(fired, ["btn", "btn"], "primary touch clears stale contacts");
  // Mouse right button on a button: ignored; a left click works.
  const m = (b: number, bs: number) => ({ id: 1, type: "mouse", button: b, buttons: bs, x: onBtn.x, y: onBtn.y, ctrl: false, primary: true });
  r.down(m(2, 2)); r.up(m(2, 0));
  assert.equal(fired.length, 2, "right click on a button does nothing");
  r.down(m(0, 1)); r.up(m(0, 0));
  assert.equal(fired.length, 3, "left click works");
  // Mouse on the board: every button goes to the board (left / right / chord stay the board's rules).
  r.down({ ...m(2, 2), x: onBoard.x, y: onBoard.y }); r.up({ ...m(2, 0), x: onBoard.x, y: onBoard.y });
  assert.deepEqual(boardLog, ["down:1", "up:1"]);
  // #350 review: the primary cleanup cancels what the stale contact still holds.
  // Left held on a button, then another primary mouse down (right / middle): the press is cancelled, not orphaned.
  r.down(m(0, 1));
  assert.equal(u.pressing, true, "left press held");
  r.down(m(2, 3));
  assert.equal(u.pressing, false, "stale press cancelled by the next primary down");
  r.up(m(0, 0));
  assert.equal(fired.length, 3, "the cancelled press does not fire");
  r.down(m(0, 1)); r.up(m(0, 0));
  assert.equal(fired.length, 4, "a click works right after");
  // A board touch whose release never arrived: the next primary touch cancels the board gesture first.
  boardLog.length = 0;
  r.down(t(20, onBoard, true)); // release lost
  r.down(t(21, onBoard, true));
  assert.deepEqual(boardLog, ["down:20", "cancel", "down:21"], "stale board touch cancelled, the new touch is a fresh tap (not a pinch)");
  r.up({ ...t(21, onBoard), buttons: 0 });
  boardLog.length = 0;
  // cancelAll (blur / hidden) clears every contact.
  r.down(t(12, onBtn, true)); r.cancelAll(); r.up({ ...t(12, onBtn), buttons: 0 });
  assert.equal(fired.length, 4, "cancelled press does not fire");
  assert.equal(r.size, 0);
}

// Debug area (神宮決定 2026-11-06): local dev server or ?debug=1 only.
assert.equal(canvasDebugEnabled("", "localhost"), true);
assert.equal(canvasDebugEnabled("", "127.0.0.1"), true);
assert.equal(canvasDebugEnabled("", "xyngwie.github.io"), false, "public: hidden");
assert.equal(canvasDebugEnabled("?debug=1", "xyngwie.github.io"), true, "public with ?debug=1");
assert.equal(canvasDebugEnabled("?debug=0&x=1", "xyngwie.github.io"), false);
assert.equal(canvasDebugEnabled("?debug_fixture=shield", "xyngwie.github.io"), false, "the Alpha Lab fixture query is a different switch");

// #353 B1: 新規ゲーム keeps ?debug=1 when debug came from the URL (public host), and nothing else.
const base = "https://xyngwie.github.io/-explore-sort-trade-game/canvas/";
assert.equal(canvasNewGameDestination(base, "?debug=1", "xyngwie.github.io"), base + "?debug=1");
assert.equal(canvasNewGameDestination(base, "?debug=1&debug_fixture=shield&salvagedContainers=3", "xyngwie.github.io"), base + "?debug=1", "only debug=1 is carried");
assert.equal(canvasNewGameDestination(base, "", "xyngwie.github.io"), base);
assert.equal(canvasNewGameDestination("http://localhost:5175/canvas/", "", "localhost"), "http://localhost:5175/canvas/", "localhost is debug by host");
assert.equal(canvasNewGameDestination("http://127.0.0.1:5175/canvas/", "?debug=1", "127.0.0.1"), "http://127.0.0.1:5175/canvas/");

console.log("canvas-ui selftest: OK");
