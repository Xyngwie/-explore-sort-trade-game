/** Canvas 探索 scene selftest (docs/CANVAS_UNIFIED_V0.md §14, U-5a). */
import assert from "node:assert/strict";
import { CanvasUI, Flow, HUB_SAVE_STORAGE_KEY, EXPLORE_SORTIE_BACK_TRAP, SORTIE_PAUSE_LABEL, historyTrapIsCurrent, createHubSave, createNewGameHub, normalizeHubSnapshot, readSortieCheckpoint, serializeHubSave, type RawPointerSample } from "@estg/shared";
import { createStubCtx } from "../../shared/src/canvas-ui/test-ctx";
import { ExploreScene, EXPLORE_MAP_ASPECT, layoutExploreSortie, type ExploreHost } from "./canvas-api";
import { executeExploreCommand } from "./game/commands";
import { pushLog } from "./game/orders";
import { getCoverObjects } from "./game/coverObjects";

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
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = store;
g.sessionStorage = session;
const hub0 = normalizeHubSnapshot({ ...createNewGameHub(), newGameIntro: undefined });
store.setItem(HUB_SAVE_STORAGE_KEY, serializeHubSave(createHubSave(hub0)));

let now = 1000;
let href = "https://x.test/canvas/explore/";
const pushed: unknown[] = [];
let backs = 0;
const history = {
  state: null as unknown,
  pushState(s: unknown) { this.state = s; pushed.push(s); },
  back() { backs++; this.state = null; },
};
const went: string[] = [];
const frames: Array<(t: number) => void> = [];
const host = (search: string): ExploreHost => ({
  search,
  href: () => href,
  replaceUrl: (u) => { href = new URL(u, href).toString(); },
  hubBase: "https://x.test/canvas/",
  go: (u) => went.push(u),
  redraw: () => {},
  history,
  storage: () => store as unknown as Storage,
  session: () => session as unknown as Storage,
  now: () => now,
  requestFrame: (fn) => { frames.push(fn); return frames.length; },
  cancelFrame: () => {},
});

// --- layout (CANVAS-X3/X4) ------------------------------------------------------------
{
  const portrait = layoutExploreSortie({ x: 0, y: 0, w: 390, h: 844 }, 4);
  assert.ok(Math.abs(portrait.map.w / portrait.map.h - EXPLORE_MAP_ASPECT) < 1e-6, "map keeps 720:420");
  assert.equal(portrait.map.w, 390 - 16, "portrait: column width");
  assert.equal(portrait.side, false);
  assert.ok(portrait.controls.y >= portrait.map.y + portrait.map.h, "controls under the map");
  const land = layoutExploreSortie({ x: 0, y: 0, w: 844, h: 390 }, 4);
  assert.ok(Math.abs(land.map.w / land.map.h - EXPLORE_MAP_ASPECT) < 1e-6);
  assert.ok(land.map.y + land.map.h <= 390, "landscape: height wins");
  assert.equal(land.side, true, "landscape: controls beside the map");
  assert.ok(land.controls.x >= land.map.x + land.map.w);
}

// --- boot: briefing, nothing saved by drawing ------------------------------------------
const scene = new ExploreScene(host(""));
assert.equal(scene.leaveForHub, false);
assert.equal(scene.phase, "briefing");
assert.equal(scene.equipmentNote(), "", "new game hub can sortie");
const ui = new CanvasUI({ blocked: () => false });
const ctx = createStubCtx();
const W = 390;
let H = 844;
const draw = () => {
  ctx.texts.length = 0;
  ui.beginFrame(ctx, W, H);
  if (scene.phase === "sortie") scene.drawSortie(ui, { x: 0, y: 0, w: W, h: H }, 1);
  else ui.scrollArea("page", { x: 0, y: 0, w: W, h: H - 56 }, "auto", (off) => { const f = new Flow(ui, 12, 12 - off, W - 24, -off); scene.drawPage(ui, f); return f.y + off; });
  ui.endFrame();
};
const press = (id: string) => {
  draw(); draw();
  const r = ui.debugRegions().find((x) => x.id === id);
  assert.ok(r, `region ${id}`);
  const p = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  ui.pointerDown(1, p, true);
  ui.pointerUp(1, p);
};
draw(); draw();
assert.ok(ctx.texts.includes("出撃"), "briefing shows 出撃");
const w0 = store.writes;
for (let i = 0; i < 10; i++) draw();
assert.equal(store.writes, w0, "redraw never saves (briefing)");

// --- 出撃 → sortie, back trap armed ------------------------------------------------------
press("explore:start");
assert.equal(scene.phase, "sortie");
assert.ok(historyTrapIsCurrent(history, EXPLORE_SORTIE_BACK_TRAP), "trap is the current entry");
assert.ok(pushed.length >= 1, "back trap pushed");
const t0 = scene.world.timeLeft;
now += 16; scene.frame(now);
now += 16; scene.frame(now);
assert.ok(scene.world.timeLeft < t0, "frames tick the sortie");
draw();
assert.ok(ctx.texts.some((t) => t.startsWith("残時間")), "HUD line");
assert.ok(ctx.texts.includes("帰還要請（搭乗円）"), "extract button");
const map = scene.map;
assert.ok(Math.abs(map.w / map.h - EXPLORE_MAP_ASPECT) < 1e-6, "map rect drawn at the world aspect");

// --- U-5b: wing cards, gauge tap, per-wingman orders, log, key table -------------------
{
  H = 4000; // tall frame: every control of the scroll area is on screen
  draw(); draw(); draw();
  const wing = scene.world.wingmen[0];
  assert.ok(wing, "seeded squad has a wingman");
  assert.ok(ctx.texts.includes("僚機指揮（オフスクリーン可）"), "wing panel title");
  assert.ok(ctx.texts.some((t) => t.startsWith(wing.name)), "wing card name");
  // gauge tap: the numbers replace the load line for 1.5 s (same as DOCK).
  press(`explore:gauge:${wing.id}`);
  draw();
  const { exploreMechGaugeModel } = await import("./game/mechGaugeExplore");
  assert.ok(ctx.texts.includes(exploreMechGaugeModel(scene.world, wing).text), "gauge tap shows the numbers");
  now += 1600; draw();
  assert.ok(!ctx.texts.includes(exploreMechGaugeModel(scene.world, wing).text), "numbers hide after 1.5 s");
  // per-wingman order buttons (when unlocked) use the existing commands.
  const order = ui.debugRegions().find((r) => r.id.startsWith(`explore:order:${wing.id}:`) && !r.disabled);
  if (order) {
    const stance = order.id.split(":").pop();
    press(order.id);
    assert.equal(scene.world.wingmen[0].stance, stance, "order button sets the stance");
  }
  // log: rows from world.logs, newest at the bottom, following.
  now += 16; scene.frame(now);
  const n0 = scene.log.rows.length;
  pushLog(scene.world, "テストの戦報", "battle");
  now += 16; scene.frame(now);
  assert.equal(scene.log.rows.length, n0 + 1, "new log row");
  assert.equal(scene.log.rows[scene.log.rows.length - 1].text, "テストの戦報", "appended at the end");
  draw(); draw();
  assert.ok(ctx.texts.includes("テストの戦報"), "log row drawn");
  assert.equal(ui.getScroll("explore:log"), ui.maxScroll("explore:log"), "log follows the latest");
  // key table (PC): ? hides / shows it; the choice is stored like the existing overlay.
  assert.ok(ctx.texts.includes("カバー切替（障害物付近）"), "key table shown");
  scene.keyDown("?", false); scene.keyUp("?");
  draw();
  assert.ok(!ctx.texts.includes("カバー切替（障害物付近）"), "? hides the key table");
  assert.equal(store.getItem("estg.explore.shortcutsHidden"), "1");
  press("explore:keys");
  draw();
  assert.ok(ctx.texts.includes("カバー切替（障害物付近）"), "キー shows it again");
  assert.ok(ctx.texts.some((t) => t.startsWith("未発見コンテナは非表示")), "help line");
  H = 844;
  draw();
}

// --- back during the sortie is swallowed ---------------------------------------------------
const pushedBefore = pushed.length;
history.state = null; // the browser popped the trap entry
assert.equal(scene.onPopstate(), true);
assert.equal(pushed.length, pushedBefore + 1, "trap re-armed");

// --- map tap = move target at the tapped world point (zoom 1) --------------------------------
const raw = ui.rawAt({ x: map.x + 10, y: map.y + 10 });
assert.ok(raw, "map is a raw region");
const touch = (id: number, x: number, y: number): RawPointerSample => ({ id, type: "touch", button: 0, buttons: 1, x, y, ctrl: false });
const cam = { ...scene.world.camera };
const tx = map.x + map.w * 0.75, ty = map.y + map.h * 0.25;
raw.down(touch(3, tx, ty)); raw.up({ ...touch(3, tx, ty), buttons: 0 });
const cm = scene.clickMove;
assert.ok(cm, "tap sets a move target");
assert.ok(Math.abs(cm.x - (cam.x + cam.w * 0.75)) < 1e-6 && Math.abs(cm.y - (cam.y + cam.h * 0.25)) < 1e-6, "tap → world point");
const back = scene.worldToCanvas(cm.x, cm.y);
assert.ok(Math.abs(back.x - tx) < 1e-6 && Math.abs(back.y - ty) < 1e-6, "world → canvas inverse");
// double tap (same place within 300ms) → 2×; its 2nd tap is still a map tap with the old zoom.
now += 400;
raw.down(touch(4, tx, ty)); raw.up({ ...touch(4, tx, ty), buttons: 0 });
now += 100;
raw.down(touch(5, tx, ty)); raw.up({ ...touch(5, tx, ty), buttons: 0 });
assert.equal(scene.zoom, 2, "double tap zooms to 2×");
// pinch: a second finger is not a map tap.
const before = scene.clickMove;
raw.down(touch(6, map.x + 50, map.y + 50));
raw.down(touch(7, map.x + 150, map.y + 50));
raw.move(touch(7, map.x + 100, map.y + 50));
raw.up({ ...touch(7, map.x + 100, map.y + 50), buttons: 0 });
raw.up({ ...touch(6, map.x + 50, map.y + 50), buttons: 0 });
assert.ok(scene.zoom < 2, "pinch in zooms out");
assert.notDeepEqual(scene.clickMove, null);
void before;
// wheel
const z = scene.zoom;
raw.wheel!({ x: map.x + 5, y: map.y + 5 }, -100);
assert.ok(scene.zoom > z, "wheel up zooms in");

// --- keys (CANVAS-X5) -----------------------------------------------------------------------
const y0 = scene.world.leader.pos.y;
assert.equal(scene.keyDown("w", false), true, "W is taken");
for (let i = 0; i < 20; i++) { now += 16; scene.frame(now); }
scene.keyUp("w");
assert.ok(scene.world.leader.pos.y < y0, "W moves the captain up");
assert.equal(scene.clickMove, null, "key move clears the tap target");
{
  const c = getCoverObjects(scene.world)[0];
  assert.ok(c, "map has cover");
  scene.world.leader.pos = { x: c.pos.x + c.radius + scene.world.leader.radius + 2, y: c.pos.y };
  assert.equal(scene.keyDown("v", false), true); scene.keyUp("v");
  assert.equal(scene.world.leader.inCover, true, "V enters cover next to an obstacle");
  assert.equal(scene.toast, "カバー開始 · 障害物で身を隠す");
  scene.keyDown("v", false); scene.keyUp("v");
  assert.equal(scene.world.leader.inCover, false, "V again leaves cover");
}

// --- hidden → checkpoint + pause; any tap resumes ------------------------------------------
scene.persistOnHide(true);
assert.equal(scene.paused, true);
const cp = readSortieCheckpoint();
assert.equal(cp.status === "ok" && cp.record.kind, "sortie", "sortie checkpoint written on hide");
draw();
assert.ok(ctx.texts.includes(SORTIE_PAUSE_LABEL));
const tp = scene.world.timeLeft;
now += 16; scene.frame(now);
assert.equal(scene.world.timeLeft, tp, "paused: no tick");
assert.equal(scene.keyDown("w", false), false, "paused: keys ignored");
const resume = ui.rawAt({ x: 5, y: H - 5 });
assert.ok(resume, "pause covers the screen");
resume.down(touch(9, 5, H - 5));
assert.equal(scene.paused, false, "tap resumes");

// --- result: one direct save, never from drawing; back trap released ---------------------
executeExploreCommand(scene.world, { id: "abort" });
const wBefore = store.writes;
history.state = pushed[pushed.length - 1];
now += 16; scene.frame(now);
assert.equal(scene.phase, "result");
assert.equal(backs, 1, "trap released on result");
const wSaved = store.writes;
assert.ok(wSaved > wBefore, "result saved once");
for (let i = 0; i < 10; i++) draw();
assert.equal(store.writes, wSaved, "redraw never saves (result)");
assert.ok(ctx.texts.includes("作戦結果"));
assert.equal(scene.onPopstate(), false, "result: back is not trapped");
press("explore:to-sort");
assert.ok(/salvagedContainers=/.test(went[went.length - 1] ?? ""), "仕分へ = Sort handoff URL");
press("explore:again");
assert.equal(scene.phase, "briefing", "再出撃 → briefing");

// --- dispose stops the frame loop requests ------------------------------------------------
scene.dispose();
const n = frames.length;
frames[frames.length - 1]?.(now + 16);
assert.equal(frames.length, n, "no frames after dispose");

// --- boot from a sortie checkpoint: resume paused in the sortie --------------------------
{
  const s1 = new ExploreScene(host(""));
  s1.start();
  assert.equal(s1.phase, "sortie");
  s1.persistOnHide(false);
  s1.dispose();
  const s2 = new ExploreScene(host(""));
  assert.equal(s2.phase, "sortie", "checkpoint resumes the sortie");
  assert.equal(s2.paused, true, "resumed paused");
  s2.dispose();
}

// --- no save → leave for the hub ---------------------------------------------------------
{
  store.clear();
  const s3 = new ExploreScene(host(""));
  assert.equal(s3.phase, "briefing");
  assert.ok(s3.leaveForHub || s3.equipmentNote() !== "", "no save: hub or guard");
  s3.dispose();
}

console.log("canvas-explore selftest OK");
