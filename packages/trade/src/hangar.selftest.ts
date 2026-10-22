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
  exploreReturnHeadJa,
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
  lostMechCountLineJa,
  wreckCountLineJa,
  repairMech,
  reviveWreck,
  buyNewMech,
  holdingPills,
  createNewMech,
  BUY_MECH_LABEL_JA,
  createMechLabelJa,
  reviveMechLabelJa,
  repairMechLabelJa,
  reviveMechCost,
  moneyShortfallJa,
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
  onHangarExploreLink,
  BULLETIN_UNLOCKED_LINE_JA,
  bulletinUnlockedLineHtml,
  scrapMech,
  sortieAmmoShortLineJa,
} from "./hangar";
import { ammoSwapLogLineJa } from "./ammo-swap-log";
import {
  PIECES_PER_CONTAINER,
  SORTIE_CHECKPOINT_KEY,
  circuitCraftCreditCost,
  isSortieDoneMark,
  readSortieCheckpoint,
  writeSortieDoneMark,
  addDestroyedGen1,
  formatCircuitBonusesJa,
  hangarEquippedCircuits,
  makeRestoredTrueOneByOne,
  createOwnedMech as createMechForMoney,
  INITIAL_HUB,
} from "@estg/shared";

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
  assert.equal(seedHub.credits, INITIAL_HUB.credits, "playtest seed must keep the configured starting wallet");
  // Four-resource model (#115/#119): typed repair cost collapses to armor;
  // legacy ids (mat_* / part_*) are compatibility-only and never stored.
  assert.ok((seedHub.inventory.armor ?? 0) >= 1);
  assert.ok(
    Object.keys(seedHub.inventory).every((k) => ["ammo", "armor", "power", "junk"].includes(k)),
    "seed inventory holds only the four resources",
  );
  for (const k of ["materials", "importedMaterials", "ammoLoad", "selectedMechId", "selectedAmmoId", "inventoryFieldDrops"]) {
    assert.equal(k in seedHub, false, `seed has no ${k}`);
  }

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
  // #266: the normal repair ignores the circuit repair discount (armor = missing durability, no credits / materials)
  const creditsBefore = hs.hub.credits;

  const missing = repairTarget!.durabilityMax - repairTarget!.durability;
  hs = { ...hs, hub: { ...hs.hub, inventory: { ...hs.hub.inventory, armor: missing + 4 } } };
  hs = repairMech(hs, repairTarget!.instanceId);
  assert.equal(
    hs.hub.fleet.find((m) => m.instanceId === repairTarget!.instanceId)?.status,
    "operational",
  );
  assert.equal(hs.hub.credits, creditsBefore, "no credits even with a repair discount");
  assert.equal("materials" in hs.hub, false, "no materials");
  assert.equal(hs.hub.inventory.armor, 4, "armor = missing durability (no discount)");
  assert.ok(!formatCircuitBonusesJa(hubCircuitBonuses(hs.hub)).includes("修理"), "no repair-discount display");
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
    resolveHangarPerfectInjectRate({ isDev: true, firstCleared: true }),
    PERFECT_CIRCUIT_DEV_RATE,
  );
  assert.equal(
    resolveHangarPerfectInjectRate({ hostname: "example.com", firstCleared: true }),
    PERFECT_CIRCUIT_PROD_RATE,
  );
  // S1: 0% until the first Invade clear.
  assert.equal(resolveHangarPerfectInjectRate({ hostname: "example.com", firstCleared: false }), 0);
  assert.equal(resolveHangarPerfectInjectRate({ isDev: true, firstCleared: false }), 0);
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
  const inv0 = { ...depositHs.hub.inventory };
  const ingested = ingestLocationSearch(
    depositHs,
    "?importMaterials=0&craftMultiplier=1.000&depositUnopenedContainers=4",
  );
  assert.equal(ingested.consumed, true);
  assert.equal(ingested.state.hub.unopenedContainers, 4);
  assert.equal("materials" in ingested.state.hub, false, "no materials");
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
  // fix/hub-save-legacy-retire: inventoryFieldDrops left HubSave; report.inventoryDrops is ignored.
  assert.equal("inventoryFieldDrops" in applied.state.hub, false);
  assert.deepEqual(applied.state.hub.inventory, {});
  const wreck = applied.state.hub.fleet.find((m) => m.instanceId === wreckId);
  assert.ok(wreck);
  assert.equal(wreck!.status, "destroyed");
  assert.equal(wreck!.durability, 0);
  assert.equal(applied.state.selectedDeployIds.includes(wreckId), false);
  assert.equal(applied.state.hub.appliedSortieIds.includes("sortie_inventory_1"), true);

  const duplicate = ingestLocationSearch(applied.state, new URL(url).search);
  assert.equal(duplicate.consumed, true);
  assert.equal("inventoryFieldDrops" in duplicate.state.hub, false);
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
  assert.deepEqual(recovered.state.hub.inventory, {}, "nothing to recover (no inventory field drops)");
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
  assert.equal("inventoryFieldDrops" in legacy, false);
  assert.equal("materials" in legacy, false);
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

  // Fresh fleet: HubSave normalize materialises the interim "undefined = full"
  // rule (fix/circuit-ammo-activity-refill) → first deploy carries 28 each.
  const firstDeploy = parseTradeToExploreSearch(new URL(buildDeployUrl(rt)!).search)!;
  assert.deepEqual(firstDeploy.mechCurrentAmmo, [
    { instanceId: idA, currentAmmo: 28 },
    { instanceId: idB, currentAmmo: 28 },
  ]);
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
  assert.equal(nextUrl.searchParams.has("startingAmmo"), true); // F1 (項目4-1): stock always sent

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

// PR-B: hangar line 「掲示板が開いた」 (#269 wording) only with hub.bulletinUnlocked; old saves read false.
{
  assert.equal(BULLETIN_UNLOCKED_LINE_JA, "掲示板が開いた");
  assert.equal(bulletinUnlockedLineHtml({}), "", "old save without the key: no line");
  assert.equal(bulletinUnlockedLineHtml(null), "");
  assert.equal(bulletinUnlockedLineHtml({ bulletinUnlocked: false }), "");
  assert.ok(bulletinUnlockedLineHtml({ bulletinUnlocked: true }).includes("掲示板が開いた"));
}

// fix/circuit-ammo-activity-refill: M7 scrap returns ammo, M3 pre-sortie top-up, M4 swap log line.
{
  const st = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = st;
  let s0 = grantStarterFleet(resetHangar(st));
  const [a, b] = s0.hub.fleet.map((m) => m.instanceId);
  s0 = {
    ...s0,
    hub: {
      ...s0.hub,
      inventory: { ...s0.hub.inventory, ammo: 5 },
      fleet: s0.hub.fleet.map((m) => (m.instanceId === a ? { ...m, currentAmmo: 20 } : { ...m, currentAmmo: 3 })),
      ammoBatteryRepaired: true,
    },
  };
  // M8: the line by the 出撃 button previews the shortage after the top-up
  const ids = [a!, b!];
  assert.equal(
    sortieAmmoShortLineJa(s0.hub, ids),
    "弾薬が足りません：隊長 25/28・僚機A 3/28",
    "5 in stock: 隊長 20 → 25 first (deploy order), 僚機A stays at 3",
  );
  assert.equal(s0.hub.fleet.find((m) => m.instanceId === a)!.currentAmmo, 20, "the preview does not change the hub");
  // M3: deploying tops up from the stock and saves; the deploy URL carries the refilled values
  const dep = markDeployed({ ...s0, selectedDeployIds: ids }, ids);
  assert.equal(dep.hub.fleet.find((m) => m.instanceId === a)!.currentAmmo, 25);
  assert.equal(dep.hub.fleet.find((m) => m.instanceId === b)!.currentAmmo, 3);
  assert.equal(dep.hub.inventory.ammo, undefined);
  assert.ok(dep.log.some((l) => l.includes("弾薬が足りません")), "shortage in the log");
  const url = parseTradeToExploreSearch(new URL(buildDeployUrl(dep)!).search)!;
  assert.deepEqual(url.mechCurrentAmmo, [{ instanceId: a, currentAmmo: 25 }, { instanceId: b, currentAmmo: 3 }]);
  // M7: scrapping a mech returns its carried ammo to the stock
  const scr = scrapMech(dep, b!);
  assert.equal(scr.hub.fleet.some((m) => m.instanceId === b), false);
  assert.equal(scr.hub.inventory.ammo, 3, "scrapped mech's 3 rounds → stock");
  assert.ok(scr.log.at(-1)!.includes("弾薬 3 を倉庫へ") || scr.log.some((l) => l.includes("弾薬 3 を倉庫へ")));
  // M4: swap log line text (console only)
  const moved = { ...scr.hub, fleet: scr.hub.fleet.map((m) => ({ ...m, currentAmmo: 6 })), inventory: { ammo: 22 } };
  assert.match(ammoSwapLogLineJa(scr.hub, moved), /^回路付け替え・弾薬積み直し：/);
  assert.equal(ammoSwapLogLineJa(scr.hub, scr.hub), "");
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

// Item 15: no fleet cap; hangar selects any number of sortie mechs (saved in HubSave.sortieSelection).
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
    assert.equal((HUB_LIMITS as Record<string, unknown>).maxSortieMechs, undefined);

    // (1) load keeps all 5; default selection = all deployable
    let hs = createInitialHangar(store);
    assert.equal(hs.hub.fleet.length, 5, "5 mechs not truncated on load");
    assert.deepEqual(hs.selectedDeployIds, ids);

    // (2) the fourth and fifth can be selected; the last selection stays.
    hs = setDeploySelection(hs, ids[3]!, false);
    hs = setDeploySelection(hs, ids[3]!, true);
    assert.deepEqual(hs.selectedDeployIds, ids, "fourth accepted");
    hs = setDeploySelection(hs, ids[3]!, false);
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
    // 出撃可能な全機体
    const allSelected = selectAllDeployable(re);
    assert.deepEqual(allSelected.selectedDeployIds, ids);
    assert.deepEqual(createInitialHangar(store).selectedDeployIds, ids);

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

// lostMechs recovery follow-up 2 (2026-10-03 神宮): circuits on a left-behind
// mech do not count toward the circuit bonuses (repair discount / craft
// multiplier / durability buffer); the sortie panel shows the left-behind count.
{
  const shared = await import("@estg/shared");
  const store = memoryStorage();
  let hs = loadPlaytestSeed(createInitialHangar(store), { storage: store, injectRate: 0, rng: () => 0 });
  const wingId = hs.hub.fleet.find((m) => m.status === "operational" && m.instanceId !== hs.hub.fleet[0]!.instanceId)!.instanceId;
  let hub = upsertCircuitIntoHub(hs.hub, {
    circuitId: "lb_awake",
    circuitBoard: { ...createEmptyCircuitBoard(8, 8, "lb_awake"), outcome: "fully_awakened" } as never,
    outcome: "fully_awakened",
  } as never);
  for (const c of hub.circuits.filter((x) => x.equippedTo === wingId)) hub = shared.unequipCircuit(hub, c.circuitId).hub;
  const eq = shared.equipCircuit(hub, "lb_awake", wingId);
  assert.equal(eq.ok, true, `equip: ${eq.reason}`);
  hub = eq.hub;
  saveHubSaveToLocalStorage(hub, store);
  hs = createInitialHangar(store);
  const before = hubCircuitBonuses(hs.hub);
  assert.ok(before.durabilityBuffer >= 10 && before.repairDiscount > 0, "awakened circuit counts while its mech is home");
  assert.equal(lostMechCountLineJa(hs.hub), null, "0 lost → line hidden");

  const lostRet = applyExploreReturnToHub(hs.hub, {
    returnKind: "extract", mechWear: [], sortieId: "lb_bonus_lost",
    lostMechs: [{ instanceId: wingId, currentAmmo: 9, battery: { capacity: 300, activity: 200 }, circuitIds: ["lb_awake"], frontSeed: 77, cell: { sx: 1, sy: 2 } }],
  });
  assert.equal(lostRet.applied, true);
  saveHubSaveToLocalStorage(lostRet.hub, store);
  hs = createInitialHangar(store);
  assert.equal(hs.hub.circuits.find((c) => c.circuitId === "lb_awake")?.equippedTo, wingId, "still in HubSave on the lost mech");
  const lost = hubCircuitBonuses(hs.hub);
  const visibleOnly = shared.aggregateCircuitBonuses(shared.hubVisibleCircuits(hs.hub));
  assert.deepEqual(lost, visibleOnly, "bonuses = visible circuits only");
  assert.equal(lost.durabilityBuffer, before.durabilityBuffer - 10, "durability buffer drops by the lost circuit");
  assert.ok(lost.repairDiscount < before.repairDiscount, "repair discount drops");
  assert.ok(lost.craftMultiplier <= before.craftMultiplier, "craft multiplier never rises");
  assert.equal(lost.counts.fully_awakened, before.counts.fully_awakened - 1);
  const deploy = buildDeployUrl(hs);
  if (deploy) {
    const inbound = parseTradeToExploreSearch(new URL(deploy).search);
    assert.equal(inbound?.circuitBonuses?.durabilityBuffer ?? 0, lost.durabilityBuffer, "deploy link carries the reduced bonuses");
  }
  assert.equal(lostMechCountLineJa(hs.hub), "置き去り 1 機（Invade の盤に表示）");
  assert.equal(lostMechCountLineJa({ lostMechs: [{}, {}] as never }), "置き去り 2 機（Invade の盤に表示）");
  // 項目5-1b③ (W1 A・W6): wrecks are counted on their own line; left-behind counts only non-wreck rows
  assert.equal(wreckCountLineJa(hs.hub), null, "no wreck → line hidden");
  assert.equal(wreckCountLineJa({ lostMechs: [] }), null);
  {
    const mixed = { lostMechs: [{}, { kind: "left_behind" }, { kind: "wreck" }, { kind: "wreck" }, { kind: "wreck" }] as never };
    assert.equal(lostMechCountLineJa(mixed), "置き去り 2 機（Invade の盤に表示）");
    assert.equal(wreckCountLineJa(mixed), "残骸 3 機（Invade の盤に表示）");
    const onlyWrecks = { lostMechs: [{ kind: "wreck" }] as never };
    assert.equal(lostMechCountLineJa(onlyWrecks), null, "only wrecks → left-behind line hidden");
    assert.equal(wreckCountLineJa(onlyWrecks), "残骸 1 機（Invade の盤に表示）");
  }
  {
    const { readFileSync } = await import("node:fs");
    const mainSrc = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const i = mainSrc.indexOf("${deployList}");
    assert.ok(i > 0 && mainSrc.indexOf("lostLine ?", i) > i && mainSrc.indexOf("lostLine ?", i) < mainSrc.indexOf("摩耗 / 修理", i), "line under the sortie mech list");
    const w = mainSrc.indexOf("wreckLine ?", i);
    assert.ok(w > mainSrc.indexOf("lostLine ?", i) && w < mainSrc.indexOf("摩耗 / 修理", i), "wreck line right under the left-behind line");
  }

  // recovered → counts again
  const rec = applyExploreReturnToHub(hs.hub, {
    returnKind: "extract", mechWear: [], sortieId: "lb_bonus_recover", recoveredLostMechInstanceIds: [wingId],
  });
  assert.equal(rec.applied, true);
  saveHubSaveToLocalStorage(rec.hub, store);
  hs = createInitialHangar(store);
  assert.deepEqual(hubCircuitBonuses(hs.hub), before, "recovered → bonuses back");
  assert.equal(lostMechCountLineJa(hs.hub), null, "recovered → line hidden");
  console.log("trade lost-mech circuits excluded from bonuses + count line ok");
}

// U14 (2026-10-07 神宮): selling an equipped circuit unequips first (slot empty),
// same price as warehouse, perfectMaxSize unchanged, bonuses drop like a warehouse
// sale; lost-mech still refused; confirm + list wording in main.ts.
{
  const shared = await import("@estg/shared");
  const store = memoryStorage();
  let hs = loadPlaytestSeed(createInitialHangar(store), { storage: store, injectRate: 0, rng: () => 0 });
  const mechId = hs.hub.fleet.find((m) => m.status === "operational")!.instanceId;
  // awake circuit on the mech (counts toward bonuses)
  let hub = upsertCircuitIntoHub(hs.hub, {
    circuitId: "u14_awake",
    circuitBoard: { ...createEmptyCircuitBoard(8, 8, "u14_awake"), outcome: "fully_awakened" } as never,
    outcome: "fully_awakened",
  } as never);
  const eq = shared.equipCircuit(hub, "u14_awake", mechId);
  assert.equal(eq.ok, true, `equip: ${eq.reason}`);
  hub = eq.hub;
  // also a warehouse twin with the same board (same effect) for price comparison
  hub = upsertCircuitIntoHub(hub, {
    circuitId: "u14_stash",
    circuitBoard: { ...createEmptyCircuitBoard(8, 8, "u14_stash"), outcome: "fully_awakened" } as never,
    outcome: "fully_awakened",
  } as never);
  assert.equal(hub.circuits.find((c) => c.circuitId === "u14_stash")!.equippedTo, null);
  saveHubSaveToLocalStorage(hub, store);
  hs = createInitialHangar(store);
  const equipped = hs.hub.circuits.find((c) => c.circuitId === "u14_awake")!;
  assert.equal(equipped.equippedTo, mechId);
  const perfectBefore = hs.hub.perfectMaxSize;
  const bonusesBefore = hubCircuitBonuses(hs.hub);
  assert.ok(bonusesBefore.durabilityBuffer >= 10, "awakened circuit counts while equipped");

  // same price whether equipped or in the warehouse
  const sideEq = circuitSellPerfectSide(equipped);
  const sideSt = circuitSellPerfectSide(hs.hub.circuits.find((c) => c.circuitId === "u14_stash")!);
  let effectEq = 0;
  try { effectEq = computeCircuitEffectForBoard(equipped.circuitBoard, { perfect: equipped.circuitBoard.perfect ?? equipped.locked }).effect; } catch { effectEq = 0; }
  let effectSt = 0;
  const stash = hs.hub.circuits.find((c) => c.circuitId === "u14_stash")!;
  try { effectSt = computeCircuitEffectForBoard(stash.circuitBoard, { perfect: stash.circuitBoard.perfect ?? stash.locked }).effect; } catch { effectSt = 0; }
  // boards differ, so compare the formula path: equipped sell uses the same helpers as warehouse
  const priceEq = circuitSellPriceCredits(effectEq, { perfectSide: sideEq });
  const creditsBefore = hs.hub.credits;
  const soldEq = sellCircuit(hs, "u14_awake");
  assert.ok(soldEq.notice.startsWith("回路売却"), soldEq.notice);
  assert.ok(!soldEq.notice.includes("から外した"), "notice has no unequip suffix");
  assert.equal(soldEq.hub.credits, creditsBefore + priceEq, "credits += equipped sell price");
  assert.equal(soldEq.hub.circuits.some((c) => c.circuitId === "u14_awake"), false, "record removed");
  assert.equal(
    soldEq.hub.circuits.filter((c) => c.equippedTo === mechId).length,
    0,
    "mech slot empty after sale",
  );
  assert.equal(soldEq.hub.perfectMaxSize, perfectBefore, "perfectMaxSize not lowered");
  const bonusesAfter = hubCircuitBonuses(soldEq.hub);
  assert.equal(bonusesAfter.durabilityBuffer, bonusesBefore.durabilityBuffer - 10, "bonus drops like warehouse sale");
  assert.ok(bonusesAfter.repairDiscount < bonusesBefore.repairDiscount);

  // warehouse twin still sells at its own formula price (no equip surcharge path)
  const priceSt = circuitSellPriceCredits(effectSt, { perfectSide: sideSt });
  const soldSt = sellCircuit(soldEq, "u14_stash");
  assert.equal(soldSt.hub.credits, soldEq.hub.credits + priceSt);
  assert.ok(soldSt.notice.startsWith("回路売却"));

  // lost-mech circuit still refused
  {
    let h2 = loadPlaytestSeed(createInitialHangar(store), { storage: store, injectRate: 0, rng: () => 0 }).hub;
    const wing = h2.fleet.find((m) => m.status === "operational" && m.instanceId !== h2.fleet[0]!.instanceId)!.instanceId;
    h2 = upsertCircuitIntoHub(h2, {
      circuitId: "u14_lost",
      circuitBoard: createEmptyCircuitBoard(2, 2, "u14_lost") as never,
      outcome: "offline",
    } as never);
    const e2 = shared.equipCircuit(h2, "u14_lost", wing);
    assert.equal(e2.ok, true);
    const lost = applyExploreReturnToHub(e2.hub, {
      returnKind: "extract", mechWear: [], sortieId: "u14_lost_sortie",
      lostMechs: [{ instanceId: wing, currentAmmo: 1, battery: { capacity: 300, activity: 1 }, circuitIds: ["u14_lost"], frontSeed: 1, cell: { sx: 0, sy: 0 } }],
    });
    assert.equal(lost.applied, true);
    saveHubSaveToLocalStorage(lost.hub, store);
    const hsLost = createInitialHangar(store);
    const refused = sellCircuit(hsLost, "u14_lost");
    assert.equal(refused.notice, "回路なし");
    assert.equal(refused.hub, hsLost.hub);
  }

  // source: confirm unequip line + list 「装備:」 wording
  {
    const { readFileSync } = await import("node:fs");
    const mainSrc = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    assert.ok(mainSrc.includes("装備: ${equippedTo} から外して売却します"), "confirm unequip line");
    assert.ok(mainSrc.includes("装備: ${c.equippedTo}"), "list shows 装備: <id>");
    assert.ok(mainSrc.includes("data-equipped-to="), "sell button carries equippedTo");
    assert.ok(mainSrc.includes("売却 仮"), "button keeps 売却 仮 wording via price helper path");
  }
  console.log("trade U14 sell equipped circuit ok");
}

// 2026-10-07 神宮: 「探索帰還」 summaries drop the English 「EXTRACT」 and say
// 「撤退」 (not 「中断」) for abort. Display only — returnKind values are unchanged.
// resourceHistory parses hangar log lines by prefix (/^帰還ウェア/); those lines
// (and their returnKind words) are unchanged, so old saved lines still parse and
// so do lines written after this change.
{
  assert.equal(exploreReturnHeadJa("extract"), "探索帰還");
  assert.equal(exploreReturnHeadJa("abort"), "探索帰還 撤退");
  assert.equal(exploreReturnHeadJa("fail"), "探索帰還 失敗");

  const oldSavedLines = [
    "帰還ウェア extract ×2 · e1 70→60(ok)",
    "帰還ウェア abort ×1 · e1 60→40(needs_repair)",
    "帰還ウェア fail ×3",
  ];
  for (const line of oldSavedLines) {
    const e = parseResourceHistoryLine(line);
    assert.ok(e, `old saved line still parses: ${line}`);
    assert.equal(e!.source, "explore");
    assert.equal(e!.title, "探索帰還（摩耗）");
  }
  assert.equal(resourceHistoryFromLog(["デモ初期化", ...oldSavedLines]).length, 3, "old lines in a log history");

  // New wording end to end: summary + log line written now still parse / show no EXTRACT・中断.
  for (const kind of ["extract", "abort", "fail"] as const) {
    const base = loadPlaytestSeed(resetHangar());
    const target = base.hub.fleet.find((m) => m.status === "operational")!;
    const search = new URL(
      buildExploreToHubWearUrl(
        toExploreToHubWearPayload(kind, [{ instanceId: target.instanceId, durabilityAfter: Math.max(0, target.durability - 1) }]),
      ),
    ).search;
    const got = ingestLocationSearch(base, search).state;
    const summary = got.lastExploreReturn!.summaryJa;
    assert.ok(summary.startsWith(exploreReturnHeadJa(kind) + " · "), `summary head (${kind}): ${summary}`);
    assert.ok(!summary.includes("EXTRACT") && !summary.includes("中断"), `no EXTRACT / 中断 (${kind}): ${summary}`);
    const wearLine = got.log.find((l) => l.startsWith("帰還ウェア"));
    assert.ok(wearLine && parseResourceHistoryLine(wearLine)?.source === "explore", `new log line parses (${kind})`);
    const sim = simulateReturn(base, kind);
    assert.equal(sim.lastExploreReturn!.summaryJa.split(" · ")[0], exploreReturnHeadJa(kind), `sim summary head (${kind})`);
  }
  console.log("trade explore return wording + old saved log lines ok");
}

{
  const store = memoryStorage();
  const state = createInitialHangar();
  const before = state.hub.unopenedContainers ?? 0;
  const deposited = ingestLocationSearch(state, "?depositUnopenedContainers=3", store);
  assert.equal(deposited.state.hub.unopenedContainers, before + 3);
  assert.equal(isSortieDoneMark(store), true);
  assert.deepEqual(JSON.parse(store.getItem(SORTIE_CHECKPOINT_KEY)!), { v: 1, kind: "done" });

  const refineStore = memoryStorage();
  const refineStart = createInitialHangar();
  const refined = ingestLocationSearch(
    refineStart,
    "?importMaterials=4&craftMultiplier=1",
    refineStore,
  );
  // old URL: importMaterials alone grants nothing and does not mark done
  assert.equal("materials" in refined.state.hub, false);
  assert.deepEqual(refined.state.hub.inventory, refineStart.hub.inventory);
  assert.equal(isSortieDoneMark(refineStore), false);

  const yieldStore = memoryStorage();
  const yieldStart = createInitialHangar();
  const yielded = ingestLocationSearch(
    yieldStart,
    "?yieldBag=ammo:2&craftMultiplier=1",
    yieldStore,
  );
  assert.equal(yielded.state.hub.inventory.ammo ?? 0, (yieldStart.hub.inventory.ammo ?? 0) + 2);
  assert.equal(isSortieDoneMark(yieldStore), true);

  const failStore = memoryStorage();
  const base = createInitialHangar();
  saveHubSaveToLocalStorage(base.hub, failStore);
  const origSet = failStore.setItem.bind(failStore);
  failStore.setItem = (key: string, value: string) => {
    if (key === HUB_SAVE_STORAGE_KEY) throw new Error("write_refused");
    origSet(key, value);
  };
  ingestLocationSearch(base, "?depositUnopenedContainers=2&importMaterials=3&yieldBag=ammo:1", failStore);
  assert.equal(isSortieDoneMark(failStore), false);
  assert.equal(readSortieCheckpoint(failStore).status, "absent");

  const zeroStore = memoryStorage();
  ingestLocationSearch(createInitialHangar(), "?importMaterials=0&craftMultiplier=1", zeroStore);
  assert.equal(isSortieDoneMark(zeroStore), false);

  const clearStore = memoryStorage();
  assert.equal(writeSortieDoneMark(clearStore), true);
  assert.equal(onHangarExploreLink("link-restore", clearStore), false);
  assert.equal(isSortieDoneMark(clearStore), true);
  assert.equal(onHangarExploreLink("link-deploy", clearStore), true);
  assert.equal(readSortieCheckpoint(clearStore).status, "absent");

  const keepStore = memoryStorage();
  assert.equal(writeSortieDoneMark(keepStore), true);
  const invadeUrl = buildInvadeToTradeUrl({
    sectorX: 1,
    sectorY: 2,
    density: 0.2,
    intelFlags: ["allDestroyed"],
  });
  ingestLocationSearch(createInitialHangar(), new URL(invadeUrl).search, keepStore);
  assert.equal(isSortieDoneMark(keepStore), true, "other entrances do not clear the mark");
  console.log("trade sortie done mark ok");
}


// #266 お金まわり（2026-10-12 神宮の Go）: 新品購入・新規機体作成・残骸復活・通常修理。
{
  const st = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = st;
  // an old save: a hangar wreck (destroyed, circuit on it), a worn mech, a field wreck row, circuits
  const wreck = { ...createMechForMoney("mech_gen1", { instanceId: "wreck-hangar", durability: 0, currentAmmo: 11 }), battery: { capacity: 300, activity: 123 } };
  const worn = createMechForMoney("mech_gen2", { instanceId: "worn", durability: 30, currentAmmo: 20 });
  const okMech = createMechForMoney("mech_gen1", { instanceId: "full", currentAmmo: 28 });
  const four = { ...makeRestoredTrueOneByOne("four-on-wreck"), equippedTo: "wreck-hangar" };
  const raw = {
    v: 3,
    savedAt: "2026-10-10T00:00:00.000Z",
    hub: {
      ...INITIAL_HUB,
      credits: 0,
      fleet: [okMech, worn, wreck],
      circuits: [four],
      inventory: { ammo: 7 },
      ammoBatteryRepaired: true, // M6 already done (else the one-time grant tops the wreck up first)
      lostMechs: [{ instanceId: "field-wreck", kind: "wreck", catalogId: "mech_gen1", durability: 0, durabilityMax: 100, status: "destroyed", currentAmmo: 3, battery: { capacity: 300, activity: 300 }, circuitIds: [], frontSeed: 1, cell: { sx: 0, sy: 0 }, lostAt: "2026-10-10T00:00:00.000Z" }],
    },
  };
  st.setItem("wreckline.hubSave.v3", JSON.stringify(raw));
  st.setItem(SORTIE_CHECKPOINT_KEY, JSON.stringify({ v: 1, kind: "sortie", savedAt: "2026-10-10T00:00:00.000Z", body: { phase: "sortie" } }));
  const checkpointBefore = st.getItem(SORTIE_CHECKPOINT_KEY);
  let s0 = createInitialHangar(st);
  assert.equal(s0.hub.fleet.length, 3, "old save with wrecks / destroyed mechs / circuits loads");
  assert.equal(s0.hub.lostMechs.length, 1, "field wreck row kept");
  assert.equal(s0.hub.circuits.find((c) => c.circuitId === "four-on-wreck")?.equippedTo, "wreck-hangar");
  assert.equal(hangarEquippedCircuits(s0.hub).some((c) => c.circuitId === "four-on-wreck"), false, "Q4: a wreck's circuit does not count");
  const total = (h: typeof s0.hub) => (h.inventory.ammo ?? 0) + h.fleet.reduce((n, m) => n + (m.currentAmmo ?? 0), 0);
  const ammoTotal0 = total(s0.hub);

  // labels exactly as #266
  assert.equal(BUY_MECH_LABEL_JA, "新品購入 2000c");
  assert.equal(createMechLabelJa(), "新規機体作成 装甲パーツ300 と 500c");
  const w0 = s0.hub.fleet.find((m) => m.instanceId === "wreck-hangar")!;
  assert.equal(reviveMechLabelJa(w0), "残骸復活 装甲パーツ200 と 500c");
  assert.equal(repairMechLabelJa(s0.hub.fleet.find((m) => m.instanceId === "worn")!), "通常修理 装甲パーツ70");
  assert.equal(reviveMechCost(s0.hub.fleet.find((m) => m.instanceId === "worn")!), null, "only wrecks revive");

  // shortfall notices (nothing changes)
  const r0 = reviveWreck(s0, "wreck-hangar");
  assert.equal(r0.notice, "装甲パーツとクレジットが足りない");
  assert.deepEqual(r0.hub, s0.hub);
  s0 = { ...s0, hub: { ...s0.hub, credits: 500 } };
  assert.equal(reviveWreck(s0, "wreck-hangar").notice, "装甲パーツが足りない");
  s0 = { ...s0, hub: { ...s0.hub, credits: 499, inventory: { ...s0.hub.inventory, armor: 200 } } };
  assert.equal(reviveWreck(s0, "wreck-hangar").notice, "クレジットが足りない");
  assert.equal(moneyShortfallJa(s0.hub, { credits: 0, armor: 0 }), null);

  // revive: circuits stay and count again, ammo / battery / ids kept, full durability
  s0 = { ...s0, hub: { ...s0.hub, credits: 500 } };
  let s1 = reviveWreck(s0, "wreck-hangar");
  assert.equal(s1.notice, "残骸復活 装甲パーツ200 と 500c");
  assert.equal(s1.log[0], "残骸復活 装甲パーツ200 と 500c");
  const rv = s1.hub.fleet.find((m) => m.instanceId === "wreck-hangar")!;
  assert.equal(rv.durability, 100);
  assert.equal(rv.status, "operational");
  assert.equal(rv.catalogId, "mech_gen1");
  assert.equal(rv.currentAmmo, 11, "carried ammo unchanged (M3 loads it before the sortie)");
  assert.deepEqual(rv.battery, { capacity: 300, activity: 123 });
  assert.equal(s1.hub.circuits.find((c) => c.circuitId === "four-on-wreck")?.equippedTo, "wreck-hangar", "reviving does not lose circuits");
  assert.equal(hangarEquippedCircuits(s1.hub).some((c) => c.circuitId === "four-on-wreck"), true, "Q4: counts again after revival");
  assert.equal(s1.hub.credits, 0);
  assert.equal(s1.hub.inventory.armor, undefined);
  assert.equal(total(s1.hub), ammoTotal0, "ammo + storage unchanged by revival");
  // a second press (double-click) and a reload never pay twice
  const twice = reviveWreck({ ...s1, hub: { ...s1.hub, credits: 9999, inventory: { ...s1.hub.inventory, armor: 999 } } }, "wreck-hangar");
  assert.equal(twice.notice, "機体なし");
  assert.equal(twice.hub.credits, 9999);
  const reloaded = createInitialHangar(st);
  assert.equal(reloaded.hub.credits, 0, "reload: saved once, no second charge");
  assert.equal(reloaded.hub.fleet.find((m) => m.instanceId === "wreck-hangar")!.durability, 100);
  assert.equal(reloaded.hub.circuits.find((c) => c.circuitId === "four-on-wreck")?.equippedTo, "wreck-hangar");

  // normal repair: armor = missing durability only; no credits / materials; full mech has none
  s1 = { ...reloaded, hub: { ...reloaded.hub, credits: 3, materials: 9, inventory: { ...reloaded.hub.inventory, armor: 69 } } };
  assert.equal(repairMech(s1, "worn").notice, "装甲パーツが足りない");
  s1 = { ...s1, hub: { ...s1.hub, inventory: { ...s1.hub.inventory, armor: 75 } } };
  const s2 = repairMech(s1, "worn");
  assert.equal(s2.notice, "通常修理 装甲パーツ70");
  const rp = s2.hub.fleet.find((m) => m.instanceId === "worn")!;
  assert.equal(rp.durability, rp.durabilityMax);
  assert.equal(rp.currentAmmo, 20);
  assert.equal(s2.hub.credits, 3);
  assert.equal("materials" in s2.hub, false);
  assert.equal(s2.hub.inventory.armor, 5);
  assert.equal(repairMech(s2, "worn").notice, "機体なし", "second press: nothing to repair");
  assert.equal(repairMech(s2, "worn").hub.inventory.armor, 5);
  assert.equal(repairMech(s2, "full").notice, "機体なし", "full durability: no repair");
  assert.equal(total(s2.hub), ammoTotal0, "ammo + storage unchanged by repair");

  // buy new / create new: both offered, same mech_gen1, never chosen automatically
  let s3 = { ...s2, hub: { ...s2.hub, credits: 1999, inventory: { ...s2.hub.inventory, armor: 300 } } };
  assert.equal(buyNewMech(s3).notice, "クレジットが足りない");
  assert.equal(buyNewMech(s3).hub.fleet.length, 3);
  assert.equal(createNewMech({ ...s3, hub: { ...s3.hub, credits: 499 } }).notice, "クレジットが足りない");
  assert.equal(createNewMech({ ...s3, hub: { ...s3.hub, inventory: { armor: 299 } } }).notice, "装甲パーツが足りない");
  assert.equal(createNewMech({ ...s3, hub: { ...s3.hub, credits: 0, inventory: {} } }).notice, "装甲パーツとクレジットが足りない");
  s3 = { ...s3, hub: { ...s3.hub, credits: 2500 } };
  const bought = buyNewMech(s3);
  assert.equal(bought.notice, "新品購入 2000c");
  assert.equal(bought.hub.credits, 500);
  assert.equal(bought.hub.inventory.armor, 300, "buying never touches armor parts");
  assert.equal(bought.hub.fleet.length, 4);
  assert.equal(bought.hub.fleet.at(-1)!.catalogId, "mech_gen1");
  const made = createNewMech(bought);
  assert.equal(made.notice, "新規機体作成 装甲パーツ300 と 500c");
  assert.equal(made.hub.credits, 0);
  assert.equal(made.hub.inventory.armor, undefined);
  assert.equal(made.hub.fleet.length, 5);
  assert.equal(made.hub.fleet.at(-1)!.catalogId, "mech_gen1");
  assert.equal(made.hub.fleet.at(-1)!.status, "operational");
  assert.equal(createInitialHangar(st).hub.fleet.length, 5, "persisted");
  assert.equal(createInitialHangar(st).hub.credits, 0, "reload does not charge again");

  // #270 air-support recovery (addDestroyedGen1) → the same hangar wreck → revivable
  let air = { ...made, hub: addDestroyedGen1(made.hub) };
  const airWreck = air.hub.fleet.at(-1)!;
  assert.equal(airWreck.status, "destroyed");
  air = { ...air, hub: { ...air.hub, credits: 500, inventory: { ...air.hub.inventory, armor: 200 } } };
  const airRevived = reviveWreck(air, airWreck.instanceId);
  assert.equal(airRevived.notice, "残骸復活 装甲パーツ200 と 500c");
  assert.equal(airRevived.hub.fleet.find((m) => m.instanceId === airWreck.instanceId)!.status, "operational");

  // field wrecks (lostMechs) are not revived from the hangar
  assert.equal(reviveWreck(airRevived, "field-wreck").notice, "機体なし");
  assert.equal(airRevived.hub.lostMechs.some((l) => l.instanceId === "field-wreck"), true);
  // the 5-3 checkpoint key is never touched by the money actions
  assert.equal(st.getItem(SORTIE_CHECKPOINT_KEY), checkpointBefore);
  assert.equal(readSortieCheckpoint(st).status, "ok");
  console.log("trade #266 money: buy / create / revive / repair ok");
}


// fix/hangar-money-followups（2026-10-12 神宮 E1〜E3）: 購入・作成の弾 0、所持欄の在庫数。
{
  const st = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = st;
  // an old v3 save: typed ammoLoad (old), inventory with ammo / armor / power, a mech without currentAmmo
  const noAmmo = createMechForMoney("mech_gen1", { instanceId: "old-no-ammo" });
  delete (noAmmo as { currentAmmo?: number }).currentAmmo;
  const raw = {
    v: 3,
    savedAt: "2026-10-01T00:00:00.000Z",
    hub: {
      ...INITIAL_HUB,
      credits: 5000,
      materials: 42,
      fleet: [noAmmo],
      ammoLoad: { ammo_standard: 40, ammo_ap: 10, ammo_hp: 5 },
      inventory: { ammo: 30, armor: 400, power: 9, junk: 2 },
    },
  };
  st.setItem("wreckline.hubSave.v3", JSON.stringify(raw));
  const s0 = createInitialHangar(st);
  assert.equal(s0.hub.fleet.length, 1, "old save loads");
  assert.equal(s0.hub.fleet[0]!.currentAmmo, 28, "A2 #1: an old mech without currentAmmo is full (not from stock)");
  assert.equal(s0.hub.inventory.ammo, 30, "A2 #1: the stock is not drawn for it");
  assert.equal("ammoLoad" in s0.hub, false, "fix/hub-save-legacy-retire: old ammoLoad read past (not converted)");
  assert.equal("materials" in s0.hub, false, "old materials read past");

  // holdings bar = the real stock (not ammoLoad 55, not a 4-resource sum)
  const bar = (h: typeof s0.hub) => Object.fromEntries(holdingPills(h).map((p) => [p.labelJa, p.value]));
  assert.deepEqual(bar(s0.hub), { Cr: 5000, 弾薬: 30, 装甲パーツ: 400, 電力パーツ: 9 });
  assert.deepEqual(holdingPills(s0.hub).map((p) => p.labelJa), ["Cr", "弾薬", "装甲パーツ", "電力パーツ"], "no 資材 in the bar");
  assert.deepEqual(bar({ ...s0.hub, inventory: {} }), { Cr: 5000, 弾薬: 0, 装甲パーツ: 0, 電力パーツ: 0 }, "empty stock reads 0");

  // E1 = B: bought / created mechs come with ammo 0; the ammo total does not grow
  const total = (h: typeof s0.hub) => (h.inventory.ammo ?? 0) + h.fleet.reduce((n, m) => n + (m.currentAmmo ?? 0), 0);
  const total0 = total(s0.hub);
  const bought = buyNewMech(s0);
  const boughtMech = bought.hub.fleet.at(-1)!;
  assert.equal(boughtMech.currentAmmo, 0, "E1: a bought mech has ammo 0");
  assert.equal(total(bought.hub), total0, "E1: buying does not add ammo");
  assert.equal(bar(bought.hub).Cr, 3000);
  const made = createNewMech(bought);
  const madeMech = made.hub.fleet.at(-1)!;
  assert.equal(madeMech.currentAmmo, 0, "E1: a created mech has ammo 0");
  assert.equal(total(made.hub), total0, "E1: creating does not add ammo");
  assert.equal(bar(made.hub).装甲パーツ, 100, "armor parts in the bar after create (400 − 300)");
  assert.equal(bar(made.hub).Cr, 2500);
  // reload: still 0 (M6 / the interim "unset = full" rule never refills an explicit 0)
  const reloaded = createInitialHangar(st);
  assert.equal(reloaded.hub.fleet.find((m) => m.instanceId === boughtMech.instanceId)!.currentAmmo, 0, "0 survives reload");
  assert.equal(reloaded.hub.fleet.find((m) => m.instanceId === madeMech.instanceId)!.currentAmmo, 0);
  assert.equal(total(reloaded.hub), total0);

  // M3: the sortie loads them from stock (30 → 28 + 2), M8 line for the short one
  const ids = [boughtMech.instanceId, madeMech.instanceId];
  const dep = markDeployed({ ...reloaded, selectedDeployIds: ids }, ids);
  assert.equal(dep.hub.fleet.find((m) => m.instanceId === boughtMech.instanceId)!.currentAmmo, 28, "M3: loaded before the sortie");
  assert.equal(dep.hub.fleet.find((m) => m.instanceId === madeMech.instanceId)!.currentAmmo, 2);
  assert.equal(dep.hub.inventory.ammo ?? 0, 0);
  assert.equal(bar(dep.hub).弾薬, 0, "the bar follows the loading");
  assert.equal(total(dep.hub), total0, "loading moves ammo, never makes it");
  assert.match(dep.log[0] ?? "", /弾薬が足りません：僚機A 2\/28/, "M8: the usual shortage line");
  assert.equal("ammoLoad" in dep.hub, false);

  // repair spends armor parts → the bar drops by the same amount
  const worn = { ...dep, hub: { ...dep.hub, fleet: dep.hub.fleet.map((m) => (m.instanceId === boughtMech.instanceId ? { ...m, durability: 70, status: "needs_repair" as const } : m)) } };
  const repaired = repairMech(worn, boughtMech.instanceId);
  assert.equal(bar(repaired.hub).装甲パーツ, 70);
  console.log("trade E1 bought mech ammo 0 / holdings bar real stock ok");
}

// 項目4-1 F1・F3（2026-10-12）: 出撃 URL の startingAmmo は倉庫の弾、デモ受領機は満タン。
{
  const st = memoryStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = st;
  const raw = {
    v: 3,
    savedAt: "2026-10-01T00:00:00.000Z",
    hub: {
      ...INITIAL_HUB,
      fleet: [createMechForMoney("mech_gen1", { instanceId: "only", currentAmmo: 5 })],
      ammoLoad: { ammo_standard: 40, ammo_ap: 10, ammo_hp: 5 },
      inventory: { ammo: 17 },
      ammoBatteryRepaired: true,
    },
  };
  st.setItem("wreckline.hubSave.v3", JSON.stringify(raw));
  const s0 = createInitialHangar(st);
  const url = new URL(buildDeployUrl({ ...s0, selectedDeployIds: ["only"] })!);
  assert.equal(url.searchParams.get("startingAmmo"), "17", "F1: startingAmmo = inventory.ammo (not ammoLoad 55)");
  assert.equal(new URL(buildInvadeUrl(s0)).searchParams.get("startingAmmo"), "17", "F1: the Invade link too");
  assert.equal("ammoLoad" in s0.hub, false, "ammoLoad read past");
  // F3: 「機体を受領」 → carried ammo at cap (attached, stock untouched), durability max, battery full
  const g = grantStarterFleet(s0);
  const added = g.hub.fleet.filter((m) => m.instanceId !== "only");
  assert.ok(added.length >= 1);
  for (const m of added) {
    assert.equal(m.currentAmmo, 28, "F3: ammo at its cap");
    assert.equal(m.durability, m.durabilityMax, "F3: durability max");
    assert.equal(m.battery.activity, m.battery.capacity, "F3: battery full");
    assert.equal(m.battery.capacity, 300);
  }
  assert.equal(g.hub.inventory.ammo, 17, "F3: not drawn from stock");
  assert.equal(g.hub.fleet.find((m) => m.instanceId === "only")!.currentAmmo, 5, "existing mechs untouched");
  console.log("trade 4-1 F1 startingAmmo / F3 demo mech full ok");
}
