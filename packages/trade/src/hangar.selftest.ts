import assert from "node:assert/strict";
import {
  buildResourceHistoryHtml,
  parseResourceHistoryLine,
  resourceHistoryFromLog,
} from "./resourceHistory";
import {
  HUB_SAVE_STORAGE_KEY,
  MECH_FLEET_RULES,
  buildExploreToHubWearUrl,
  buildInvadeToTradeUrl,
  buildRestoreToTradeUrl,
  createEmptyCircuitBoard,
  parseHubSave,
  deserializeHubSave,
  toExploreToHubWearPayload,
  computeCircuitEffectForBoard,
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
} from "./hangar";
import { PIECES_PER_CONTAINER } from "@estg/shared";

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


// Circuit sell: price = 30 + floor(effect)×3; inventory removal + credit
{
  assert.equal(CIRCUIT_SELL_BASE_CREDITS, 30);
  assert.equal(CIRCUIT_SELL_CREDITS_PER_EFFECT, 3);
  assert.equal(circuitSellPriceCredits(0), 30);
  assert.equal(circuitSellPriceCredits(1), 33);
  assert.equal(circuitSellPriceCredits(8), 54);
  assert.equal(circuitSellPriceCredits(8.9), 54);
  assert.equal(circuitSellPriceCredits(-2), 30);

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
  const price = circuitSellPriceCredits(br.effect);
  assert.equal(price, 54); // 30 + 8*3

  const creditsBefore = hs.hub.credits;
  const countBefore = hs.hub.circuits.length;
  hs = sellCircuit(hs, VERIFY_PERFECT_CIRCUIT_ID);
  assert.equal(
    hs.hub.circuits.some((c) => c.circuitId === VERIFY_PERFECT_CIRCUIT_ID),
    false,
  );
  assert.equal(hs.hub.circuits.length, countBefore - 1);
  assert.equal(hs.hub.credits, creditsBefore + price);
  assert.ok(hs.notice.includes("+54c") || hs.notice.includes("54"));
  assert.ok(hs.notice.includes("最低") && hs.notice.includes("出来栄え"));
  assert.ok(hs.log.some((l) => l.includes("回路売却") && l.includes("+54c")));

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

  // Effect 0: allow sell at +30c (最低額; clears inventory)
  hs = loadPlaytestSeed(hs, { storage: store, injectRate: 0, rng: () => 0 });
  const seedRec = hs.hub.circuits.find((c) => c.circuitId === SEED_CIRCUIT_ID);
  assert.ok(seedRec);
  const seedEffect = computeCircuitEffectForBoard(seedRec!.circuitBoard).effect;
  assert.equal(seedEffect, 0);
  assert.equal(circuitSellPriceCredits(seedEffect), 30);
  const c0 = hs.hub.credits;
  hs = sellCircuit(hs, SEED_CIRCUIT_ID);
  assert.equal(hs.hub.circuits.some((c) => c.circuitId === SEED_CIRCUIT_ID), false);
  assert.equal(hs.hub.credits, c0 + 30);
  assert.ok(hs.notice.includes("+30c"));
  assert.ok(hs.notice.includes("最低") && hs.notice.includes("出来栄え"));

  // Missing id
  const missing = sellCircuit(hs, "no_such_circuit");
  assert.equal(missing.notice, "回路なし");
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

console.log("trade hangar selftest: ok");
