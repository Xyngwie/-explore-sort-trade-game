import assert from "node:assert/strict";
import { createHubSave, serializeHubSave, INITIAL_HUB } from "@estg/shared";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { aimAt, turnRate, updateFacing, wrapAngle, TURN_RATE_RAD, FIRE_HALF_ARC_RAD } from "./game/facing";
import { loadSpeedRatio } from "./game/carry";
import { inMeleeArc } from "./game/circuitPlay";
import { escortOffset } from "./game/brain";
import { BALANCE, SPAWN_POINT } from "./game/balance";

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
// 10/17 details. 1: sortie start facing (spawn at centre, leader up, wingmen outward on a ring).
{
  const s0 = createWorld(bootstrapFromSearch("?wingmen=4")); startSortie(s0);
  assert.deepEqual(s0.leader.pos, { x: SPAWN_POINT.x, y: SPAWN_POINT.y });
  assert.deepEqual({ x: SPAWN_POINT.x, y: SPAWN_POINT.y }, { x: BALANCE.worldW / 2, y: BALANCE.worldH / 2 }, "spawn is the map centre");
  assert.ok(near(s0.leader.heading, -Math.PI / 2), "leader faces up");
  const rs = s0.wingmen.map(u => Math.hypot(u.pos.x - SPAWN_POINT.x, u.pos.y - SPAWN_POINT.y));
  for (const [i, u] of s0.wingmen.entries()) {
    assert.ok(Math.abs(rs[i]! - rs[0]!) < 1e-6, "wingmen share one ring");
    assert.ok(near(u.heading, Math.atan2(u.pos.y - SPAWN_POINT.y, u.pos.x - SPAWN_POINT.x)), "wingman faces outward");
  }
  for (const e of s0.enemies) {
    const a = [s0.leader, ...s0.wingmen].sort((p, q) => Math.hypot(p.pos.x - e.pos.x, p.pos.y - e.pos.y) - Math.hypot(q.pos.x - e.pos.x, q.pos.y - e.pos.y))[0]!;
    assert.ok(near(e.heading, Math.atan2(a.pos.y - e.pos.y, a.pos.x - e.pos.x)), "enemy faces nearest ally");
  }
  assert.deepEqual(s0.extract.pos, { x: SPAWN_POINT.x, y: SPAWN_POINT.y }, "old extract point moved with spawn");
  const c = s0.camera; assert.ok(Math.abs(c.x + c.w / 2 - SPAWN_POINT.x) < 1e-6 && Math.abs(c.y + c.h / 2 - SPAWN_POINT.y) < 1e-6, "camera centred on spawn");
  for (const k of s0.containers) assert.ok(Math.hypot(k.pos.x - SPAWN_POINT.x, k.pos.y - SPAWN_POINT.y) >= 140 - 1e-6, "containers keep the spawn gap");
  // Checkpoint compat: an old body (left-edge spawn, no facing fields) resumes where it was.
  const body = JSON.parse(JSON.stringify(snapshotSortieWorld(s0))) as { leader: Record<string, unknown> & { pos: { x: number; y: number } } };
  body.leader.pos = { x: 180, y: 500 }; delete body.leader.moveHeading; delete body.leader.aimWant;
  const old = worldFromCheckpointBody(body)!; assert.deepEqual(old.leader.pos, { x: 180, y: 500 }, "old checkpoint keeps its positions");
}
// 2: load 6 → no turning.
L.salvagedCount = 6; assert.equal(turnRate(w, L), 0); L.salvagedCount = 0;
// 3: melee arc ±135°.
L.heading = 0;
assert.equal(inMeleeArc(L, at(130)), true); assert.equal(inMeleeArc(L, at(-134)), true);
assert.equal(inMeleeArc(L, at(140)), false, "rear 90° blind for melee");
// 4: formation follows the leader's travel, not its facing.
L.moveHeading = 0; L.heading = Math.PI / 2;
const slotA = escortOffset(L, 30);
L.heading = -Math.PI / 2; assert.deepEqual(escortOffset(L, 30), slotA, "facing does not move the formation");
console.log("facing: 90°/s, 3° arc, aim over move, cargo ratio, enemies, checkpoint/hub compat PASS");
