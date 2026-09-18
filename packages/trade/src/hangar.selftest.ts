import assert from "node:assert/strict";
import {
  MECH_FLEET_RULES,
  buildExploreToHubWearUrl,
  toExploreToHubWearPayload,
} from "@estg/shared";
import {
  buildDeployUrl,
  buildPlaytestSeedHub,
  createInitialHangar,
  grantStarterFleet,
  ingestLocationSearch,
  loadPlaytestSeed,
  markDeployed,
  resetHangar,
  simulateReturn,
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

console.log("trade hangar selftest: ok");
