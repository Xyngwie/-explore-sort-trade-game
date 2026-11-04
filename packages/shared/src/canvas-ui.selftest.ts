/** Canvas UI core selftest (docs/CANVAS_SHELL_V0.md §3). */
import assert from "node:assert/strict";
import { CanvasUI, CANVAS_SCROLL_SLOP_PX, ellipsize, wrapText, backingSize, clientToCanvas, type Rect } from "./canvas-ui";
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

console.log("canvas-ui selftest: OK");
