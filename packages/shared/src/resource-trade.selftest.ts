/** PR2b palette logic: tiers, max clamp, trade math vs the pre-PR2b DOCK card, save/checkpoint compat. */
import assert from "node:assert/strict";
import {
  INITIAL_HUB, createNewGameHub, loadHubSaveFromLocalStorage, saveHubSaveToLocalStorage, normalizeHubSnapshot,
  SORTIE_CHECKPOINT_KEY, readSortieCheckpoint, addUnopenedContainers, UNOPENED_CONTAINER_PRICE_CREDITS,
  RESOURCE_BUY_PRICE, RESOURCE_SELL_PRICE, applyResourceTrade, applyContainerBuy, holdQuantity,
  maxResourceTrade, maxContainerBuy, resourceSellConfirmText, signedDelta, shortfallText,
  HOLD_START_DELAY_MS, HOLD_STEP_MS, HOLD_STEPS_PER_TIER, computeShellModel, hudPaletteEnabled,
  type HubSnapshot, type ResourceId,
} from "./index";

class Mem {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
}
// Prices / constants unchanged & decided.
assert.equal(RESOURCE_SELL_PRICE, 5); assert.equal(RESOURCE_BUY_PRICE, 6); assert.equal(UNOPENED_CONTAINER_PRICE_CREDITS, 15);
assert.deepEqual([HOLD_START_DELAY_MS, HOLD_STEP_MS, HOLD_STEPS_PER_TIER], [400, 100, 10]);

// Tiers 1..10, 20..100, 200..1000, 2000…
const seq = Array.from({ length: 30 }, (_, i) => holdQuantity(i, 1e9).qty);
assert.deepEqual(seq.slice(0, 10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.deepEqual(seq.slice(10, 19), [20, 30, 40, 50, 60, 70, 80, 90, 100]);
assert.deepEqual(seq.slice(19, 28), [200, 300, 400, 500, 600, 700, 800, 900, 1000]);
assert.equal(seq[28], 2000);
assert.deepEqual(holdQuantity(0, 1e9), { qty: 1, atMax: false });
// Max clamp.
assert.deepEqual(holdQuantity(50, 37), { qty: 37, atMax: true });
assert.deepEqual(holdQuantity(12, 37), { qty: 37, atMax: true }); // 40 > 37
assert.deepEqual(holdQuantity(11, 37), { qty: 30, atMax: false });
assert.deepEqual(holdQuantity(0, 1), { qty: 1, atMax: true });
assert.deepEqual(holdQuantity(5, 0), { qty: 0, atMax: true });

// Legacy DOCK card (pre-PR2b, verbatim) for byte-equality of qty=1.
function legacy(hub: HubSnapshot, id: ResourceId, action: "buy" | "sell"): HubSnapshot | null {
  const current = Math.max(0, Math.floor(hub.inventory?.[id] ?? 0));
  const inventory = { ...hub.inventory };
  if (action === "sell") {
    if (current < 1) return null;
    if (current === 1) delete inventory[id]; else inventory[id] = current - 1;
    return { ...hub, credits: hub.credits + 5, inventory };
  }
  if (hub.credits < 6) return null;
  inventory[id] = current + 1;
  return { ...hub, credits: hub.credits - 6, inventory };
}
const base = normalizeHubSnapshot({ ...INITIAL_HUB, credits: 100, inventory: { ammo: 3, armor: 1, power: 0, junk: 7 } } as HubSnapshot);
for (const id of ["ammo", "armor", "power", "junk"] as ResourceId[])
  for (const a of ["buy", "sell"] as const)
    assert.deepEqual(applyResourceTrade(base, id, a, 1), legacy(base, id, a), `${id} ${a}`);
// qty N == N repeated single trades.
let rep: HubSnapshot | null = base;
for (let i = 0; i < 3; i++) rep = applyResourceTrade(rep!, "ammo", "sell", 1);
assert.deepEqual(applyResourceTrade(base, "ammo", "sell", 3), rep);
rep = base; for (let i = 0; i < 16; i++) rep = applyResourceTrade(rep!, "power", "buy", 1);
assert.deepEqual(applyResourceTrade(base, "power", "buy", 16), rep);
// No partial trades / over max.
assert.equal(maxResourceTrade(base, "power", "buy"), 16);
assert.equal(applyResourceTrade(base, "power", "buy", 17), null);
assert.equal(maxResourceTrade(base, "ammo", "sell"), 3);
assert.equal(applyResourceTrade(base, "ammo", "sell", 4), null);
assert.equal(applyResourceTrade(base, "power", "sell", 1), null);
assert.equal(applyResourceTrade(base, "ammo", "buy", 0), null);
// Stock only: mech loaded ammo untouched.
const withMech = normalizeHubSnapshot(createNewGameHub());
const tradedMech = applyResourceTrade({ ...withMech, credits: 600 }, "ammo", "buy", 10)!;
assert.deepEqual(tradedMech.fleet, withMech.fleet);
// Containers: same as DOCK buyUnopenedContainers math.
const cb = applyContainerBuy({ ...base, credits: 47 }, 3)!;
assert.deepEqual(cb, addUnopenedContainers(normalizeHubSnapshot({ ...base, credits: 2 }), 3));
assert.equal(applyContainerBuy({ ...base, credits: 44 }, 3), null);
assert.equal(maxContainerBuy({ credits: 47 }), 3);
// Texts / signs.
assert.equal(resourceSellConfirmText("弾薬", 3), "売却しますか？\n弾薬 ×3\n+15c（売値 5c）");
assert.deepEqual(signedDelta(5), { text: "+5", cls: "gain" });
assert.deepEqual(signedDelta(-6), { text: "\u22126", cls: "spend" });
assert.deepEqual(signedDelta(0), { text: "±0", cls: "zero" });
assert.equal(shortfallText(6, 2), "要 6c / 持 2c");

// Save + checkpoint compat: trade round-trips, checkpoint key untouched, shape unchanged.
const mem = new Mem();
const ckpt = JSON.stringify({ v: 1, kind: "sortie", body: { phase: "x" } });
mem.setItem(SORTIE_CHECKPOINT_KEY, ckpt);
saveHubSaveToLocalStorage(base, mem as unknown as Storage);
const before = loadHubSaveFromLocalStorage(mem as unknown as Storage)!.hub;
const after = applyResourceTrade(before, "junk", "sell", 7)!;
saveHubSaveToLocalStorage(after, mem as unknown as Storage);
const re = loadHubSaveFromLocalStorage(mem as unknown as Storage)!.hub;
assert.equal(re.credits, before.credits + 35);
assert.equal(re.inventory.junk ?? 0, 0);
assert.deepEqual(Object.keys(re).sort(), Object.keys(before).sort());
assert.equal(mem.getItem(SORTIE_CHECKPOINT_KEY), ckpt);
assert.deepEqual(readSortieCheckpoint(mem as unknown as Storage), readSortieCheckpoint((() => { const m = new Mem(); m.setItem(SORTIE_CHECKPOINT_KEY, ckpt); return m as unknown as Storage; })()));

// #332: palette available in onboarding, off mid SORT handoff / explore / no save.
const intro = normalizeHubSnapshot(createNewGameHub());
assert.ok(intro.newGameIntro && !intro.newGameIntro.firstSortie);
assert.equal(hudPaletteEnabled({ current: "trade", hub: intro, handoffInProgress: false }), true);
assert.equal(hudPaletteEnabled({ current: "sort", hub: intro, handoffInProgress: true }), false);
assert.equal(hudPaletteEnabled({ current: "explore", hub: intro, handoffInProgress: false }), false);
assert.equal(hudPaletteEnabled({ current: "trade", hub: null, handoffInProgress: false }), false);
// Tabs unchanged during onboarding (only DOCK).
assert.deepEqual(computeShellModel({ current: "trade", hub: intro, handoffInProgress: false }).tabs.filter((t) => t.enabled).map((t) => t.id), []);
console.log("resource-trade selftest ok");
