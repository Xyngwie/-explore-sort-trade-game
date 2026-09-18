import assert from "node:assert/strict";
import {
  SECTOR_FRONT_DISTANCE,
  SECTOR_WALL_DISTANCE,
  buildInvadeToExploreUrl,
  buildInvadeToTradeUrl,
  parseInvadeToExploreSearch,
  parseInvadeToTradeSearch,
  parseTradeToInvadeSearch,
  sectorDensityAt,
  sectorDensityFromChebyshev,
} from "@estg/shared";

const mid = sectorDensityFromChebyshev(5);
assert.equal(mid.blocked, false);
assert.ok(mid.density > 0 && mid.density < 1);

const wall = sectorDensityAt(SECTOR_WALL_DISTANCE, 0);
assert.equal(wall.blocked, true);

const front = sectorDensityAt(SECTOR_FRONT_DISTANCE, 0);
assert.equal(front.blocked, false);
assert.equal(front.density, 1);
assert.ok(front.distance >= SECTOR_FRONT_DISTANCE);

// AOI half=10 includes front ring; wall starts at 12 (outside AOI)
assert.equal(sectorDensityAt(10, 0).distance, 10);
assert.equal(sectorDensityAt(0, 0).distance, 0);

// --- M4 handoff wire (shared helpers; UI uses these) ---
const inbound = parseTradeToInvadeSearch(
  "fromHub=1&deployableMechs=2&startingAmmo=28",
);
assert.ok(inbound);
assert.equal(inbound.fromHub, true);
assert.equal(inbound.deployableMechs, 2);
assert.equal(inbound.startingAmmo, 28);
assert.equal(parseTradeToInvadeSearch(""), null);

const dens = sectorDensityAt(3, -2);
assert.equal(dens.blocked, false);
const sector = {
  sectorX: 3,
  sectorY: -2,
  density: dens.density,
  intelFlags: ["routeHint"],
};

const tradeUrl = buildInvadeToTradeUrl(sector, "http://localhost:5175/");
const tradeParsed = parseInvadeToTradeSearch(new URL(tradeUrl).search);
assert.ok(tradeParsed);
assert.equal(tradeParsed.sectorX, 3);
assert.equal(tradeParsed.sectorY, -2);
assert.equal(tradeParsed.density, Number(dens.density.toFixed(3)));
assert.deepEqual(tradeParsed.intelFlags, ["routeHint"]);
assert.ok(!tradeUrl.includes("yieldBag"));
assert.ok(!tradeUrl.includes("salvagedContainers"));

const exploreUrl = buildInvadeToExploreUrl(sector, "http://localhost:5173/");
const exploreParsed = parseInvadeToExploreSearch(new URL(exploreUrl).search);
assert.ok(exploreParsed);
assert.equal(exploreParsed.sectorX, 3);
assert.equal(exploreParsed.sectorY, -2);

console.log("invade density.selftest ok");
