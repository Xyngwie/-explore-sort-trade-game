import assert from "node:assert/strict";
import { createHubSave, serializeHubSave, INITIAL_HUB } from "@estg/shared";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { tickWorld } from "./game/sim";
import { decideWingman } from "./game/brain";
import { nearestEnemyTarget } from "./game/enemyBehavior";
import { getCoverObjects } from "./game/coverObjects";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { canSee, enemyVisibleToSquad, squadIntel, updateSquadIntel, updateSquadMemory, fogGrey, fogCellCenter, ghostOf, ghostTrust, LAST_SEEN_SEC, FOG_RETURN_SEC, GHOST_TRUST_SEC } from "./game/vision";

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
// Fog, faint images and AI trust.
{
  const w = mk(); const L = w.leader; for (const u of w.wingmen) u.alive = false; for (const e of w.enemies) e.alive = false;
  L.heading = 0; w.elapsed = 0;
  const n = squadIntel(w).fogT.length; assert.ok(n > 0);
  let watched = -1, never = -1;
  for (let i = 0; i < n; i++) { const c = fogCellCenter(w, i); if (watched < 0 && canSee(w, L, c)) watched = i; if (never < 0 && Math.hypot(c.x - L.pos.x, c.y - L.pos.y) > 600) never = i; }
  updateSquadMemory(w);
  assert.equal(fogGrey(w, never), 1, "never seen = grey");
  assert.equal(fogGrey(w, watched), 0, "watched = black");
  L.heading = Math.PI; L.pos = { x: L.pos.x - 400, y: L.pos.y }; // look away and leave
  w.elapsed = FOG_RETURN_SEC / 2; updateSquadMemory(w);
  assert.ok(Math.abs(fogGrey(w, watched) - 0.5) < 1e-9, "fog returns gradually");
  w.elapsed = FOG_RETURN_SEC; assert.equal(fogGrey(w, watched), 1, "grey again after 60 s");
  // Container: faint image while unseen, kept when taken unseen, removed once the spot is seen.
  const w2 = mk(); const L2 = w2.leader; for (const u of w2.wingmen) u.alive = false; for (const e of w2.enemies) e.alive = false;
  L2.heading = 0; w2.elapsed = 0;
  const c = w2.containers[0]!; c.discovered = true; c.taken = false; c.pos = { x: L2.pos.x + 100, y: L2.pos.y };
  updateSquadMemory(w2); assert.ok(ghostOf(w2, "container", c.id), "seen → image recorded");
  L2.heading = Math.PI; w2.elapsed = 5; c.taken = true; updateSquadMemory(w2);
  assert.ok(ghostOf(w2, "container", c.id), "taken while unseen → image stays");
  L2.heading = 0; updateSquadMemory(w2); assert.equal(ghostOf(w2, "container", c.id), null, "seen again → removed");
  // Enemy mechs leave no image.
  const e = w2.enemies[0]!; e.alive = true; e.pos = { x: L2.pos.x + 80, y: L2.pos.y }; updateSquadMemory(w2);
  assert.equal(ghostOf(w2, "enemyWreck", e.id), null, "a live enemy is not a static image");
  // Trust: fresh 1, lower with age, 0 at ~120 s.
  const g = { kind: "container" as const, id: "x", pos: { x: 0, y: 0 }, t: 0 };
  w2.elapsed = 0; assert.equal(ghostTrust(w2, g), 1);
  w2.elapsed = 60; assert.ok(ghostTrust(w2, g) < 1 && ghostTrust(w2, g) > 0, "older = lower priority");
  w2.elapsed = GHOST_TRUST_SEC; assert.equal(ghostTrust(w2, g), 0, "~120 s = not trusted");
}
// Checkpoint: fog and images survive resume; an old body without them loads.
{
  const w = mk(); tickWorld(w, 0.05, idle);
  const k = Object.keys(squadIntel(w).ghosts);
  const r = worldFromCheckpointBody(JSON.parse(JSON.stringify(snapshotSortieWorld(w))))!;
  assert.deepEqual(squadIntel(r).fogT, squadIntel(w).fogT, "fog survives");
  assert.deepEqual(Object.keys(squadIntel(r).ghosts), k, "images survive");
  const old = JSON.parse(JSON.stringify(snapshotSortieWorld(w))) as { squadIntel: Record<string, unknown> };
  delete old.squadIntel.fogT; delete old.squadIntel.ghosts;
  const ro = worldFromCheckpointBody(old)!; tickWorld(ro, 0.05, idle);
  assert.equal(squadIntel(ro).fogT.length, squadIntel(w).fogT.length, "old checkpoint gets a fog grid");
}
console.log("vision: cones, blind rear, obstacles, shared intel, 5 s last seen, no chase, enemy cones, checkpoint PASS");
