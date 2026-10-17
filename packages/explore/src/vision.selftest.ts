import assert from "node:assert/strict";
import { createHubSave, serializeHubSave, INITIAL_HUB } from "@estg/shared";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { tickWorld } from "./game/sim";
import { decideWingman } from "./game/brain";
import { nearestEnemyTarget } from "./game/enemyBehavior";
import { getCoverObjects } from "./game/coverObjects";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { canSee, enemyVisibleToSquad, squadIntel, updateSquadIntel, LAST_SEEN_SEC } from "./game/vision";

const idle = { move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false };
const mk = () => { const w = createWorld(bootstrapFromSearch("")); startSortie(w); getCoverObjects(w).splice(0); return w; };
const at = (o: { x: number; y: number }, deg: number, d: number) => ({ x: o.x + Math.cos(deg * Math.PI / 180) * d, y: o.y + Math.sin(deg * Math.PI / 180) * d });

// Cones: front 60° to 2×, periphery 270° to 1×, rear 90° blind.
{
  const w = mk(); const L = w.leader; L.heading = 0; const R = w.balance.visionRange;
  assert.equal(canSee(w, L, at(L.pos, 29, R * 1.9)), true, "front sees ~2×");
  assert.equal(canSee(w, L, at(L.pos, 31, R * 1.9)), false, "outside front: 1× only");
  assert.equal(canSee(w, L, at(L.pos, 130, R * 0.9)), true, "periphery sees 1×");
  assert.equal(canSee(w, L, at(L.pos, 140, R * 0.5)), false, "rear 90° blind");
  assert.equal(canSee(w, L, at(L.pos, 180, 30)), false, "blind even close");
  // Obstacles block sight.
  getCoverObjects(w).push({ id: "t", pos: at(L.pos, 0, 100), radius: 30 });
  assert.equal(canSee(w, L, at(L.pos, 0, 200)), false, "no seeing past obstacles");
  assert.equal(canSee(w, L, at(L.pos, 0, 85)), true, "a unit inside the obstacle can be seen");
}
// Shared squad knowledge and the 5 s last-seen.
{
  const w = mk(); const L = w.leader; const wa = w.wingmen[0]!;
  for (const e of w.enemies) e.alive = false;
  const e = w.enemies[0]!; e.alive = true;
  L.heading = 0; L.moveHeading = 0; wa.pos = at(L.pos, 180, 60); wa.heading = Math.PI; wa.moveHeading = Math.PI;
  e.pos = at(L.pos, 0, 150);
  updateSquadIntel(w);
  assert.equal(canSee(w, wa, e.pos), false); assert.equal(enemyVisibleToSquad(w, e), true, "seen by the leader → shared");
  // A shared-only target: the wingman turns/shoots in range but does not chase.
  wa.stance = "patrol"; wa.waypoint = { ...wa.pos };
  const intent = decideWingman(w, wa, 0.05);
  assert.notDeepEqual(intent.moveTarget, e.pos, "no chase of a shared-only target");
  // Lose it: last seen stays ~5 s then goes.
  L.heading = Math.PI; L.moveHeading = Math.PI; L.aimWant = null;
  w.elapsed = 10; updateSquadIntel(w);
  assert.equal(enemyVisibleToSquad(w, e), false);
  assert.deepEqual(squadIntel(w).lastSeen[e.id]?.pos, e.pos, "last seen kept");
  w.elapsed = 10 + LAST_SEEN_SEC - 0.1; updateSquadIntel(w); assert.ok(squadIntel(w).lastSeen[e.id]);
  w.elapsed = 10 + LAST_SEEN_SEC + 0.1; updateSquadIntel(w); assert.equal(squadIntel(w).lastSeen[e.id], undefined, "gone after 5 s");
}
// Enemies use their own cones only.
{
  const w = mk(); const e = w.enemies[0]!; const L = w.leader;
  for (const x of w.enemies) if (x !== e) x.alive = false;
  for (const u of w.wingmen) u.alive = false;
  e.pos = at(L.pos, 0, 100);
  e.heading = Math.PI; assert.equal(nearestEnemyTarget(w, e), L, "facing the leader → target");
  e.heading = 0; assert.equal(nearestEnemyTarget(w, e), null, "leader behind it → not seen");
}
// Checkpoint compat: old body without squadIntel ticks fine; HUB save unchanged.
{
  const w = mk(); tickWorld(w, 0.05, idle);
  const body = JSON.parse(JSON.stringify(snapshotSortieWorld(w))) as Record<string, unknown>;
  delete body.squadIntel;
  const r = worldFromCheckpointBody(body)!; tickWorld(r, 0.05, idle);
  assert.ok(Array.isArray(squadIntel(r).visible));
  const r2 = worldFromCheckpointBody(JSON.parse(JSON.stringify(snapshotSortieWorld(w))))!;
  assert.deepEqual(squadIntel(r2), squadIntel(w), "intel round-trips");
  assert.ok(!/squadIntel|lastSeen/.test(serializeHubSave(createHubSave(INITIAL_HUB))), "not in HUB save");
}
console.log("vision: cones, blind rear, obstacles, shared intel, 5 s last seen, no chase, enemy cones, checkpoint PASS");
