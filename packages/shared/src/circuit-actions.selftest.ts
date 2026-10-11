/**
 * Circuit effect numbers and fixed 1×1 boards (Issue #269).
 */
import assert from "node:assert/strict";
import {
  cargoSlotBonus,
  circuitTrueBoardRate,
  classifyCircuit,
  effectKeyForCircuit,
  effectRate,
  makeFalseOneByOne,
  makeTrueOneByOne,
  perfectRatePoints,
  readAirSupportCooldownSec,
  readBulletinUnlocked,
  slotCapacity,
  type HubSnapshot,
} from "./circuit-actions";
import { resolveCluesForCircuitBoard } from "./circuit-clues";

assert.equal(effectRate(8), 0.06);
assert.equal(effectRate(49), 0.14);
assert.equal(effectRate(100), 0.2);
assert.equal(effectRate(225), 0.3);
assert.equal(effectRate(0), 0);
assert.equal(perfectRatePoints(8), 1);
assert.equal(perfectRatePoints(49), 4);
assert.equal(perfectRatePoints(225), 8);
assert.equal(cargoSlotBonus(16), 1);
assert.equal(cargoSlotBonus(256), 4);
assert.equal(cargoSlotBonus(0), 0);

const truth = makeTrueOneByOne("true-1x1");
const fals = makeFalseOneByOne("false-1x1");
assert.equal(classifyCircuit(truth).oneByOne, "true");
assert.equal(classifyCircuit(fals).oneByOne, "false");
assert.equal(resolveCluesForCircuitBoard(truth.circuitBoard)[0]?.[0], 4);
assert.equal(slotCapacity([fals]), 1);
assert.equal(slotCapacity([truth]), 2);
assert.equal(slotCapacity([fals], truth), 2);
assert.equal(slotCapacity([], fals), 1);

const keyed = { ...fals, effectKey: "smg" as const };
assert.equal(effectKeyForCircuit(keyed), "smg");
assert.equal(effectKeyForCircuit(keyed), effectKeyForCircuit(keyed));
assert.equal(effectKeyForCircuit(fals), undefined);

const bare = { fleet: [{ instanceId: "m1" }], circuits: [], lostMechs: [] } as unknown as HubSnapshot;
assert.equal(circuitTrueBoardRate(bare, 0.01), 0);
assert.equal(readBulletinUnlocked(bare), false);
assert.equal(readAirSupportCooldownSec(bare), 0);
const cleared = { ...bare, bulletinUnlocked: true } as HubSnapshot;
assert.equal(circuitTrueBoardRate(cleared, 0.01), 0.01);
assert.equal(circuitTrueBoardRate(cleared, 0.4), 0.31);

console.log("circuit-actions.selftest ok");
