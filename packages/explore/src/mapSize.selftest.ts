/**
 * Stage 3: every sortie is the playable board. worldW/worldH no longer
 * build a 0-based rectangle (decision 18). The global BALANCE table stays
 * 1400×1000, and the command radii stay 7500 and 1500.
 */
import assert from "node:assert/strict";
import { BALANCE } from "./game/balance";
import { fieldRectOf, playableFieldRect } from "./game/fieldBounds";
import { bootstrapFromSearch, createWorld } from "./game/world";

const boot = () => bootstrapFromSearch("");
const globalBefore = {
  worldW: BALANCE.worldW,
  worldH: BALANCE.worldH,
  captain: BALANCE.commandRangeCaptain,
  platoon: BALANCE.commandRangePlatoonLeader,
};
const playable = playableFieldRect();

{
  const world = createWorld(boot());
  const rect = fieldRectOf(world.balance);
  assert.deepEqual(rect, playable);
  assert.equal(world.balance.worldW, playable.maxX - playable.minX);
  assert.equal(world.balance.worldH, playable.maxY - playable.minY);
  assert.ok(rect.minX < 0 && rect.minY < 0, "origin is the HQ centre, not the corner");
  assert.deepEqual(world.leader.pos, { x: 0, y: 0 });
  assert.equal(world.balance.commandRangeCaptain, 7500);
  assert.equal(world.balance.commandRangePlatoonLeader, 1500);
  assert.notStrictEqual(world.balance, BALANCE);
}

{
  const ignored = createWorld(boot(), { worldW: 2800, worldH: 2000 });
  assert.deepEqual(fieldRectOf(ignored.balance), playable, "a passed size does not build a 0-based map");
  assert.deepEqual(ignored.leader.pos, { x: 0, y: 0 });
  const partial = createWorld(boot(), { worldW: Number.NaN, worldH: 0 });
  assert.deepEqual(fieldRectOf(partial.balance), playable);
}

assert.equal(BALANCE.worldW, globalBefore.worldW);
assert.equal(BALANCE.worldH, globalBefore.worldH);
assert.equal(BALANCE.worldW, 1400);
assert.equal(BALANCE.worldH, 1000);
assert.equal(BALANCE.commandRangeCaptain, globalBefore.captain);
assert.equal(BALANCE.commandRangePlatoonLeader, globalBefore.platoon);

console.log("map size (wide board, passed size ignored, BALANCE untouched) PASS");
