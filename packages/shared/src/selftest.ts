import assert from "node:assert/strict";
import {
  buildExploreToSortUrl,
  parseExploreToSortSearch,
  buildSortToTradeUrlFromResult,
  parseSortToTradeSearch,
  wingmanCountFromMechs,
  importedMaterialsFromResult,
} from "./handoff";
import {
  createHubSave,
  parseHubSave,
  importMaterialsIntoHub,
  INITIAL_HUB,
  HUB_LIMITS,
} from "./hub-save";
import {
  createExpeditionState,
  applyPuzzleResult,
  puzzleInputFromExpedition,
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
} from "./mech-fleet";
import {
  coarsenFix,
  isGeolocationSupported,
  toGeoFix,
  type GeoFix,
} from "./geolocation";

const exploreUrl = buildExploreToSortUrl({
  salvagedContainers: 6,
  totalStockPieces: 150,
  isExtracted: true,
});
const exploreParsed = parseExploreToSortSearch(new URL(exploreUrl).search);
assert.equal(exploreParsed?.salvagedContainers, 6);
assert.equal(exploreParsed?.totalStockPieces, 150);
assert.equal(exploreParsed?.isExtracted, true);

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
