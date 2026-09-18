import assert from "node:assert/strict";
import {
  MECH_FLEET_RULES,
  buildExploreToHubWearUrl,
  toExploreToHubWearPayload,
} from "@estg/shared";
import {
  EXAMPLE_TYPED_REPAIR_COST,
  buildDeployUrl,
  buildPlaytestSeedHub,
  buildSeedYieldBagForTypedRepair,
  canAffordYieldCost,
  createInitialHangar,
  describeTypedRepairShortfall,
  grantStarterFleet,
  ingestLocationSearch,
  loadPlaytestSeed,
  markDeployed,
  repairTyped,
  resetHangar,
  simulateReturn,
  yieldBagFromTypedRepairCost,
} from "./hangar";

/** Minimal in-memory Storage for HubSave. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  } as Storage;
}

const storage = memoryStorage();
(globalThis as unknown as { localStorage: Storage }).localStorage = storage;

let state = resetHangar(storage);
state = grantStarterFleet(state);
assert.ok(state.hub.fleet.length >= 2);
assert.ok(state.hub.fleet.every((m) => m.status === "operational"));

const deployUrl = buildDeployUrl(state);
assert.ok(deployUrl);
assert.ok(deployUrl!.includes("deployedInstanceIds="));
assert.ok(deployUrl!.includes("mechDurability="));

const ids = state.selectedDeployIds;
assert.ok(ids.length > 0);
state = markDeployed(state, ids);

// Simulated return applies flat wear and persists
const before = state.hub.fleet.map((m) => m.durability);
state = simulateReturn(state, "extract");
for (let i = 0; i < state.hub.fleet.length; i++) {
  const m = state.hub.fleet[i]!;
  if (ids.includes(m.instanceId)) {
    assert.equal(m.durability, before[i]! - MECH_FLEET_RULES.wearOnExtract);
  }
}

// Reload from storage — wear persisted
const reloaded = createInitialHangar(storage);
assert.equal(
  reloaded.hub.fleet.find((m) => m.instanceId === ids[0])!.durability,
  state.hub.fleet.find((m) => m.instanceId === ids[0])!.durability,
);

// URL wear handoff: apply fail wear to first mech via query
const target = reloaded.hub.fleet.find((m) => m.status === "operational")!;
assert.ok(target);
const afterFail = Math.max(0, target.durability - MECH_FLEET_RULES.wearOnFail);
const wearUrl = buildExploreToHubWearUrl(
  toExploreToHubWearPayload("fail", [
    { instanceId: target.instanceId, durabilityAfter: afterFail },
  ]),
);
const wearSearch = new URL(wearUrl).search;
const ingested = ingestLocationSearch(reloaded, wearSearch);
assert.equal(ingested.consumed, true);
const worn = ingested.state.hub.fleet.find((m) => m.instanceId === target.instanceId)!;
assert.equal(worn.durability, afterFail);
assert.ok(
  worn.status === "needs_repair" ||
    worn.status === "destroyed" ||
    worn.status === "operational",
);
assert.ok(ingested.state.log.some((l) => l.includes("帰還ウェア")));


// Playtest seed: mixed fleet + wallet + YieldBag + ammo, persists via HubSave
{
  const seedHub = buildPlaytestSeedHub();
  assert.equal(seedHub.fleet.length, 3);
  const statuses = seedHub.fleet.map((m) => m.status).sort();
  assert.deepEqual(statuses, ["needs_repair", "operational", "operational"]);
  assert.ok(seedHub.credits >= 50);
  assert.ok((seedHub.inventory.mat_scrap ?? 0) >= 20);
  assert.ok((seedHub.inventory.part_actuator ?? 0) >= 1);
  assert.ok(
    seedHub.ammoLoad.ammo_standard +
      seedHub.ammoLoad.ammo_ap +
      seedHub.ammoLoad.ammo_hp >
      0,
  );

  let seeded = resetHangar(storage);
  seeded = loadPlaytestSeed(seeded, storage);
  assert.equal(seeded.hub.fleet.length, 3);
  assert.ok(seeded.selectedDeployIds.length === 2);
  assert.ok(seeded.log.some((l) => l.includes("シード読込")));

  const afterSeed = createInitialHangar(storage);
  assert.equal(afterSeed.hub.fleet.length, 3);
  assert.equal(
    afterSeed.hub.fleet.find((m) => m.instanceId === "seed_repair_gen1")!.status,
    "needs_repair",
  );
  assert.equal(afterSeed.hub.credits, seedHub.credits);
  assert.equal(
    afterSeed.hub.inventory.mat_scrap ?? 0,
    seedHub.inventory.mat_scrap ?? 0,
  );
}


// Seed → typed repair → operational → deployable again
{
  const seedStorage = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = seedStorage;

  let seeded = resetHangar(seedStorage);
  seeded = loadPlaytestSeed(seeded, seedStorage);

  const costBag = yieldBagFromTypedRepairCost(EXAMPLE_TYPED_REPAIR_COST);
  assert.equal(
    canAffordYieldCost(seeded.hub.inventory, costBag),
    true,
    "seed YieldBag must cover EXAMPLE_TYPED_REPAIR_COST",
  );
  assert.ok(
    seeded.hub.credits >= EXAMPLE_TYPED_REPAIR_COST.credits,
    "seed credits must cover typed repair",
  );
  assert.equal(describeTypedRepairShortfall(seeded.hub.credits, seeded.hub.inventory), null);

  const derived = buildSeedYieldBagForTypedRepair(3);
  assert.ok((derived.mat_scrap ?? 0) >= (costBag.mat_scrap ?? 0) * 3);
  assert.ok((derived.part_actuator ?? 0) >= (costBag.part_actuator ?? 0) * 3);

  const damaged = seeded.hub.fleet.find((m) => m.instanceId === "seed_repair_gen1")!;
  assert.equal(damaged.status, "needs_repair");
  assert.ok(!seeded.selectedDeployIds.includes("seed_repair_gen1"));

  const creditsBefore = seeded.hub.credits;
  const scrapBefore = seeded.hub.inventory.mat_scrap ?? 0;
  const actuatorBefore = seeded.hub.inventory.part_actuator ?? 0;

  seeded = repairTyped(seeded, "seed_repair_gen1");

  const fixed = seeded.hub.fleet.find((m) => m.instanceId === "seed_repair_gen1")!;
  assert.equal(fixed.status, "operational");
  assert.equal(fixed.durability, fixed.durabilityMax);
  assert.ok(
    seeded.selectedDeployIds.includes("seed_repair_gen1"),
    "repaired mech must enter deploy selection",
  );
  assert.equal(seeded.hub.credits, creditsBefore - EXAMPLE_TYPED_REPAIR_COST.credits);
  assert.equal(
    seeded.hub.inventory.mat_scrap ?? 0,
    scrapBefore - (costBag.mat_scrap ?? 0),
  );
  assert.equal(
    seeded.hub.inventory.part_actuator ?? 0,
    actuatorBefore - (costBag.part_actuator ?? 0),
  );
  assert.ok(seeded.notice.includes("健在"));
  assert.ok(seeded.log.some((l) => l.includes("修理(型付き)")));

  const deployUrl = buildDeployUrl(seeded);
  assert.ok(deployUrl);
  assert.ok(
    deployUrl!.includes("seed_repair_gen1"),
    "deploy URL must include repaired instance",
  );

  // Shortfall path: empty inventory → failure notice, status unchanged
  let broke = {
    ...seeded,
    hub: {
      ...seeded.hub,
      inventory: {},
      credits: 0,
      fleet: seeded.hub.fleet.map((m) =>
        m.instanceId === "seed_op_gen2"
          ? { ...m, durability: 20, status: "needs_repair" as const }
          : m,
      ),
    },
    selectedDeployIds: seeded.selectedDeployIds.filter((id) => id !== "seed_op_gen2"),
  };
  // Re-normalize status via durability by using create path: durability 20 → needs_repair
  // (status field above is explicit for the test stub)
  const beforeFailStatus = broke.hub.fleet.find((m) => m.instanceId === "seed_op_gen2")!.status;
  assert.equal(beforeFailStatus, "needs_repair");
  broke = repairTyped(broke, "seed_op_gen2");
  assert.ok(/不足/.test(broke.notice), `expected shortfall notice, got: ${broke.notice}`);
  assert.equal(
    broke.hub.fleet.find((m) => m.instanceId === "seed_op_gen2")!.status,
    "needs_repair",
  );
}

console.log("trade hangar selftest: ok");
