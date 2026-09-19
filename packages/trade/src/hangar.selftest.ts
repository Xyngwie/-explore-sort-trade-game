import assert from "node:assert/strict";
import {
  HUB_SAVE_STORAGE_KEY,
  MECH_FLEET_RULES,
  buildExploreToHubWearUrl,
  buildInvadeToTradeUrl,
  buildRestoreToTradeUrl,
  createEmptyCircuitBoard,
  parseHubSave,
  toExploreToHubWearPayload,
} from "@estg/shared";
import {
  EXAMPLE_TYPED_REPAIR_COST,
  HUB_M45_STASH_STORAGE_KEY,
  SEED_CIRCUIT_ID,
  buildDeployUrl,
  buildInvadeUrl,
  buildPlaytestSeedHub,
  buildRestoreUrl,
  buildSeedCircuitBoard,
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
  selectCircuit,
  simulateReturn,
  yieldBagFromTypedRepairCost,
  hubCircuitBonuses,
  repairClassic,
  sellRareItem,
  isRareYieldItemId,
  RARE_SELL_PRICE_CREDITS,
  grantDemoInventory,
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


// M4/M5 handoff: trade→invade / trade→restore + HubSave.circuits persist
{
  const m45Storage = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = m45Storage;

  let hs = resetHangar(m45Storage);
  hs = loadPlaytestSeed(hs, m45Storage);
  assert.ok(hs.lastCircuit, "seed should set demo circuit");
  assert.equal(hs.lastCircuit!.circuitId, SEED_CIRCUIT_ID);
  assert.equal(hs.lastCircuit!.outcome, "offline");
  assert.equal(hs.hub.circuits.length, 1, "seed must write HubSave.circuits");
  assert.equal(hs.hub.circuits[0]!.circuitId, SEED_CIRCUIT_ID);

  const rawSave = m45Storage.getItem(HUB_SAVE_STORAGE_KEY);
  assert.ok(rawSave);
  const parsedSave = parseHubSave(JSON.parse(rawSave!));
  assert.equal(parsedSave?.hub.circuits.length, 1);

  const invadeUrl = buildInvadeUrl(hs);
  assert.ok(invadeUrl.includes("fromHub=1"));
  assert.ok(invadeUrl.includes("deployableMechs="));
  assert.ok(invadeUrl.includes("startingAmmo="));

  const restoreUrl = buildRestoreUrl(hs);
  assert.ok(restoreUrl.includes("circuitId="));
  assert.ok(restoreUrl.includes("circuitBoard="));
  assert.equal(
    restoreUrl.includes("circuitOutcome="),
    false,
    "trade→restore must not forward prior outcome",
  );

  const itt = buildInvadeToTradeUrl({
    sectorX: 3,
    sectorY: -2,
    density: 0.3,
    intelFlags: ["routeHint"],
  });
  const creditsBefore = hs.hub.credits;
  const invaded = ingestLocationSearch(hs, new URL(itt).search);
  assert.equal(invaded.consumed, true);
  assert.equal(invaded.state.lastInvadeSector?.sectorX, 3);
  assert.equal(invaded.state.lastInvadeSector?.sectorY, -2);
  assert.equal(invaded.state.lastInvadeSector?.density, 0.3);
  assert.deepEqual(invaded.state.lastInvadeSector?.intelFlags, ["routeHint"]);
  assert.equal(invaded.state.hub.credits, creditsBefore, "invade must not pay salvage");
  assert.ok(invaded.state.log.some((l) => l.includes("invade セクター")));
  assert.ok(m45Storage.getItem(HUB_M45_STASH_STORAGE_KEY));

  const board = createEmptyCircuitBoard(8, 8, "stub-8");
  const rtt = buildRestoreToTradeUrl({
    circuitId: "board_demo",
    circuitBoard: board,
    outcome: "bypass",
  });
  const restored = ingestLocationSearch(invaded.state, new URL(rtt).search);
  assert.equal(restored.consumed, true);
  assert.equal(restored.state.lastCircuit?.outcome, "bypass");
  assert.equal(restored.state.lastCircuit?.circuitId, "board_demo");
  assert.ok(restored.state.log.some((l) => l.includes("restore 回路")));
  assert.equal(restored.state.hub.circuits[0]!.outcome, "bypass");
  assert.equal(restored.state.hub.circuits[0]!.circuitId, "board_demo");

  const rtt2 = buildRestoreToTradeUrl({
    circuitId: "board_extra",
    circuitBoard: createEmptyCircuitBoard(4, 4, "extra"),
    outcome: "fully_awakened",
  });
  const restored2 = ingestLocationSearch(restored.state, new URL(rtt2).search);
  assert.equal(restored2.state.hub.circuits.length, 2);
  assert.equal(restored2.state.hub.circuits[0]!.circuitId, "board_extra");

  const selected = selectCircuit(restored2.state, "board_demo");
  assert.equal(selected.lastCircuit?.circuitId, "board_demo");
  const restoreSelected = buildRestoreUrl(selected, "board_demo");
  assert.ok(restoreSelected.includes("circuitId=board_demo"));
  assert.ok(restoreSelected.includes("circuitBoard="));

  const reloaded = createInitialHangar(m45Storage);
  assert.equal(reloaded.lastInvadeSector?.sectorX, 3);
  assert.equal(reloaded.hub.circuits.length, 2);
  assert.equal(reloaded.lastCircuit?.outcome, "fully_awakened");
  assert.equal(
    reloaded.hub.circuits.find((c) => c.circuitId === "board_demo")?.outcome,
    "bypass",
  );

  // Legacy stash → HubSave migration when hub has no circuits
  {
    const mig = memoryStorage();
    (globalThis as unknown as { localStorage: Storage }).localStorage = mig;
    mig.setItem(
      HUB_M45_STASH_STORAGE_KEY,
      JSON.stringify({
        lastInvadeSector: null,
        lastCircuit: {
          circuitId: "legacy_board",
          circuitBoard: createEmptyCircuitBoard(8, 8, "legacy"),
          outcome: "offline",
        },
        updatedAt: "2026-09-01T00:00:00.000Z",
      }),
    );
    const migrated = createInitialHangar(mig);
    assert.equal(migrated.hub.circuits.length, 1);
    assert.equal(migrated.hub.circuits[0]!.circuitId, "legacy_board");
    const hubRaw = mig.getItem(HUB_SAVE_STORAGE_KEY);
    assert.ok(hubRaw);
    assert.equal(
      parseHubSave(JSON.parse(hubRaw!))?.hub.circuits[0]?.circuitId,
      "legacy_board",
    );
  }

  const empty = resetHangar(m45Storage);
  assert.equal(empty.lastCircuit, null);
  assert.equal(empty.hub.circuits.length, 0);
  const emptyRestore = buildRestoreUrl(empty);
  assert.ok(emptyRestore.includes("circuitBoard="));
  assert.equal(buildSeedCircuitBoard().puzzleId, "stub-8");
}


// Circuit outcome bonuses on deploy URL + repair discount
{
  const store = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  let hs = loadPlaytestSeed(resetHangar(store));
  const board = createEmptyCircuitBoard(8, 8, "bonus-test");
  hs = ingestLocationSearch(
    hs,
    new URL(
      buildRestoreToTradeUrl({
        circuitId: "bonus_awake",
        circuitBoard: { ...board, outcome: "fully_awakened" },
        outcome: "fully_awakened",
      }),
    ).search,
  ).state;
  const bonuses = hubCircuitBonuses(hs.hub);
  assert.equal(bonuses.durabilityBuffer, 10);
  assert.ok(Math.abs(bonuses.repairDiscount - 0.2) < 1e-9);

  const deploy = buildDeployUrl(hs);
  assert.ok(deploy);
  assert.ok(
    deploy!.includes("circuitBonuses=") &&
      (deploy!.includes("dur%3A10") || deploy!.includes("dur:10")),
  );

  const repairTarget = hs.hub.fleet.find((m) => m.status === "needs_repair");
  assert.ok(repairTarget);
  const creditsBefore = hs.hub.credits;
  const materialsBefore = hs.hub.materials;
  hs = repairClassic(hs, repairTarget!.instanceId);
  assert.equal(
    hs.hub.fleet.find((m) => m.instanceId === repairTarget!.instanceId)?.status,
    "operational",
  );
  const spentC = creditsBefore - hs.hub.credits;
  const spentM = materialsBefore - hs.hub.materials;
  assert.equal(spentC, Math.ceil(MECH_FLEET_RULES.repairCredits * 0.8));
  assert.equal(spentM, Math.ceil(MECH_FLEET_RULES.repairMaterials * 0.8));
}


// --- rare sell (YieldBag → credits, HubSave persist) ---
{
  // Earlier blocks swap globalThis.localStorage; restore so persistHangar hits this store.
  (globalThis as unknown as { localStorage: Storage }).localStorage = storage;
  let s = resetHangar(storage);
  s = grantDemoInventory(s);
  assert.ok(isRareYieldItemId("part_actuator"));
  assert.ok(isRareYieldItemId("mat_circuit"));
  assert.equal(isRareYieldItemId("mat_scrap"), false);
  const beforeC = s.hub.credits;
  const beforeAct = s.hub.inventory.part_actuator ?? 0;
  assert.ok(beforeAct >= 1);
  const unit = RARE_SELL_PRICE_CREDITS.part_actuator;
  s = sellRareItem(s, "part_actuator", 1);
  assert.equal(s.hub.credits, beforeC + unit);
  assert.equal(s.hub.inventory.part_actuator ?? 0, beforeAct - 1);
  const re = createInitialHangar(storage);
  assert.equal(re.hub.credits, s.hub.credits);
  assert.equal(re.hub.inventory.part_actuator ?? 0, s.hub.inventory.part_actuator ?? 0);
  const blocked = sellRareItem(s, "mat_scrap", 1);
  assert.match(blocked.notice, /レア対象外/);
}

console.log("trade hangar selftest: ok");
