import assert from "node:assert/strict";
import { createHubSave, serializeHubSave, INITIAL_HUB } from "@estg/shared";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { aimAt, turnRate, updateFacing, wrapAngle, TURN_RATE_RAD, FIRE_HALF_ARC_RAD } from "./game/facing";
import { loadSpeedRatio } from "./game/carry";

const near = (a: number, b: number) => Math.abs(wrapAngle(a - b)) < 1e-6;
const w = createWorld(bootstrapFromSearch("")); startSortie(w);
const L = w.leader;
// 90°/s: facing directly behind takes about 2 s; no snapping.
L.heading = 0; L.moveHeading = null;
const back = { ...L, pos: { x: L.pos.x - 100, y: L.pos.y } };
assert.equal(aimAt(L, back), false, "outside 3° arc cannot fire");
updateFacing(w, 1);
assert.ok(near(Math.abs(L.heading), Math.PI / 2), "turned 90° in 1 s");
assert.equal(aimAt(L, back), false);
updateFacing(w, 1);
assert.equal(aimAt(L, back), true, "behind reached after 2 s");
// 3° arc boundary.
L.heading = 0;
const at = (deg: number) => ({ ...L, pos: { x: L.pos.x + 100 * Math.cos(deg * Math.PI / 180), y: L.pos.y + 100 * Math.sin(deg * Math.PI / 180) } });
assert.equal(aimAt(L, at(1.4)), true); assert.equal(aimAt(L, at(2)), false);
assert.ok(Math.abs(FIRE_HALF_ARC_RAD * 2 - Math.PI / 60) < 1e-9);
// Facing is independent of movement: aim wins over travel direction.
L.heading = 0; L.moveHeading = Math.PI / 2; aimAt(L, at(-90)); updateFacing(w, 0.5);
assert.ok(near(L.heading, -Math.PI / 4), "aim overrides movement heading");
updateFacing(w, 0.5); assert.ok(near(L.heading, 0), "without aim it turns to travel direction");
// Cargo slows turning by the movement ratio; no activity used.
const act = JSON.stringify(w.mechBattery);
L.salvagedCount = 1;
assert.ok(Math.abs(turnRate(w, L) - TURN_RATE_RAD * loadSpeedRatio(1)) < 1e-9);
L.salvagedCount = 0; assert.equal(turnRate(w, L), TURN_RATE_RAD);
assert.equal(JSON.stringify(w.mechBattery), act, "turning uses no activity");
// Enemies follow the same rule.
const e = w.enemies[0]!; e.heading = 0; e.aimWant = Math.PI; updateFacing(w, 1);
assert.ok(near(Math.abs(e.heading), Math.PI / 2), "enemy turns at 90°/s");
// Checkpoint compat: an old body without facing fields restores and turns.
const body = JSON.parse(JSON.stringify(snapshotSortieWorld(w))) as { leader: Record<string, unknown> };
delete body.leader.moveHeading; delete body.leader.aimWant;
const r = worldFromCheckpointBody(body)!; assert.ok(r);
r.leader.heading = 0; r.leader.moveHeading = Math.PI; updateFacing(r, 1);
assert.ok(near(Math.abs(r.leader.heading), Math.PI / 2), "old checkpoint turns normally");
// Hub save unchanged by facing.
assert.ok(!/aimWant|moveHeading/.test(serializeHubSave(createHubSave(INITIAL_HUB))), "facing is not saved to HUB");
console.log("facing: 90°/s, 3° arc, aim over move, cargo ratio, enemies, checkpoint/hub compat PASS");
