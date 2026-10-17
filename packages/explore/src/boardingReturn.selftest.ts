import assert from "node:assert/strict";
import { bootstrapFromSearch, createWorld, startSortie } from "./game/world";
import { attachCircuitPlay, issueWingmanMove } from "./game/circuitPlay";
import { backfillEnemyState } from "./game/enemyBehavior";
import { getCoverObjects } from "./game/coverObjects";
import { boardingAssemblyTarget, hasIndividualWingOrder } from "./game/boardingMovement";
import { executeExploreCommand } from "./game/commands";
import { applyOrder, onSalvageCompleted } from "./game/orders";
import { requestExtract, tickWorld } from "./game/sim";
import { snapshotSortieWorld, worldFromCheckpointBody } from "./game/checkpoint";
import { dist } from "./game/math";

const idle = () => ({ move: { x: 0, y: 0 }, clickMove: null, fire: false, interact: false });
function fixture() {
  const w = createWorld(bootstrapFromSearch("?deployedInstanceIds=a,b,c&deployableMechs=3"));
  startSortie(w); attachCircuitPlay(w, null, false);
  w.commandUnlock.mode = "all_unlocked";
  getCoverObjects(w).splice(0);
  backfillEnemyState(w);
  for (const e of w.enemies) { e.alive = false; e.hp = 0; e.enemyState!.deathHandled = true; }
  w.containers = [];
  w.leader.pos = { x: 600, y: 600 };
  for (const u of w.wingmen) { u.pos = { x: 900, y: 600 }; u.stance = "patrol"; u.waypoint = { x: 900, y: 600 }; }
  return w;
}
function recall(w: ReturnType<typeof fixture>) {
  assert.equal(requestExtract(w), true);
  w.recallSpawns = [];
}
function advance(w: ReturnType<typeof fixture>, seconds: number) {
  for (let n = 0; n < Math.round(seconds / .05); n++) tickWorld(w, .05, idle());
}
// Stances and arbitrary ordinary AI waypoints are not evidence of a player order.
{
  const w = fixture(), wing = w.wingmen[0]!;
  assert.equal(boardingAssemblyTarget(w, wing), null);
  tickWorld(w, .1, idle());
  assert.ok(dist(wing.pos, { x: 900, y: 600 }) > 0, "normal patrol works before recall");
  const stance = wing.stance, waypoint = { ...wing.waypoint! };
  recall(w);
  assert.equal(wing.stance, stance); assert.deepEqual(wing.waypoint, waypoint);
  assert.ok(boardingAssemblyTarget(w, wing));
  advance(w, 4);
  assert.ok(dist(wing.pos, w.boarding!.center) + wing.radius <= w.boarding!.radius,
    "normal wing assembles with its whole body inside, through ordinary movement");
  const arrived = { ...wing.pos };
  advance(w, 2);
  assert.deepEqual(wing.pos, arrived, "no patrol out of the circle after arriving");
  w.boarding = null;
  advance(w, .2);
  assert.notDeepEqual(wing.pos, arrived, "original patrol resumes when recall ends");
  assert.equal(wing.stance, stance); assert.deepEqual(wing.waypoint, waypoint);
}
// Combat pursuit and global focus do not override assembly or hold-in-circle.
{
  const w = fixture(), wing = w.wingmen[0]!;
  wing.pos = { x: 700, y: 600 }; wing.heading = 0;
  const foe = w.enemies[0]!;
  foe.alive = true; foe.hp = foe.maxHp = 100000; foe.pos = { x: 780, y: 600 };
  foe.enemyState!.ammo = 0; foe.enemyState!.activity = 0;
  wing.stance = "raid";
  recall(w);
  w.circuitPlay!.order = { kind: "focus", enemyId: foe.id };
  advance(w, 1);
  assert.ok(wing.pos.x < 700, "wing moves inward instead of pursuing the enemy");
  assert.ok(dist(wing.pos, w.boarding!.center) <= w.boarding!.radius);
  const settled = { ...wing.pos };
  advance(w, 1);
  assert.deepEqual(wing.pos, settled, "focus fire does not pull normal wings out of boarding");
}
// Explicit individual stance is preserved; a subsequent squad order replaces it.
{
  const w = fixture(), wing = w.wingmen[0]!;
  executeExploreCommand(w, { id: "wing_patrol", wingId: wing.id });
  assert.equal(wing.individualOrder, true);
  const waypoint = { ...wing.waypoint! };
  recall(w);
  assert.equal(boardingAssemblyTarget(w, wing), null);
  assert.deepEqual(wing.waypoint, waypoint);
  advance(w, .3);
  assert.equal(wing.individualOrder, true);
  executeExploreCommand(w, { id: "wing_escort" });
  assert.equal(wing.individualOrder, false);
  assert.ok(boardingAssemblyTarget(w, wing), "clearing an individual stance immediately enables recall");
  advance(w, 4);
  assert.ok(dist(wing.pos, w.boarding!.center) <= w.boarding!.radius);
}
// Existing move/recover/manual hold/locked-stop contracts beat auto assembly.
{
  const w = fixture(), wing = w.wingmen[0]!, p = w.circuitPlay!;
  recall(w);
  p.wingMove[wing.id] = { x: 1000, y: 600 };
  assert.equal(boardingAssemblyTarget(w, wing), null);
  advance(w, .2); assert.ok(wing.pos.x > 900, "individual destination is retained");
  delete p.wingMove[wing.id];
  p.wingRecover![wing.id] = { kind: "wreck", id: w.leader.id, n0: 0 };
  assert.equal(boardingAssemblyTarget(w, wing), null);
  delete p.wingRecover![wing.id];
  p.wingHold![wing.id] = { ...wing.pos, manual: true };
  assert.equal(boardingAssemblyTarget(w, wing), null);
  p.wingHold![wing.id]!.manual = false;
  assert.ok(boardingAssemblyTarget(w, wing), "completed recovery's automatic wait yields to recall");
  delete p.wingHold![wing.id]; wing.holdOrder = true;
  const before = { ...wing.pos };
  advance(w, .2); assert.deepEqual(wing.pos, before); assert.equal(wing.holdOrder, true);
  applyOrder(w, wing, "escort");
  assert.ok(boardingAssemblyTarget(w, wing));
}
// New individual map destinations replace older individual stance provenance.
{
  const w = fixture(), wing = w.wingmen[0]!;
  executeExploreCommand(w, { id: "wing_patrol", wingId: wing.id });
  // Palette move is a release-only command for a non-autonomous passenger candidate.
  w.circuitPlay!.release = true; w.circuitPlay!.captainTrueOne = true;
  const pt = { x: wing.pos.x + 60, y: wing.pos.y };
  assert.deepEqual(issueWingmanMove(w, [wing.id], pt), [wing.id]);
  assert.equal(wing.individualOrder, false);
  recall(w); assert.equal(boardingAssemblyTarget(w, wing), null);
  advance(w, 1);
  assert.equal(hasIndividualWingOrder(w, wing), false, "completed destination releases individual movement ownership");
  assert.equal(boardingAssemblyTarget(w, wing), null, "non-autonomous wing remains immobile after its explicit move ends");
  const autonomous = fixture(), recovering = autonomous.wingmen[0]!;
  recall(autonomous);
  recovering.individualOrder = true; recovering.stance = "recover";
  onSalvageCompleted(autonomous, recovering);
  assert.equal(recovering.individualOrder, false, "completed individual recovery no longer blocks recall");
  assert.ok(boardingAssemblyTarget(autonomous, recovering));
}
// Protect/pincer are squad circuit actions, not individual wing-ID commands.
// Recall owns movement for their participants, while focus firing stays active.
{
  const w = fixture(), wing = w.wingmen[0]!, other = w.wingmen[1]!;
  w.leader.heading = w.leader.moveHeading = Math.PI / 2;
  w.circuitPlay!.order = { kind: "protect", allyId: wing.id };
  recall(w);
  assert.ok(boardingAssemblyTarget(w, wing));
  assert.ok(boardingAssemblyTarget(w, other));
  tickWorld(w, .1, idle());
  assert.ok(wing.pos.x < 900);
  assert.equal(wing.pos.y, 600, "assembly takes priority over squad protect follow position");
  assert.equal(w.circuitPlay!.order?.kind, "protect", "squad order itself is not cancelled");
  const resumed = worldFromCheckpointBody(snapshotSortieWorld(w))!;
  assert.ok(boardingAssemblyTarget(resumed, resumed.wingmen[0]!), "priority survives checkpoint");
}
{
  const w = fixture(), wing = w.wingmen[0]!, other = w.wingmen[1]!;
  const foe = w.enemies[0]!;
  foe.alive = true; foe.hp = foe.maxHp = 100000; foe.pos = { x: 1400, y: 1000 };
  foe.enemyState!.ammo = 0; foe.enemyState!.activity = 0;
  w.circuitPlay!.order = { kind: "pincer", enemyId: foe.id, points: { [wing.id]: { x: 1000, y: 600 } } };
  recall(w);
  assert.ok(boardingAssemblyTarget(w, wing));
  assert.ok(boardingAssemblyTarget(w, other));
  tickWorld(w, .1, idle());
  assert.ok(wing.pos.x < 900, "pincer participant assembles instead of following squad attack destination");
  assert.ok(other.pos.x < 900, "non-participant also assembles");
  assert.equal(w.circuitPlay!.order?.kind, "pincer", "squad order itself is not cancelled");
}
// Assembly uses normal collision movement, without warping through a blocking obstacle.
{
  const w = fixture(), wing = w.wingmen[0]!;
  const obstacle = { id: "recall-blocker", pos: { x: 800, y: 600 }, radius: 30 };
  getCoverObjects(w).push(obstacle);
  recall(w);
  const before = { ...wing.pos };
  tickWorld(w, .05, idle());
  assert.ok(dist(wing.pos, before) <= w.balance.moveSpeed * .05 + 1e-6, "recall moves at normal speed");
  advance(w, 1);
  assert.ok(dist(wing.pos, obstacle.pos) >= obstacle.radius + wing.radius, "assembly cannot enter obstacle");
  assert.ok(wing.pos.x > obstacle.pos.x, "no warp across a head-on obstruction");
}
// Checkpoints keep provenance and precedence, while pre-field snapshots remain valid.
{
  const w = fixture();
  executeExploreCommand(w, { id: "wing_raid", wingId: w.wingmen[0]!.id });
  recall(w);
  const resumed = worldFromCheckpointBody(snapshotSortieWorld(w))!;
  getCoverObjects(resumed).splice(0);
  assert.equal(resumed.wingmen[0]!.individualOrder, true);
  assert.equal(boardingAssemblyTarget(resumed, resumed.wingmen[0]!), null);
  const oldNormal = resumed.wingmen[1]!;
  delete oldNormal.individualOrder;
  assert.ok(boardingAssemblyTarget(resumed, oldNormal));
  advance(resumed, 4);
  assert.ok(dist(oldNormal.pos, resumed.boarding!.center) <= resumed.boarding!.radius);
}
// Immobile/mounted/locked wings are not teleported or implicitly rescued.
{
  const w = fixture(), wing = w.wingmen[0]!;
  w.circuitPlay!.release = true; recall(w);
  assert.equal(boardingAssemblyTarget(w, wing), null, "no movement circuit stays immobile");
  const at = { ...wing.pos };
  advance(w, .5); assert.deepEqual(wing.pos, at);
  w.circuitPlay!.carry[w.leader.id] = [wing.id];
  w.circuitPlay!.wingTrueOne[wing.id] = true;
  assert.equal(boardingAssemblyTarget(w, wing), null, "passenger never walks independently");
  delete w.circuitPlay!.carry[w.leader.id];
  wing.pos = { ...at };
  wing.holdOrder = true;
  advance(w, 14.5);
  assert.equal(w.phase, "result");
  assert.ok(w.leftBehind?.some(item => item.id === wing.id), "explicit hold outside still loses wingman at lift-off");
}
console.log("boarding return selftest: ok");
