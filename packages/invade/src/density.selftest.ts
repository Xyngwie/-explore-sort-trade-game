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

// AOI half=12 includes front ring and wall ring (d≥12 blocked)
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

// --- invade→explore engage build/parse round-trip ---
const forcedPayload = {
  sectorX: 3,
  sectorY: -2,
  density: 0.5,
  intelFlags: ["scoutHazard", "routeHint"],
  engage: "forced" as const,
  enemyCells: [
    { sx: 3, sy: -2 },
    { sx: 4, sy: -2 },
    { sx: 3, sy: -1 },
  ],
};
const forcedUrl = buildInvadeToExploreUrl(forcedPayload, "http://localhost:5173/");
const forcedParsed = parseInvadeToExploreSearch(new URL(forcedUrl).search);
assert.ok(forcedParsed);
assert.equal(forcedParsed.engage, "forced");
assert.equal(forcedParsed.enemyCells?.length, 3);
assert.deepEqual(
  new Set((forcedParsed.enemyCells ?? []).map((c) => `${c.sx},${c.sy}`)),
  new Set(["3,-2", "4,-2", "3,-1"]),
);
assert.deepEqual(forcedParsed.intelFlags, ["scoutHazard", "routeHint"]);
assert.ok(!forcedUrl.includes("yieldBag"));
assert.ok(!forcedUrl.includes("salvagedContainers"));

const raidPayload = {
  sectorX: 5,
  sectorY: 1,
  density: 0.2,
  engage: "raid" as const,
  enemyCells: [{ sx: 5, sy: 1 }],
};
const raidUrl = buildInvadeToExploreUrl(raidPayload, "http://localhost:5173/");
const raidParsed = parseInvadeToExploreSearch(new URL(raidUrl).search);
assert.ok(raidParsed);
assert.equal(raidParsed.engage, "raid");
assert.deepEqual(raidParsed.enemyCells, [{ sx: 5, sy: 1 }]);

console.log("invade density.selftest ok");
