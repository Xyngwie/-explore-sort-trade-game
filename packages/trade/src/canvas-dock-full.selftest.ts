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
import { type DockEnv } from "./canvas/dock-sections";
import { PALETTE_TITLE, type PaletteId } from "./canvas/palette-tree";
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

const sec = () => scene.sections!;
const cur = () => sec().nav.current;
/** HUB, then the nav buttons along the path (each one a real tap). */
const goto = (...path: PaletteId[]) => {
  if (sec().nav.depth > 1) { sec().homePalette(); draw(); draw(); }
  for (const id of path) tap(`dock:nav:${id}`);
  assert.equal(cur(), path.at(-1) ?? "H", `reached ${path.join("→")}`);
};
const ALL: PaletteId[] = ["H", "T", "B", "BR", "BC", "V", "VS", "S", "M", "MM", "MN", "MC", "MF", "MD", "MS", "MW", "MR", "MV", "MQ", "C", "CI", "CD", "CC", "CB", "CU", "CS", "EQ", "EQS", "I", "IT", "ITD", "A", "AI", "AH", "AL", "AS"];

// --- drawing / resizing / moving between palettes never writes ------------------------------
draw(); draw();
const w0 = store.writes;
for (const id of ALL) {
  sec().goPalette(id);
  for (const f of [{ width: 390, height: 844 }, { width: 1280, height: 900 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) { frame = { ...frame, ...f }; draw(); draw(); }
  assert.ok(ctx.texts.includes(PALETTE_TITLE[id]) || id === "H", `${id} shows its title`);
}
frame = { ...frame, width: 390, height: 844 };
assert.equal(store.writes, w0, "redraw / resize / palette moves never save");

// --- HUB (H): asset display + the 4 modules only (神宮の見本) ------------------------------------
sec().homePalette(); draw(); draw();
const hubIds = regions().filter((r) => r.id.startsWith("dock:")).map((r) => r.id);
assert.deepEqual(hubIds.filter((x) => x.startsWith("dock:nav:")).sort(), ["dock:nav:A", "dock:nav:I", "dock:nav:M", "dock:nav:S", "dock:nav:T"], "H: 所持資産 + 売買・仕分・整備・侵略");
assert.equal(hubIds.some((x) => /:(buy|sell|repair|scrap|equip|select|step)/.test(x)), false, "H has no work buttons");
for (const t of ["所持資産", "売買", "仕分", "整備", "侵略"]) assert.ok(ctx.texts.includes(t), t);
// PC 1200px+: the HUB is 2 columns (CANVAS-PR2 暫定 ★A); the 4 modules are on the right.
frame = { ...frame, width: 1280, height: 900 }; draw(); draw();
assert.ok(regions().find((r) => r.id === "dock:nav:T")!.x > 640, "PC: the modules column is on the right");
frame = { ...frame, width: 390, height: 844 }; draw(); draw();

// --- every palette: ≥44px targets, also on a 320px phone (scrolled through) ------------------------
for (const width of [390, 320]) {
  frame = { ...frame, width };
  for (const id of ALL) {
    sec().goPalette(id);
    for (let step = 0; step < 40; step++) {
      draw(); draw();
      for (const r of regions()) {
        if (r.disabled || !r.visible || r.id.endsWith(":box") || r.id.includes("backdrop") || r.id.startsWith("dock:gauge") || r.id === "dock:nav:A") continue;
        const full = r.h >= 43.9 || r.y <= 92 || r.y + r.h >= frame.height - 60;
        if (full) assert.ok(r.w >= 43.9, `${width}px ${id} ${r.id} ${r.w}×${r.h}`);
        if (r.y > 92 && r.y + r.h < frame.height - 60) assert.ok(r.h >= 43.9, `${width}px ${id} ${r.id} ${r.w}×${r.h}`);
      }
      const y = ui.getScroll("dock");
      ui.wheel({ x: 100, y: 400 }, 300);
      if (ui.getScroll("dock") === y) break;
    }
  }
}
frame = { ...frame, width: 390 };
sec().homePalette(); draw(); draw();

// --- back = one step to the parent; HUB = straight home; shared work returns to its branch ---------
goto("T", "B", "MC");
tap("dock:nav:back"); assert.equal(cur(), "B", "買う → 新品機体 → 戻る = 買う");
goto("M", "MM", "MN", "MC");
tap("dock:nav:back"); assert.equal(cur(), "MN", "新規機体 → 購入 → 戻る = 新規機体");
tap("dock:nav:home"); assert.equal(cur(), "H", "HUB = straight home");

// --- tabs: onboarding = DOCK only; seeded = all but the active one; SORT tab = 仕分 -------------------
assert.deepEqual(dockTabs(createNewGameHub()).map((t) => t.enabled), [false, false, false, false, false]);
assert.deepEqual(dockTabs(hub()).map((t) => [t.id, t.enabled]), [["DOCK", false], ["INVADE", true], ["SORT", true], ["RESTORE", true], ["SORTIE", true]]);
tap("tab:INVADE");
assert.equal(navigated.at(-1), "tab:INVADE");
const nNav = navigated.length;
tap("tab:SORT");
assert.equal(navigated.length, nNav, "SORT tab stays in DOCK");
assert.equal(cur(), "S", "SORT tab opens 仕分");
assert.equal(sec().nav.parent, "H");

// --- repair (整備 → 機体整備 → 修理): one press, a double tap within 600ms pays once -------------
const worn = hub().fleet.find((m) => m.status === "needs_repair")!;
goto("M", "MM", "MR");
tap(`dock:mech:${worn.instanceId}:repair`);
assert.match(sec().state.notice, /足りない/, "short of parts → refused, nothing paid");
// Buy armor (売買 → 買う → 資源) with the canvas quantity buttons, then repair.
goto("T", "B", "BR");
for (let i = 0; i < 9; i++) tap("dock:armor:step:10");
tap("dock:armor:buy");
assert.ok((hub().inventory.armor ?? 0) >= 90, "market bought armor");
const armor0 = hub().inventory.armor ?? 0;
clock += 1000;
goto("M", "MM", "MR");
tap(`dock:mech:${worn.instanceId}:repair`);
const afterRepair = hub();
assert.ok((afterRepair.inventory.armor ?? 0) < armor0, "repair paid");
assert.equal(afterRepair.fleet.find((m) => m.instanceId === worn.instanceId)!.status, "operational");

// --- new mech (整備 → 機体整備 → 新規機体 → 購入) -------------------------------------------------------
clock += 1000;
const credits0 = hub().credits;
goto("M", "MM", "MN", "MC");
tap("dock:hangar:buy");
tap("dock:hangar:buy"); // same clock → guarded
assert.equal(hub().fleet.length, 4, "double tap buys one mech");
assert.ok(hub().credits < credits0);

// --- scrap (整備 → 機体整備 → 処分 → 分解): dialog, cancel stays, ok ----------------------------------
clock += 1000;
const victim = hub().fleet.at(-1)!.instanceId;
goto("M", "MM", "MD", "MS");
tap(`dock:mech:${victim}:scrap`);
assert.ok(sec().confirm, "scrap asks first");
tap("dock:confirm:scrap:cancel");
assert.equal(sec().confirm, null);
assert.equal(cur(), "MS", "やめる stays on the work palette");
assert.equal(hub().fleet.length, 4, "やめる keeps the mech");
tap(`dock:mech:${victim}:scrap`);
tap("dock:confirm:scrap:ok");
assert.equal(hub().fleet.length, 3, "解体した");

// --- deploy selection (侵略 → 部隊を選ぶ) --------------------------------------------------------------
const m0 = hub().fleet[0].instanceId;
const sel0 = sec().state.selectedDeployIds.includes(m0);
goto("I", "IT");
tap(`dock:mech:${m0}:select`);
assert.equal(sec().state.selectedDeployIds.includes(m0), !sel0);
tap(`dock:mech:${m0}:select`);
assert.equal(sec().state.selectedDeployIds.includes(m0), sel0);

// --- resource sell (売買 → 売る → 資源, confirm) ---------------------------------------------------------
const armorBefore = hub().inventory.armor ?? 0, crBefore = hub().credits;
goto("T", "V", "VS");
tap("dock:sell:armor");
assert.equal(hub().inventory.armor ?? 0, armorBefore, "sell asks first");
tap("dock:confirm:sell:ok");
assert.equal(hub().inventory.armor ?? 0, armorBefore - 1);
assert.equal(hub().credits, crBefore + 5);
// 神宮 2026-11-09: the confirm dialog chooses the quantity (±1 / ±10, 1..stock); cancel sells nothing.
{
  const a0 = hub().inventory.armor ?? 0, c0 = hub().credits;
  assert.ok(a0 >= 12, `seed has armor to sell (${a0})`);
  tap("dock:sell:armor");
  assert.equal(sec().confirmSpec()?.qty?.value, 1, "starts at 1");
  assert.equal(regions().find((r) => r.id === "dock:confirm:sell:qty:-1")?.disabled, true, "cannot go below 1");
  tap("dock:confirm:sell:qty:10");
  tap("dock:confirm:sell:qty:1");
  assert.equal(sec().confirmSpec()?.qty?.value, 12);
  assert.match(sec().confirmSpec()!.text, /12/);
  tap("dock:confirm:sell:cancel");
  assert.equal(sec().confirmSpec(), null);
  assert.equal(hub().inventory.armor ?? 0, a0, "cancel sells nothing");
  tap("dock:sell:armor");
  assert.equal(sec().confirmSpec()?.qty?.value, 1, "reopens at 1");
  for (let i = 0; i < Math.ceil(a0 / 10) + 1; i++) tap("dock:confirm:sell:qty:10");
  assert.equal(sec().confirmSpec()?.qty?.value, a0, "clamped to stock");
  tap("dock:confirm:sell:qty:-10");
  assert.equal(sec().confirmSpec()?.qty?.value, a0 - 10);
  tap("dock:confirm:sell:ok");
  assert.equal(hub().inventory.armor ?? 0, 10);
  assert.equal(hub().credits, c0 + (a0 - 10) * 5);
}

// --- equip (整備 → 機体整備 → 装備回路) through the canvas pickers ----------------------------------------
const circuitId = hub().circuits[0].circuitId;
const mechId = hub().fleet[1].instanceId;
goto("M", "MM", "EQ");
tap("dock:equip:circuit");
assert.ok(sec().picker);
tap(`dock:pick:circuit:opt:${circuitId}`);
tap("dock:equip:mech");
tap(`dock:pick:mech:opt:${mechId}`);
tap("dock:equip:equip");
const eq = hub().circuits.find((c) => c.circuitId === circuitId)!;
assert.ok(eq.equippedTo === mechId || /装備|できません|上限/.test(sec().state.notice), `equip result: ${eq.equippedTo} / ${sec().state.notice}`);

// --- circuits (整備 → 回路 → 所持回路 → 詳細): choosing selects it and opens 回路詳細; back = 所持回路 ------------
goto("M", "C", "CI");
tap(`dock:circuit:${circuitId}:select`);
assert.equal(cur(), "CD", "a circuit opens its detail");
assert.equal(sec().state.lastCircuit?.circuitId, circuitId, "existing selectCircuit");
tap("dock:nav:back"); assert.equal(cur(), "CI");

// --- sortie (侵略 → 直接出撃の準備): 探索へ marks deployed and navigates with the refilled URL -----------------
const navBefore = navigated.length;
goto("I");
tap("dock:sortie:explore");
if (navigated.length > navBefore) {
  const url = new URL(navigated.at(-1)!);
  assert.ok(url.searchParams.get("deployedInstanceIds"), "deploy URL carries the squad");
}

// Test tools are not on the canvas without debug mode (神宮決定 2026-11-06: localhost / ?debug=1 only, in the HTML area).
sec().homePalette(); draw(); draw();
assert.equal(ui.debugRegions().some((r) => r.id.startsWith("dock:debug")), false, "no test buttons on the canvas");
{
  let opened = 0;
  const dbgScene = new DockScene({ env: { ...env, debug: true, openDebug: () => { opened++; } }, redraw: () => {} });
  const dui = new CanvasUI({ blocked: () => false });
  const dctx = createStubCtx();
  const ddraw = () => { dui.beginFrame(dctx, 390, 844); dbgScene.draw(dui, { width: 390, height: 844, dpr: 1, insets: { top: 0, right: 0, bottom: 0, left: 0 } }); dui.endFrame(); };
  ddraw(); ddraw();
  const ids = dui.debugRegions().filter((r) => r.id.startsWith("dock:debug")).map((r) => r.id);
  assert.deepEqual(ids, ["dock:debug:open"], "debug mode: only 「検証用の欄へ」 on the canvas (HUB)");
  assert.deepEqual(dbgScene.sections!.debugActions().map((a) => a.id), ["seed", "grant", "inv", "verify-true", "verify-perfect", "sim-extract", "sim-abort", "sim-fail"], "the test actions go to the HTML area");
  dui.scrollTo("dock", 1e9); ddraw(); ddraw();
  const r = dui.debugRegions().find((x) => x.id === "dock:debug:open")!;
  const p = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  dui.pointerDown(1, p, true); dui.pointerUp(1, p);
  assert.equal(opened, 1, "「検証用の欄へ」 opens the HTML area");
}

// --- the play-log blocked state stops every action (HUB and a work palette) --------------------------------
for (const id of ["H", "BR"] as PaletteId[]) {
  sec().goPalette(id);
  const blockedUi = new CanvasUI({ blocked: () => true });
  blockedUi.beginFrame(ctx, 390, 844); scene.draw(blockedUi, frame); blockedUi.endFrame();
  const w = store.writes;
  for (const r of blockedUi.debugRegions().filter((x) => x.visible && !x.disabled)) {
    blockedUi.pointerDown(9, { x: r.x + 1, y: r.y + 1 }); blockedUi.pointerUp(9, { x: r.x + 1, y: r.y + 1 });
  }
  assert.equal(store.writes, w, `${id}: blocked → nothing saved`);
  assert.equal(blockedUi.activationCount, 0);
  assert.equal(cur(), id, `${id}: blocked → no palette move`);
}

// --- 初出撃の準備 (HUB) only until the 10 initial containers are opened (神宮 2026-11-09) -----------------------
{
  const introStore = new MemStore();
  const introShown = (opened: number) => {
    const h = createNewGameHub();
    introStore.setItem(HUB_SAVE_STORAGE_KEY, serializeHubSave(createHubSave({ ...h, newGameIntro: { ...h.newGameIntro!, initialOpened: opened } })));
    const s2 = new DockScene({ env: { ...env, storage: introStore }, redraw: () => {} });
    const u2 = new CanvasUI({ blocked: () => false });
    const d2 = () => { u2.beginFrame(createStubCtx(), 390, 844); s2.draw(u2, { width: 390, height: 844, dpr: 1, insets: { top: 0, right: 0, bottom: 0, left: 0 } }); u2.endFrame(); };
    d2(); d2();
    return u2.debugRegions().some((r) => r.id === "dock:intro:open");
  };
  assert.equal(introShown(0), true, "new game: 初出撃の準備 on HUB");
  assert.equal(introShown(9), true, "9/10 opened: still shown");
  assert.equal(introShown(10), false, "all 10 opened: hidden");
}

console.log("canvas-dock-full selftest: OK");
