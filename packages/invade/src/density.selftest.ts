import assert from "node:assert/strict";
import {
  SECTOR_FRONT_DISTANCE,
  SECTOR_WALL_DISTANCE,
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

console.log("invade density.selftest ok");
