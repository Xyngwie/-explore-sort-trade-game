/** Canvas INVADE scene selftest (docs/CANVAS_UNIFIED_V0.md §11, U-4). */
import assert from "node:assert/strict";
import { CanvasUI, Flow, HUB_SAVE_STORAGE_KEY, createHubSave, createNewGameHub, loadHubSaveFromLocalStorage, normalizeHubSnapshot, serializeHubSave, type RawPointerSample } from "@estg/shared";
import { createStubCtx } from "../../shared/src/canvas-ui/test-ctx";
import { InvadeScene, BOARD_INPUT } from "./canvas-api";
import { getCell } from "./board";
import { FORCED_HANDOFF_INTENT_KEY, FORCED_LOCK_HISTORY_STATE } from "./forced-combat";

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
const store = new MemStore(), session = new MemStore();
(globalThis as unknown as { localStorage: MemStore }).localStorage = store;
(globalThis as unknown as { sessionStorage: MemStore }).sessionStorage = session;
const hub0 = normalizeHubSnapshot({ ...createNewGameHub(), newGameIntro: undefined });
store.setItem(HUB_SAVE_STORAGE_KEY, serializeHubSave(createHubSave(hub0)));

// Fake clock for BoardGesture (hold 300ms, double tap 280ms).
let now = 1000;
const timers: Array<{ at: number; fn: () => void; id: number }> = [];
let tid = 0;
const advance = (ms: number) => { now += ms; for (const t of [...timers].sort((a, b) => a.at - b.at)) if (t.at <= now) { timers.splice(timers.indexOf(t), 1); t.fn(); } };
const history = { state: null as unknown, pushState(s: unknown) { this.state = s; } };
const went: string[] = [];
const scene = new InvadeScene({
  search: "?fromHub=1&deployableMechs=2", hubBase: "https://x.test/canvas/", exploreBase: "https://x.test/explore/",
  go: (u) => went.push(u), redraw: () => {}, history, href: () => "https://x.test/canvas/invade/",
  now: () => now, setTimer: (fn, ms) => { const id = ++tid; timers.push({ at: now + ms, fn, id }); return id; }, clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
});
assert.equal(scene.inbound?.fromHub, true);
const ui = new CanvasUI({ blocked: () => false });
const ctx = createStubCtx();
const draw = () => { ui.beginFrame(ctx, 390, 844); ui.scrollArea("invade", { x: 0, y: 32, w: 390, h: 756 }, "auto", (off) => { const f = new Flow(ui, 12, 32 - off + 12, 366, 32 - off); scene.draw(ui, f, 756); return f.y - (32 - off); }); ui.endFrame(); };
draw(); draw();
const w0 = store.writes;
for (let i = 0; i < 10; i++) draw();
assert.equal(store.writes, w0, "redraw never saves");
const raw = scene.rawHandler();
const center = (sx: number, sy: number) => { const r = scene.cellRect({ sx, sy })!; return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; };
const touch = (id: number, p: { x: number; y: number }): RawPointerSample => ({ id, type: "touch", button: 0, buttons: 1, x: p.x, y: p.y, ctrl: false });
const mouse = (p: { x: number; y: number }, buttons: number, button = 0, ctrl = false): RawPointerSample => ({ id: 1, type: "mouse", button, buttons, x: p.x, y: p.y, ctrl });

// --- geometry: drawn cell ↔ hit -----------------------------------------------------
const hq = center(0, 0);
assert.deepEqual(scene.hit(hq), { sx: 0, sy: 0 }, "hit = drawn cell");
assert.equal(scene.hit(center(12, 0)), null, "wall cells are not hittable");
const r00 = scene.cellRect({ sx: 0, sy: 0 })!;
assert.equal(scene.hit({ x: r00.right + 0.4, y: hq.y }), null, "the 1px gap is not a cell");

// Pick a closed safe cell near HQ (scale 1 = zoomed out → a tap waits 280ms for a double tap).
const cells = scene.board.cells.flat();
const target = cells.find((c) => !c.blocked && !c.open && !c.mine && Math.max(Math.abs(c.sx), Math.abs(c.sy)) <= 4)!;
const pt = center(target.sx, target.sy);
// --- touch default: tap = mark (after the double-tap wait), tap again = unmark ------
raw.down(touch(5, pt)); raw.up({ ...touch(5, pt), buttons: 0 });
assert.equal(getCell(scene.board, target.sx, target.sy)!.flagged, false, "single tap waits for a possible double tap");
advance(BOARD_INPUT.doubleTapMs + 1);
assert.equal(getCell(scene.board, target.sx, target.sy)!.flagged, true, "tap = mark");
raw.down(touch(6, pt)); raw.up({ ...touch(6, pt), buttons: 0 }); advance(300);
assert.equal(getCell(scene.board, target.sx, target.sy)!.flagged, false, "tap again = unmark");
// --- hold 300ms + release = open (preview at 300ms, nothing at 299ms) -----------------
raw.down(touch(7, pt)); advance(BOARD_INPUT.holdMs - 1);
assert.equal(scene.animating(), false, "no preview at 299ms");
advance(1); draw();
raw.up({ ...touch(7, pt), buttons: 0 });
assert.equal(getCell(scene.board, target.sx, target.sy)!.open, true, "hold+release = open");
assert.ok(store.writes > w0, "front progress saved");
// --- a sweep out of the cell pans and never acts -----------------------------------------
const other = cells.find((c) => !c.blocked && !c.open && !c.flagged && !c.mine && Math.max(Math.abs(c.sx), Math.abs(c.sy)) <= 6)!;
const op = center(other.sx, other.sy);
const x0 = scene.view.x;
raw.down(touch(8, op)); raw.move(touch(8, { x: op.x + 30, y: op.y })); raw.move(touch(8, { x: op.x + 50, y: op.y })); raw.up({ ...touch(8, op), buttons: 0 }); advance(400);
assert.ok(scene.view.x !== x0, "panned");
assert.equal(getCell(scene.board, other.sx, other.sy)!.flagged, false, "a pan never marks");
// --- pinch zooms; the second finger never acts -----------------------------------------
const s0 = scene.view.scale;
raw.down(touch(9, { x: 100, y: 400 })); raw.down(touch(10, { x: 200, y: 400 }));
raw.move(touch(10, { x: 260, y: 400 }));
raw.up({ ...touch(10, { x: 260, y: 400 }), buttons: 0 }); raw.up({ ...touch(9, { x: 100, y: 400 }), buttons: 0 });
assert.ok(scene.view.scale > s0, "pinch zooms in");
scene.home();
assert.equal(scene.view.scale, 1, "拠点へ = scale 1");
draw();
// --- double tap (zoomed out) = ×2 around the tap ------------------------------------------
const dt = center(other.sx, other.sy);
raw.down(touch(11, dt)); raw.up({ ...touch(11, dt), buttons: 0 }); advance(100);
raw.down(touch(12, dt)); raw.up({ ...touch(12, dt), buttons: 0 });
assert.equal(scene.view.scale, 2, "double tap = 2×");
assert.equal(getCell(scene.board, other.sx, other.sy)!.flagged, false, "double tap does not mark");
scene.home(); draw();
// --- mouse: left opens, right marks, Ctrl+left marks, long mouse press never marks -------
const m2 = cells.find((c) => !c.blocked && !c.open && !c.flagged && !c.mine && c !== other && Math.max(Math.abs(c.sx), Math.abs(c.sy)) <= 6)!;
const mp = center(m2.sx, m2.sy);
raw.down(mouse(mp, 2, 2)); raw.up(mouse(mp, 0, 2));
assert.equal(getCell(scene.board, m2.sx, m2.sy)!.flagged, true, "right = mark");
raw.down(mouse(mp, 1, 0, true)); raw.up(mouse(mp, 0, 0, true));
assert.equal(getCell(scene.board, m2.sx, m2.sy)!.flagged, false, "Ctrl+left = unmark");
raw.down(mouse(mp, 1)); advance(600); raw.up(mouse(mp, 0));
assert.equal(getCell(scene.board, m2.sx, m2.sy)!.open, true, "mouse left = open (a long press is still a left click)");
// --- wheel zooms ---------------------------------------------------------------------------
raw.wheel!(hq, -200);
assert.ok(scene.view.scale > 1);
scene.home(); draw();

// --- forced combat: stepping on an enemy locks everything but the forced sortie ----------
const mineCell = cells.find((c) => c.mine && !c.open)!;
scene.applyBoardAction("left", { sx: mineCell.sx, sy: mineCell.sy });
assert.equal(scene.board.hitMine, true);
assert.equal(scene.forcedLockActive(), true);
assert.equal((history.state as Record<string, unknown>)[FORCED_LOCK_HISTORY_STATE], true, "back trap armed");
const bar = scene.sortieBar();
assert.equal(bar.tone, "locked");
assert.equal(bar.buttons.length, 1, "only the forced sortie");
assert.ok(new URL(bar.buttons[0].url).searchParams.get("engage") === "forced");
const flagsBefore = cells.filter((c) => c.flagged).length;
const free = cells.find((c) => !c.blocked && !c.open && !c.mine)!;
scene.applyBoardAction("right", { sx: free.sx, sy: free.sy });
assert.equal(cells.filter((c) => c.flagged).length, flagsBefore, "locked: no marking");
scene.regenerate(); assert.equal(scene.confirm, null, "locked: no regenerate");
scene.skip(); assert.notEqual(scene.selected, null, "locked: no skip");
assert.equal(scene.onPopstate(), true, "back is swallowed under the lock");
scene.leave(bar.buttons[0]);
assert.equal(session.getItem(FORCED_HANDOFF_INTENT_KEY) != null, true, "forced sortie marks the handoff intent");
assert.ok(went.at(-1)!.startsWith("https://x.test/explore/"));
assert.equal(scene.onPopstate(), false, "with the intent, back is not swallowed (intent consumed)");
assert.equal(loadHubSaveFromLocalStorage(store)!.hub.frontProgress?.hitMine, true, "lock saved in HubSave");

// --- regenerate asks (after the lock is resolved elsewhere) -------------------------------
scene.board.hitMine = false;
scene.regenerate();
assert.ok(scene.confirm, "regenerate asks first");
const seed = scene.board.seed;
scene.confirm!.onOk();
assert.notEqual(scene.board.seed, seed, "new board");
// Invade→HUB URL on the canvas page.
scene.applyBoardAction("left", { sx: 0, sy: 0 });
const hb = scene.sortieBar().buttons.find((b) => b.id === "invade:to-hangar")!;
assert.ok(hb.url.startsWith("https://x.test/canvas/?"), hb.url);
console.log("canvas-invade selftest: OK");
