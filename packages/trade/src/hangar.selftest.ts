import assert from "node:assert/strict";
import {
  buildResourceHistoryHtml,
  parseResourceHistoryLine,
  resourceHistoryFromLog,
} from "./resourceHistory";
import {
  HUB_SAVE_STORAGE_KEY,
  applySortieReport,
  applyExploreReturnToHub,
  MECH_FLEET_RULES,
  buildExploreToHubWearUrl,
  buildInvadeToTradeUrl,
  parseTradeToExploreSearch,
  buildRestoreToTradeUrl,
  createEmptyCircuitBoard,
  parseHubSave,
  parseExploreToHubWearSearch,
  deserializeHubSave,
  normalizeHubSnapshot,
  toExploreToHubWearPayload,
  computeCircuitEffectForBoard,
  buildSizedTruePuzzleId,
  resolveSizedTruePuzzle,
  encodeEdgeState,
  upsertCircuitIntoHub,
  addMechToHub,
  saveHubSaveToLocalStorage,
  HUB_LIMITS,
  type CircuitOutcome,
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
  RARE_SELL_PRICE_TABLE,
  RARE_YIELD_ITEM_IDS,
  rareSellPriceCredits,
  setDeploySelection,
  persistHangar,
  selectAllDeployable,
  grantDemoInventory,
  setCraftSignature,
  loadCraftSignature,
  isCraftSignatureLocked,
  isCircuitLocked,
  DEFAULT_CRAFT_SIGNATURE,
  CRAFT_SIGNATURE_STORAGE_KEY,
  grantVerifyTrueCircuit,
  grantVerifyPerfectLockedCircuit,
  VERIFY_TRUE_CIRCUIT_ID,
  VERIFY_PERFECT_CIRCUIT_ID,
  VERIFY_TRUE_PUZZLE_ID,
  resolveHangarPerfectInjectRate,
  PERFECT_CIRCUIT_DEV_RATE,
  PERFECT_CIRCUIT_PROD_RATE,
  buildNextSortieReadiness,
  buildNextSortieReturnDigest,
  formatIntelFlagJa,
  formatInvadeIntelBrief,
  formatCircuitHubBrief,
  formatCircuitEffectBreakdownJa,
  groupCircuitEffectContributions,
  sellCircuit,
  circuitSellPriceCredits,
  CIRCUIT_SELL_BASE_CREDITS,
  CIRCUIT_SELL_CREDITS_PER_EFFECT,
  buyUnopenedContainers,
  launchSortFromUnopened,
  buildSortFromUnopenedUrl,
  UNOPENED_CONTAINER_PRICE_CREDITS,
  circuitSellPerfectSide,
  perfectCircuitSellBonusCredits,
  formatCircuitSellPriceJa,
  resolveActiveCircuit,
} from "./hangar";
import { PIECES_PER_CONTAINER, circuitCraftCreditCost } from "@estg/shared";

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
assert.equal(
  new URL(deployUrl!).searchParams.has("mechCircuits"),
  false,
  "circuit-less fleet must preserve the legacy handoff shape",
);

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

// Trade → Explore mechCircuits handoff: instanceId is the map key and the
// existing restoreState/effect/effectKey fields are forwarded unchanged.
{
  const handoffSeed = loadPlaytestSeed(resetHangar());
  const equipped = handoffSeed.hub.circuits[0];
  assert.ok(equipped, "seed must provide a circuit record for handoff coverage");
  const equippedId = handoffSeed.selectedDeployIds[0]!;
  const handoffState = {
    ...handoffSeed,
    hub: {
      ...handoffSeed.hub,
      circuits: handoffSeed.hub.circuits.map((c) =>
        c.circuitId === equipped!.circuitId ? { ...c, equippedTo: equippedId } : c,
      ),
    },
    selectedDeployIds: [equippedId],
  };
  const handoffUrl = buildDeployUrl(handoffState);
  assert.ok(handoffUrl);
  const handoff = parseTradeToExploreSearch(new URL(handoffUrl!).search);
  assert.ok(handoff?.mechCircuits);
  assert.deepEqual(Object.keys(handoff!.mechCircuits!), [equippedId]);
  assert.deepEqual(handoff!.deployedInstanceIds, [equippedId]);
  const entry = handoff!.mechCircuits![equippedId]![0]!;
  assert.equal(entry.circuitId, equipped!.circuitId);
  assert.equal(entry.restoreState, equipped!.restoreState);
  assert.equal(
    entry.effect,
    computeCircuitEffectForBoard(equipped!.circuitBoard, {
      perfect: equipped!.circuitBoard.perfect ?? equipped!.locked,
    }).effect,
  );
  assert.equal(entry.effectKey, equipped!.effectKey);
}


// Playtest seed: mixed fleet + wallet + YieldBag + ammo, persists via HubSave
{
  const seedHub = buildPlaytestSeedHub();
  assert.equal(seedHub.fleet.length, 3);
  const statuses = seedHub.fleet.map((m) => m.status).sort();
  assert.deepEqual(statuses, ["needs_repair", "operational", "operational"]);
  assert.ok(seedHub.credits >= 50);
  // Four-resource model (#115/#119): typed repair cost collapses to armor;
  // legacy ids (mat_* / part_*) are compatibility-only and never stored.
  assert.ok((seedHub.inventory.armor ?? 0) >= 1);
  assert.ok(
    Object.keys(seedHub.inventory).every((k) => ["ammo", "armor", "power", "junk"].includes(k)),
    "seed inventory holds only the four resources",
  );
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
  assert.deepEqual(afterSeed.hub.inventory, seedHub.inventory);
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
  assert.ok((costBag.armor ?? 0) >= 1, "typed repair cost maps to armor");
  assert.ok((derived.armor ?? 0) >= (costBag.armor ?? 0) * 3);

  const damaged = seeded.hub.fleet.find((m) => m.instanceId === "seed_repair_gen1")!;
  assert.equal(damaged.status, "needs_repair");
  assert.ok(!seeded.selectedDeployIds.includes("seed_repair_gen1"));

  const creditsBefore = seeded.hub.credits;
  const armorBefore = seeded.hub.inventory.armor ?? 0;

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
    seeded.hub.inventory.armor ?? 0,
    armorBefore - (costBag.armor ?? 0),
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


// --- rare sell (explicit 仮 price table → credits, HubSave persist) ---
{
  // Earlier blocks swap globalThis.localStorage; restore so persistHangar hits this store.
  (globalThis as unknown as { localStorage: Storage }).localStorage = storage;

  // Table is the single source of truth (TBD placeholders).
  assert.ok(RARE_SELL_PRICE_TABLE.length >= 1);
  assert.equal(RARE_SELL_PRICE_TABLE.length, RARE_YIELD_ITEM_IDS.length);
  for (const row of RARE_SELL_PRICE_TABLE) {
    assert.equal(row.balance, "TBD", `${row.id} must stay TBD until economy pass`);
    assert.ok(row.credits > 0, `${row.id} placeholder credits`);
    assert.equal(RARE_SELL_PRICE_CREDITS[row.id], row.credits);
    assert.equal(rareSellPriceCredits(row.id), row.credits);
    assert.ok(isRareYieldItemId(row.id));
  }
  const matRow = RARE_SELL_PRICE_TABLE.find((r) => r.id === "mat_circuit");
  const partRows = RARE_SELL_PRICE_TABLE.filter((r) => r.kind === "part");
  assert.ok(matRow);
  assert.ok(partRows.length >= 1);
  for (const p of partRows) {
    assert.ok(p.credits > matRow!.credits, "parts 仮価格 > basic rare mat");
  }

  let s = resetHangar(storage);
  s = grantDemoInventory(s);
  assert.ok(isRareYieldItemId("part_actuator"));
  assert.ok(isRareYieldItemId("mat_circuit"));
  assert.equal(isRareYieldItemId("mat_scrap"), false);
  assert.equal(rareSellPriceCredits("mat_scrap"), null);
  // Four-resource model (#115/#119): legacy rare ids are compatibility-only and
  // are never stored in HubSave inventory, so the demo bag keeps none of them and
  // a legacy rare sell cannot succeed (no credits minted from nothing).
  assert.ok(
    Object.keys(s.hub.inventory).every((k) => ["ammo", "armor", "power", "junk"].includes(k)),
    "demo inventory holds only the four resources",
  );
  const beforeC = s.hub.credits;
  assert.equal(s.hub.inventory.part_actuator ?? 0, 0);
  s = sellRareItem(s, "part_actuator", 1);
  assert.equal(s.hub.credits, beforeC, "no credits without stock");
  assert.match(s.notice, /不足/);
  const re = createInitialHangar(storage);
  assert.equal(re.hub.credits, s.hub.credits);
  const blocked = sellRareItem(s, "mat_scrap", 1);
  assert.match(blocked.notice, /レア対象外/);
}



// --- craft signature + Perfect Circuit lock ---
{
  const store = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  let hs = resetHangar(store);
  assert.equal(hs.craftSignature, DEFAULT_CRAFT_SIGNATURE);
  assert.equal(isCraftSignatureLocked(store), false);
  hs = setCraftSignature(hs, "  回路職人  ", store);
  assert.equal(hs.craftSignature, "回路職人");
  assert.equal(loadCraftSignature(store), "回路職人");
  assert.equal(isCraftSignatureLocked(store), true);
  const again = setCraftSignature(hs, "別の名前", store);
  assert.equal(again.craftSignature, "回路職人");
  assert.match(again.notice, /確定済み/);

  const board = createEmptyCircuitBoard(8, 8, "stub-8");
  const rtt = buildRestoreToTradeUrl({
    circuitId: "board_perfect",
    circuitBoard: { ...board, perfect: true },
    outcome: "fully_awakened",
    lastEditorName: "回路職人",
    locked: true,
    perfect: true,
  });
  const ingested = ingestLocationSearch(hs, new URL(rtt).search);
  assert.equal(ingested.consumed, true);
  const rec = ingested.state.hub.circuits.find((c) => c.circuitId === "board_perfect");
  assert.ok(rec);
  assert.equal(rec!.locked, true);
  assert.equal(rec!.lastEditorName, "回路職人");
  assert.equal(isCircuitLocked(rec!), true);

  const restoreUrl = buildRestoreUrl(ingested.state, "board_perfect");
  assert.ok(restoreUrl.includes("editorName="));
  assert.ok(
    restoreUrl.includes("circuitLocked=1") || restoreUrl.includes("circuitLocked=true"),
  );

  // Locked refuse: try overwrite via restore handoff
  const tamper = buildRestoreToTradeUrl({
    circuitId: "board_perfect",
    circuitBoard: createEmptyCircuitBoard(4, 4, "hack"),
    outcome: "offline",
    lastEditorName: "侵入者",
  });
  const blocked = ingestLocationSearch(ingested.state, new URL(tamper).search);
  const still = blocked.state.hub.circuits.find((c) => c.circuitId === "board_perfect");
  assert.equal(still!.outcome, "fully_awakened");
  assert.equal(still!.lastEditorName, "回路職人");

  // Non-perfect refreshes 刻印
  const soft = buildRestoreToTradeUrl({
    circuitId: "board_soft",
    circuitBoard: createEmptyCircuitBoard(4, 4, "soft"),
    outcome: "bypass",
    lastEditorName: "回路職人",
  });
  let softState = ingestLocationSearch(blocked.state, new URL(soft).search).state;
  softState = setCraftSignature(
    { ...softState, craftSignature: "回路職人" },
    "ignored",
    store,
  );
  const soft2 = buildRestoreToTradeUrl({
    circuitId: "board_soft",
    circuitBoard: createEmptyCircuitBoard(4, 4, "soft2"),
    outcome: "bypass",
    lastEditorName: "回路職人",
  });
  softState = ingestLocationSearch(softState, new URL(soft2).search).state;
  assert.equal(
    softState.hub.circuits.find((c) => c.circuitId === "board_soft")?.lastEditorName,
    "回路職人",
  );
  assert.equal(store.getItem(CRAFT_SIGNATURE_STORAGE_KEY), "回路職人");
}


// --- verify-true / verify-perfect hangar grants ---
{
  const store = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  let hs = resetHangar(store);
  hs = setCraftSignature(hs, "検証プレイヤ", store);
  hs = grantVerifyTrueCircuit(hs);
  const trueRec = hs.hub.circuits.find((c) => c.circuitId === VERIFY_TRUE_CIRCUIT_ID);
  assert.ok(trueRec);
  assert.equal(trueRec!.circuitBoard.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.equal(trueRec!.outcome, "offline");
  assert.equal(isCircuitLocked(trueRec!), false);
  assert.equal(trueRec!.circuitBoard.cols, 2);
  assert.equal(hs.lastCircuit?.circuitId, VERIFY_TRUE_CIRCUIT_ID);

  hs = grantVerifyPerfectLockedCircuit(hs, store);
  const perf = hs.hub.circuits.find((c) => c.circuitId === VERIFY_PERFECT_CIRCUIT_ID);
  assert.ok(perf);
  assert.equal(perf!.locked, true);
  assert.equal(perf!.outcome, "fully_awakened");
  assert.equal(perf!.lastEditorName, "検証プレイヤ");
  assert.equal(isCircuitLocked(perf!), true);

  const restoreLocked = buildRestoreUrl(hs, VERIFY_PERFECT_CIRCUIT_ID);
  assert.ok(
    restoreLocked.includes("circuitLocked=1") ||
      restoreLocked.includes("circuitLocked=true"),
  );
  const restoreTrue = buildRestoreUrl(hs, VERIFY_TRUE_CIRCUIT_ID);
  assert.ok(restoreTrue.includes("circuitId=verify_true"));
  assert.ok(restoreTrue.includes("circuitBoard="));

  const reloaded = createInitialHangar(store);
  assert.ok(reloaded.hub.circuits.some((c) => c.circuitId === VERIFY_TRUE_CIRCUIT_ID));
  assert.ok(
    reloaded.hub.circuits.some(
      (c) => c.circuitId === VERIFY_PERFECT_CIRCUIT_ID && c.locked === true,
    ),
  );
}


// --- Perfect Circuit inject rates on hangar seed ---
{
  assert.equal(PERFECT_CIRCUIT_PROD_RATE, 0.01);
  assert.equal(PERFECT_CIRCUIT_DEV_RATE, 0.33);
  assert.equal(
    resolveHangarPerfectInjectRate({ isDev: true }),
    PERFECT_CIRCUIT_DEV_RATE,
  );
  assert.equal(
    resolveHangarPerfectInjectRate({ hostname: "example.com" }),
    PERFECT_CIRCUIT_PROD_RATE,
  );
  assert.equal(
    resolveHangarPerfectInjectRate({ search: "?perfectRate=0.33" }),
    0.33,
  );

  const flawed = buildSeedCircuitBoard({ injectRate: 0, rng: () => 0 });
  assert.equal(flawed.puzzleId, "stub-8");
  assert.equal(flawed.cols, 8);

  const injected = buildSeedCircuitBoard({ injectRate: 1, rng: () => 0.99 });
  assert.equal(injected.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.equal(injected.cols, 2);

  const store = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  let hs = resetHangar(store);
  hs = loadPlaytestSeed(hs, { storage: store, injectRate: 1, rng: () => 0 });
  assert.equal(hs.lastCircuit?.circuitBoard.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.ok(hs.notice.includes("真盤") || hs.log.some((l) => l.includes("真盤")));
  hs = loadPlaytestSeed(hs, {
    storage: store,
    injectRate: 1,
    rng: () => 0,
    showInjectionDetails: false,
  });
  assert.equal(hs.lastCircuit?.circuitBoard.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.equal(hs.notice.includes("真盤"), false);
  assert.equal(hs.log.at(-1)?.includes("真盤") ?? false, false);

  hs = loadPlaytestSeed(hs, { storage: store, injectRate: 0, rng: () => 0 });
  assert.equal(hs.lastCircuit?.circuitBoard.puzzleId, "stub-8");
}


// Next-sortie readiness helpers (pure)
{
  const store = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  let hs = resetHangar(store);
  const empty = buildNextSortieReadiness(hs);
  assert.equal(empty.total, 0);
  assert.equal(empty.canDeployExplore, false);
  assert.equal(empty.readinessLabelJa, "艦隊なし");
  assert.equal(formatInvadeIntelBrief(null), "戦線インテル未取込");
  assert.equal(formatIntelFlagJa("routeHint"), "ルート示唆");
  assert.equal(formatIntelFlagJa("customFlag"), "customFlag");
  assert.equal(
    formatCircuitHubBrief([]).summaryJa,
    "回路なし（restore 取込待ち）",
  );

  hs = loadPlaytestSeed(hs, { storage: store, injectRate: 0, rng: () => 0 });
  const ready = buildNextSortieReadiness(hs);
  assert.equal(ready.operational, 2);
  assert.equal(ready.needsRepair, 1);
  assert.equal(ready.destroyed, 0);
  assert.equal(ready.total, 3);
  assert.equal(ready.deployableIds.length, 2);
  assert.equal(ready.selectedIds.length, 2);
  assert.equal(ready.canDeployExplore, true);
  assert.ok(ready.readinessLabelJa.includes("出撃可 2"));
  assert.ok(ready.readinessLabelJa.includes("要修理 1"));
  assert.equal(ready.repairTargets.length, 1);
  assert.equal(ready.repairTargets[0]!.instanceId, "seed_repair_gen1");

  const invaded = ingestLocationSearch(
    hs,
    "?sectorX=3&sectorY=-2&density=0.3&intelFlags=routeHint,rareSignal",
  );
  assert.equal(invaded.consumed, true);
  const intel = formatInvadeIntelBrief(invaded.state.lastInvadeSector);
  assert.ok(intel.includes("(3,-2)"));
  assert.ok(intel.includes("0.30"));
  assert.ok(intel.includes("ルート示唆"));
  assert.ok(intel.includes("希少信号"));

  const brief = formatCircuitHubBrief(
    invaded.state.hub.circuits,
    invaded.state.lastCircuit,
  );
  assert.ok(brief.lines.length >= 1);
  assert.ok(brief.summaryJa.includes("回路"));
  assert.ok(brief.summaryJa.includes("オフライン") || brief.summaryJa.includes("バイパス") || brief.summaryJa.includes("完全覚醒"));
  const active = brief.lines.find((l) => l.active) ?? brief.lines[0]!;
  assert.equal(typeof active.outcomeJa, "string");
  assert.ok(active.outcomeJa.length > 0);

  const digest = buildNextSortieReturnDigest(invaded.state);
  assert.ok(digest.invadeJa.includes("(3,-2)"));
  assert.ok(digest.restoreJa.includes("回路"));
  assert.ok(typeof brief.lines[0]!.effect === "number");
  assert.ok(brief.summaryJa.includes("効果"));
}


// Circuit sell: price = 25 + floor(effect)×3; inventory removal + credit
{
  assert.equal(CIRCUIT_SELL_BASE_CREDITS, 25);
  assert.equal(CIRCUIT_SELL_CREDITS_PER_EFFECT, 3);
  assert.equal(circuitSellPriceCredits(0), 25);
  assert.equal(circuitSellPriceCredits(1), 28);
  assert.equal(circuitSellPriceCredits(8), 49);
  assert.equal(circuitSellPriceCredits(8.9), 49);
  assert.equal(circuitSellPriceCredits(-2), 25);

  const store = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  let hs = resetHangar(store);
  hs = grantVerifyPerfectLockedCircuit(hs, store);
  const perf = hs.hub.circuits.find((c) => c.circuitId === VERIFY_PERFECT_CIRCUIT_ID);
  assert.ok(perf);
  const br = computeCircuitEffectForBoard(perf!.circuitBoard, {
    perfect: perf!.circuitBoard.perfect ?? perf!.locked,
  });
  assert.equal(br.effect, 8);
  assert.equal(circuitSellPriceCredits(br.effect), 49); // 25 + 8*3 (no bonus)
  // Perfect (Fully Awakened) 2×2 → + 完璧ボーナス 2×round(4×1.5^2) = 18 → 67c.
  assert.equal(circuitSellPerfectSide(perf!), 2);
  const price = circuitSellPriceCredits(br.effect, { perfectSide: 2 });
  assert.equal(price, 67); // 25 + 8*3 + 18

  const creditsBefore = hs.hub.credits;
  const countBefore = hs.hub.circuits.length;
  hs = sellCircuit(hs, VERIFY_PERFECT_CIRCUIT_ID);
  assert.equal(
    hs.hub.circuits.some((c) => c.circuitId === VERIFY_PERFECT_CIRCUIT_ID),
    false,
  );
  assert.equal(hs.hub.circuits.length, countBefore - 1);
  assert.equal(hs.hub.credits, creditsBefore + price);
  assert.ok(hs.notice.includes("+67c"));
  assert.ok(hs.notice.includes("最低") && hs.notice.includes("出来栄え"));
  assert.ok(hs.notice.includes("完璧ボーナス 18c"));
  assert.ok(hs.log.some((l) => l.includes("回路売却") && l.includes("+67c")));

  // Persist: HubSave no longer lists the sold circuit
  const raw = store.getItem(HUB_SAVE_STORAGE_KEY);
  assert.ok(raw);
  const saved = deserializeHubSave(raw!);
  assert.ok(saved);
  assert.equal(
    saved!.hub.circuits.some((c) => c.circuitId === VERIFY_PERFECT_CIRCUIT_ID),
    false,
  );
  assert.equal(saved!.hub.credits, creditsBefore + price);

  // Effect 0: allow sell at +25c (最低額; clears inventory)
  hs = loadPlaytestSeed(hs, { storage: store, injectRate: 0, rng: () => 0 });
  const seedRec = hs.hub.circuits.find((c) => c.circuitId === SEED_CIRCUIT_ID);
  assert.ok(seedRec);
  const seedEffect = computeCircuitEffectForBoard(seedRec!.circuitBoard).effect;
  assert.equal(seedEffect, 0);
  assert.equal(circuitSellPriceCredits(seedEffect), 25);
  const c0 = hs.hub.credits;
  hs = sellCircuit(hs, SEED_CIRCUIT_ID);
  assert.equal(hs.hub.circuits.some((c) => c.circuitId === SEED_CIRCUIT_ID), false);
  assert.equal(hs.hub.credits, c0 + 25);
  assert.ok(hs.notice.includes("+25c"));
  assert.ok(hs.notice.includes("最低") && hs.notice.includes("出来栄え"));

  // Missing id
  const missing = sellCircuit(hs, "no_such_circuit");
  assert.equal(missing.notice, "回路なし");
}

// Perfect-only 完璧ボーナス 2 × round(4 × 1.5^N) (= 2 × junk craft credit cost,
// shared single source): sized Perfect boards 2×2 / 6×6 / 8×8 (+ 20×20 table),
// and Bypass / Offline / un-Restored / non-awakened get no bonus.
{
  assert.equal(perfectCircuitSellBonusCredits(2), 18);
  assert.equal(perfectCircuitSellBonusCredits(4), 40);
  assert.equal(perfectCircuitSellBonusCredits(6), 92);
  assert.equal(perfectCircuitSellBonusCredits(8), 206);
  assert.equal(perfectCircuitSellBonusCredits(10), 462);
  assert.equal(perfectCircuitSellBonusCredits(20), 26602);
  for (const n of [2, 4, 6, 8, 10, 20]) {
    assert.equal(perfectCircuitSellBonusCredits(n), 2 * circuitCraftCreditCost(n));
  }
  assert.equal(perfectCircuitSellBonusCredits(null), 0);
  assert.equal(perfectCircuitSellBonusCredits(0), 0);
  assert.equal(circuitSellPriceCredits(0, { perfectSide: null }), 25);
  assert.equal(circuitSellPriceCredits(0, { perfectSide: 20 }), 25 + 26602);
  const brkJa = formatCircuitSellPriceJa(8, { perfectSide: 2 });
  assert.equal(brkJa.total, 67);
  assert.equal(brkJa.perfectBonus, 18);
  assert.ok(brkJa.detailJa.includes("完璧ボーナス 18c"));
  assert.equal(formatCircuitSellPriceJa(8).detailJa.includes("完璧"), false);

  const store = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  const addBoard = (
    state: ReturnType<typeof resetHangar>,
    id: string,
    size: number,
    outcome: CircuitOutcome,
    perfect: boolean,
  ) => {
    const puzzleId = buildSizedTruePuzzleId(`sell-${id}`, size, size);
    const sized = resolveSizedTruePuzzle(puzzleId)!;
    const board = {
      v: 1 as const,
      cols: size,
      rows: size,
      edgeState: encodeEdgeState(sized.solution),
      puzzleId,
      outcome,
      ...(perfect ? { perfect: true, locked: true } : {}),
    };
    const hub = upsertCircuitIntoHub(state.hub, {
      circuitId: id,
      circuitBoard: board,
      outcome,
      ...(perfect ? { perfect: true, digitRate: 1, loopClosed: true } : {}),
    });
    return { ...state, hub };
  };
  const sellAndGain = (
    state: ReturnType<typeof resetHangar>,
    id: string,
  ): { gained: number; effect: number; next: ReturnType<typeof resetHangar> } => {
    const rec = state.hub.circuits.find((c) => c.circuitId === id)!;
    const effect = computeCircuitEffectForBoard(rec.circuitBoard, {
      perfect: rec.circuitBoard.perfect ?? rec.locked,
    }).effect;
    const before = state.hub.credits;
    const next = sellCircuit(state, id);
    return { gained: next.hub.credits - before, effect, next };
  };

  for (const size of [2, 6, 8]) {
    let hs = resetHangar(store);
    hs = addBoard(hs, `perf${size}`, size, "fully_awakened", true);
    const rec = hs.hub.circuits.find((c) => c.circuitId === `perf${size}`)!;
    assert.equal(circuitSellPerfectSide(rec), size);
    const r = sellAndGain(hs, `perf${size}`);
    assert.equal(r.gained, 25 + r.effect * 3 + 2 * circuitCraftCreditCost(size));
    console.log(
      `trade perfect sell ${size}x${size}: effect ${r.effect} → ${r.gained}c`,
    );

    // Same lines as Bypass (not Perfect) → no bonus.
    hs = resetHangar(store);
    hs = addBoard(hs, `byp${size}`, size, "bypass", false);
    const b = sellAndGain(hs, `byp${size}`);
    assert.equal(b.gained, 25 + b.effect * 3);
  }

  // Un-Restored / Offline empty board → 25c, no bonus.
  {
    let hs = resetHangar(store);
    hs = {
      ...hs,
      hub: upsertCircuitIntoHub(hs.hub, {
        circuitId: "raw6",
        circuitBoard: createEmptyCircuitBoard(6, 6, "raw6"),
        outcome: "offline",
      }),
    };
    const rec = hs.hub.circuits.find((c) => c.circuitId === "raw6")!;
    assert.equal(circuitSellPerfectSide(rec), null);
    const r = sellAndGain(hs, "raw6");
    assert.equal(r.gained, 25);
  }
  // Perfect flag without Fully Awakened outcome → no bonus.
  assert.equal(
    circuitSellPerfectSide({
      circuitBoard: { v: 1, cols: 6, rows: 6, edgeState: "", perfect: true, outcome: "bypass" },
      outcome: "bypass",
    }),
    null,
  );
  // Non-square boards: N = max(cols, rows).
  assert.equal(
    circuitSellPerfectSide({
      circuitBoard: { v: 1, cols: 4, rows: 6, edgeState: "", perfect: true, outcome: "fully_awakened" },
      outcome: "fully_awakened",
    }),
    6,
  );
}

// --- unopened containers: buy / launch / skip deposit ingest ---
{
  assert.equal(UNOPENED_CONTAINER_PRICE_CREDITS, 15);
  const store = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  let hs = resetHangar(store);
  assert.equal(hs.hub.unopenedContainers ?? 0, 0);

  // Buy qty×15
  const credits0 = hs.hub.credits;
  hs = buyUnopenedContainers(hs, 2);
  assert.equal(hs.hub.unopenedContainers, 2);
  assert.equal(hs.hub.credits, credits0 - 30);
  assert.ok(hs.notice.includes("+2"));
  const rawBuy = store.getItem(HUB_SAVE_STORAGE_KEY);
  assert.ok(rawBuy);
  assert.equal(deserializeHubSave(rawBuy!)!.hub.unopenedContainers, 2);

  // Insufficient funds
  hs = {
    ...hs,
    hub: { ...hs.hub, credits: 10 },
  };
  const blocked = buyUnopenedContainers(hs, 1);
  assert.equal(blocked.hub.unopenedContainers, 2, "stock unchanged");
  assert.equal(blocked.hub.credits, 10, "credits unchanged");
  assert.ok(blocked.notice.includes("クレジット不足"));

  // Restore credits for launch tests
  hs = {
    ...blocked,
    hub: { ...blocked.hub, credits: 100 },
  };
  const url = buildSortFromUnopenedUrl(hs, 2);
  assert.ok(url);
  assert.ok(url!.includes("salvagedContainers=2"));
  assert.ok(url!.includes(`totalStockPieces=${2 * PIECES_PER_CONTAINER}`));
  assert.ok(url!.includes("isExtracted=1"));

  const launched = launchSortFromUnopened(hs, 2);
  assert.ok(launched.url);
  assert.equal(launched.state.hub.unopenedContainers, 0, "launch consumes stock");
  assert.ok(launched.state.log.some((l) => l.includes("未開封→仕分")));
  const rawLaunch = store.getItem(HUB_SAVE_STORAGE_KEY);
  assert.equal(deserializeHubSave(rawLaunch!)!.hub.unopenedContainers, 0);

  // Over-spend launch
  const over = launchSortFromUnopened(launched.state, 1);
  assert.equal(over.url, null);
  assert.ok(over.state.notice.includes("未開封不足"));

  // Skip deposit ingest: depositUnopenedContainers → Hub stock, no materials
  let depositHs = resetHangar(store);
  const mats0 = depositHs.hub.materials;
  const inv0 = { ...depositHs.hub.inventory };
  const ingested = ingestLocationSearch(
    depositHs,
    "?importMaterials=0&craftMultiplier=1.000&depositUnopenedContainers=4",
  );
  assert.equal(ingested.consumed, true);
  assert.equal(ingested.state.hub.unopenedContainers, 4);
  assert.equal(ingested.state.hub.materials, mats0, "no false refine materials");
  assert.deepEqual(ingested.state.hub.inventory, inv0);
  assert.ok(ingested.state.log.some((l) => l.includes("未開封コンテナ預け +4")));
}


// --- circuit effect breakdown display helpers (UI math) ---
{
  const empty = formatCircuitHubBrief([]);
  assert.equal(empty.lines.length, 0);
  assert.ok(empty.summaryJa.includes("回路"));

  const seeded = loadPlaytestSeed(createInitialHangar());
  const brief = formatCircuitHubBrief(seeded.hub.circuits, seeded.lastCircuit);
  assert.ok(brief.lines.length >= 1);
  for (const line of brief.lines) {
    assert.ok(typeof line.effectBreakdownJa === "string");
    assert.ok(
      line.effectBreakdownJa.includes("内訳"),
      `expected 内訳 in ${line.effectBreakdownJa}`,
    );
  }
  const withEffect = brief.lines.find((l) => l.effect > 0);
  if (withEffect) {
    // Contributing digits should appear as N×count(+total)
    assert.ok(
      /\d+×\d+\(\+\d+\)/.test(withEffect.effectBreakdownJa) ||
        withEffect.effectBreakdownJa.includes("0→4"),
      withEffect.effectBreakdownJa,
    );
  }

  // Direct formatter smoke via hangar re-exports
  const groups = groupCircuitEffectContributions({
    effect: 8,
    rawSum: 8,
    loopCount: 1,
    hasLoop: true,
    activeLoopEdgeCount: 8,
    perfect: true,
    digits: { clueCount: 4, satisfied: 4, satisfiedZeros: 0, rate: 1 },
    zeroBonusApplied: 0,
    contributions: [
      { x: 0, y: 0, digit: 2, contribution: 2 },
      { x: 1, y: 0, digit: 2, contribution: 2 },
      { x: 0, y: 1, digit: 2, contribution: 2 },
      { x: 1, y: 1, digit: 2, contribution: 2 },
    ],
  });
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.digit, 2);
  assert.equal(groups[0]!.count, 4);
  assert.equal(groups[0]!.total, 8);
  const ja = formatCircuitEffectBreakdownJa({
    effect: 8,
    rawSum: 8,
    loopCount: 1,
    hasLoop: true,
    activeLoopEdgeCount: 8,
    perfect: true,
    digits: { clueCount: 4, satisfied: 4, satisfiedZeros: 0, rate: 1 },
    zeroBonusApplied: 0,
    contributions: [
      { x: 0, y: 0, digit: 2, contribution: 2 },
      { x: 1, y: 0, digit: 2, contribution: 2 },
      { x: 0, y: 1, digit: 2, contribution: 2 },
      { x: 1, y: 1, digit: 2, contribution: 2 },
    ],
  });
  assert.equal(ja, "内訳 2×4(+8)");
  assert.ok(
    formatCircuitEffectBreakdownJa({
      effect: 0,
      rawSum: 0,
      loopCount: 0,
      hasLoop: false,
      activeLoopEdgeCount: 0,
      perfect: false,
      digits: { clueCount: 0, satisfied: 0, satisfiedZeros: 0, rate: 1 },
      zeroBonusApplied: 0,
      contributions: [],
    }).includes("ループなし"),
  );
}

// TRADE-01 resource history visualization (log-derived, no price changes)
{
  const mat = parseResourceHistoryLine("搬入 materials +12");
  assert.ok(mat);
  assert.equal(mat!.polarity, "gain");
  assert.equal(mat!.source, "sort");
  assert.equal(mat!.chips[0]!.amount, 12);

  const yf = parseResourceHistoryLine("搬入 yieldBag mat_ration:3, part_actuator:1");
  assert.ok(yf);
  assert.equal(yf!.chips.length, 2);
  assert.equal(yf!.chips[0]!.label, "mat_ration");
  assert.equal(yf!.chips[0]!.amount, 3);

  const buy = parseResourceHistoryLine("未開封購入 ×2 → −30c（仮 15c）");
  assert.ok(buy);
  assert.equal(buy!.polarity, "spend");
  assert.equal(buy!.chips[0]!.amount, -30);

  const sell = parseResourceHistoryLine("レア売却 mat_rare_core×1 → +40c（仮）");
  assert.ok(sell);
  assert.equal(sell!.polarity, "gain");
  assert.equal(sell!.source, "hub");

  const wear = parseResourceHistoryLine("帰還ウェア extract ×2 · e1 70→60(ok)");
  assert.ok(wear);
  assert.equal(wear!.source, "explore");
  assert.equal(wear!.polarity, "neutral");

  const junk = parseResourceHistoryLine("デモ初期化");
  assert.equal(junk, null, "non-resource lines ignored");

  const hist = resourceHistoryFromLog([
    "搬入 materials +5",
    "デモ初期化",
    "restore 回路 board_x → awakened · 刻印 無名",
    "未開封コンテナ預け +3",
  ]);
  assert.equal(hist.length, 3);
  assert.equal(hist[0]!.title.includes("資材"), true);
  assert.equal(hist[1]!.source, "restore");
  assert.equal(hist[2]!.chips[0]!.amount, 3);

  const html = buildResourceHistoryHtml([
    "搬入 materials +5",
    "未開封購入 ×1 → −15c（仮 15c）",
  ]);
  assert.ok(html.includes("res-history"), "history root");
  assert.ok(html.includes("polarity-gain"), "gain row");
  assert.ok(html.includes("polarity-spend"), "spend row");
  assert.ok(html.includes("精製"), "sort source JA");
  assert.ok(html.includes("拠点"), "hub source JA");
  assert.ok(html.includes("materials +5") || html.includes("materials +5m") || html.includes("+5"), "gain chip");
  assert.ok(!html.includes("circuit-sell-prices"), "no price module leak");

  const empty = buildResourceHistoryHtml(["セーブ読込 (x)", "デモ初期化"]);
  assert.ok(empty.includes("res-history empty") || empty.includes("まだありません"), "empty state");
  console.log("trade resource history viz ok");
}

// --- SortieReport: wreck is retained, true loss is removed, overlap cannot cause retention ---
{
  const state = grantStarterFleet(resetHangar(memoryStorage()));
  const wreckId = state.hub.fleet[0]!.instanceId;
  const lostId = state.hub.fleet[1]!.instanceId;
  const wrecked = applySortieReport(state.hub, {
    sortieId: "sortie_wreck_unit",
    cell: null,
    frontSeed: null,
    lostMechInstanceIds: [],
    lostCause: {},
    recoveredDropIds: [],
    acquiredCircuits: [],
    wreckedMechInstanceIds: [wreckId],
  });
  assert.equal(wrecked.applied, true);
  assert.ok(wrecked.hub.fleet.some((m) => m.instanceId === wreckId));
  assert.equal(wrecked.hub.fleet.find((m) => m.instanceId === wreckId)!.status, "destroyed");

  const lost = applySortieReport(state.hub, {
    sortieId: "sortie_lost_unit",
    cell: null,
    frontSeed: null,
    lostMechInstanceIds: [lostId],
    lostCause: {},
    recoveredDropIds: [],
    acquiredCircuits: [],
    wreckedMechInstanceIds: [],
  });
  assert.equal(lost.applied, true);
  assert.equal(lost.hub.fleet.some((m) => m.instanceId === lostId), false);

  const overlap = applySortieReport(state.hub, {
    sortieId: "sortie_overlap_unit",
    cell: null,
    frontSeed: null,
    lostMechInstanceIds: [wreckId],
    lostCause: {},
    recoveredDropIds: [],
    acquiredCircuits: [],
    wreckedMechInstanceIds: [wreckId],
  });
  assert.equal(overlap.hub.fleet.some((m) => m.instanceId === wreckId), false);
}

// --- Explore return state: general inventory drops, recovery, wreck retention, idempotency ---
{
  const store = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  let hs = resetHangar(store);
  hs = grantStarterFleet(hs);
  const wreckId = hs.hub.fleet[0]!.instanceId;
  const drop = {
    dropId: "invdrop_sortie_1",
    frontSeed: 123,
    cell: { sx: 2, sy: -1 },
    inventory: { ammo: 3, armor: 2 },
    cause: "wreck_not_carried" as const,
    droppedAt: "2026-10-02T00:00:00.000Z",
  };
  const payload = toExploreToHubWearPayload(
    "fail",
    [{ instanceId: wreckId, durabilityAfter: 0 }],
    {
      sortieId: "sortie_inventory_1",
      inventoryDrops: [drop],
      wreckedMechInstanceIds: [wreckId],
    },
  );
  const url = buildExploreToHubWearUrl(payload);
  const applied = ingestLocationSearch(hs, new URL(url).search);
  assert.equal(applied.consumed, true);
  assert.equal(applied.state.hub.inventoryFieldDrops.length, 1);
  assert.equal(applied.state.hub.inventoryFieldDrops[0]!.dropId, drop.dropId);
  assert.deepEqual(applied.state.hub.inventory, {});
  const wreck = applied.state.hub.fleet.find((m) => m.instanceId === wreckId);
  assert.ok(wreck);
  assert.equal(wreck!.status, "destroyed");
  assert.equal(wreck!.durability, 0);
  assert.equal(applied.state.selectedDeployIds.includes(wreckId), false);
  assert.equal(applied.state.hub.appliedSortieIds.includes("sortie_inventory_1"), true);

  const duplicate = ingestLocationSearch(applied.state, new URL(url).search);
  assert.equal(duplicate.consumed, true);
  assert.equal(duplicate.state.hub.inventoryFieldDrops.length, 1);
  assert.equal(duplicate.state.hub.appliedSortieIds.filter((id) => id === "sortie_inventory_1").length, 1);

  const recoveryPayload = toExploreToHubWearPayload(
    "extract",
    [],
    {
      sortieId: "sortie_inventory_2",
      recoveredInventoryDropIds: [drop.dropId],
    },
  );
  const recovered = ingestLocationSearch(
    duplicate.state,
    new URL(buildExploreToHubWearUrl(recoveryPayload)).search,
  );
  assert.deepEqual(recovered.state.hub.inventory, { ammo: 3, armor: 2 });
  assert.equal(recovered.state.hub.inventoryFieldDrops.length, 0);
  assert.equal(recovered.state.hub.appliedSortieIds.includes("sortie_inventory_2"), true);

  const legacy = normalizeHubSnapshot({
    credits: 1,
    materials: 1,
    fleet: [],
    ammoLoad: { standard: 0, ap: 0, emp: 0 },
    inventory: {},
    circuits: [],
    frontProgress: null,
    importedMaterials: 0,
    unopenedContainers: 0,
    selectedMechId: "mech_gen1",
    selectedAmmoId: "ammo_standard",
    perfectMaxSize: 0,
    fieldDrops: [],
  });
  assert.deepEqual(legacy.inventoryFieldDrops, []);
}


// Lost-mech return handoff survives URL parsing and reaches applySortieReport/HubSave.
{
  const payload = toExploreToHubWearPayload(
    "extract",
    [{ instanceId: "lost-return-1", durabilityAfter: 73 }],
    {
      sortieId: "sortie_lost_return_1",
      lostMechs: [{
        instanceId: "lost-return-1",
        currentAmmo: 7,
        battery: { capacity: 300, activity: 212 },
        circuitIds: ["circuit_lost_1", "circuit_lost_2"],
      }],
    },
  );
  const parsed = parseExploreToHubWearSearch(new URL(buildExploreToHubWearUrl(payload)).search);
  assert.ok(parsed);
  assert.deepEqual(parsed!.lostMechs, payload.lostMechs);

  const base = grantStarterFleet(resetHangar(memoryStorage())).hub;
  const targetId = base.fleet[0]!.instanceId;
  const applied = applySortieReport(base, {
    sortieId: "sortie_lost_return_1",
    cell: null,
    frontSeed: null,
    lostMechInstanceIds: [],
    lostCause: {},
    recoveredDropIds: [],
    acquiredCircuits: [],
    lostMechs: [{
      instanceId: targetId,
      currentAmmo: 7,
      battery: { capacity: 300, activity: 212 },
      circuitIds: ["circuit_lost_1"],
    }],
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.hub.fleet.some((m) => m.instanceId === targetId), false);
  assert.equal(applied.hub.lostMechs.some((m) => m.instanceId === targetId), true);
}

// Explore return carries per-mech ammo / battery → HubSave updated → next
// deploy URL re-sends them (mechCurrentAmmo / mechBattery). A stale return
// URL (sortieId already applied) never overwrites newer values.
{
  const rtStorage = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = rtStorage;
  let rt = grantStarterFleet(resetHangar(rtStorage));
  const [idA, idB] = rt.hub.fleet.map((m) => m.instanceId);
  assert.ok(idA && idB, "starter fleet has two mechs");
  rt = { ...rt, selectedDeployIds: [idA!, idB!] };

  // Fresh fleet: no currentAmmo yet → first deploy carries no mechCurrentAmmo.
  const firstDeploy = parseTradeToExploreSearch(new URL(buildDeployUrl(rt)!).search)!;
  assert.equal(firstDeploy.mechCurrentAmmo, undefined);
  assert.deepEqual(
    firstDeploy.mechBattery?.map((r) => [r.instanceId, r.battery.capacity, r.battery.activity]),
    [[idA, 300, 300], [idB, 300, 300]],
  );

  const durA = rt.hub.fleet.find((m) => m.instanceId === idA)!.durability;
  const durB = rt.hub.fleet.find((m) => m.instanceId === idB)!.durability;
  const returnUrl = buildExploreToHubWearUrl(
    toExploreToHubWearPayload(
      "extract",
      [
        { instanceId: idA!, durabilityAfter: durA },
        { instanceId: idB!, durabilityAfter: durB },
      ],
      {
        sortieId: "sortie_ammo_battery_rt_1",
        mechCurrentAmmo: [
          { instanceId: idA!, currentAmmo: 11 },
          { instanceId: idB!, currentAmmo: 0 },
        ],
        mechBattery: [{ instanceId: idA!, battery: { capacity: 300, activity: 123 } }],
      },
    ),
  );
  const applied = ingestLocationSearch(rt, new URL(returnUrl).search);
  assert.equal(applied.consumed, true);
  const mechA = applied.state.hub.fleet.find((m) => m.instanceId === idA)!;
  const mechB = applied.state.hub.fleet.find((m) => m.instanceId === idB)!;
  assert.equal(mechA.currentAmmo, 11);
  assert.equal(mechB.currentAmmo, 0, "0 is written back as 0, not unset");
  assert.deepEqual(mechA.battery, { capacity: 300, activity: 123 });
  assert.deepEqual(mechB.battery, { capacity: 300, activity: 300 }, "unreported battery unchanged");
  assert.ok(applied.state.hub.appliedSortieIds?.includes("sortie_ammo_battery_rt_1"));

  // Persisted: a reload from storage sees the same values.
  const reloadedRt = createInitialHangar(rtStorage);
  const savedA = reloadedRt.hub.fleet.find((m) => m.instanceId === idA)!;
  assert.equal(savedA.currentAmmo, 11);
  assert.deepEqual(savedA.battery, { capacity: 300, activity: 123 });
  assert.equal(reloadedRt.hub.fleet.find((m) => m.instanceId === idB)!.currentAmmo, 0);

  // Next deploy URL re-sends them; startingAmmo is omitted once mechCurrentAmmo is present.
  const nextUrl = new URL(buildDeployUrl({ ...reloadedRt, selectedDeployIds: [idA!, idB!] })!);
  const nextDeploy = parseTradeToExploreSearch(nextUrl.search)!;
  assert.deepEqual(nextDeploy.mechCurrentAmmo, [
    { instanceId: idA, currentAmmo: 11 },
    { instanceId: idB, currentAmmo: 0 },
  ]);
  assert.deepEqual(
    nextDeploy.mechBattery?.map((r) => [r.instanceId, r.battery.capacity, r.battery.activity]),
    [[idA, 300, 123], [idB, 300, 300]],
  );
  assert.equal(nextUrl.searchParams.has("startingAmmo"), false);

  // Re-opening the same return URL is ignored (already applied) and does not overwrite.
  const changed = {
    ...applied.state,
    hub: {
      ...applied.state.hub,
      fleet: applied.state.hub.fleet.map((m) => (m.instanceId === idA ? { ...m, currentAmmo: 5 } : m)),
    },
  };
  const again = ingestLocationSearch(changed, new URL(returnUrl).search);
  assert.equal(again.state.hub.fleet.find((m) => m.instanceId === idA)!.currentAmmo, 5);
}

console.log("trade hangar selftest: ok");

// U9: Explore saved the return to HubSave at sortie end (shared
// applyExploreReturnToHub). Trade opening the same 格納庫 return URL must not
// apply it again; a legacy return URL alone (no direct save) applies once.
{
  const u9Storage = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = u9Storage;
  const base = grantStarterFleet(resetHangar(u9Storage));
  const [idA, idB] = base.hub.fleet.map((m) => m.instanceId);
  assert.ok(idA && idB);
  const durA = base.hub.fleet.find((m) => m.instanceId === idA)!.durability;
  const payload = toExploreToHubWearPayload(
    "extract",
    [{ instanceId: idA!, durabilityAfter: durA - 15 }],
    {
      sortieId: "sortie_u9_direct_1",
      mechCurrentAmmo: [{ instanceId: idA!, currentAmmo: 9 }],
      mechBattery: [{ instanceId: idA!, battery: { capacity: 300, activity: 280 } }],
      lostMechs: [{ instanceId: idB!, currentAmmo: 4, battery: { capacity: 300, activity: 250 }, circuitIds: [] }],
    },
  );
  const returnSearch = new URL(buildExploreToHubWearUrl(payload)).search;

  // (a) direct save first (what Explore does), then trade opens the return URL
  const direct = applyExploreReturnToHub(base.hub, payload);
  assert.equal(direct.applied, true);
  const afterDirect = normalizeHubSnapshot(direct.hub);
  const opened = ingestLocationSearch({ ...base, hub: afterDirect }, returnSearch);
  assert.equal(opened.consumed, true);
  assert.deepEqual(opened.state.hub.fleet, afterDirect.fleet, "no second wear / ammo write");
  assert.deepEqual(opened.state.hub.lostMechs, afterDirect.lostMechs, "lostMechs recorded once");
  assert.equal(opened.state.hub.lostMechs.length, 1);
  assert.equal(opened.state.hub.fleet.find((m) => m.instanceId === idA)!.durability, durA - 15);
  assert.equal(opened.state.hub.fleet.find((m) => m.instanceId === idA)!.currentAmmo, 9);
  assert.ok(opened.state.lastExploreReturn?.summaryJa.includes("反映済み"));

  // (b) legacy: only the return URL (e.g. local dev cross-origin) → applies once
  const legacy1 = ingestLocationSearch(base, returnSearch);
  const a1 = legacy1.state.hub.fleet.find((m) => m.instanceId === idA)!;
  assert.equal(a1.durability, durA - 15);
  assert.equal(a1.currentAmmo, 9);
  assert.deepEqual(a1.battery, { capacity: 300, activity: 280 });
  assert.equal(legacy1.state.hub.fleet.some((m) => m.instanceId === idB), false);
  assert.equal(legacy1.state.hub.lostMechs.length, 1);
  const legacy2 = ingestLocationSearch(legacy1.state, returnSearch);
  assert.deepEqual(legacy2.state.hub.fleet, legacy1.state.hub.fleet, "second open does nothing");
  assert.deepEqual(legacy2.state.hub.lostMechs, legacy1.state.hub.lostMechs);
  // same result either way
  assert.deepEqual(legacy1.state.hub.fleet, afterDirect.fleet);
  console.log("trade U9 direct save / legacy return URL once ok");
}

// Item 15: no fleet cap; hangar picks up to 3 sortie mechs (saved in HubSave.sortieSelection).
{
  const prevLs = (globalThis as unknown as { localStorage: Storage }).localStorage;
  const store = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = store;
  try {
    let hub = grantStarterFleet(resetHangar(store)).hub;
    while (hub.fleet.length < 5) hub = addMechToHub(hub, "mech_gen1")!;
    hub = { ...hub, fleet: hub.fleet.map((m) => ({ ...m, status: "operational" as const, durability: m.durabilityMax })) };
    saveHubSaveToLocalStorage(hub, store);
    const ids = hub.fleet.map((m) => m.instanceId);
    assert.equal(ids.length, 5);
    assert.equal(HUB_LIMITS.maxSortieMechs, 3);

    // (1) load keeps all 5; default selection = first 3 deployable
    let hs = createInitialHangar(store);
    assert.equal(hs.hub.fleet.length, 5, "5 mechs not truncated on load");
    assert.deepEqual(hs.selectedDeployIds, ids.slice(0, 3));

    // (2) 4th refused; unchecking the last refused
    const full = setDeploySelection(hs, ids[3]!, true);
    assert.deepEqual(full.selectedDeployIds, ids.slice(0, 3), "4th refused");
    assert.ok(full.notice.includes("最大"));
    hs = setDeploySelection(hs, ids[0]!, false);
    hs = setDeploySelection(hs, ids[4]!, true);
    assert.deepEqual(hs.selectedDeployIds, [ids[1], ids[2], ids[4]], "fleet order");
    let one = setDeploySelection(setDeploySelection(hs, ids[1]!, false), ids[2]!, false);
    assert.deepEqual(one.selectedDeployIds, [ids[4]]);
    one = setDeploySelection(one, ids[4]!, false);
    assert.deepEqual(one.selectedDeployIds, [ids[4]], "last one stays");
    assert.ok(one.notice.includes("1 機以上"));
    persistHangar(hs); // back to the [1,2,4] selection (the probes above persisted)

    // (3) deploy URL carries only the chosen mechs
    const deploy = parseTradeToExploreSearch(new URL(buildDeployUrl(hs)!).search)!;
    assert.deepEqual(deploy.deployedInstanceIds, [ids[1], ids[2], ids[4]]);

    // (4) selection persisted → reload keeps it; save again keeps all 5
    const re = createInitialHangar(store);
    assert.equal(re.hub.fleet.length, 5);
    assert.deepEqual(re.hub.sortieSelection, [ids[1], ids[2], ids[4]]);
    assert.deepEqual(re.selectedDeployIds, [ids[1], ids[2], ids[4]]);
    // 先頭から3機
    const firstThree = selectAllDeployable(re);
    assert.deepEqual(firstThree.selectedDeployIds, ids.slice(0, 3));
    assert.deepEqual(createInitialHangar(store).selectedDeployIds, ids.slice(0, 3));

    // wear only on the chosen mechs (simulated return of the sortie set)
    const deployed = markDeployed(re, [ids[1]!, ids[2]!, ids[4]!]);
    const back = simulateReturn(deployed, "extract");
    for (const m of back.hub.fleet) {
      const before = re.hub.fleet.find((x) => x.instanceId === m.instanceId)!;
      if ([ids[1], ids[2], ids[4]].includes(m.instanceId)) assert.ok(m.durability < before.durability);
      else assert.equal(m.durability, before.durability, "unselected mech untouched");
    }
    assert.equal(back.hub.fleet.length, 5);
  } finally {
    (globalThis as unknown as { localStorage: Storage }).localStorage = prevLs;
  }
  {
    // the generic [data-act] click → render() must not swallow the checkbox's change event
    const { readFileSync } = await import("node:fs");
    const mainSrc = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    assert.ok(mainSrc.includes(`'[data-act]:not([data-act="select"])'`), "sortie checkbox not re-rendered on click");
  }
  console.log("trade item15 fleet cap removal / sortie selection ok");
}

// lostMechs recovery follow-up (2026-10-03 神宮): a circuit on a left-behind
// mech stays in HubSave but the HUB treats it as out of its hands — not listed,
// not counted, not sellable, not re-equippable; it comes back with the mech.
{
  const shared = await import("@estg/shared");
  const lostApi = await import("./lost-mech-circuits");
  const store = memoryStorage();
  let hs = loadPlaytestSeed(createInitialHangar(store), { storage: store, injectRate: 0, rng: () => 0 });
  const wingId = hs.hub.fleet.find((m) => m.status === "operational" && m.instanceId !== hs.hub.fleet[0]!.instanceId)!.instanceId;
  // a second circuit kept in the stash, to check the count drops only by the lost one
  let hub = upsertCircuitIntoHub(hs.hub, {
    circuitId: "lm_stash",
    circuitBoard: createEmptyCircuitBoard(2, 2, "lm_stash") as never,
    outcome: "offline",
  } as never);
  const eq = shared.equipCircuit(hub, SEED_CIRCUIT_ID, wingId);
  assert.equal(eq.ok, true);
  hub = eq.hub;
  const totalBefore = hub.circuits.length;
  // left behind via Invade (place known) → lostMechs, circuit stays on it
  const lostRet = applyExploreReturnToHub(hub, {
    returnKind: "extract", mechWear: [], sortieId: "lm_trade_lost",
    lostMechs: [{ instanceId: wingId, currentAmmo: 9, battery: { capacity: 300, activity: 200 }, circuitIds: [SEED_CIRCUIT_ID], frontSeed: 77, cell: { sx: 1, sy: 2 } }],
  });
  assert.equal(lostRet.applied, true);
  saveHubSaveToLocalStorage(lostRet.hub, store);
  hs = createInitialHangar(store);
  assert.equal(hs.hub.circuits.find((c) => c.circuitId === SEED_CIRCUIT_ID)?.equippedTo, wingId, "kept in HubSave on the lost mech");
  assert.equal(hs.hub.circuits.length, totalBefore, "HubSave keeps every record");

  // (1) not in the list nor the count
  const visible = shared.hubVisibleCircuits(hs.hub);
  assert.deepEqual(visible.map((c) => c.circuitId), ["lm_stash"]);
  const brief = formatCircuitHubBrief(visible, hs.lastCircuit);
  assert.ok(brief.summaryJa.startsWith("回路 1枚"), brief.summaryJa);
  assert.ok(!buildNextSortieReturnDigest(hs).restoreJa.includes(SEED_CIRCUIT_ID), "hub digest ignores it");
  assert.notEqual(hs.lastCircuit?.circuitId, SEED_CIRCUIT_ID, "not the active circuit");
  {
    // only the lost circuit left: the remembered selection does not bring it back
    const only = shared.normalizeHubSnapshot({ ...hs.hub, circuits: hs.hub.circuits.filter((c) => c.circuitId === SEED_CIRCUIT_ID) });
    const remembered = { circuitId: SEED_CIRCUIT_ID, circuitBoard: hs.hub.circuits.find((c) => c.circuitId === SEED_CIRCUIT_ID)!.circuitBoard, outcome: "offline" } as never;
    assert.equal(resolveActiveCircuit(only, remembered), null);
  }
  assert.equal(selectCircuit(hs, SEED_CIRCUIT_ID).notice, "回路なし", "cannot be selected");
  {
    const { readFileSync } = await import("node:fs");
    const mainSrc = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const equipSrc = readFileSync(new URL("./circuit-equip-ui.ts", import.meta.url), "utf8");
    assert.ok(mainSrc.includes("const list = hubVisibleCircuits(s.hub);"), "保有回路 list filtered");
    assert.ok(mainSrc.includes("formatCircuitHubBrief(hubVisibleCircuits(s.hub)"), "sortie panel count filtered");
    assert.ok(equipSrc.includes("const circuits = hubVisibleCircuits(hub);"), "回路装備 options / count filtered");
    assert.ok(!equipSrc.includes("hub.circuits"), "equip UI never reads raw circuits");
  }

  // (2) sell and re-equip refused on the processing side
  const sold = sellCircuit(hs, SEED_CIRCUIT_ID);
  assert.equal(sold.notice, "回路なし", "refused like a missing circuit (existing notice)");
  assert.equal(sold.hub, hs.hub, "hub unchanged");
  assert.equal(shared.normalizeHubSnapshot(shared.loadHubSaveFromLocalStorage(store)!.hub).circuits.length, totalBefore, "save unchanged");
  const other = hs.hub.fleet.find((m) => m.status === "operational")!.instanceId;
  const eqLost = lostApi.equipHubCircuit(hs.hub, SEED_CIRCUIT_ID, other);
  assert.deepEqual([eqLost.ok, eqLost.reason], [false, "on_lost_mech"]);
  const unLost = lostApi.unequipHubCircuit(hs.hub, SEED_CIRCUIT_ID);
  assert.deepEqual([unLost.ok, unLost.reason], [false, "on_lost_mech"]);
  assert.equal(lostApi.equipRefusalMessageJa("on_lost_mech"), "回路が見つかりません。", "existing text, no new wording");
  assert.equal(lostApi.equipRefusalMessageJa("slot_full"), "その機体の回路枠がいっぱいです。");
  assert.equal(lostApi.unequipHubCircuit(hs.hub, "lm_stash").ok, true, "stash circuit: unaffected");

  // (3) recovered → back in the list, still on that mech, usable again
  const rec = applyExploreReturnToHub(hs.hub, {
    returnKind: "extract", mechWear: [], sortieId: "lm_trade_recover", recoveredLostMechInstanceIds: [wingId],
  });
  assert.equal(rec.applied, true);
  saveHubSaveToLocalStorage(rec.hub, store);
  hs = createInitialHangar(store);
  const back = shared.hubVisibleCircuits(hs.hub);
  assert.deepEqual(back.map((c) => c.circuitId).sort(), [SEED_CIRCUIT_ID, "lm_stash"].sort());
  assert.equal(back.find((c) => c.circuitId === SEED_CIRCUIT_ID)?.equippedTo, wingId, "comes back on its mech");
  assert.ok(formatCircuitHubBrief(back, hs.lastCircuit).summaryJa.startsWith("回路 2枚"));
  assert.equal(selectCircuit(hs, SEED_CIRCUIT_ID).notice, `回路選択 ${SEED_CIRCUIT_ID}`);
  assert.equal(lostApi.unequipHubCircuit(hs.hub, SEED_CIRCUIT_ID).ok, true, "can be unequipped again");
  const soldBack = sellCircuit(hs, SEED_CIRCUIT_ID);
  assert.ok(soldBack.notice.startsWith("回路売却"), "can be sold again");
  console.log("trade lost-mech circuits hidden from the HUB ok");
}
