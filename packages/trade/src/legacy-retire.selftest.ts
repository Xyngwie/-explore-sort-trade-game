/** fix/hub-save-legacy-retire: compat tests 7, 8, 9, 11 (trade side) + old history logs. */
import assert from "node:assert/strict";
import { createOwnedMech, INITIAL_HUB, parseSortToTradeSearch } from "@estg/shared";
import { createInitialHangar, holdingPills, ingestLocationSearch, scrapMech, type HangarState } from "./hangar";
import { validateAndConsumeSortHandoff } from "./sort-handoff-guard";
import { parseResourceHistoryLine } from "./resourceHistory";

class Mem {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as unknown as { localStorage: Mem; window: { location: { href: string } } };
const base = (): HangarState => {
  const s = createInitialHangar(new Mem());
  return { ...s, hub: { ...s.hub, credits: 100, inventory: { ammo: 1, armor: 0, power: 0, junk: 0 } } };
};

// 7. old URL (importMaterials + yieldBag + handoffId): only the yieldBag, once; no 資材
{
  const search = "?importMaterials=42&craftMultiplier=1.000&yieldBag=ammo:10;armor:20&handoffId=h7";
  const href = `https://estg.invalid/trade/${search}`;
  g.localStorage = new Mem();
  g.window = { location: { href } };
  g.localStorage.setItem("wreckline.pendingSortHandoff.v1", JSON.stringify({ href, createdAt: Date.now() }));
  assert.equal(validateAndConsumeSortHandoff(search), true, "first arrival accepted");
  const after = ingestLocationSearch(base(), search, new Mem()).state;
  const inv = (i: Record<string, number | undefined>) => ["ammo", "armor", "power", "junk"].map((k) => i[k] ?? 0);
  assert.deepEqual(inv(after.hub.inventory), [11, 20, 0, 0]);
  assert.equal("materials" in (after.hub as unknown as Record<string, unknown>), false);
  assert.equal(after.hub.credits, 100, "the old 42 grants nothing");
  assert.equal(validateAndConsumeSortHandoff(search), false, "replay rejected by handoffId");
  console.log("trade legacy-retire 7 old URL grants yieldBag once ok");
}

// 8. old importMaterials=0 → Sort return, no grant
{
  const after = ingestLocationSearch(base(), "?importMaterials=0&craftMultiplier=1", new Mem());
  assert.equal(parseSortToTradeSearch("?importMaterials=0&craftMultiplier=1")?.fromSort, true, "old zero-yield URL is read as a Sort return");
  assert.deepEqual(after.state.hub.inventory.ammo ?? 0, 1);
  assert.equal(after.state.hub.inventory.armor ?? 0, 0);
  assert.equal(after.state.hub.credits, 100);
  console.log("trade legacy-retire 8 old zero URL ok");
}

// 9. new fromSort=1 with and without a yieldBag
{
  const none = ingestLocationSearch(base(), "?fromSort=1&craftMultiplier=1.000", new Mem());
  assert.equal(parseSortToTradeSearch("?fromSort=1&craftMultiplier=1.000")?.fromSort, true);
  assert.equal(none.state.hub.inventory.ammo ?? 0, 1);
  assert.equal(none.state.hub.inventory.power ?? 0, 0);
  const bag = ingestLocationSearch(base(), "?fromSort=1&craftMultiplier=1.000&yieldBag=power:3", new Mem());
  assert.equal(bag.state.hub.inventory.power, 3);
  console.log("trade legacy-retire 9 fromSort=1 ok");
}

// 11. scrap gives junk; the bar has no 資材
{
  const s0 = base();
  const m = createOwnedMech("mech_gen1", { instanceId: "scrap-me" });
  const s = scrapMech({ ...s0, hub: { ...s0.hub, fleet: [m, ...s0.hub.fleet] } }, "scrap-me");
  assert.equal(s.hub.inventory.junk, 15, "operational gen1 → ジャンク 15 (was 資材 15)");
  assert.equal(s.hub.credits, 140);
  assert.ok(!holdingPills(s.hub).some((p) => p.labelJa.includes("資材") || p.key === "materials"));
  assert.ok(!JSON.stringify(s.hub).includes('"materials"'));
  const entry = parseResourceHistoryLine(s.log[0]!);
  assert.ok(entry && entry.chips.some((c) => c.label === "ジャンク" && c.amount === 15), `new scrap log shows: ${s.log[0]}`);
  console.log("trade legacy-retire 11 scrap → junk ok");
}

// old history lines still display
{
  assert.equal(parseResourceHistoryLine("搬入 materials +12")?.chips[0]?.amount, 12);
  assert.equal(parseResourceHistoryLine("解体 m1 → +40c / +15m")?.chips[1]?.amount, 15);
  void INITIAL_HUB;
  console.log("trade legacy-retire old history lines ok");
}
console.log("trade legacy-retire.selftest ok");
