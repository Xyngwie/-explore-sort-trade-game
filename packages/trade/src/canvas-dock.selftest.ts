/** Canvas DOCK stage 1 selftest (docs/CANVAS_SHELL_V0.md §5–§7). */
import assert from "node:assert/strict";
import {
  CanvasUI,
  CRAFT_SIGNATURE_STORAGE_KEY,
  HUB_SAVE_STORAGE_KEY,
  applyContainerBuy,
  applyResourceTrade,
  createNewGameHub,
  loadHubSaveFromLocalStorage,
  normalizeHubSnapshot,
  saveHubSaveToLocalStorage,
  type HubSnapshot,
} from "@estg/shared";
import { createStubCtx } from "../../shared/src/canvas-ui/test-ctx";
import { DockScene, layoutDock } from "./canvas/dock-scene";
import { MARKET_ITEMS, purchase, type MarketDeps } from "./canvas/market";
import { StartScene, startWithName } from "./canvas/start-scene";

class MemStore {
  map = new Map<string, string>();
  writes = 0;
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.writes++; this.map.set(k, String(v)); }
  removeItem(k: string) { this.writes++; this.map.delete(k); }
}
function setup(hub: HubSnapshot) {
  const store = new MemStore();
  saveHubSaveToLocalStorage(hub, store);
  store.writes = 0;
  const ops: Array<{ kind: string; ctx: unknown }> = [];
  let blocked = false;
  const deps: MarketDeps = {
    read: () => loadHubSaveFromLocalStorage(store)?.hub ?? null,
    save: (h) => saveHubSaveToLocalStorage(h, store),
    blocked: () => blocked,
    operation: (kind, ctx) => ops.push({ kind, ctx }),
  };
  return { store, ops, deps, setBlocked: (b: boolean) => { blocked = b; } };
}
const base = normalizeHubSnapshot({ ...createNewGameHub(), credits: 1000, inventory: { ammo: 3 } });
const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// --- purchase = existing trade functions, one save, one play-log op --------
{
  const t = setup(base);
  const r = purchase("ammo", 10, t.deps);
  assert.equal(r.ok, true);
  const now = t.deps.read()!;
  assert.equal(now.credits, 1000 - 60);
  assert.equal(now.inventory.ammo, 13);
  assert.equal(t.store.writes, 1, "one save per purchase");
  assert.deepEqual(t.ops, [{ kind: "resource.buy", ctx: { id: "ammo", quantity: 10 } }]);
  // Same result as the palette / DOCK card function applied to the same hub.
  const ref = applyResourceTrade(base, "ammo", "buy", 10)!;
  assert.equal(now.credits, ref.credits);
  assert.deepEqual(now.inventory, normalizeHubSnapshot(ref).inventory);
}
{
  const t = setup(base);
  assert.equal(purchase("unopened", 3, t.deps).ok, true);
  const ref = applyContainerBuy(base, 3)!;
  assert.equal(t.deps.read()!.unopenedContainers, ref.unopenedContainers);
  assert.equal(t.deps.read()!.credits, 1000 - 45);
  assert.deepEqual(t.ops, [{ kind: "unopened.buy", ctx: { quantity: 3 } }]);
  // newGameIntro (10 initial containers flow) is untouched by a purchase.
  assert.deepEqual(t.deps.read()!.newGameIntro, normalizeHubSnapshot(base).newGameIntro);
}
// Refusals never write.
{
  const t = setup(base);
  t.setBlocked(true);
  assert.deepEqual(purchase("ammo", 1, t.deps), { ok: false, reason: "blocked" });
  t.setBlocked(false);
  assert.deepEqual(purchase("ammo", 167, t.deps), { ok: false, reason: "insufficient" }, "1000/6 = 166 max");
  assert.deepEqual(purchase("ammo", 0, t.deps), { ok: false, reason: "insufficient" });
  assert.equal(t.store.writes, 0);
  assert.equal(t.ops.length, 0);
}
// A stale screen cannot overspend: purchase re-reads the save.
{
  const t = setup(base);
  const scene = new DockScene({ deps: t.deps });
  saveHubSaveToLocalStorage({ ...t.deps.read()!, credits: 5 }, t.store); // another tab spent it
  t.store.writes = 0;
  scene.qty.ammo = 1;
  scene.requestBuy("ammo");
  assert.equal(t.store.writes, 0);
  assert.match(scene.notice!, /クレジットが足りません/);
  assert.equal(scene.hub!.credits, 5, "screen re-read the save after the refusal");
}

// --- scene: confirm dialog, cancel, quantity -----------------------------------
{
  const t = setup(base);
  const scene = new DockScene({ deps: t.deps });
  scene.step("unopened", 10);
  assert.equal(scene.qty.unopened, 11);
  scene.step("unopened", 1000);
  assert.equal(scene.qty.unopened, 66, "clamped to what Cr buys (1000/15)");
  scene.step("unopened", -1000);
  assert.equal(scene.qty.unopened, 1, "never below 1");
  scene.step("unopened", 1);
  scene.requestBuy("unopened");
  assert.deepEqual(scene.confirm, { item: "unopened", qty: 2 });
  assert.equal(t.store.writes, 0, "opening the dialog does not buy");
  scene.cancelConfirm();
  assert.equal(scene.confirm, null);
  assert.equal(t.store.writes, 0, "やめる does not buy");
  scene.requestBuy("unopened");
  scene.confirmBuy();
  scene.confirmBuy(); // a second confirm (double tap) has no dialog left → nothing
  assert.equal(t.store.writes, 1);
  assert.equal(t.deps.read()!.unopenedContainers, normalizeHubSnapshot(base).unopenedContainers + 2);
  assert.equal(scene.qty.unopened, 1, "CANVAS-D4: quantity back to 1");
  // Resource buys do not confirm (existing rule).
  scene.requestBuy("power");
  assert.equal(scene.confirm, null);
  assert.equal(t.store.writes, 2);
}

// --- drawing never writes; whole flow through the canvas UI --------------------
{
  const t = setup(base);
  const scene = new DockScene({ deps: t.deps });
  const ui = new CanvasUI({ blocked: () => false });
  const ctx = createStubCtx();
  const frame = { width: 390, height: 844, dpr: 3, insets: noInsets };
  const draw = () => { ui.beginFrame(ctx, frame.width, frame.height); scene.draw(ui, frame); ui.endFrame(); };
  for (let i = 0; i < 50; i++) draw();
  assert.equal(t.store.writes, 0, "50 redraws → no save");
  for (const s of ["Cr", "弾", "装", "電", "箱", "購入", "物資市場（購入）"]) assert.ok(ctx.texts.includes(s) || ctx.texts.some((x) => x.includes(s)), s);
  const reg = (id: string) => ui.debugRegions().find((r) => r.id === id)!;
  const tap = (id: string, pid: number) => {
    const r = reg(id);
    assert.ok(r && r.visible, `${id} visible`);
    ui.pointerDown(pid, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
    ui.pointerUp(pid, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
    draw();
  };
  tap("dock:ammo:step:10", 1);
  tap("dock:ammo:buy", 2);
  assert.equal(t.store.writes, 1);
  assert.equal(t.deps.read()!.inventory.ammo, 3 + 11);
  assert.ok(ctx.texts.includes("Cr −66") && ctx.texts.includes("弾 +11"), "delta shown with #300 signs");
  // Box: dialog, underlying buttons are dead while it is open.
  ui.wheel({ x: 100, y: 400 }, 10_000); draw();
  tap("dock:unopened:buy", 3);
  assert.ok(scene.confirm);
  const under = ui.debugRegions().find((r) => r.id === "dock:ammo:buy")!;
  assert.equal(under.visible, false, "base layer inactive under the dialog");
  ui.pointerDown(4, { x: under.x + 2, y: under.y + 2 });
  ui.pointerUp(4, { x: under.x + 2, y: under.y + 2 });
  draw();
  assert.equal(t.store.writes, 1, "tap on a hidden button behind the dialog never buys");
  assert.equal(scene.confirm, null, "backdrop tap = やめる (CANVAS-D6)");
  tap("dock:unopened:buy", 5);
  tap("dock:confirm:ok", 6);
  assert.equal(t.store.writes, 2);
  assert.deepEqual(t.ops.map((o) => o.kind), ["resource.buy", "unopened.buy"]);
  // Scroll drag starting on a buy button never buys.
  ui.wheel({ x: 100, y: 400 }, -10_000); draw();
  const b = reg("dock:junk:buy");
  ui.pointerDown(7, { x: b.x + 5, y: b.y + 5 });
  ui.pointerMove(7, { x: b.x + 5, y: b.y - 60 });
  ui.pointerUp(7, { x: b.x + 5, y: b.y - 60 });
  ui.pointerCancel(7);
  draw();
  assert.equal(t.store.writes, 2, "scroll never buys");
}

// --- layout: phone portrait/landscape, PC, small phone ---------------------------
for (const [w, h] of [[390, 844], [844, 390], [1280, 900], [320, 568], [280, 653], [360, 740], [1600, 1000]]) {
  const L = layoutDock({ width: w, height: h, insets: noInsets }, true);
  assert.ok(L.column.w <= 960 && L.column.x >= 0 && L.column.x + L.column.w <= w);
  for (const row of L.rows) {
    const rects = [...row.steps, row.qty, row.buy];
    for (const r of rects) {
      assert.ok(r.h >= 44 && r.w >= 44, `${w}x${h} ${row.item} target ≥44px (${r.w}×${r.h})`);
      assert.ok(r.x >= row.rect.x && r.x + r.w <= row.rect.x + row.rect.w + 0.01, `${w}x${h} ${row.item} inside row`);
      assert.ok(r.y >= row.rect.y && r.y + r.h <= row.rect.y + row.rect.h, `${w}x${h} ${row.item} inside row vertically`);
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], c = rects[j];
      const apart = a.x + a.w <= c.x + 0.01 || c.x + c.w <= a.x + 0.01 || a.y + a.h <= c.y + 0.01 || c.y + c.h <= a.y + 0.01;
      assert.ok(apart, `${w}x${h} ${row.item} no overlap`);
    }
    assert.ok(row.note.y >= Math.max(...rects.map((r) => r.y + r.h)) - 0.01 || L.wide, `${w}x${h} ${row.item} note below the controls`);
    assert.ok(row.info.w > 40, `${w}x${h} label room`);
  }
  assert.equal(L.rows.length, MARKET_ITEMS.length);
}

// --- identity (CANVAS-Q1) -------------------------------------------------------
{
  const store = new MemStore();
  assert.deepEqual(startWithName("   ", store), { ok: false, notice: "名前を入力してください。" });
  assert.equal(store.writes, 0);
  assert.deepEqual(startWithName(" 神宮|\u0007 ", store), { ok: true, name: "神宮" });
  assert.equal(store.getItem(CRAFT_SIGNATURE_STORAGE_KEY), "神宮");
  // Already confirmed: a different draft cannot change it.
  assert.deepEqual(startWithName("別名", store), { ok: true, name: "神宮" });
  assert.equal(store.getItem(CRAFT_SIGNATURE_STORAGE_KEY), "神宮");
  assert.equal(store.writes, 1, "set once");
  // Longer than 32 is cut to the existing engraving limit.
  const s2 = new MemStore();
  assert.equal((startWithName("あ".repeat(40), s2) as { name: string }).name.length, 32);
  // Start scene: locked → starts with the stored name, no input needed.
  let started = "";
  const sc = new StartScene((n) => { started = n; }, store);
  assert.equal(sc.locked, true);
  sc.start();
  assert.equal(started, "神宮");
  // Save failure → stays on the start screen with a notice.
  const failing = { getItem: () => null, setItem: () => { throw new Error("play_log_pending"); } };
  const sf = new StartScene(() => { throw new Error("must not start"); }, failing);
  sf.draft = "名前";
  sf.start();
  assert.match(sf.notice!, /保存できませんでした/);
}

// --- save / checkpoint compatibility ----------------------------------------------
{
  const t = setup(base);
  t.store.setItem("estg.sortieCheckpoint", '{"v":1,"kind":"sortie","body":{}}');
  const before = t.store.getItem("estg.sortieCheckpoint");
  purchase("armor", 2, t.deps);
  assert.equal(t.store.getItem("estg.sortieCheckpoint"), before, "checkpoint untouched");
  // Written in the existing save key and format (readable by the existing loader).
  assert.ok(t.store.getItem(HUB_SAVE_STORAGE_KEY));
  assert.equal(loadHubSaveFromLocalStorage(t.store)!.hub.inventory.armor, 2);
  // Re-reading after a "reload" gives the same balance and stock.
  const reread = new DockScene({ deps: t.deps });
  assert.equal(reread.hub!.credits, 1000 - 12);
  assert.equal(reread.hub!.inventory.armor, 2);
}

console.log("canvas-dock selftest: OK");
