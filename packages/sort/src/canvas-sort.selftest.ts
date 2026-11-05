/** Canvas SORT scene selftest (docs/CANVAS_UNIFIED_V0.md §9, U-2). */
import assert from "node:assert/strict";
import { CanvasUI, HUB_SAVE_STORAGE_KEY, createHubSave, createNewGameHub, serializeHubSave, type Rect } from "@estg/shared";
import { createStubCtx } from "../../shared/src/canvas-ui/test-ctx";
import { SortScene, layoutSort, SORT_MAX_CELL_PX, PENDING_SORT_HANDOFF_KEY } from "./canvas-api";
import { SORT_V0_RULES } from "./refine";

class MemStore {
  map = new Map<string, string>();
  writes = 0;
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.writes++; this.map.set(k, String(v)); }
  removeItem(k: string) { this.writes++; this.map.delete(k); }
  clear() { this.map.clear(); }
}
const store = new MemStore();
(globalThis as unknown as { localStorage: MemStore }).localStorage = store;
store.setItem(HUB_SAVE_STORAGE_KEY, serializeHubSave(createHubSave(createNewGameHub())));

// --- layout: board + 精製を終える fit in the field (SORT_V0 §8-7) -------------------
const inside = (a: Rect, b: Rect) => a.x >= b.x - 0.01 && a.y >= b.y - 0.01 && a.x + a.w <= b.x + b.w + 0.01 && a.y + a.h <= b.y + b.h + 0.01;
for (const [w, h] of [[390, 756], [320, 480], [448, 812], [844, 302], [960, 812]]) {
  const field = { x: 0, y: 32, w, h };
  const L = layoutSort(field, 6, 7);
  assert.ok(inside(L.board, field), `${w}x${h} board inside`);
  assert.ok(inside(L.finish, field), `${w}x${h} finish inside`);
  assert.ok(L.cell <= SORT_MAX_CELL_PX && L.cell >= 24, `${w}x${h} cell ${L.cell}`);
  assert.ok(L.finish.h >= 44);
  const overlap = !(L.rail.y + L.rail.h <= L.board.y || L.board.y + L.board.h <= L.rail.y || L.rail.x + L.rail.w <= L.board.x || L.board.x + L.board.w <= L.rail.x);
  assert.ok(!overlap, `${w}x${h} rail and board do not overlap`);
}
assert.equal(layoutSort({ x: 0, y: 0, w: 844, h: 302 }, 6, 7).landscape, true, "short wide field → side layout");

// --- scene: briefing → play → gestures → finish → result URL with token ------------------
const went: string[] = [];
const host = {
  search: "?salvagedContainers=2&totalStockPieces=50&isExtracted=1",
  hubBase: "https://example.test/canvas/",
  sortModuleBase: "https://example.test/sort/",
  href: () => "https://example.test/canvas/?salvagedContainers=2&totalStockPieces=50&isExtracted=1",
  go: (u: string) => went.push(u),
  redraw: () => {},
  storage: store,
};
const scene = new SortScene(host);
assert.equal(scene.state.phase, "briefing");
const ui = new CanvasUI({ blocked: () => false });
const ctx = createStubCtx();
const frame = { width: 390, height: 844, dpr: 3, insets: { top: 0, right: 0, bottom: 0, left: 0 } };
const field = { x: 0, y: 32, w: 390, h: 756 };
const draw = () => { ui.beginFrame(ctx, 390, 844); scene.draw(ui, frame, field); ui.endFrame(); };
draw();
const w0 = store.writes;
for (let i = 0; i < 20; i++) draw();
assert.equal(store.writes, w0, "redraw never saves");
const reg = (id: string) => ui.debugRegions().find((r) => r.id === id)!;
const tap = (id: string) => { const r = reg(id); assert.ok(r, id); ui.pointerDown(1, { x: r.x + r.w / 2, y: r.y + r.h / 2 }); ui.pointerUp(1, { x: r.x + r.w / 2, y: r.y + r.h / 2 }); draw(); };
assert.ok(reg("sort:test-play"), "test play outside the intro");
tap("sort:start");
assert.equal(scene.state.phase, "play");
const L = layoutSort(field, scene.state.cols, scene.state.rows);
const cellCenter = (i: number) => ({ x: L.board.x + (i % scene.state.cols + 0.5) * L.cell, y: L.board.y + (Math.floor(i / scene.state.cols) + 0.5) * L.cell });
// Tap (below the swipe threshold) selects; the same cell again clears the selection.
if (scene.state.playMode === "idle") {
  const p = cellCenter(9);
  ui.pointerDown(2, p); ui.pointerUp(2, { x: p.x + SORT_V0_RULES.swipeMinPx - 4, y: p.y }); draw();
  assert.equal(scene.state.selected, 9, "short move = tap = select");
  ui.pointerDown(3, p); ui.pointerUp(3, p); draw();
  assert.equal(scene.state.selected, null, "tap again deselects");
  // A cancelled gesture does nothing.
  const moves = scene.state.movesLeft;
  ui.pointerDown(4, p); ui.pointerMove(4, { x: p.x + 40, y: p.y }); ui.pointerCancel(4); draw();
  assert.equal(scene.state.movesLeft, moves, "cancel = no swap");
  // A diagonal swipe beyond the threshold is rejected (no tap either).
  ui.pointerDown(5, p); ui.pointerUp(5, { x: p.x + 30, y: p.y + 30 }); draw();
  assert.equal(scene.state.selected, null);
  assert.equal(scene.state.movesLeft, moves, "true diagonal rejected");
}
scene.finish();
draw();
assert.equal(scene.state.phase, "result");
tap("sort:to-hangar");
assert.equal(went.length, 1);
const back = new URL(went[0]);
assert.equal(back.origin + back.pathname, host.hubBase, "Sort→HUB on the canvas page");
assert.ok(back.searchParams.get("fromSort"));
const pending = store.getItem(PENDING_SORT_HANDOFF_KEY);
if (back.searchParams.has("yieldBag")) {
  assert.ok(back.searchParams.get("handoffId"), "resource grant carries the token");
  assert.equal(JSON.parse(pending!).href, went[0], "pending token = the exact URL opened");
} else assert.equal(back.searchParams.get("handoffId"), null, "no grant → no token");
scene.dispose();

// --- intro opening that no longer matches → blocked, no test play ------------------------
const intro = new SortScene({ ...host, search: "?salvagedContainers=10&totalStockPieces=250&isExtracted=1&introOpening=gone" });
assert.equal(intro.state.phase, "blocked");
ui.beginFrame(ctx, 390, 844); intro.draw(ui, frame, field); ui.endFrame();
assert.equal(ui.debugRegions().some((r) => r.id === "sort:test-play"), false, "no test play during the intro");
assert.ok(ui.debugRegions().some((r) => r.id === "sort:demo"));
intro.dispose();

console.log("canvas-sort selftest: OK");
