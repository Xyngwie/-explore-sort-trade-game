import assert from "node:assert/strict";
import {
  SECTOR_WALL_DISTANCE,
  sectorDensityAt,
  sectorDensityFromChebyshev,
} from "@estg/shared";

const mid = sectorDensityFromChebyshev(5);
assert.equal(mid.blocked, false);
assert.ok(mid.density > 0 && mid.density < 1);

const wall = sectorDensityAt(SECTOR_WALL_DISTANCE, 0);
assert.equal(wall.blocked, true);

console.log("invade density.selftest ok");
