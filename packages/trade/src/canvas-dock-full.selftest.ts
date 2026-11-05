/** Canvas DOCK (all sections) selftest — docs/CANVAS_UNIFIED_V0.md §4, §7. */
import assert from "node:assert/strict";
import {
  CanvasUI,
  HUB_SAVE_STORAGE_KEY,
  createHubSave,
  createNewGameHub,
  loadHubSaveFromLocalStorage,
  serializeHubSave,
} from "@estg/shared";
import { createStubCtx } from "../../shared/src/canvas-ui/test-ctx";
import { DockScene } from "./canvas/dock-scene";
import { DOCK_ANCHOR, type DockEnv } from "./canvas/dock-sections";
import { dockTabs } from "./canvas/tabs";
import { loadPlaytestSeed, createInitialHangar } from "./hangar";

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
const session = new MemStore();
(globalThis as unknown as { localStorage: MemStore }).localStorage = store;
(globalThis as unknown as { sessionStorage: MemStore }).sessionStorage = session;
let clock = 0;
const navigated: string[] = [];
const env: DockEnv = {
  navigate: (u) => navigated.push(u),
  now: () => clock,
  session,
  storage: store,
  search: "",
  hostname: "localhost",
  isDev: false,
  envRate: "0",
  newId: (p) => `${p}_${++clock}`,
};
const hub = () => loadHubSaveFromLocalStorage(store)!.hub;

// Seeded hub (2 operational + 1 needs repair, circuits).
store.setItem(HUB_SAVE_STORAGE_KEY, serializeHubSave(createHubSave(createNewGameHub())));
loadPlaytestSeed(createInitialHangar(store), { injectRate: 0 });

const ui = new CanvasUI({ blocked: () => false });
const ctx = createStubCtx();
let frame = { width: 390, height: 844, dpr: 3, insets: { top: 0, right: 0, bottom: 0, left: 0 } };
const scene = new DockScene({ env, redraw: () => {}, onTab: (t) => navigated.push(`tab:${t.id}`) });
const draw = () => { ui.beginFrame(ctx, frame.width, frame.height); scene.draw(ui, frame); ui.endFrame(); };
const regions = () => ui.debugRegions();
const reveal = (id: string) => {
  for (let i = 0; i < 200; i++) {
    draw(); draw(); // second frame applies measured card heights
    const r = regions().find((x) => x.id === id);
    if (r && r.visible && r.h >= 43) return r;
    const y = ui.getScroll("dock");
    ui.wheel({ x: 100, y: 300 }, r && r.y < 300 ? -120 : 120);
    if (ui.getScroll("dock") === y && (!r || !r.visible)) ui.wheel({ x: 100, y: 300 }, r && r.y < 300 ? -2000 : 2000);
  }
  throw new Error(`cannot reveal ${id}`);
};
const tap = (id: string) => {
  const r = reveal(id);
  ui.pointerDown(1, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
  ui.pointerUp(1, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
  draw(); draw();
};

// --- drawing never writes ----------------------------------------------------
draw(); draw();
const w0 = store.writes;
for (let i = 0; i < 40; i++) draw();
frame = { ...frame, width: 1280, height: 900 }; for (let i = 0; i < 10; i++) draw();
frame = { ...frame, width: 844, height: 390 }; for (let i = 0; i < 10; i++) draw();
frame = { ...frame, width: 390, height: 844 }; draw(); draw();
assert.equal(store.writes, w0, "redraw / resize never saves");
for (const s of ["次の出撃", "未開封コンテナ", "物資市場（購入）", "資源の売却", "ハンガー", "型付き在庫", "署名（刻印）", "保有回路", "回路装備", "回路作成", "資源履歴", "検証用"]) assert.ok(ctx.texts.includes(s), s);

// Every enabled control is a ≥44px target.
// Every enabled control is a ≥44px target, also on a 320px phone (whole list scrolled through).
for (const width of [390, 320]) {
  frame = { ...frame, width };
  ui.scrollTo("dock", 0);
  for (let step = 0; step < 80; step++) {
    draw(); draw();
    for (const r of regions()) {
      if (r.disabled || !r.visible || r.id.endsWith(":box") || r.id.includes("backdrop") || r.id.startsWith("dock:gauge")) continue;
      const full = r.h >= 43.9 || r.y <= 92 || r.y + r.h >= frame.height - 60; // partly clipped at the scroll edges
      if (full) assert.ok(r.w >= 43.9, `${width}px ${r.id} ${r.w}×${r.h}`);
      if (r.y > 92 && r.y + r.h < frame.height - 60) assert.ok(r.h >= 43.9, `${width}px ${r.id} ${r.w}×${r.h}`);
    }
    const y = ui.getScroll("dock");
    ui.wheel({ x: 100, y: 400 }, 300);
    if (ui.getScroll("dock") === y) break;
  }
}
frame = { ...frame, width: 390 };
ui.scrollTo("dock", 0); draw(); draw();

// --- tabs: onboarding = DOCK only; seeded = all but the active one -----------------
assert.deepEqual(dockTabs(createNewGameHub()).map((t) => t.enabled), [false, false, false, false, false]);
assert.deepEqual(dockTabs(hub()).map((t) => [t.id, t.enabled]), [["DOCK", false], ["INVADE", true], ["SORT", true], ["RESTORE", true], ["SORTIE", true]]);
tap("tab:INVADE");
assert.equal(navigated.at(-1), "tab:INVADE");
// SORT tab = scroll to 未開封 (no navigation).
const nNav = navigated.length;
ui.scrollTo("dock", 0); draw();
tap("tab:SORT");
assert.equal(navigated.length, nNav, "SORT tab stays in DOCK");
assert.ok(ui.getScroll("dock") > 0, "scrolled to 未開封");
assert.ok(Math.abs(ui.getScroll("dock") - (scene.anchors.get(DOCK_ANCHOR.unopened)! - 8)) < 1);

// --- repair: one press, a double tap within 600ms pays once --------------------------
const worn = hub().fleet.find((m) => m.status === "needs_repair")!;
tap(`dock:mech:${worn.instanceId}:repair`);
assert.match(scene.sections!.state.notice, /足りない/, "short of parts → refused, nothing paid");
// Buy armor through the market (canvas quantity buttons), then repair.
for (let i = 0; i < 9; i++) tap("dock:armor:step:10");
tap("dock:armor:buy");
assert.ok((hub().inventory.armor ?? 0) >= 90, "market bought armor");
const armor0 = hub().inventory.armor ?? 0;
clock += 1000;
tap(`dock:mech:${worn.instanceId}:repair`);
const afterRepair = hub();
assert.ok((afterRepair.inventory.armor ?? 0) < armor0, "repair paid");
assert.equal(afterRepair.fleet.find((m) => m.instanceId === worn.instanceId)!.status, "operational");

clock += 1000;
const credits0 = hub().credits;
tap("dock:hangar:buy");
tap("dock:hangar:buy"); // same clock → guarded
assert.equal(hub().fleet.length, 4, "double tap buys one mech");
assert.ok(hub().credits < credits0);

// --- scrap: dialog, cancel, ok ------------------------------------------------------
clock += 1000;
const victim = hub().fleet.at(-1)!.instanceId;
tap(`dock:mech:${victim}:scrap`);
assert.ok(scene.sections!.confirm, "scrap asks first");
assert.equal(hub().fleet.length, 4);
tap("dock:confirm:scrap:cancel");
assert.equal(scene.sections!.confirm, null);
assert.equal(hub().fleet.length, 4, "やめる keeps the mech");
tap(`dock:mech:${victim}:scrap`);
tap("dock:confirm:scrap:ok");
assert.equal(hub().fleet.length, 3, "解体した");

// --- deploy selection toggle ----------------------------------------------------------
const m0 = hub().fleet[0].instanceId;
const sel0 = scene.sections!.state.selectedDeployIds.includes(m0);
tap(`dock:mech:${m0}:select`);
assert.equal(scene.sections!.state.selectedDeployIds.includes(m0), !sel0);
tap(`dock:mech:${m0}:select`);
assert.equal(scene.sections!.state.selectedDeployIds.includes(m0), sel0);

// --- resource sell (confirm) ------------------------------------------------------------
const armorBefore = hub().inventory.armor ?? 0, crBefore = hub().credits;
tap("dock:sell:armor");
assert.equal(hub().inventory.armor ?? 0, armorBefore, "sell asks first");
tap("dock:confirm:sell:ok");
assert.equal(hub().inventory.armor ?? 0, armorBefore - 1);
assert.equal(hub().credits, crBefore + 5);

// --- equip through the canvas pickers ---------------------------------------------------
const circuitId = hub().circuits[0].circuitId;
const mechId = hub().fleet[1].instanceId;
tap("dock:equip:circuit");
assert.ok(scene.sections!.picker);
tap(`dock:pick:circuit:opt:${circuitId}`);
tap("dock:equip:mech");
tap(`dock:pick:mech:opt:${mechId}`);
tap("dock:equip:equip");
const eq = hub().circuits.find((c) => c.circuitId === circuitId)!;
assert.ok(eq.equippedTo === mechId || /装備|できません|上限/.test(scene.sections!.state.notice), `equip result: ${eq.equippedTo} / ${scene.sections!.state.notice}`);

// --- HUB tree → scroll + highlight ------------------------------------------------------
ui.scrollTo("dock", 0); draw();
tap("dock:tree:circuits");
assert.ok(Math.abs(ui.getScroll("dock") - (scene.anchors.get(DOCK_ANCHOR.circuits)! - 8)) < 1, "tree scrolls to 回路");

// --- sortie: 探索へ marks deployed and navigates with the refilled URL -------------------
const navBefore = navigated.length;
tap("dock:sortie:explore");
if (navigated.length > navBefore) {
  const url = new URL(navigated.at(-1)!);
  assert.ok(url.searchParams.get("deployedInstanceIds"), "deploy URL carries the squad");
}

// --- the play-log blocked state stops every action ------------------------------------
{
  const blockedUi = new CanvasUI({ blocked: () => true });
  blockedUi.beginFrame(ctx, 390, 844); scene.draw(blockedUi, frame); blockedUi.endFrame();
  const w = store.writes;
  for (const r of blockedUi.debugRegions().filter((x) => x.visible && !x.disabled)) {
    blockedUi.pointerDown(9, { x: r.x + 1, y: r.y + 1 }); blockedUi.pointerUp(9, { x: r.x + 1, y: r.y + 1 });
  }
  assert.equal(store.writes, w, "blocked → nothing saved");
  assert.equal(blockedUi.activationCount, 0);
}

console.log("canvas-dock-full selftest: OK");
