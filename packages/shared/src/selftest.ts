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
} from "./hub-save";
import {
  createExpeditionState,
  applyPuzzleResult,
  puzzleInputFromExpedition,
} from "./expedition";

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

import {
  coarsenFix,
  isGeolocationSupported,
  toGeoFix,
  type GeoFix,
} from "./geolocation";

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
