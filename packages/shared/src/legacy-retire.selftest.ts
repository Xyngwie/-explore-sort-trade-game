/**
 * fix/hub-save-legacy-retire (2026-10-12 神宮): materials / importedMaterials / ammoLoad /
 * selectedMechId / selectedAmmoId / inventoryFieldDrops left HubSave.
 * Compat tests 1–5, 7–10, 12 of hubsave-key-inventory.md (6 and 11: explore / trade).
 */
import assert from "node:assert/strict";
import {
  HUB_SAVE_LEGACY_STORAGE_KEY,
  HUB_SAVE_STORAGE_KEY,
  INITIAL_HUB,
  createHubSave,
  createOwnedMech,
  loadHubSaveWithStatus,
  normalizeHubSnapshot,
  parseHubSave,
  parseSortToTradeSearch,
  readSortieCheckpoint,
  shouldMarkDoneAfterTradeWrite,
  writeSortieCheckpoint,
  buildSortToTradeUrlFromResult,
} from "./index";

class Mem {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}

const RETIRED = ["materials", "importedMaterials", "ammoLoad", "selectedMechId", "selectedAmmoId", "inventoryFieldDrops"];
const mech = createOwnedMech("mech_gen1", { instanceId: "keep-1", currentAmmo: 9 });
const oldV3Hub = {
  ...INITIAL_HUB,
  credits: 777,
  materials: 432,
  importedMaterials: 12,
  ammoLoad: { ammo_standard: 40, ammo_ap: 10, ammo_hp: 5 },
  selectedMechId: "mech_gen2",
  selectedAmmoId: "ammo_ap",
  inventoryFieldDrops: [{ dropId: "d1", frontSeed: 1, cell: { sx: 0, sy: 0 }, inventory: { ammo: 3 }, cause: "wreck_not_carried", droppedAt: "2026-10-01T00:00:00.000Z" }],
  fleet: [mech],
  inventory: { ammo: 30, armor: 7, power: 2, junk: 4 },
  perfectMaxSize: 3,
  firstInvadeClear: { boardSeed: 5 },
  ammoBatteryRepaired: true,
  appliedSortieIds: ["s1"],
  airSupportCooldownSec: 12,
  bulletinUnlocked: true,
  sortieSelection: ["keep-1"],
  unopenedContainers: 2,
};

// 1. an old v3 save with the retired keys loads; every other key is unchanged
{
  const parsed = parseHubSave({ v: 3, savedAt: "2026-10-01T00:00:00.000Z", hub: oldV3Hub })!;
  assert.ok(parsed, "old v3 loads");
  const h = parsed.hub as unknown as Record<string, unknown>;
  for (const k of RETIRED) assert.equal(k in h, false, `${k} gone`);
  assert.equal(parsed.hub.credits, 777);
  assert.deepEqual(parsed.hub.fleet.map((m) => [m.instanceId, m.currentAmmo]), [["keep-1", 9]]);
  assert.deepEqual(parsed.hub.inventory, { ammo: 30, armor: 7, power: 2, junk: 4 });
  assert.equal(parsed.hub.perfectMaxSize, 3);
  assert.equal(parsed.hub.ammoBatteryRepaired, true);
  assert.deepEqual(parsed.hub.appliedSortieIds, ["s1"]);
  assert.equal(parsed.hub.airSupportCooldownSec, 12);
  assert.equal(parsed.hub.bulletinUnlocked, true);
  assert.deepEqual(parsed.hub.sortieSelection, ["keep-1"]);
  assert.equal(parsed.hub.unopenedContainers, 2);
  assert.equal(parsed.hub.firstInvadeClear?.boardSeed, 5);
  console.log("legacy-retire 1 old v3 loads, other keys unchanged ok");

  // 2. load → save: the JSON has none of the retired keys
  const json = JSON.stringify(createHubSave(parsed.hub));
  for (const k of RETIRED) assert.ok(!json.includes(`"${k}"`), `${k} not written`);
  console.log("legacy-retire 2 re-save drops the keys ok");

  // 5. ammoLoad is not converted: inventory.ammo stays 30 (no +55)
  assert.equal(parsed.hub.inventory.ammo, 30);
  // D1: materials is not converted into junk either
  assert.equal(parsed.hub.inventory.junk, 4);
  console.log("legacy-retire 5 ammoLoad / materials not converted ok");

  // 4. an old build writes materials back into v3 → the new build still reads it
  const oldBuildWrite = { ...createHubSave(parsed.hub), hub: { ...createHubSave(parsed.hub).hub, materials: 99, ammoLoad: { ammo_standard: 1, ammo_ap: 0, ammo_hp: 0 } } };
  const back = parseHubSave(JSON.parse(JSON.stringify(oldBuildWrite)))!;
  assert.ok(back);
  assert.equal("materials" in back.hub, false);
  assert.deepEqual(back.hub.inventory, parsed.hub.inventory);
  console.log("legacy-retire 4 round trip with an old build ok");

  // 12. normalize is idempotent
  const once = normalizeHubSnapshot(oldV3Hub as never);
  assert.deepEqual(normalizeHubSnapshot(once), once);
  console.log("legacy-retire 12 normalize idempotent ok");
}

// 3. v1 / v2 legacy saves (MechId[] fleet, materials) migrate; ID mechs are created
{
  const store = new Mem();
  store.setItem(HUB_SAVE_LEGACY_STORAGE_KEY, JSON.stringify({
    v: 2, savedAt: "2026-08-01T00:00:00.000Z",
    hub: { credits: 50, materials: 3, fleet: ["mech_gen1", "mech_gen2"], ammoLoad: { ammo_standard: 4, ammo_ap: 0, ammo_hp: 0 }, importedMaterials: 1, selectedMechId: "mech_gen1", selectedAmmoId: "ammo_standard" },
  }));
  const res = loadHubSaveWithStatus(store);
  assert.equal(res.status, "migrated");
  assert.equal(res.save!.hub.credits, 50);
  assert.equal(res.save!.hub.fleet.length, 2);
  assert.ok(res.save!.hub.fleet.every((m) => typeof m.instanceId === "string" && m.instanceId.length > 0));
  for (const k of RETIRED) assert.equal(k in (res.save!.hub as unknown as Record<string, unknown>), false);
  assert.ok(store.getItem(HUB_SAVE_LEGACY_STORAGE_KEY), "the legacy key itself is left as it was");
  const v3 = store.getItem(HUB_SAVE_STORAGE_KEY);
  if (v3) assert.ok(!v3.includes('"materials"'));
  console.log("legacy-retire 3 v1/v2 migrate ok");
}

// 7–9 (shared side). Old URL with importMaterials + yieldBag, old zero-yield URL, new fromSort URLs.
{
  const oldFull = parseSortToTradeSearch("?importMaterials=42&craftMultiplier=1.000&yieldBag=ammo:10;armor:20&handoffId=h1")!;
  assert.equal(oldFull.fromSort, true);
  assert.deepEqual(oldFull.yieldBag, { ammo: 10, armor: 20 });
  assert.equal("importMaterials" in oldFull, false, "the old number is not carried on");
  const oldZero = parseSortToTradeSearch("?importMaterials=0&craftMultiplier=1");
  assert.equal(oldZero?.fromSort, true, "8: old zero-yield URL is a Sort return");
  const newZero = parseSortToTradeSearch("?fromSort=1");
  assert.equal(newZero?.fromSort, true, "9: fromSort=1 alone");
  const newUrl = new URL(buildSortToTradeUrlFromResult({ yieldFood: 1, yieldMaterial: 2, yieldEnergy: 3, craftMultiplier: 1 }));
  assert.equal(newUrl.searchParams.get("fromSort"), "1");
  assert.equal(newUrl.searchParams.has("importMaterials"), false);
  console.log("legacy-retire 7-9 Sort return marker (URL side) ok");

  // 10. done mark: old and new URL give the same answer; a checkpoint still reads
  const mark = (p: ReturnType<typeof parseSortToTradeSearch>) => shouldMarkDoneAfterTradeWrite({
    saved: true,
    depositUnopenedContainers: Math.floor(Number(p?.depositUnopenedContainers) || 0),
    yieldBag: !!p?.yieldBag && Object.keys(p.yieldBag).length > 0,
  });
  assert.equal(mark(oldFull), mark(parseSortToTradeSearch(`?fromSort=1&craftMultiplier=1.000&yieldBag=ammo:10;armor:20`)));
  assert.equal(mark(oldZero), mark(newZero));
  assert.equal(mark(oldZero), false);
  const store = new Mem();
  assert.ok(writeSortieCheckpoint({ v: 1, kind: "sortie", body: { hub: oldV3Hub } } as never, store));
  assert.notEqual(readSortieCheckpoint(store).status, "corrupt");
  console.log("legacy-retire 10 done mark same for old/new URL, checkpoint reads ok");
}

console.log("shared legacy-retire.selftest ok");
