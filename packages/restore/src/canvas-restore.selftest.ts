/** Canvas RESTORE scene selftest (docs/CANVAS_UNIFIED_V0.md §10, U-3). */
import assert from "node:assert/strict";
import { CanvasUI, Flow, decodeEdgeState, edgeCount, parseRestoreToTradeSearch } from "@estg/shared";
import { createStubCtx } from "../../shared/src/canvas-ui/test-ctx";
import { RestoreScene, RESTORE_TAP_SLOP_PX } from "./canvas-api";
import { STORAGE_PREFIX, hEdgeIndex } from "./puzzle";

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
let redraws = 0;
const went: string[] = [];
const host = (search: string) => ({
  search,
  href: () => "https://example.test/canvas/restore/" + search,
  hubBase: "https://example.test/canvas/",
  go: (u: string) => went.push(u),
  redraw: () => { redraws++; },
  signature: "神宮",
  rateOpts: { hostname: "example.test", isDev: false, envRate: "0", showInjectionDetails: false },
  now: () => 0,
});
const scene = new RestoreScene(host("?seed=selftest-a"));
assert.equal(scene.session.source, "demo");
assert.equal(scene.editorName, "神宮", "CANVAS-Q1: engraving name = signature, no input");
assert.equal(scene.persist, true, "demo boards save their edges (existing default)");
const pz = scene.session.puzzle;
assert.equal(scene.marks.length, edgeCount(pz.cols, pz.rows));

// --- draw: no writes, board region present ---------------------------------------
const ui = new CanvasUI({ blocked: () => false });
const ctx = createStubCtx();
const draw = () => {
  ui.beginFrame(ctx, 390, 844);
  ui.scrollArea("restore", { x: 0, y: 32, w: 390, h: 756 }, "auto", (off) => { const f = new Flow(ui, 12, 32 - off + 12, 366, 32 - off); scene.draw(ui, f, 844); return f.y - (32 - off); });
  ui.endFrame();
};
draw(); draw();
const w0 = store.writes;
for (let i = 0; i < 20; i++) draw();
assert.equal(store.writes, w0, "redraw never saves");
const board = ui.debugRegions().find((r) => r.id === "restore:board")!;
assert.ok(board && board.visible);
for (const s of ["精密回路修復", "Commit Bypass", "格納庫へ"]) assert.ok(ctx.texts.some((t) => t.includes(s)), s);

// --- tap = nearest edge; a pan never toggles ---------------------------------------
const z = scene.zoom(366 - 24, 844 * 0.72);
const m = RestoreScene.metrics(z);
const e = scene.extent(z);
const view = { x: board.x, y: board.y, w: board.w, h: board.h };
const ox = view.x + Math.max(0, (view.w - e.w) / 2) + m.dot / 2, oy = view.y + Math.max(0, (view.h - e.h) / 2) + m.dot / 2;
// Middle of the top edge of cell (1,0) = h edge (1,0).
const p = { x: ox + 1.5 * m.pitch, y: oy };
assert.equal(scene.edgeAt(view, z, p), hEdgeIndex(pz.cols, pz.rows, 1, 0), "nearest edge from the drawn geometry");
assert.equal(scene.edgeAt(view, z, { x: ox, y: oy }), null, "dot dead zone");
const idx = hEdgeIndex(pz.cols, pz.rows, 1, 0);
ui.pointerDown(1, p); ui.pointerUp(1, { x: p.x + RESTORE_TAP_SLOP_PX - 3, y: p.y }); draw();
assert.equal(scene.marks[idx], 1, "tap → 線");
ui.pointerDown(2, p); ui.pointerMove(2, { x: p.x + 40, y: p.y + 40 }); ui.pointerUp(2, { x: p.x + 40, y: p.y + 40 }); draw();
assert.equal(scene.marks[idx], 1, "a drag is a pan, never a toggle");
ui.pointerDown(3, p); ui.pointerCancel(3); draw();
assert.equal(scene.marks[idx], 1, "cancel does nothing");
scene.toggleEdge(idx); assert.equal(scene.marks[idx], 2, "線 → ×");
scene.toggleEdge(idx); assert.equal(scene.marks[idx], 0, "× → 空");
scene.toggleEdge(idx);
// Saved per puzzle (persist on).
const saved = store.getItem(STORAGE_PREFIX + pz.puzzleId);
assert.ok(saved, "edges saved for this puzzleId");
scene.setPersist(false);
const before = store.getItem(STORAGE_PREFIX + pz.puzzleId);
scene.toggleEdge(hEdgeIndex(pz.cols, pz.rows, 0, 0));
assert.equal(store.getItem(STORAGE_PREFIX + pz.puzzleId), before, "保存 off → not saved");
scene.setPersist(true);

// --- outcomes ------------------------------------------------------------------------
scene.abandon(); assert.equal(scene.play().outcome, "offline");
scene.commitBypass(); assert.equal(scene.play().outcome, "bypass");
scene.clear(); assert.equal(scene.marks.every((x) => x === 0), true);
scene.toggleEdge(idx);
scene.commitBypass();
// --- Restore→HUB URL on the canvas page, with the signature ------------------------
scene.toHub();
const back = new URL(went.at(-1)!);
assert.equal(back.origin + back.pathname, "https://example.test/canvas/");
const payload = parseRestoreToTradeSearch(back.search)!;
assert.equal(payload.outcome, "bypass");
assert.equal(payload.lastEditorName ?? payload.circuitBoard.lastEditorName, "神宮");
assert.equal(decodeEdgeState(payload.circuitBoard.edgeState, scene.marks.length)[idx], 1);
// 「もう一度」 on demo boards → same page, new seed.
scene.nextBoard();
assert.match(went.at(-1)!, /\/canvas\/restore\/\?seed=board-/);

// --- large boards: zoom modes ----------------------------------------------------------
const big = new RestoreScene(host("?seed=selftest-big&cols=12&rows=12"));
const bp = big.session.puzzle;
if (Math.max(bp.cols, bp.rows) >= 11) {
  assert.equal(big.isLarge(342), true);
  big.setZoom("fit");
  const fz = big.zoom(342, 600);
  assert.ok(big.extent(fz).w <= 342 + 0.5, "全体 fits the width");
  big.setZoom("1.5");
  assert.equal(big.zoom(342, 600), 1.5);
}
console.log("canvas-restore selftest: OK");
