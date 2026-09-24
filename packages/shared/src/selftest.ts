import assert from "node:assert/strict";
import {
  buildExploreToSortUrl,
  parseExploreToSortSearch,
  buildSortToTradeUrl,
  buildSortToTradeUrlFromResult,
  parseSortToTradeSearch,
  wingmanCountFromMechs,
  importedMaterialsFromResult,
  buildTradeToExploreUrl,
  parseTradeToExploreSearch,
  buildTradeToExplorePayloadFromFleet,
  buildExploreToHubWearUrl,
  parseExploreToHubWearSearch,
  toExploreToHubWearPayload,
  buildSortToTradePayloadFromResult,
  buildTradeToInvadeUrl,
  parseTradeToInvadeSearch,
  buildInvadeToTradeUrl,
  parseInvadeToTradeSearch,
  buildInvadeToExploreUrl,
  parseInvadeToExploreSearch,
  mergeInvadeSectorOntoExploreUrl,
  encodeEnemyCells,
  parseEnemyCells,
  buildTradeToRestoreUrl,
  parseTradeToRestoreSearch,
  buildRestoreToTradeUrl,
  parseRestoreToTradeSearch,
} from "./handoff";
import {
  resolveModuleBaseUrl,
  LOCAL_DEV_MODULE_URLS,
  MODULE_URLS,
  HANDOFF_QUERY_KEYS,
  UNOPENED_CONTAINER_PRICE_CREDITS,
} from "./constants";
import {
  createHubSave,
  parseHubSave,
  importMaterialsIntoHub,
  importYieldBagIntoHub,
  upsertCircuitIntoHub,
  normalizeCircuits,
  normalizeFrontProgress,
  setFrontProgressInHub,
  clearFrontProgressInHub,
  clearFrontProgressHitMine,
  addUnopenedContainers,
  spendUnopenedContainers,
  clampUnopenedContainers,
  INITIAL_HUB,
  HUB_LIMITS,
} from "./hub-save";
import {
  aggregateCircuitBonuses,
  applyDurabilityBufferToWear,
  applyRepairDiscountToCost,
  encodeCircuitBonusesCompact,
  parseCircuitBonusesCompact,
  CIRCUIT_OUTCOME_BONUS,
} from "./circuit-bonuses";
import {
  createExpeditionState,
  applyPuzzleResult,
  puzzleInputFromExpedition,
  createExploreSortieOutcome,
} from "./expedition";
import {
  createOwnedMech,
  wearAfterSortie,
  canDeploy,
  repairCost,
  applyRepair,
  scrapYield,
  applyScrap,
  countDeployable,
  MECH_FLEET_RULES,
  statusFromDurability,
  filterToDeployableIds,
  selectDeployableInstanceIds,
  buildWearReportsForSortie,
  applyWearReportsToFleet,
} from "./mech-fleet";
import {
  coarsenFix,
  isGeolocationSupported,
  toGeoFix,
  type GeoFix,
} from "./geolocation";

import {
  BASIC_MATERIAL_IDS,
  PART_IDS,
  yieldBagFromClearedCounts,
  yieldBagFromClearedWithMultiplier,
  mergeYieldBags,
  scaleYieldBag,
  encodeYieldBagCompact,
  parseYieldBagCompact,
  canAffordYieldCost,
  spendYieldBag,
  applyYieldBagToInventory,
  yieldBagFromTypedRepairCost,
  EXAMPLE_TYPED_REPAIR_COST,
  isBasicMaterialId,
  isPartId,
} from "./sort-yield";


const exploreUrl = buildExploreToSortUrl({
  salvagedContainers: 6,
  totalStockPieces: 150,
  isExtracted: true,
});
const exploreParsed = parseExploreToSortSearch(new URL(exploreUrl).search);
assert.equal(exploreParsed?.salvagedContainers, 6);
assert.equal(exploreParsed?.totalStockPieces, 150);
assert.equal(exploreParsed?.isExtracted, true);

const exploreCraftUrl = buildExploreToSortUrl({
  salvagedContainers: 2,
  totalStockPieces: 50,
  isExtracted: true,
  craftMultiplier: 1.1,
});
const exploreCraftParsed = parseExploreToSortSearch(new URL(exploreCraftUrl).search);
assert.ok(Math.abs((exploreCraftParsed?.craftMultiplier ?? 0) - 1.1) < 0.001);
assert.ok(new URL(exploreCraftUrl).searchParams.get("craftMultiplier")?.startsWith("1.100"));

const fromCircuit = parseExploreToSortSearch(
  "salvagedContainers=1&totalStockPieces=25&isExtracted=1&circuitBonuses=craft:1.050;dur:5",
);
assert.ok(Math.abs((fromCircuit?.craftMultiplier ?? 0) - 1.05) < 0.001);

const overrideWins = parseExploreToSortSearch(
  "salvagedContainers=1&totalStockPieces=25&isExtracted=1&craftMultiplier=1.200&circuitBonuses=craft:1.050",
);
assert.ok(Math.abs((overrideWins?.craftMultiplier ?? 0) - 1.2) < 0.001);

const tradeUrl = buildSortToTradeUrlFromResult({
  yieldFood: 10,
  yieldMaterial: 20,
  yieldEnergy: 5,
  craftMultiplier: 1.05,
});
const tradeParsed = parseSortToTradeSearch(new URL(tradeUrl).search);
assert.equal(tradeParsed?.importMaterials, Math.floor(35 * 1.05));

assert.equal(wingmanCountFromMechs(1), 0);
assert.equal(wingmanCountFromMechs(3), 2);

const hub = importMaterialsIntoHub(INITIAL_HUB, 80);
assert.equal(hub.materials, INITIAL_HUB.materials + 80);
const save = createHubSave(hub);
assert.equal(save.v, 2);
assert.equal(parseHubSave(save)?.hub.materials, hub.materials);

const state = applyPuzzleResult(
  createExpeditionState({
    salvagedContainers: 2,
    isExtracted: true,
    totalStockPieces: 50,
  }),
  {
    yieldFood: 1,
    yieldMaterial: 2,
    yieldEnergy: 3,
    scrapLossCount: 0,
    craftMultiplier: 1.1,
  },
);
assert.equal(state.yieldMaterial, 2);
assert.equal(puzzleInputFromExpedition(state).totalStockPieces, 50);
assert.equal(importedMaterialsFromResult(state), Math.floor(6 * 1.1));

console.log("shared selftest: ok");

assert.equal(isGeolocationSupported({ geolocation: undefined as never }), false);
assert.equal(
  isGeolocationSupported({
    geolocation: { getCurrentPosition() {}, watchPosition() {}, clearWatch() {} },
  }),
  true,
);

const fix: GeoFix = {
  latitude: 35.681236,
  longitude: 139.767125,
  accuracyMeters: 12,
  altitudeMeters: null,
  headingDegrees: null,
  speedMps: null,
  timestamp: Date.now(),
};
const coarse = coarsenFix(fix, 0.01);
assert.equal(Number(coarse.latitude.toFixed(2)), Number((Math.round(35.681236 / 0.01) * 0.01).toFixed(2)));

const fakePos = {
  coords: {
    latitude: 1,
    longitude: 2,
    accuracy: 5,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 123,
} as GeolocationPosition;
assert.equal(toGeoFix(fakePos).longitude, 2);

console.log("shared geolocation selftest: ok");

// --- mech fleet ---
const fresh = createOwnedMech("mech_gen1", { instanceId: "t1" });
assert.equal(fresh.status, "operational");
assert.equal(canDeploy(fresh), true);
assert.equal(statusFromDurability(41), "operational");
assert.equal(statusFromDurability(40), "needs_repair");
assert.equal(statusFromDurability(0), "destroyed");

let worn = wearAfterSortie(fresh, "extract");
assert.equal(worn.durability, 100 - MECH_FLEET_RULES.wearOnExtract);
assert.equal(worn.status, "operational");

worn = wearAfterSortie(
  createOwnedMech("mech_gen1", { instanceId: "t2", durability: 50 }),
  "fail",
);
assert.equal(worn.durability, 50 - MECH_FLEET_RULES.wearOnFail);
assert.equal(worn.status, "needs_repair");
assert.equal(canDeploy(worn), false);

const cost = repairCost(worn);
assert.deepEqual(cost, {
  credits: MECH_FLEET_RULES.repairCredits,
  materials: MECH_FLEET_RULES.repairMaterials,
});
const repaired = applyRepair(worn, { credits: 100, materials: 100 });
assert.ok(repaired);
assert.equal(repaired!.mech.status, "operational");
assert.equal(repaired!.mech.durability, repaired!.mech.durabilityMax);
assert.equal(
  repaired!.wallet.credits,
  100 - MECH_FLEET_RULES.repairCredits,
);

const wrecked = wearAfterSortie(
  createOwnedMech("mech_gen1", { instanceId: "t3", durability: 10 }),
  "fail",
);
assert.equal(wrecked.status, "destroyed");
assert.equal(repairCost(wrecked), null);
assert.equal(applyRepair(wrecked, { credits: 999, materials: 999 }), null);

const yieldOp = scrapYield(
  createOwnedMech("mech_gen1", { instanceId: "s1" }),
);
assert.deepEqual(yieldOp, MECH_FLEET_RULES.scrapByStatus.operational);

const yieldGen2 = scrapYield(
  createOwnedMech("mech_gen2", { instanceId: "s2", durability: 0 }),
);
assert.equal(
  yieldGen2.credits,
  MECH_FLEET_RULES.scrapByStatus.destroyed.credits +
    MECH_FLEET_RULES.gen2ScrapBonus.credits,
);

const fleet = [
  createOwnedMech("mech_gen1", { instanceId: "a" }),
  createOwnedMech("mech_gen1", {
    instanceId: "b",
    durability: 20,
  }),
];
assert.equal(countDeployable(fleet), 1);
const scrapped = applyScrap(fleet, "b", { credits: 0, materials: 0 });
assert.ok(scrapped);
assert.equal(scrapped!.fleet.length, 1);
assert.equal(scrapped!.fleet[0]!.instanceId, "a");
assert.equal(
  scrapped!.wallet.credits,
  MECH_FLEET_RULES.scrapByStatus.needs_repair.credits,
);

// v1 save migration
const legacy = parseHubSave({
  v: 1,
  savedAt: "2026-09-01T00:00:00.000Z",
  hub: {
    credits: 10,
    materials: 20,
    fleet: ["mech_gen1", "mech_gen2"],
    ammoLoad: { ammo_standard: 5, ammo_ap: 0, ammo_hp: 0 },
    importedMaterials: 0,
    selectedMechId: "mech_gen1",
    selectedAmmoId: "ammo_standard",
  },
});
assert.ok(legacy);
assert.equal(legacy!.v, 2);
assert.equal(legacy!.hub.fleet.length, 2);
assert.equal(legacy!.hub.fleet[0]!.catalogId, "mech_gen1");
assert.equal(legacy!.hub.fleet[0]!.status, "operational");
assert.ok(legacy!.hub.fleet[0]!.instanceId.startsWith("migrated_"));
assert.ok(legacy!.hub.fleet.length <= HUB_LIMITS.maxMechs);

console.log("shared mech-fleet selftest: ok");

// --- explore I/O v2 (deploy filter + wear return) ---
const fleetIo = [
  createOwnedMech("mech_gen1", { instanceId: "op1" }),
  createOwnedMech("mech_gen1", { instanceId: "rep1", durability: 20 }),
  createOwnedMech("mech_gen2", { instanceId: "dead1", durability: 0 }),
];
assert.equal(canDeploy(fleetIo[0]!), true);
assert.equal(canDeploy(fleetIo[1]!), false);
assert.equal(canDeploy(fleetIo[2]!), false);
assert.deepEqual(selectDeployableInstanceIds(fleetIo), ["op1"]);
assert.deepEqual(
  filterToDeployableIds(fleetIo, ["op1", "rep1", "dead1", "ghost"]),
  ["op1"],
);

const tte = buildTradeToExplorePayloadFromFleet(fleetIo, 42, [
  "op1",
  "rep1",
  "dead1",
]);
assert.deepEqual(tte.deployedInstanceIds, ["op1"]);
assert.equal(tte.deployableMechs, 1);
assert.equal(tte.startingAmmo, 42);

const tteUrl = buildTradeToExploreUrl(tte);
const tteParsed = parseTradeToExploreSearch(new URL(tteUrl).search);
assert.deepEqual(tteParsed?.deployedInstanceIds, ["op1"]);
assert.equal(tteParsed?.deployableMechs, 1);

// v1 count-only still parses
const v1Parsed = parseTradeToExploreSearch("deployableMechs=3&startingAmmo=10");
assert.equal(v1Parsed?.deployableMechs, 3);
assert.equal(v1Parsed?.deployedInstanceIds, undefined);

const wearReports = buildWearReportsForSortie(fleetIo, ["op1"], "extract");
assert.equal(wearReports.length, 1);
assert.equal(wearReports[0]!.instanceId, "op1");
assert.equal(
  wearReports[0]!.durabilityAfter,
  100 - MECH_FLEET_RULES.wearOnExtract,
);
assert.equal(wearReports[0]!.wearApplied, MECH_FLEET_RULES.wearOnExtract);

const wornFleet = applyWearReportsToFleet(fleetIo, wearReports);
assert.equal(wornFleet[0]!.durability, 100 - MECH_FLEET_RULES.wearOnExtract);
assert.equal(wornFleet[1]!.durability, 20); // untouched

const outcome = createExploreSortieOutcome({
  result: {
    carrierCapacity: 4,
    maxOperationTimeSec: 180,
    ammoStock: 42,
    isExtracted: true,
    salvagedContainers: 2,
    totalStockPieces: 50,
  },
  returnKind: "fail",
  fleet: [
    createOwnedMech("mech_gen1", { instanceId: "x1", durability: 50 }),
  ],
  deployedInstanceIds: ["x1"],
});
assert.equal(outcome.salvagedContainers, 2);
assert.equal(outcome.returnKind, "fail");
assert.equal(outcome.mechWear[0]!.statusAfter, "needs_repair");

const hubWearUrl = buildExploreToHubWearUrl(
  toExploreToHubWearPayload(outcome.returnKind, outcome.mechWear),
);
const hubWearParsed = parseExploreToHubWearSearch(new URL(hubWearUrl).search);
assert.equal(hubWearParsed?.returnKind, "fail");
assert.equal(hubWearParsed?.mechWear[0]!.instanceId, "x1");
assert.equal(
  hubWearParsed?.mechWear[0]!.durabilityAfter,
  outcome.mechWear[0]!.durabilityAfter,
);


// durability snapshot on trade→explore (multi-sortie accuracy)
const midFleet = [
  createOwnedMech("mech_gen1", { instanceId: "m1", durability: 85 }),
  createOwnedMech("mech_gen2", { instanceId: "m2", durability: 70 }),
];
const tteMid = buildTradeToExplorePayloadFromFleet(midFleet, 10, ["m1", "m2"]);
assert.deepEqual(tteMid.deployedDurability, [
  { instanceId: "m1", durability: 85 },
  { instanceId: "m2", durability: 70 },
]);
const tteMidUrl = buildTradeToExploreUrl(tteMid);
assert.ok(tteMidUrl.includes("mechDurability="));
const tteMidParsed = parseTradeToExploreSearch(new URL(tteMidUrl).search);
assert.deepEqual(tteMidParsed?.deployedDurability, [
  { instanceId: "m1", durability: 85 },
  { instanceId: "m2", durability: 70 },
]);
assert.equal(resolveModuleBaseUrl("explore", { hostname: "localhost" }), LOCAL_DEV_MODULE_URLS.explore);
assert.equal(resolveModuleBaseUrl("trade", { hostname: "example.com" }), MODULE_URLS.trade);
assert.equal(resolveModuleBaseUrl("invade", { hostname: "localhost" }), LOCAL_DEV_MODULE_URLS.invade);
assert.equal(resolveModuleBaseUrl("restore", { hostname: "example.com" }), MODULE_URLS.restore);

console.log("shared explore-io selftest: ok");

// --- sort yield v2 ---
assert.equal(BASIC_MATERIAL_IDS.length, 5);
assert.equal(PART_IDS.length, 5);
assert.equal(isBasicMaterialId("mat_scrap"), true);
assert.equal(isPartId("part_actuator"), true);
assert.equal(isPartId("mat_scrap"), false);

const bag = yieldBagFromClearedCounts({
  food: 10,
  material: 20,
  energy: 12,
});
assert.equal(bag.mat_ration, 10);
assert.equal(bag.mat_scrap, 12); // floor(20*0.6)
assert.equal(bag.mat_polymer, 8); // floor(20*0.4)
assert.equal(bag.part_actuator, 2); // floor(20/10)
assert.equal(bag.part_armor_plate, 1); // floor(20/15)
assert.equal(bag.part_hydraulic_line, 1); // floor(20/20)
assert.equal(bag.mat_circuit, 6); // floor(12*0.5)
assert.equal(bag.mat_coolant, 6);
assert.equal(bag.part_power_cell, 1); // floor(12/12)
assert.equal(bag.part_sensor_array, undefined); // floor(12/18)=0

const scaled = yieldBagFromClearedWithMultiplier(
  { food: 10, material: 0, energy: 0 },
  1.05,
);
assert.equal(scaled.mat_ration, 10); // floor(10*1.05)=10

const merged = mergeYieldBags({ mat_scrap: 3 }, { mat_scrap: 2, part_actuator: 1 });
assert.equal(merged.mat_scrap, 5);
assert.equal(merged.part_actuator, 1);

assert.equal(scaleYieldBag({ mat_scrap: 10 }, 0).mat_scrap, undefined);

const compact = encodeYieldBagCompact(bag);
const roundTrip = parseYieldBagCompact(compact);
assert.equal(roundTrip.mat_ration, bag.mat_ration);
assert.equal(roundTrip.part_actuator, bag.part_actuator);
assert.deepEqual(parseYieldBagCompact("nope:1;mat_scrap:4;ghost:9").mat_scrap, 4);

const inv = applyYieldBagToInventory(bag, {
  mat_scrap: 20,
  mat_polymer: 10,
  part_actuator: 1,
});
const costBag = yieldBagFromTypedRepairCost(EXAMPLE_TYPED_REPAIR_COST);
assert.equal(canAffordYieldCost(inv, costBag), true);
assert.equal(canAffordYieldCost(bag, costBag), false); // bag alone lacks scrap/polymer
const spent = spendYieldBag(inv, costBag);
assert.ok(spent);
assert.equal(spent!.mat_scrap, (bag.mat_scrap ?? 0)); // +20 then -20
assert.equal(spent!.mat_polymer, (bag.mat_polymer ?? 0)); // +10 then -10
assert.equal(spent!.part_actuator, (bag.part_actuator ?? 0)); // +1 then -1
assert.equal(
  spendYieldBag({ mat_scrap: 1 }, { mat_scrap: 5 }),
  null,
);

const payload = buildSortToTradePayloadFromResult({
  yieldFood: 10,
  yieldMaterial: 20,
  yieldEnergy: 12,
  craftMultiplier: 1,
});
assert.equal(payload.importMaterials, 42);
assert.ok(payload.yieldBag);
assert.equal(payload.yieldBag!.mat_ration, 10);

const yieldUrl = buildSortToTradeUrlFromResult({
  yieldFood: 10,
  yieldMaterial: 20,
  yieldEnergy: 12,
  craftMultiplier: 1,
});
const yieldParsed = parseSortToTradeSearch(new URL(yieldUrl).search);
assert.equal(yieldParsed?.importMaterials, 42);
assert.equal(yieldParsed?.yieldBag?.mat_scrap, 12);
assert.equal(yieldParsed?.yieldBag?.part_actuator, 2);

// v1 URL without yieldBag still parses
const v1Trade = parseSortToTradeSearch("importMaterials=9&craftMultiplier=1.000");
assert.equal(v1Trade?.importMaterials, 9);
assert.equal(v1Trade?.yieldBag, undefined);

// explicit yieldBag on result wins over derivation
const explicit = buildSortToTradePayloadFromResult({
  yieldFood: 1,
  yieldMaterial: 1,
  yieldEnergy: 1,
  craftMultiplier: 1,
  yieldBag: { mat_scrap: 99 },
});
assert.equal(explicit.yieldBag?.mat_scrap, 99);

console.log("shared sort-yield selftest: ok");

// --- hub inventory (YieldBag) ---
assert.deepEqual(INITIAL_HUB.inventory, {});
const withBag = importYieldBagIntoHub(INITIAL_HUB, {
  mat_scrap: 5,
  part_actuator: 1,
});
assert.equal(withBag.inventory.mat_scrap, 5);
assert.equal(withBag.inventory.part_actuator, 1);
const mergedBag = importYieldBagIntoHub(withBag, { mat_scrap: 3 });
assert.equal(mergedBag.inventory.mat_scrap, 8);
const saveInv = createHubSave(mergedBag);
assert.equal(saveInv.hub.inventory.mat_scrap, 8);
const parsedInv = parseHubSave(saveInv);
assert.equal(parsedInv?.hub.inventory.mat_scrap, 8);
// missing inventory on legacy blob → empty
const noInv = parseHubSave({
  v: 2,
  savedAt: "2026-09-01T00:00:00.000Z",
  hub: {
    credits: 1,
    materials: 2,
    fleet: [],
    ammoLoad: { ammo_standard: 0, ammo_ap: 0, ammo_hp: 0 },
    importedMaterials: 0,
    selectedMechId: "mech_gen1",
    selectedAmmoId: "ammo_standard",
  },
});
assert.ok(noInv);
assert.deepEqual(noInv!.hub.inventory, {});
console.log("shared hub-inventory selftest: ok");

import {
  chebyshevDistance,
  sectorDensityAt,
  sectorDensityFromChebyshev,
  SECTOR_WALL_DISTANCE,
  SECTOR_FRONT_DISTANCE,
} from "./sector-density";
import {
  createEmptyCircuitBoard,
  decodeEdgeState,
  encodeEdgeState,
  encodeCircuitBoardCompact,
  parseCircuitBoardCompact,
  normalizeCircuitBoard,
  edgeCount,
  isCircuitLocked,
  isPerfectCircuitClearance,
  sanitizeEditorName,
  stampCircuitEditor,
  type EdgeMark,
} from "./circuit-board";
import {
  VERIFY_TRUE_PUZZLE_ID,
  VERIFY_TRUE_CIRCUIT_ID,
  VERIFY_PERFECT_CIRCUIT_ID,
  VERIFY_TRUE_CLUES,
  VERIFY_TRUE_COLS,
  VERIFY_TRUE_ROWS,
  buildVerifyTrueSolutionMarks,
  buildVerifyTrueUnsolvedBoard,
  buildVerifyPerfectLockedBoard,
  resolveVerifyTrueClues,
  isVerifyTruePuzzleId,
  PERFECT_CIRCUIT_PROD_RATE,
  PERFECT_CIRCUIT_PROD_RATE_ALT,
  PERFECT_CIRCUIT_DEV_RATE,
  rollPerfectCircuit,
  resolvePerfectCircuitInjectRate,
  isPerfectCircuitDebugContext,
  buildTruePuzzleFromSolution,
  buildInjectedOrFlawedPuzzle,
} from "./perfect-circuit-seed";
import {
  boardHasClosedLoop,
  circuitDigitEffectContribution,
  circuitHEdgeIndex,
  circuitVEdgeIndex,
  computeCircuitEffectValue,
  formatCircuitEffectJa,
  formatCircuitEffectBreakdownJa,
  groupCircuitEffectContributions,
  isCircuitSingleLoopClosed,
  listCircuitClosedLoops,
  selectSmallestClosedLoop,
} from "./circuit-effect";
import {
  FLAWED_HAZARD_WEIGHTS,
  computeCircuitEffectForBoard,
  generateFlawedClues,
  resolveCluesForCircuitBoard,
} from "./circuit-clues";


// --- Perfect Circuit verify-true seed (2×2 outer loop) ---
{
  assert.equal(isVerifyTruePuzzleId(VERIFY_TRUE_PUZZLE_ID), true);
  assert.equal(isVerifyTruePuzzleId("stub-8"), false);
  const fixed = resolveVerifyTrueClues(VERIFY_TRUE_PUZZLE_ID);
  assert.ok(fixed);
  assert.equal(fixed!.cols, 2);
  assert.equal(fixed!.rows, 2);
  assert.deepEqual(fixed!.clues, VERIFY_TRUE_CLUES.map((r) => [...r]));

  const marks = buildVerifyTrueSolutionMarks();
  assert.equal(marks.length, edgeCount(2, 2));
  assert.equal(marks.filter((m) => m === 1).length, 8);

  const unsolved = buildVerifyTrueUnsolvedBoard();
  assert.equal(unsolved.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.equal(unsolved.outcome, "offline");
  assert.ok(!unsolved.locked);
  assert.equal(
    decodeEdgeState(unsolved.edgeState, edgeCount(2, 2)).every((m) => m === 0),
    true,
  );

  const lockedBoard = buildVerifyPerfectLockedBoard("テスト職人");
  assert.equal(lockedBoard.locked, true);
  assert.equal(lockedBoard.perfect, true);
  assert.equal(lockedBoard.outcome, "fully_awakened");
  assert.equal(lockedBoard.lastEditorName, "テスト職人");
  assert.equal(isCircuitLocked(lockedBoard), true);
  assert.equal(
    isPerfectCircuitClearance({
      outcome: lockedBoard.outcome,
      perfect: lockedBoard.perfect,
      locked: lockedBoard.locked,
    }),
    true,
  );

  let hubV = { ...INITIAL_HUB, circuits: [] as typeof INITIAL_HUB.circuits };
  hubV = upsertCircuitIntoHub(hubV, {
    circuitId: VERIFY_TRUE_CIRCUIT_ID,
    circuitBoard: unsolved,
    outcome: "offline",
  });
  assert.equal(hubV.circuits[0]!.circuitId, VERIFY_TRUE_CIRCUIT_ID);
  hubV = upsertCircuitIntoHub(hubV, {
    circuitId: VERIFY_PERFECT_CIRCUIT_ID,
    circuitBoard: lockedBoard,
    outcome: "fully_awakened",
    lastEditorName: lockedBoard.lastEditorName,
    perfect: true,
  });
  const perf = hubV.circuits.find((c) => c.circuitId === VERIFY_PERFECT_CIRCUIT_ID);
  assert.ok(perf);
  assert.equal(perf!.locked, true);
  assert.equal(perf!.lastEditorName, "テスト職人");
  const before = perf!.circuitBoard.edgeState;
  hubV = upsertCircuitIntoHub(hubV, {
    circuitId: VERIFY_PERFECT_CIRCUIT_ID,
    circuitBoard: createEmptyCircuitBoard(4, 4, "hack"),
    outcome: "offline",
    lastEditorName: "侵入者",
  });
  assert.equal(
    hubV.circuits.find((c) => c.circuitId === VERIFY_PERFECT_CIRCUIT_ID)!
      .circuitBoard.edgeState,
    before,
  );
  console.log("shared perfect-circuit-seed selftest: ok");
}

// --- Perfect Circuit injection rates ---
{
  assert.equal(PERFECT_CIRCUIT_PROD_RATE, 0.01);
  assert.equal(PERFECT_CIRCUIT_PROD_RATE_ALT, 0.001);
  assert.equal(PERFECT_CIRCUIT_DEV_RATE, 0.33);

  assert.equal(rollPerfectCircuit(() => 0.0, { rate: 0.01 }), true);
  assert.equal(rollPerfectCircuit(() => 0.01, { rate: 0.01 }), false);
  assert.equal(rollPerfectCircuit(() => 0.5, { rate: 0 }), false);
  assert.equal(rollPerfectCircuit(() => 0.99, { rate: 1 }), true);

  assert.equal(
    resolvePerfectCircuitInjectRate({ isDev: true }),
    PERFECT_CIRCUIT_DEV_RATE,
  );
  assert.equal(
    resolvePerfectCircuitInjectRate({ hostname: "localhost" }),
    PERFECT_CIRCUIT_DEV_RATE,
  );
  assert.equal(
    resolvePerfectCircuitInjectRate({ hostname: "example.com" }),
    PERFECT_CIRCUIT_PROD_RATE,
  );
  assert.equal(
    resolvePerfectCircuitInjectRate({
      hostname: "example.com",
      search: "?perfectRate=0.33",
    }),
    0.33,
  );
  assert.equal(
    resolvePerfectCircuitInjectRate({
      isDev: true,
      search: "perfectRate=0.05",
    }),
    0.05,
    "query wins over DEV",
  );
  assert.equal(
    resolvePerfectCircuitInjectRate({
      hostname: "example.com",
      envRate: "0.001",
    }),
    PERFECT_CIRCUIT_PROD_RATE_ALT,
  );

  assert.equal(isPerfectCircuitDebugContext({ isDev: true }), true);
  assert.equal(
    isPerfectCircuitDebugContext({ hostname: "localhost" }),
    true,
  );
  assert.equal(
    isPerfectCircuitDebugContext({
      hostname: "example.com",
      search: "?perfectRate=0.05",
    }),
    true,
  );
  assert.equal(
    isPerfectCircuitDebugContext({ hostname: "example.com" }),
    false,
  );
  assert.equal(
    isPerfectCircuitDebugContext({
      hostname: "example.com",
      search: "?perfectRate=not-a-rate",
    }),
    false,
  );

  const trueP = buildTruePuzzleFromSolution();
  assert.equal(trueP.kind, "true");
  assert.equal(trueP.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.deepEqual(trueP.clues, VERIFY_TRUE_CLUES.map((r) => [...r]));

  const injected = buildInjectedOrFlawedPuzzle({
    seed: "any-seed",
    cols: 6,
    rows: 6,
    rate: 1,
    rng: () => 0,
    forceKind: "true",
    generateFlawed: () => [[1]],
  });
  assert.equal(injected.injectedTrue, true);
  assert.equal(injected.puzzleId, VERIFY_TRUE_PUZZLE_ID);
  assert.equal(injected.cols, 2);

  const flawed = buildInjectedOrFlawedPuzzle({
    seed: "flaw-seed",
    cols: 4,
    rows: 4,
    rate: 0,
    rng: () => 0.99,
    forceKind: "flawed",
    generateFlawed: (seed, c, r) =>
      Array.from({ length: r }, () =>
        Array.from({ length: c }, () => 1 as number | null),
      ),
  });
  assert.equal(flawed.injectedTrue, false);
  assert.equal(flawed.kind, "flawed");
  assert.equal(flawed.puzzleId, "flaw-seed");
  assert.equal(flawed.cols, 4);
  assert.equal(flawed.clues[0]![0], 1);

  console.log("shared perfect-circuit-inject selftest: ok");
}


// --- sector density placeholders ---
assert.equal(chebyshevDistance(0, 0, 3, 1), 3);
assert.equal(chebyshevDistance(-2, 5, 0, 0), 5);
{
  const near = sectorDensityFromChebyshev(0);
  assert.equal(near.blocked, false);
  assert.equal(near.density, 0);
  const front = sectorDensityFromChebyshev(SECTOR_FRONT_DISTANCE);
  assert.equal(front.blocked, false);
  assert.equal(front.density, 1);
  const wall = sectorDensityFromChebyshev(SECTOR_WALL_DISTANCE);
  assert.equal(wall.blocked, true);
  assert.equal(wall.density, 0);
  const at = sectorDensityAt(10, 0);
  assert.equal(at.distance, 10);
  assert.equal(at.density, 1);
}

// --- circuit board edgeState stub ---
{
  assert.equal(edgeCount(8, 8), 144);
  const marks: EdgeMark[] = [0, 1, 2, 1, 0, 2, 1, 0];
  const enc = encodeEdgeState(marks);
  assert.ok(enc.length > 0);
  const dec = decodeEdgeState(enc, marks.length);
  assert.deepEqual(dec, marks);
  const board = createEmptyCircuitBoard(8, 8, "stub-8");
  assert.equal(board.v, 1);
  assert.equal(board.cols, 8);
  assert.equal(board.rows, 8);
  assert.equal(board.puzzleId, "stub-8");
  const empty = decodeEdgeState(board.edgeState, edgeCount(8, 8));
  assert.equal(empty.length, 144);
  assert.ok(empty.every((m) => m === 0));
  // size budget: packed payload alone should be well under 0.4KB
  assert.ok(board.edgeState.length < 100, `edgeState too long: ${board.edgeState.length}`);
  assert.ok(normalizeCircuitBoard(board));
  assert.equal(normalizeCircuitBoard({ v: 1, cols: 0, rows: 8, edgeState: "" }), null);
}


console.log("shared selftest: sector-density + circuit-board ok");

// --- hub circuits (HubSave v2 additive) ---
{
  assert.deepEqual(INITIAL_HUB.circuits, []);
  const board = createEmptyCircuitBoard(8, 8, "stub-8");
  let hub = upsertCircuitIntoHub(INITIAL_HUB, {
    circuitId: "board_demo",
    circuitBoard: board,
    outcome: "bypass",
  });
  assert.equal(hub.circuits.length, 1);
  assert.equal(hub.circuits[0]!.circuitId, "board_demo");
  assert.equal(hub.circuits[0]!.outcome, "bypass");
  assert.equal(hub.circuits[0]!.circuitBoard.outcome, "bypass");

  hub = upsertCircuitIntoHub(hub, {
    circuitId: "board_demo",
    circuitBoard: { ...board, puzzleId: "stub-8b" },
    outcome: "fully_awakened",
  });
  assert.equal(hub.circuits.length, 1, "upsert same id must replace");
  assert.equal(hub.circuits[0]!.outcome, "fully_awakened");

  hub = upsertCircuitIntoHub(hub, {
    circuitId: "board_other",
    circuitBoard: createEmptyCircuitBoard(4, 4, "small"),
    outcome: "offline",
  });
  assert.equal(hub.circuits.length, 2);
  assert.equal(hub.circuits[0]!.circuitId, "board_other", "most recent first");

  const save = createHubSave(hub);
  assert.equal(save.v, 2);
  const parsed = parseHubSave(save);
  assert.ok(parsed);
  assert.equal(parsed!.hub.circuits.length, 2);
  assert.equal(parsed!.hub.circuits[0]!.circuitId, "board_other");

  const legacyNoCircuits = parseHubSave({
    v: 2,
    savedAt: "2026-09-01T00:00:00.000Z",
    hub: {
      credits: 1,
      materials: 2,
      fleet: [],
      ammoLoad: { ammo_standard: 0, ammo_ap: 0, ammo_hp: 0 },
      importedMaterials: 0,
      selectedMechId: "mech_gen1",
      selectedAmmoId: "ammo_standard",
    },
  });
  assert.ok(legacyNoCircuits);
  assert.deepEqual(legacyNoCircuits!.hub.circuits, []);

  const fromMap = normalizeCircuits({
    alpha: { circuitBoard: board, outcome: "offline" },
  });
  assert.equal(fromMap.length, 1);
  assert.equal(fromMap[0]!.circuitId, "alpha");
  assert.ok(HUB_LIMITS.maxCircuits >= 1);
}

console.log("shared hub-circuits selftest: ok");

// --- hub unopenedContainers (HubSave v2 additive) ---
{
  assert.equal(UNOPENED_CONTAINER_PRICE_CREDITS, 15);
  assert.equal(INITIAL_HUB.unopenedContainers, 0);
  assert.equal(clampUnopenedContainers(-3), 0);
  assert.equal(clampUnopenedContainers(2.9), 2);

  let hub = addUnopenedContainers(INITIAL_HUB, 3);
  assert.equal(hub.unopenedContainers, 3);
  hub = addUnopenedContainers(hub, 0);
  assert.equal(hub.unopenedContainers, 3);
  const spent = spendUnopenedContainers(hub, 2);
  assert.ok(spent);
  assert.equal(spent!.unopenedContainers, 1);
  assert.equal(spendUnopenedContainers(hub, 99), null, "no partial spend");

  const legacy = parseHubSave({
    v: 2,
    savedAt: "2026-09-01T00:00:00.000Z",
    hub: {
      credits: 10,
      materials: 0,
      fleet: [],
      ammoLoad: { ammo_standard: 0, ammo_ap: 0, ammo_hp: 0 },
      importedMaterials: 0,
      selectedMechId: "mech_gen1",
      selectedAmmoId: "ammo_standard",
    },
  });
  assert.ok(legacy);
  assert.equal(legacy!.hub.unopenedContainers, 0, "migrate missing → 0");

  const withStock = createHubSave(addUnopenedContainers(INITIAL_HUB, 4));
  assert.equal(parseHubSave(withStock)?.hub.unopenedContainers, 4);

  const depositUrl = buildSortToTradeUrl(
    {
      importMaterials: 0,
      craftMultiplier: 1,
      depositUnopenedContainers: 5,
    },
    "http://localhost:5175/",
  );
  const depositParsed = parseSortToTradeSearch(new URL(depositUrl).search);
  assert.equal(depositParsed?.depositUnopenedContainers, 5);
  assert.equal(depositParsed?.importMaterials, 0);
  assert.ok(
    (HANDOFF_QUERY_KEYS.sortToTrade as readonly string[]).includes(
      "depositUnopenedContainers",
    ),
  );
}

console.log("shared hub-unopened selftest: ok");


// --- circuit authorship + Perfect lock (additive) ---
{
  assert.equal(sanitizeEditorName("  職人A  "), "職人A");
  assert.equal(sanitizeEditorName(""), undefined);
  assert.equal(
    isPerfectCircuitClearance({
      outcome: "fully_awakened",
      digitRate: 1,
      loopClosed: true,
    }),
    true,
  );
  assert.equal(
    isPerfectCircuitClearance({ outcome: "fully_awakened" }),
    false,
    "fully_awakened alone must not lock without perfect/metrics",
  );
  assert.equal(
    isPerfectCircuitClearance({
      outcome: "fully_awakened",
      perfect: true,
    }),
    true,
  );

  const board = createEmptyCircuitBoard(4, 4, "lock-demo");
  let hub = upsertCircuitIntoHub(INITIAL_HUB, {
    circuitId: "lock_demo",
    circuitBoard: board,
    outcome: "bypass",
    lastEditorName: "職人A",
  });
  assert.equal(hub.circuits[0]!.lastEditorName, "職人A");
  assert.equal(hub.circuits[0]!.locked, undefined);
  assert.equal(isCircuitLocked(hub.circuits[0]!), false);

  hub = upsertCircuitIntoHub(hub, {
    circuitId: "lock_demo",
    circuitBoard: board,
    outcome: "bypass",
    lastEditorName: "職人B",
  });
  assert.equal(hub.circuits[0]!.lastEditorName, "職人B", "non-perfect refreshes 刻印");

  hub = upsertCircuitIntoHub(hub, {
    circuitId: "lock_demo",
    circuitBoard: { ...board, perfect: true },
    outcome: "fully_awakened",
    lastEditorName: "職人C",
    perfect: true,
  });
  assert.equal(hub.circuits[0]!.outcome, "fully_awakened");
  assert.equal(hub.circuits[0]!.locked, true);
  assert.equal(hub.circuits[0]!.lastEditorName, "職人C");
  assert.equal(isCircuitLocked(hub.circuits[0]!), true);

  const frozen = hub;
  hub = upsertCircuitIntoHub(hub, {
    circuitId: "lock_demo",
    circuitBoard: createEmptyCircuitBoard(4, 4, "tamper"),
    outcome: "offline",
    lastEditorName: "侵入者",
  });
  assert.equal(hub.circuits[0]!.outcome, "fully_awakened", "locked refuses outcome override");
  assert.equal(hub.circuits[0]!.lastEditorName, "職人C");
  assert.equal(hub.circuits[0]!.circuitBoard.puzzleId, "lock-demo");
  assert.equal(hub, frozen);

  const stamped = stampCircuitEditor(board, "刻印X", {
    outcome: "fully_awakened",
    digitRate: 1,
    loopClosed: true,
  });
  assert.equal(stamped.locked, true);
  assert.equal(stamped.perfect, true);
  assert.equal(stamped.lastEditorName, "刻印X");

  const migrated = normalizeCircuits([
    {
      circuitId: "legacy_ok",
      circuitBoard: createEmptyCircuitBoard(2, 2, "L"),
      outcome: "offline",
      lastEditorName: "旧職人",
    },
  ]);
  assert.equal(migrated[0]!.lastEditorName, "旧職人");
  assert.equal(migrated[0]!.locked, undefined);

  const ttr = buildTradeToRestoreUrl({
    circuitId: "lock_demo",
    circuitBoard: hub.circuits[0]!.circuitBoard,
    editorName: "職人C",
    locked: true,
    lastEditorName: "職人C",
  });
  const ttrP = parseTradeToRestoreSearch(new URL(ttr).search);
  assert.equal(ttrP?.editorName, "職人C");
  assert.equal(ttrP?.locked, true);

  const rtt = buildRestoreToTradeUrl({
    circuitId: "lock_demo",
    circuitBoard: hub.circuits[0]!.circuitBoard,
    outcome: "fully_awakened",
    lastEditorName: "職人C",
    locked: true,
    perfect: true,
  });
  const rttP = parseRestoreToTradeSearch(new URL(rtt).search);
  assert.equal(rttP?.lastEditorName, "職人C");
  assert.equal(rttP?.locked, true);
  assert.equal(rttP?.perfect, true);
}
console.log("shared circuit-lock selftest: ok");


// --- hub frontProgress (HubSave v2 additive) ---
{
  assert.equal(INITIAL_HUB.frontProgress, null);

  const progress = {
    seed: 42,
    aoiHalf: 12,
    opened: [{ sx: 0, sy: 0 }, { sx: 1, sy: 0 }, [2, 0]],
    flagged: [{ sx: 3, sy: 1 }],
    focus: { sx: 1, sy: 0 },
    hitMine: false,
  };
  let hub = setFrontProgressInHub(INITIAL_HUB, progress as never);
  assert.ok(hub.frontProgress);
  assert.equal(hub.frontProgress!.seed, 42);
  assert.equal(hub.frontProgress!.aoiHalf, 12);
  assert.equal(hub.frontProgress!.opened.length, 3);
  assert.equal(hub.frontProgress!.flagged.length, 1);
  assert.equal(hub.frontProgress!.focus?.sx, 1);
  assert.ok(hub.frontProgress!.updatedAt);

  const save = createHubSave(hub);
  const parsed = parseHubSave(save);
  assert.ok(parsed);
  assert.equal(parsed!.hub.frontProgress!.seed, 42);
  assert.equal(parsed!.hub.credits, INITIAL_HUB.credits);

  const viaAliasHub = parseHubSave({
    v: 2,
    savedAt: "2026-09-19T00:00:00.000Z",
    hub: {
      credits: 10,
      materials: 20,
      fleet: [],
      ammoLoad: { ammo_standard: 0, ammo_ap: 0, ammo_hp: 0 },
      importedMaterials: 0,
      selectedMechId: "mech_gen1",
      selectedAmmoId: "ammo_standard",
      invadeBoard: {
        seed: 99,
        opened: [{ sx: 0, sy: 0 }],
        flagged: [],
        focus: null,
        hitMine: true,
      },
    },
  });
  assert.ok(viaAliasHub);
  assert.equal(viaAliasHub!.hub.frontProgress!.seed, 99);
  assert.equal(viaAliasHub!.hub.frontProgress!.hitMine, true);

  const legacy = parseHubSave({
    v: 2,
    savedAt: "2026-09-01T00:00:00.000Z",
    hub: {
      credits: 1,
      materials: 2,
      fleet: [],
      ammoLoad: { ammo_standard: 0, ammo_ap: 0, ammo_hp: 0 },
      importedMaterials: 0,
      selectedMechId: "mech_gen1",
      selectedAmmoId: "ammo_standard",
    },
  });
  assert.ok(legacy);
  assert.equal(legacy!.hub.frontProgress, null);

  // clear hitMine only — keep opened/flagged/focus
  hub = setFrontProgressInHub(INITIAL_HUB, {
    seed: 7,
    aoiHalf: 12,
    opened: [{ sx: 0, sy: 0 }, { sx: 1, sy: 0 }],
    flagged: [{ sx: 2, sy: 1 }],
    focus: { sx: 1, sy: 0 },
    hitMine: true,
  } as never);
  assert.equal(hub.frontProgress!.hitMine, true);
  hub = clearFrontProgressHitMine(hub);
  assert.equal(hub.frontProgress!.hitMine, false);
  assert.equal(hub.frontProgress!.opened.length, 2);
  assert.equal(hub.frontProgress!.flagged.length, 1);
  assert.equal(hub.frontProgress!.focus?.sx, 1);
  hub = clearFrontProgressHitMine(hub); // idempotent
  assert.equal(hub.frontProgress!.hitMine, false);

  hub = clearFrontProgressInHub(hub);
  assert.equal(hub.frontProgress, null);

  assert.equal(normalizeFrontProgress({ opened: [], flagged: [], focus: null }), null);
  assert.ok(HUB_LIMITS.maxFrontCells >= 625);
}
console.log("shared hub-frontProgress selftest: ok");

// --- M4/M5 handoff key contracts ---
assert.ok(HANDOFF_QUERY_KEYS.tradeToInvade.includes("fromHub"));
assert.ok(HANDOFF_QUERY_KEYS.invadeToTrade.includes("sectorX"));
assert.ok(HANDOFF_QUERY_KEYS.invadeToExplore.includes("density"));
assert.ok(HANDOFF_QUERY_KEYS.tradeToRestore.includes("circuitBoard"));
assert.ok(HANDOFF_QUERY_KEYS.restoreToTrade.includes("circuitOutcome"));
// non-goal: invade returns must not advertise yieldBag
assert.equal(
  (HANDOFF_QUERY_KEYS.invadeToTrade as readonly string[]).includes("yieldBag"),
  false,
);

const tti = buildTradeToInvadeUrl({
  fromHub: true,
  deployableMechs: 2,
  startingAmmo: 28,
});
const ttiParsed = parseTradeToInvadeSearch(new URL(tti).search);
assert.equal(ttiParsed?.fromHub, true);
assert.equal(ttiParsed?.deployableMechs, 2);
assert.equal(ttiParsed?.startingAmmo, 28);
assert.equal(parseTradeToInvadeSearch(""), null);
// explore-style URL without fromHub is not trade→invade
assert.equal(
  parseTradeToInvadeSearch("deployableMechs=2&deployedInstanceIds=a,b"),
  null,
);

const itt = buildInvadeToTradeUrl({
  sectorX: 3,
  sectorY: -2,
  density: 0.3,
  intelFlags: ["routeHint", "rareSignal", "bad flag!", "routeHint"],
});
const ittParsed = parseInvadeToTradeSearch(new URL(itt).search);
assert.equal(ittParsed?.sectorX, 3);
assert.equal(ittParsed?.sectorY, -2);
assert.equal(ittParsed?.density, 0.3);
assert.deepEqual(ittParsed?.intelFlags, ["routeHint", "rareSignal"]);
assert.equal(itt.includes("yieldBag"), false);

const ite = buildInvadeToExploreUrl({
  sectorX: 10,
  sectorY: 0,
  density: 1,
  intelFlags: ["frontline"],
});
const iteParsed = parseInvadeToExploreSearch(new URL(ite).search);
assert.equal(iteParsed?.sectorX, 10);
assert.equal(iteParsed?.density, 1);
assert.deepEqual(iteParsed?.intelFlags, ["frontline"]);
assert.equal(iteParsed?.engage, undefined);
assert.equal(iteParsed?.enemyCells, undefined);

assert.ok(HANDOFF_QUERY_KEYS.invadeToExplore.includes("engage"));
assert.ok(HANDOFF_QUERY_KEYS.invadeToExplore.includes("enemyCells"));
// trade path stays without engage keys
assert.equal(
  (HANDOFF_QUERY_KEYS.invadeToTrade as readonly string[]).includes("engage"),
  false,
);

assert.equal(
  encodeEnemyCells([
    { sx: 3, sy: -1 },
    { sx: 2, sy: 0 },
    { sx: 3, sy: -1 },
  ]),
  "2,0;3,-1",
);
assert.deepEqual(parseEnemyCells("2,0;3,-1;bad;4,1"), [
  { sx: 2, sy: 0 },
  { sx: 3, sy: -1 },
  { sx: 4, sy: 1 },
]);

const iteForced = buildInvadeToExploreUrl({
  sectorX: 3,
  sectorY: -2,
  density: 0.5,
  intelFlags: ["scoutHazard"],
  engage: "forced",
  enemyCells: [
    { sx: 3, sy: -2 },
    { sx: 4, sy: -2 },
    { sx: 3, sy: -1 },
  ],
});
const iteForcedParsed = parseInvadeToExploreSearch(new URL(iteForced).search);
assert.equal(iteForcedParsed?.engage, "forced");
assert.deepEqual(iteForcedParsed?.enemyCells, [
  { sx: 3, sy: -2 },
  { sx: 3, sy: -1 },
  { sx: 4, sy: -2 },
]);

const iteRaid = buildInvadeToExploreUrl({
  sectorX: 5,
  sectorY: 1,
  density: 0.2,
  engage: "raid",
  enemyCells: [{ sx: 5, sy: 1 }],
});
const iteRaidParsed = parseInvadeToExploreSearch(new URL(iteRaid).search);
assert.equal(iteRaidParsed?.engage, "raid");
assert.deepEqual(iteRaidParsed?.enemyCells, [{ sx: 5, sy: 1 }]);

// merge sector onto trade→explore URL without dropping deploy keys
const mergedExplore = mergeInvadeSectorOntoExploreUrl(
  buildTradeToExploreUrl({
    deployableMechs: 1,
    startingAmmo: 5,
    deployedInstanceIds: ["op1"],
  }),
  {
    sectorX: 4,
    sectorY: 1,
    density: 0.4,
    engage: "raid",
    enemyCells: [{ sx: 4, sy: 1 }],
  },
);
const mergedU = new URL(mergedExplore);
assert.equal(mergedU.searchParams.get("deployedInstanceIds"), "op1");
assert.equal(mergedU.searchParams.get("sectorX"), "4");
assert.equal(mergedU.searchParams.get("density"), "0.400");
assert.equal(mergedU.searchParams.get("engage"), "raid");
assert.equal(mergedU.searchParams.get("enemyCells"), "4,1");

const board0 = createEmptyCircuitBoard(8, 8, "stub-8");
const boardCompact = encodeCircuitBoardCompact(board0);
assert.ok(boardCompact.startsWith("1|8|8|"));
assert.deepEqual(parseCircuitBoardCompact(boardCompact)?.puzzleId, "stub-8");

const ttr = buildTradeToRestoreUrl({
  circuitId: "board_demo",
  circuitBoard: board0,
});
const ttrParsed = parseTradeToRestoreSearch(new URL(ttr).search);
assert.equal(ttrParsed?.circuitId, "board_demo");
assert.equal(ttrParsed?.circuitBoard?.cols, 8);
assert.equal(ttrParsed?.circuitBoard?.puzzleId, "stub-8");

const rtt = buildRestoreToTradeUrl({
  circuitId: "board_demo",
  circuitBoard: board0,
  outcome: "bypass",
});
const rttParsed = parseRestoreToTradeSearch(new URL(rtt).search);
assert.equal(rttParsed?.outcome, "bypass");
assert.equal(rttParsed?.circuitBoard.outcome, "bypass");
assert.equal(rttParsed?.circuitId, "board_demo");
assert.equal(parseRestoreToTradeSearch("circuitId=only"), null);
assert.equal(
  parseRestoreToTradeSearch("circuitOutcome=fully_awakened"),
  null,
); // needs board


// --- circuit outcome bonuses (track 1) ---
{
  const empty = aggregateCircuitBonuses([]);
  assert.equal(empty.craftMultiplier, 1);
  assert.equal(empty.durabilityBuffer, 0);
  assert.equal(empty.repairDiscount, 0);

  const one = aggregateCircuitBonuses([
    { circuitId: "a", outcome: "fully_awakened" },
  ]);
  assert.equal(one.craftMultiplierBonus, CIRCUIT_OUTCOME_BONUS.fully_awakened.craftMultiplierBonus);
  assert.equal(one.repairDiscount, CIRCUIT_OUTCOME_BONUS.fully_awakened.repairDiscount);
  assert.equal(one.durabilityBuffer, CIRCUIT_OUTCOME_BONUS.fully_awakened.durabilityBuffer);
  assert.equal(one.counts.fully_awakened, 1);

  const mixed = aggregateCircuitBonuses([
    { circuitId: "a", outcome: "fully_awakened" },
    { circuitId: "b", outcome: "bypass" },
    { circuitId: "c", outcome: "offline" },
  ]);
  assert.equal(
    mixed.craftMultiplierBonus,
    CIRCUIT_OUTCOME_BONUS.fully_awakened.craftMultiplierBonus +
      CIRCUIT_OUTCOME_BONUS.bypass.craftMultiplierBonus,
  );
  assert.equal(mixed.counts.offline, 1);
  assert.ok(mixed.contributingCircuitIds.includes("a"));
  assert.ok(!mixed.contributingCircuitIds.includes("c"));

  const discounted = applyRepairDiscountToCost(
    { credits: 50, materials: 30 },
    one,
  );
  assert.equal(discounted.credits, Math.ceil(50 * one.repairCostMul));
  assert.equal(discounted.materials, Math.ceil(30 * one.repairCostMul));

  assert.equal(applyDurabilityBufferToWear(35, 10), 25);
  assert.equal(applyDurabilityBufferToWear(5, 10), 0);

  const enc = encodeCircuitBonusesCompact(one);
  assert.ok(enc.includes("craft:"));
  assert.ok(enc.includes("dur:10"));
  const round = parseCircuitBonusesCompact(enc);
  assert.equal(round.durabilityBuffer, 10);
  assert.ok(Math.abs(round.craftMultiplier - one.craftMultiplier) < 0.001);

  const url = buildTradeToExploreUrl({
    deployableMechs: 1,
    startingAmmo: 10,
    deployedInstanceIds: ["op1"],
    circuitBonuses: {
      craftMultiplier: one.craftMultiplier,
      repairDiscount: one.repairDiscount,
      durabilityBuffer: one.durabilityBuffer,
    },
  });
  const parsed = parseTradeToExploreSearch(new URL(url).search);
  assert.equal(parsed?.circuitBonuses?.durabilityBuffer, 10);
  assert.ok((parsed?.circuitBonuses?.craftMultiplier ?? 0) > 1);
}

console.log("shared handoff-m45 selftest: ok");

// --- circuit effect value (効果値) ---
{
  assert.equal(circuitDigitEffectContribution(0, false), 0);
  assert.equal(circuitDigitEffectContribution(0, true), 4);
  assert.equal(circuitDigitEffectContribution(2, false), 2);
  assert.equal(circuitDigitEffectContribution(3, true), 3);

  const cols = VERIFY_TRUE_COLS;
  const rows = VERIFY_TRUE_ROWS;
  const empty: EdgeMark[] = Array.from(
    { length: edgeCount(cols, rows) },
    () => 0 as EdgeMark,
  );
  const noLoop = computeCircuitEffectValue({
    clues: VERIFY_TRUE_CLUES,
    marks: empty,
    cols,
    rows,
  });
  assert.equal(noLoop.hasLoop, false);
  assert.equal(noLoop.effect, 0);
  assert.ok(formatCircuitEffectJa(noLoop).includes("ループなし"));

  const sol = buildVerifyTrueSolutionMarks();
  assert.equal(isCircuitSingleLoopClosed(sol, cols, rows), true);
  assert.equal(boardHasClosedLoop(sol, cols, rows), true);
  const perfect = computeCircuitEffectValue({
    clues: VERIFY_TRUE_CLUES,
    marks: sol,
    cols,
    rows,
    perfect: true,
  });
  // Four satisfied 2s → 2+2+2+2 = 8; no zeros on verify-true.
  assert.equal(perfect.hasLoop, true);
  assert.equal(perfect.perfect, true);
  assert.equal(perfect.effect, 8);
  assert.equal(perfect.zeroBonusApplied, 0);
  assert.equal(perfect.contributions.length, 4);
  assert.ok(perfect.contributions.every((c) => c.digit === 2 && c.contribution === 2));
  assert.equal(groupCircuitEffectContributions(perfect).length, 1);
  assert.equal(groupCircuitEffectContributions(perfect)[0]!.total, 8);
  assert.ok(formatCircuitEffectBreakdownJa(perfect).includes("2×4(+8)"));
  assert.ok(formatCircuitEffectBreakdownJa(noLoop).includes("ループなし"));



  // 3×3 board: unit square around cell (1,1) = 4 edges; 0 at (0,0) with 0 lines.
  {
    const c = 3;
    const r = 3;
    const clues = [
      [0, null, null],
      [null, 4, null],
      [null, null, null],
    ];
    const m: EdgeMark[] = Array.from(
      { length: edgeCount(c, r) },
      () => 0 as EdgeMark,
    );
    m[circuitHEdgeIndex(c, r, 1, 1)] = 1;
    m[circuitVEdgeIndex(c, r, 2, 1)] = 1;
    m[circuitHEdgeIndex(c, r, 1, 2)] = 1;
    m[circuitVEdgeIndex(c, r, 1, 1)] = 1;
    assert.equal(isCircuitSingleLoopClosed(m, c, r), true);

    const flawed = computeCircuitEffectValue({
      clues,
      marks: m,
      cols: c,
      rows: r,
      perfect: false,
    });
    // 0 satisfied but not perfect → 0; digit 4 → +4; has loop → effect 4
    assert.equal(flawed.digits.satisfiedZeros, 1);
    assert.equal(flawed.effect, 4);
    assert.equal(flawed.zeroBonusApplied, 0);

    const asPerfect = computeCircuitEffectValue({
      clues,
      marks: m,
      cols: c,
      rows: r,
      perfect: true,
    });
    // 0 → 4, plus 4 → effect 8
    assert.equal(asPerfect.effect, 8);
    assert.equal(asPerfect.zeroBonusApplied, 4);
  }

  const locked = buildVerifyPerfectLockedBoard("tester");
  const fromBoard = computeCircuitEffectForBoard(locked);
  assert.equal(fromBoard.effect, 8);
  assert.equal(fromBoard.perfect, true);

  const flawedGen = generateFlawedClues("effect-selftest", 6, 6, undefined, "contradiction");
  assert.equal(flawedGen.hazard, "contradiction");
  assert.ok(
    Math.abs(
      FLAWED_HAZARD_WEIGHTS.contradiction +
        FLAWED_HAZARD_WEIGHTS.overdigit +
        FLAWED_HAZARD_WEIGHTS.dense_noise -
        1,
    ) < 1e-9,
  );
  const cluesResolved = resolveCluesForCircuitBoard({
    cols: 2,
    rows: 2,
    puzzleId: VERIFY_TRUE_PUZZLE_ID,
  });
  assert.deepEqual(cluesResolved, VERIFY_TRUE_CLUES.map((row) => [...row]));

  // Multi-loop: effect from the *smallest* closed loop only (not sum of all).
  //  - Unit square (4 edges) around (0,0) with digit 4 → +4
  //  - 2×1 rectangle (6 edges) around (2,1)-(3,1) with digit 3 → +3
  // Old bug summed 7; new rule picks smallest → effect 4.
  {
    const c = 4;
    const r = 3;
    const clues: (number | null)[][] = [
      [4, null, null, null],
      [null, null, 3, null],
      [null, null, null, null],
    ];
    const m: EdgeMark[] = Array.from(
      { length: edgeCount(c, r) },
      () => 0 as EdgeMark,
    );
    m[circuitHEdgeIndex(c, r, 0, 0)] = 1;
    m[circuitVEdgeIndex(c, r, 1, 0)] = 1;
    m[circuitHEdgeIndex(c, r, 0, 1)] = 1;
    m[circuitVEdgeIndex(c, r, 0, 0)] = 1;
    m[circuitHEdgeIndex(c, r, 2, 1)] = 1;
    m[circuitHEdgeIndex(c, r, 3, 1)] = 1;
    m[circuitVEdgeIndex(c, r, 4, 1)] = 1;
    m[circuitHEdgeIndex(c, r, 3, 2)] = 1;
    m[circuitHEdgeIndex(c, r, 2, 2)] = 1;
    m[circuitVEdgeIndex(c, r, 2, 1)] = 1;

    const loops = listCircuitClosedLoops(m, c, r);
    assert.equal(loops.length, 2);
    const smallest = selectSmallestClosedLoop(loops);
    assert.ok(smallest);
    assert.equal(smallest!.edgeIndices.length, 4);

    const multi = computeCircuitEffectValue({
      clues,
      marks: m,
      cols: c,
      rows: r,
      perfect: false,
    });
    assert.equal(multi.loopCount, 2);
    assert.equal(multi.hasLoop, true);
    assert.equal(multi.activeLoopEdgeCount, 4);
    assert.equal(multi.effect, 4);
    // multi active contributions: only digit on smallest loop
    const multiPos = multi.contributions.filter((c) => c.contribution > 0);
    assert.equal(multiPos.length, 1);
    assert.equal(multiPos[0]!.digit, 4);
    assert.equal(multiPos[0]!.contribution, 4);
    assert.ok(formatCircuitEffectBreakdownJa(multi).includes("4×1(+4)"));

    assert.equal(multi.digits.satisfied, 2);
    assert.equal(multi.digits.clueCount, 2);
  }

  // Screenshot intent: smallest loop alone has satisfied digit 3 → effect 3.
  // Disjoint loops (no shared vertices): small 2×1 (6 edges) + large 3×1 (8 edges).
  // Both carry a satisfied digit 3; board-wide sum would be 6; active = 3.
  {
    const c = 5;
    const r = 4;
    const clues: (number | null)[][] = [
      [3, null, null, null, null],
      [null, null, null, null, null],
      [null, null, null, 3, null],
      [null, null, null, null, null],
    ];
    const m: EdgeMark[] = Array.from(
      { length: edgeCount(c, r) },
      () => 0 as EdgeMark,
    );
    // Large 3×1 around (0,0)(1,0)(2,0) — 8 edges
    m[circuitHEdgeIndex(c, r, 0, 0)] = 1;
    m[circuitHEdgeIndex(c, r, 1, 0)] = 1;
    m[circuitHEdgeIndex(c, r, 2, 0)] = 1;
    m[circuitVEdgeIndex(c, r, 3, 0)] = 1;
    m[circuitHEdgeIndex(c, r, 2, 1)] = 1;
    m[circuitHEdgeIndex(c, r, 1, 1)] = 1;
    m[circuitHEdgeIndex(c, r, 0, 1)] = 1;
    m[circuitVEdgeIndex(c, r, 0, 0)] = 1;
    // Small 2×1 around (3,2)(4,2) — 6 edges; digit 3 at (3,2)
    m[circuitHEdgeIndex(c, r, 3, 2)] = 1;
    m[circuitHEdgeIndex(c, r, 4, 2)] = 1;
    m[circuitVEdgeIndex(c, r, 5, 2)] = 1;
    m[circuitHEdgeIndex(c, r, 4, 3)] = 1;
    m[circuitHEdgeIndex(c, r, 3, 3)] = 1;
    m[circuitVEdgeIndex(c, r, 3, 2)] = 1;

    const loops = listCircuitClosedLoops(m, c, r);
    assert.equal(loops.length, 2);
    assert.equal(selectSmallestClosedLoop(loops)!.edgeIndices.length, 6);

    const shot = computeCircuitEffectValue({
      clues,
      marks: m,
      cols: c,
      rows: r,
      perfect: false,
    });
    assert.equal(shot.loopCount, 2);
    assert.equal(shot.activeLoopEdgeCount, 6);
    assert.equal(shot.effect, 3);
    assert.equal(shot.digits.satisfied, 2);
    assert.equal(shot.digits.clueCount, 2);
  }
}

console.log("shared circuit-effect selftest: ok");
