import assert from "node:assert/strict";
import { createHubSave, serializeHubSave, INITIAL_HUB } from "@estg/shared";
import { COLORS, MECH_R, SHAPE_SIZE, shapePoints } from "./game/mapShapes";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { tickWorld } from "./game/sim";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";

// 10/17 神宮: colours, sizes, fixed shapes.
assert.equal(COLORS.leader, "#4f8fe8"); assert.equal(COLORS.wingman, "#7eb6ff"); assert.equal(COLORS.wreck, "#8a9099");
assert.equal(MECH_R, 14);
assert.deepEqual(SHAPE_SIZE, { leader: 1.1, wingman: 1.0, enemy: 1.0, wreck: 0.75, supply: 0.35 });
assert.ok(SHAPE_SIZE.supply < SHAPE_SIZE.wreck, "supply circles smaller than wreck circles");
assert.equal(shapePoints("hexagon", 10).length, 6);
const up = shapePoints("triangle", 10), down = shapePoints("invertedTriangle", 10);
assert.ok(Math.abs(up[0]!.y + 10) < 1e-9, "enemy triangle apex up");
assert.ok(Math.abs(down[0]!.y - 10) < 1e-9, "wingman triangle apex down");
// Visual only: nothing new in the checkpoint or the HUB save; old checkpoints still load.
const w = createWorld(bootstrapFromSearch("")); startSortie(w); tickWorld(w, 0.05, { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false });
const body = JSON.stringify(snapshotSortieWorld(w));
assert.ok(!/hexagon|invertedTriangle|#4f8fe8/.test(body), "shapes are not saved");
assert.ok(worldFromCheckpointBody(JSON.parse(body)), "checkpoint still loads");
assert.ok(!/hexagon|#4f8fe8/.test(serializeHubSave(createHubSave(INITIAL_HUB))), "HUB save unchanged");
console.log("map shapes: colours, sizes, fixed shapes, compat PASS");

// 10/17 神宮: split supply drops use SORT's current red / yellow; circuit drop is whitish.
assert.equal(COLORS.ammoDrop, "#f85149");
assert.equal(COLORS.powerDrop, "#d4a72c");
assert.equal(COLORS.circuitDrop, "#e6e9ee");
