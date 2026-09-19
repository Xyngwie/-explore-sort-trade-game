import assert from "node:assert/strict";
import {
  buildInvadeToExploreUrl,
  buildInvadeToTradeUrl,
  parseInvadeToTradeSearch,
  sectorDensityAt,
} from "@estg/shared";
import {
  SWEEP_INTEL,
  densityAfterSweep,
  hazardChanceFromDensity,
  intelForMark,
  mergeIntelFlags,
  resolveFlag,
  resolveSweep,
} from "./sweep";

assert.equal(hazardChanceFromDensity(0), 0);
assert.equal(hazardChanceFromDensity(1), 1);
assert.equal(hazardChanceFromDensity(0.5), 0.5);
assert.equal(hazardChanceFromDensity(-1), 0);
assert.equal(hazardChanceFromDensity(2), 1);
assert.equal(hazardChanceFromDensity(Number.NaN), 0);

const flag = resolveFlag();
assert.equal(flag.kind, "flagged");
assert.equal(flag.mark, "flagged");
assert.deepEqual([...flag.intelAdded], [SWEEP_INTEL.flagged]);

const alwaysClear = resolveSweep(0.4, () => 0.99);
assert.equal(alwaysClear.kind, "cleared");
assert.deepEqual([...alwaysClear.intelAdded], [SWEEP_INTEL.cleared]);

const alwaysHazard = resolveSweep(0.4, () => 0);
assert.equal(alwaysHazard.kind, "hazard");
assert.deepEqual([...alwaysHazard.intelAdded], [SWEEP_INTEL.hazard]);

// Boundary: roll === p is clear (strict <)
assert.equal(resolveSweep(0.5, () => 0.5).kind, "cleared");
assert.equal(resolveSweep(0.5, () => 0.499).kind, "hazard");

assert.deepEqual(intelForMark("none"), []);
assert.deepEqual(intelForMark("flagged"), [SWEEP_INTEL.flagged]);

const merged = mergeIntelFlags(
  ["routeHint", "frontLine", "routeHint"],
  "hazard",
);
assert.deepEqual(merged, ["routeHint", "frontLine", SWEEP_INTEL.hazard]);

assert.equal(densityAfterSweep(0.5, "none"), 0.5);
assert.equal(densityAfterSweep(0.5, "flagged"), 0.5);
assert.ok(densityAfterSweep(0.5, "cleared") < 0.5);
assert.ok(densityAfterSweep(0.5, "hazard") > 0.5);
assert.equal(densityAfterSweep(1, "hazard"), 1);

// Handoff still uses existing keys only
const dens = sectorDensityAt(3, -2);
const flags = mergeIntelFlags(["routeHint"], "cleared");
const densOut = densityAfterSweep(dens.density, "cleared");
const url = buildInvadeToTradeUrl(
  {
    sectorX: 3,
    sectorY: -2,
    density: densOut,
    intelFlags: flags,
  },
  "http://localhost:5175/",
);
const parsed = parseInvadeToTradeSearch(new URL(url).search);
assert.ok(parsed);
assert.deepEqual(parsed.intelFlags, ["routeHint", SWEEP_INTEL.cleared]);
assert.equal(parsed.density, densOut);
assert.ok(!url.includes("yieldBag"));

const exploreUrl = buildInvadeToExploreUrl(
  {
    sectorX: 3,
    sectorY: -2,
    density: densOut,
    intelFlags: flags,
  },
  "http://localhost:5173/",
);
assert.ok(exploreUrl.includes("intelFlags="));
assert.ok(exploreUrl.includes(SWEEP_INTEL.cleared));

console.log("invade sweep.selftest ok");
